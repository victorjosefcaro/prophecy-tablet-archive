import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = 'prophecy-tablet-puzzles';

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
    const params = event.queryStringParameters || {};
    const {
      search = '',
      sortBy = 'newest',
      timeRange = 'all',
      limit = '50',
      dailyDate = null,
      isDaily = null,
    } = params;

    const result = await docClient.send(
      new ScanCommand({
        TableName: TABLE_NAME,
      })
    );

    let puzzles = result.Items || [];

    if (dailyDate) {
      const dailyResult = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'scheduledDate-index',
          KeyConditionExpression: 'scheduledDate = :date',
          ExpressionAttributeValues: {
            ':date': dailyDate,
          },
        })
      );

      const dailyPuzzles = (dailyResult.Items || []).filter((p) => p.isDaily === true);

      if (dailyPuzzles.length === 0) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ puzzles: [] }),
        };
      }

      const puzzle = dailyPuzzles[0];

      const countResult = await docClient.send(
        new ScanCommand({
          TableName: TABLE_NAME,
          FilterExpression: 'isDaily = :isDaily AND scheduledDate <= :date',
          ExpressionAttributeValues: {
            ':isDaily': true,
            ':date': dailyDate,
          },
          Select: 'COUNT',
        })
      );

      const dailyNumber = countResult.Count || 1;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          puzzles: [
            {
              ...puzzle,
              dailyNumber,
            },
          ],
        }),
      };
    }

    if (isDaily === 'true') {
      const today = new Date().toISOString().split('T')[0];
      const allDailies = puzzles
        .filter((p) => p.isDaily && p.scheduledDate)
        .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

      puzzles = allDailies.filter((p) => p.scheduledDate <= today);

      puzzles = puzzles.map((p) => {
        const globalIndex = allDailies.findIndex((d) => d.id === p.id);
        return {
          ...p,
          dailyNumber: globalIndex + 1,
        };
      });
    } else {
      puzzles = puzzles.filter((p) => !p.isDaily);
    }

    const now = Date.now();
    const timeFilters = {
      today: now - 24 * 60 * 60 * 1000,
      week: now - 7 * 24 * 60 * 60 * 1000,
      month: now - 30 * 24 * 60 * 60 * 1000,
      all: 0,
    };
    const minTime = timeFilters[timeRange] || 0;
    puzzles = puzzles.filter((p) => (p.createdAt || 0) >= minTime);

    if (search) {
      const searchLower = search.toLowerCase();
      puzzles = puzzles.filter(
        (p) =>
          (p.puzzleName || '').toLowerCase().includes(searchLower) ||
          (p.authorName || '').toLowerCase().includes(searchLower)
      );
    }

    const getRating = (p) => (p.ratingCount > 0 ? p.ratingSum / p.ratingCount : 0);
    const sortFunctions = {
      newest: (a, b) =>
        (b.scheduledDate || b.createdAt || 0)
          .toString()
          .localeCompare((a.scheduledDate || a.createdAt || 0).toString()),
      oldest: (a, b) =>
        (a.scheduledDate || a.createdAt || 0)
          .toString()
          .localeCompare((b.scheduledDate || b.createdAt || 0).toString()),
      highestRated: (a, b) => getRating(b) - getRating(a),
      mostRated: (a, b) => b.ratingCount - a.ratingCount,
      highestRatingCount: (a, b) => b.ratingCount - a.ratingCount,
      mostPlayed: (a, b) => b.playCount - a.playCount,
      leastPlayed: (a, b) => a.playCount - b.playCount,
    };

    if (isDaily === 'true') {
      const dailySort = {
        newest: (a, b) => b.scheduledDate.localeCompare(a.scheduledDate),
        oldest: (a, b) => a.scheduledDate.localeCompare(b.scheduledDate),
      };
      puzzles.sort(dailySort[sortBy] || dailySort.newest);
    } else {
      puzzles.sort(sortFunctions[sortBy] || sortFunctions.newest);
    }

    puzzles = puzzles.slice(0, parseInt(limit, 10));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ puzzles }),
    };
  } catch (error) {
    console.error('Error fetching puzzles:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch puzzles' }),
    };
  }
};
