// Lambda function: createPuzzle (ES Module version)
// Copy this entire code into your Lambda function in AWS Console

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
    RegExpMatcher,
    englishDataset,
    englishRecommendedTransformers
} from 'obscenity';

// Initialize the profanity matcher
const matcher = new RegExpMatcher({
    ...englishDataset.build(),
    ...englishRecommendedTransformers,
});

const generateShortCode = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < 5; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = 'prophecy-tablet-puzzles';

// SECURITY: Set this as an environment variable in your Lambda configuration
// Go to Lambda > Configuration > Environment variables > Add ADMIN_SECRET
const ADMIN_SECRET = process.env.ADMIN_SECRET;

export const handler = async (event) => {
    // CORS Configuration
    const allowedOrigins = [
        'https://prophecytablet.com',
        'https://www.prophecytablet.com',
        'http://localhost:8000',
        'null' // This allows file:// requests (use with caution, but necessary for local HTML files)
    ];

    const origin = event.headers.origin || event.headers.Origin;
    let allowOrigin = 'https://prophecytablet.com'; // Default fallback

    if (allowedOrigins.includes(origin)) {
        allowOrigin = origin;
    }

    const headers = {
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Secret',
        'Content-Type': 'application/json'
    };

    try {
        const body = JSON.parse(event.body);

        // Basic validation
        if (!body.puzzleData || !body.puzzleData.puzzlePiecesData || !body.puzzleData.solutions) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Missing puzzle data' })
            };
        }

        // SECURITY: Admin authentication for daily puzzles
        if (body.isDaily === true) {
            const providedSecret = event.headers?.['x-admin-secret'] || event.headers?.['X-Admin-Secret'];
            if (!ADMIN_SECRET || providedSecret !== ADMIN_SECRET) {
                return {
                    statusCode: 403,
                    headers,
                    body: JSON.stringify({ error: 'Unauthorized: Admin access required for daily puzzles' })
                };
            }
        }

        // Profanity Check
        const textToCheck = `${body.puzzleName || ''} ${body.authorName || ''}`;
        const hasProfanity = matcher.hasMatch(textToCheck);

        if (hasProfanity) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    error: 'Potentially inappropriate language detected.'
                })
            };
        }

        // Puzzle Creation Logic with ID collision detection
        let puzzleId;
        let success = false;
        let attempts = 0;
        const maxAttempts = 5;

        while (!success && attempts < maxAttempts) {
            puzzleId = generateShortCode();

            const puzzle = {
                id: puzzleId,
                puzzleName: body.puzzleName || 'Untitled Puzzle',
                authorName: body.authorName || 'Nameless',
                puzzleData: body.puzzleData,
                ratingSum: 0,
                ratingCount: 0,
                playCount: 0,
                createdAt: Date.now(),
                status: 'active',
                isDaily: body.isDaily || false,
                scheduledDate: body.scheduledDate || null
            };

            try {
                await docClient.send(new PutCommand({
                    TableName: TABLE_NAME,
                    Item: puzzle,
                    ConditionExpression: 'attribute_not_exists(id)'
                }));
                success = true;
            } catch (err) {
                if (err.name === 'ConditionalCheckFailedException') {
                    attempts++;
                    console.warn(`Collision detected for ID ${puzzleId}, retrying... (Attempt ${attempts})`);
                } else {
                    throw err;
                }
            }
        }

        if (!success) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Failed to generate a unique ID. Please try again.' })
            };
        }

        return {
            statusCode: 201,
            headers,
            body: JSON.stringify({
                message: 'Puzzle created successfully',
                puzzle: {
                    id: puzzleId,
                    puzzleName: body.puzzleName || 'Untitled Puzzle',
                    authorName: body.authorName || 'Nameless'
                }
            })
        };
    } catch (error) {
        console.error('Error creating puzzle:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to create puzzle' })
        };
    }
};
