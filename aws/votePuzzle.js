// Lambda function: votePuzzle (ES Module version)
// This handles star ratings (1-5) and maintains sum/count averages.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = 'prophecy-tablet-puzzles';

export const handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    try {
        const puzzleId = event.pathParameters?.id;
        if (!puzzleId) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing puzzle ID' }) };
        }

        const body = JSON.parse(event.body || '{}');
        const { rating, previousRating } = body;

        // Ensure we are working with numbers or null
        const r = (rating !== null && rating !== undefined) ? Number(rating) : null;
        const pr = (previousRating !== null && previousRating !== undefined) ? Number(previousRating) : null;

        if (r === pr) {
            return { statusCode: 200, headers, body: JSON.stringify({ message: 'No change' }) };
        }

        // Calculate differences
        let sumDiff = 0;
        let countDiff = 0;

        // Subtract old rating
        if (pr !== null && !isNaN(pr)) {
            sumDiff -= pr;
            countDiff -= 1;
        }

        // Add new rating
        if (r !== null && !isNaN(r)) {
            sumDiff += r;
            countDiff += 1;
        }

        // Safety check to prevent junk updates
        if (sumDiff === 0 && countDiff === 0) {
            return { statusCode: 200, headers, body: JSON.stringify({ message: 'No change' }) };
        }

        // Use ExpressionAttributeNames to avoid any reserved keyword conflicts
        const result = await docClient.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { id: puzzleId },
            UpdateExpression: 'SET #sum = if_not_exists(#sum, :zero) + :sd, #cnt = if_not_exists(#cnt, :zero) + :cd',
            ExpressionAttributeNames: {
                '#sum': 'ratingSum',
                '#cnt': 'ratingCount'
            },
            ExpressionAttributeValues: {
                ':sd': sumDiff,
                ':cd': countDiff,
                ':zero': 0
            },
            ReturnValues: 'ALL_NEW'
        }));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                message: 'Rating updated',
                ratingSum: result.Attributes.ratingSum || 0,
                ratingCount: result.Attributes.ratingCount || 0
            })
        };
    } catch (error) {
        console.error('Error rating:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to record rating' }) };
    }
};
