import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = 'prophecy-tablet-puzzles';

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
        const params = event.queryStringParameters || {};
        const {
            search = '',
            sortBy = 'newest',
            timeRange = 'all',
            limit = '50',
            dailyDate = null,
            isDaily = null
        } = params;

        const result = await docClient.send(new ScanCommand({
            TableName: TABLE_NAME
        }));

        let puzzles = result.Items || [];

        // If dailyDate is provided, only return the daily puzzle for that date
        if (dailyDate) {
            const dailyPuzzles = puzzles
                .filter(p => p.isDaily && p.scheduledDate)
                .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

            const index = dailyPuzzles.findIndex(p => p.scheduledDate === dailyDate);

            if (index === -1) {
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ puzzles: [] })
                };
            }

            const puzzle = dailyPuzzles[index];
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    puzzles: [{
                        ...puzzle,
                        dailyNumber: index + 1
                    }]
                })
            };
        }

        // Filter by isDaily if specified
        if (isDaily === 'true') {
            const today = new Date().toISOString().split('T')[0];
            const allDailies = puzzles
                .filter(p => p.isDaily && p.scheduledDate)
                .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

            // Only return dailies scheduled for today or earlier
            puzzles = allDailies.filter(p => p.scheduledDate <= today);

            // Add dailyNumber to each
            puzzles = puzzles.map(p => {
                const globalIndex = allDailies.findIndex(d => d.id === p.id);
                return {
                    ...p,
                    dailyNumber: globalIndex + 1
                };
            });
        } else {
            // Exclude daily puzzles from regular explore list
            puzzles = puzzles.filter(p => !p.isDaily);
        }

        // Filter by time range
        const now = Date.now();
        const timeFilters = {
            today: now - 24 * 60 * 60 * 1000,
            week: now - 7 * 24 * 60 * 60 * 1000,
            month: now - 30 * 24 * 60 * 60 * 1000,
            all: 0
        };
        const minTime = timeFilters[timeRange] || 0;
        puzzles = puzzles.filter(p => (p.createdAt || 0) >= minTime);

        // Filter by search term
        if (search) {
            const searchLower = search.toLowerCase();
            puzzles = puzzles.filter(p =>
                (p.puzzleName || '').toLowerCase().includes(searchLower) ||
                (p.authorName || '').toLowerCase().includes(searchLower)
            );
        }

        // Sort puzzles
        const getRating = (p) => (p.ratingCount > 0 ? p.ratingSum / p.ratingCount : 0);
        const sortFunctions = {
            newest: (a, b) => (b.scheduledDate || b.createdAt || 0).toString().localeCompare((a.scheduledDate || a.createdAt || 0).toString()),
            oldest: (a, b) => (a.scheduledDate || a.createdAt || 0).toString().localeCompare((b.scheduledDate || b.createdAt || 0).toString()),
            highestRated: (a, b) => getRating(b) - getRating(a),
            mostRated: (a, b) => b.ratingCount - a.ratingCount,
            highestRatingCount: (a, b) => b.ratingCount - a.ratingCount,
            mostPlayed: (a, b) => b.playCount - a.playCount,
            leastPlayed: (a, b) => a.playCount - b.playCount
        };

        // Use scheduledDate for sorting if we're looking at dailies
        if (isDaily === 'true') {
            const dailySort = {
                newest: (a, b) => b.scheduledDate.localeCompare(a.scheduledDate),
                oldest: (a, b) => a.scheduledDate.localeCompare(b.scheduledDate)
            };
            puzzles.sort(dailySort[sortBy] || dailySort.newest);
        } else {
            puzzles.sort(sortFunctions[sortBy] || sortFunctions.newest);
        }

        puzzles = puzzles.slice(0, parseInt(limit, 10));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ puzzles })
        };
    } catch (error) {
        console.error('Error fetching puzzles:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to fetch puzzles' })
        };
    }
};