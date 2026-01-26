// Lambda function: getPuzzle (ES Module version)
// Copy this entire code into your Lambda function in AWS Console

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

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
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Missing puzzle ID' })
            };
        }

        const result = await docClient.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { id: puzzleId }
        }));

        if (!result.Item) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ error: 'Puzzle not found' })
            };
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ puzzle: result.Item })
        };
    } catch (error) {
        console.error('Error fetching puzzle:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to fetch puzzle' })
        };
    }
};
