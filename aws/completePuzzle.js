// Lambda function: completePuzzle (ES Module version)
// Copy this entire code into your Lambda function in AWS Console
// This records completion stats (time, moves) when a user finishes a puzzle

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
        const body = JSON.parse(event.body);
        const { time, moves } = body;

        if (!puzzleId) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Missing puzzle ID' })
            };
        }

        if (typeof time !== 'number' || typeof moves !== 'number') {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Invalid time or moves value' })
            };
        }

        // Update totals and completion count for calculating averages
        const result = await docClient.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { id: puzzleId },
            UpdateExpression: `SET 
        totalTimeMs = if_not_exists(totalTimeMs, :zero) + :time,
        totalMoves = if_not_exists(totalMoves, :zero) + :moves,
        completionCount = if_not_exists(completionCount, :zero) + :inc`,
            ExpressionAttributeValues: {
                ':time': time,
                ':moves': moves,
                ':inc': 1,
                ':zero': 0
            },
            ReturnValues: 'ALL_NEW'
        }));

        const attrs = result.Attributes;
        const avgTime = Math.round(attrs.totalTimeMs / attrs.completionCount);
        const avgMoves = Math.round(attrs.totalMoves / attrs.completionCount);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                message: 'Completion recorded',
                completionCount: attrs.completionCount,
                avgTimeMs: avgTime,
                avgMoves: avgMoves
            })
        };
    } catch (error) {
        console.error('Error recording completion:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to record completion' })
        };
    }
};
