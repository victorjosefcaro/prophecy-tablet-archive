import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = 'prophecy-tablet-puzzles';

export const handler = async (event) => {
  const allowedOrigins = ['https://prophecytablet.com', 'https://www.prophecytablet.com'];

  const origin = event.headers.origin || event.headers.Origin;
  let allowOrigin = 'https://prophecytablet.com';

  if (allowedOrigins.includes(origin)) {
    allowOrigin = origin;
  }

  const headers = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  try {
    const puzzleId = event.pathParameters?.id;

    if (!puzzleId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing puzzle ID' }),
      };
    }

    const result = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: puzzleId },
      })
    );

    if (!result.Item) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Puzzle not found' }),
      };
    }

    const puzzle = result.Item;

    if (puzzle.isDaily && puzzle.scheduledDate) {
      const today = new Date().toISOString().split('T')[0];
      if (puzzle.scheduledDate > today) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ error: 'This puzzle is not yet available.' }),
        };
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ puzzle }),
    };
  } catch (error) {
    console.error('Error fetching puzzle:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch puzzle' }),
    };
  }
};
