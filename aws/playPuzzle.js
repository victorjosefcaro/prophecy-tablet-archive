// Lambda function: playPuzzle (ES Module version)
// Copy this entire code into your Lambda function in AWS Console

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
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Missing puzzle ID' })
            };
        }

        const result = await docClient.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { id: puzzleId },
            UpdateExpression: 'SET playCount = playCount + :inc',
            ExpressionAttributeValues: { ':inc': 1 },
            ReturnValues: 'ALL_NEW'
        }));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                message: 'Play count incremented',
                playCount: result.Attributes.playCount
            })
        };
    } catch (error) {
        console.error('Error incrementing play count:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to increment play count' })
        };
    }
};
