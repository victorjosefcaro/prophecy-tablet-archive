import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';

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

const ADMIN_SECRET = process.env.ADMIN_SECRET;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

export const handler = async (event) => {
  const allowedOrigins = [
    'https://prophecytablet.com',
    'https://www.prophecytablet.com',
    'http://localhost:8000',
    'null',
  ];

  const origin = event.headers.origin || event.headers.Origin;
  let allowOrigin = 'https://prophecytablet.com';

  if (allowedOrigins.includes(origin)) {
    allowOrigin = origin;
  }

  const headers = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Secret',
    'Content-Type': 'application/json',
  };

  try {
    const body = JSON.parse(event.body);

    if (!body.puzzleData || !body.puzzleData.puzzlePiecesData || !body.puzzleData.solutions) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing puzzle data' }),
      };
    }

    if (body.isDaily === true) {
      const providedSecret = event.headers?.['x-admin-secret'] || event.headers?.['X-Admin-Secret'];
      if (!ADMIN_SECRET || providedSecret !== ADMIN_SECRET) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ error: 'Unauthorized: Admin access required for daily puzzles' }),
        };
      }
    }

    const textToCheck = `${body.puzzleName || ''} ${body.authorName || ''}`;
    const hasProfanity = matcher.hasMatch(textToCheck);

    if (hasProfanity) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Potentially inappropriate language detected.',
        }),
      };
    }

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
        scheduledDate: body.scheduledDate || null,
      };

      try {
        await docClient.send(
          new PutCommand({
            TableName: TABLE_NAME,
            Item: puzzle,
            ConditionExpression: 'attribute_not_exists(id)',
          })
        );
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
        body: JSON.stringify({ error: 'Failed to generate a unique ID. Please try again.' }),
      };
    }

    if (DISCORD_WEBHOOK_URL) {
      try {
        const message = {
          content: body.isDaily ? '**Daily Puzzle Scheduled!**' : '**New User Puzzle Uploaded!**',
          embeds: [
            {
              title: body.puzzleName || 'Untitled Puzzle',
              description: `By **${body.authorName || 'Nameless author'}**`,
              color: body.isDaily ? 0xffd700 : 0x0099ff,
              fields: [
                { name: 'Short Code', value: `\`${puzzleId}\``, inline: true },
                { name: 'Status', value: body.isDaily ? 'Scheduled' : 'Active', inline: true },
              ],
              url: `https://prophecytablet.com/archive`,
              timestamp: new Date().toISOString(),
            },
          ],
        };

        await fetch(DISCORD_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message),
        });
      } catch (discordErr) {
        console.error('Failed to send Discord notification:', discordErr);
      }
    }

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        message: 'Puzzle created successfully',
        puzzle: {
          id: puzzleId,
          puzzleName: body.puzzleName || 'Untitled Puzzle',
          authorName: body.authorName || 'Nameless',
        },
      }),
    };
  } catch (error) {
    console.error('Error creating puzzle:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to create puzzle' }),
    };
  }
};
