import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

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
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing puzzle ID' }) };
    }

    const body = JSON.parse(event.body || '{}');
    const { rating, previousRating } = body;

    const r = rating !== null && rating !== undefined ? Number(rating) : null;
    const pr =
      previousRating !== null && previousRating !== undefined ? Number(previousRating) : null;

    if (r !== null && (isNaN(r) || r < 1 || r > 5 || !Number.isInteger(r))) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Rating must be an integer between 1 and 5' }),
      };
    }

    if (pr !== null && (isNaN(pr) || pr < 1 || pr > 5 || !Number.isInteger(pr))) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Previous rating must be an integer between 1 and 5' }),
      };
    }

    if (r === pr) {
      return { statusCode: 200, headers, body: JSON.stringify({ message: 'No change' }) };
    }

    let sumDiff = 0;
    let countDiff = 0;

    if (pr !== null && !isNaN(pr)) {
      sumDiff -= pr;
      countDiff -= 1;
    }

    if (r !== null && !isNaN(r)) {
      sumDiff += r;
      countDiff += 1;
    }

    if (sumDiff === 0 && countDiff === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ message: 'No change' }) };
    }

    const result = await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: puzzleId },
        UpdateExpression:
          'SET #sum = if_not_exists(#sum, :zero) + :sd, #cnt = if_not_exists(#cnt, :zero) + :cd',
        ExpressionAttributeNames: {
          '#sum': 'ratingSum',
          '#cnt': 'ratingCount',
        },
        ExpressionAttributeValues: {
          ':sd': sumDiff,
          ':cd': countDiff,
          ':zero': 0,
        },
        ReturnValues: 'ALL_NEW',
      })
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Rating updated',
        ratingSum: result.Attributes.ratingSum || 0,
        ratingCount: result.Attributes.ratingCount || 0,
      }),
    };
  } catch (error) {
    console.error('Error rating:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to record rating' }) };
  }
};
