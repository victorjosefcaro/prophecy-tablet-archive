// api.js - API service for puzzle operations

const API_URL = 'https://6l9qzyjsd8.execute-api.ap-southeast-2.amazonaws.com/prod';

/**
 * Fetches puzzles from the API with optional filters
 * @param {Object} options - Query options
 * @param {string} options.search - Search term for puzzle/author name
 * @param {string} options.sortBy - Sort option: newest, oldest, mostLikes, leastLikes, mostPlayed, leastPlayed
 * @param {string} options.timeRange - Time filter: today, week, month, all
 * @returns {Promise<Array>} Array of puzzle objects
 */
const fetchPuzzles = async (options = {}) => {
    const params = new URLSearchParams();
    if (options.search) params.append('search', options.search);
    if (options.sortBy) params.append('sortBy', options.sortBy);
    if (options.timeRange) params.append('timeRange', options.timeRange);
    if (options.limit) params.append('limit', options.limit);

    const url = `${API_URL}/puzzles${params.toString() ? '?' + params.toString() : ''}`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch puzzles');
        const data = await response.json();
        return data.puzzles || [];
    } catch (error) {
        console.error('Error fetching puzzles:', error);
        return [];
    }
};

/**
 * Fetches a single puzzle by ID
 * @param {string} puzzleId - The puzzle ID
 * @returns {Promise<Object|null>} Puzzle object or null if not found
 */
const fetchPuzzleById = async (puzzleId) => {
    const url = `${API_URL}/puzzles/${puzzleId}`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch puzzle');
        const data = await response.json();
        return data.puzzle || data; // Handle different response formats
    } catch (error) {
        console.error('Error fetching puzzle:', error);
        return null;
    }
};

/**
 * Creates a new puzzle
 * @param {Object} puzzleData - The puzzle data
 * @param {string} puzzleName - Name of the puzzle
 * @param {string} authorName - Author name (default: Nameless)
 * @returns {Promise<Object>} Created puzzle info
 */
const createPuzzle = async (puzzleData, puzzleName, authorName) => {
    const payload = {
        puzzleData,
        puzzleName: puzzleName || 'Untitled Puzzle',
        authorName: authorName || 'Nameless'
    };

    console.log('[API] Creating puzzle:', payload);
    console.log('[API] POST to:', `${API_URL}/puzzles`);

    try {
        const response = await fetch(`${API_URL}/puzzles`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        console.log('[API] Response status:', response.status);
        const data = await response.json();
        console.log('[API] Response data:', data);

        if (!response.ok) throw new Error(data.error || 'Failed to create puzzle');
        return data;
    } catch (error) {
        console.error('[API] Error creating puzzle:', error);
        throw error;
    }
};

/**
 * Records a like or dislike vote
 * @param {string} puzzleId - The puzzle ID
 * @param {string} action - 'like' or 'dislike'
 * @returns {Promise<Object>} Updated vote counts
 */
const votePuzzle = async (puzzleId, action, previousVote = null) => {
    try {
        const response = await fetch(`${API_URL}/puzzles/${puzzleId}/vote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, previousVote })
        });
        if (!response.ok) throw new Error('Failed to vote');
        return await response.json();
    } catch (error) {
        console.error('Error voting:', error);
        throw error;
    }
};

/**
 * Increments the play count for a puzzle
 * @param {string} puzzleId - The puzzle ID
 * @returns {Promise<Object>} Updated play count
 */
const recordPlay = async (puzzleId) => {
    try {
        const response = await fetch(`${API_URL}/puzzles/${puzzleId}/play`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        if (!response.ok) throw new Error('Failed to record play');
        return await response.json();
    } catch (error) {
        console.error('Error recording play:', error);
        // Don't throw - play count is not critical
    }
};

/**
 * Records completion stats (time, moves) for a puzzle
 * @param {string} puzzleId - The puzzle ID
 * @param {number} timeMs - Time taken in milliseconds
 * @param {number} moves - Number of moves made
 * @returns {Promise<Object>} Updated stats
 */
const recordCompletion = async (puzzleId, timeMs, moves) => {
    try {
        const response = await fetch(`${API_URL}/puzzles/${puzzleId}/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ time: timeMs, moves })
        });
        if (!response.ok) throw new Error('Failed to record completion');
        return await response.json();
    } catch (error) {
        console.error('Error recording completion:', error);
        // Don't throw - completion stats are not critical
    }
};

/**
 * Gets the set of puzzle IDs the user has played (from localStorage)
 * @returns {Set<string>} Set of played puzzle IDs
 */
const getPlayedPuzzles = () => {
    const played = localStorage.getItem('playedPuzzles');
    return new Set(played ? JSON.parse(played) : []);
};

/**
 * Marks a puzzle as played in localStorage
 * @param {string} puzzleId - The puzzle ID
 */
const markPuzzlePlayed = (puzzleId) => {
    const played = getPlayedPuzzles();
    played.add(puzzleId);
    localStorage.setItem('playedPuzzles', JSON.stringify([...played]));
};

/**
 * Gets the user's vote for a puzzle from localStorage
 * @param {string} puzzleId - The puzzle ID
 * @returns {string|null} 'like', 'dislike', or null
 */
const getUserVote = (puzzleId) => {
    const votes = JSON.parse(localStorage.getItem('userVotes') || '{}');
    return votes[puzzleId] || null;
};

/**
 * Saves the user's vote in localStorage (prevents double voting)
 * @param {string} puzzleId - The puzzle ID
 * @param {string|null} action - 'like', 'dislike', or null to remove
 */
const saveUserVote = (puzzleId, action) => {
    const votes = JSON.parse(localStorage.getItem('userVotes') || '{}');
    if (action === null) {
        delete votes[puzzleId];
    } else {
        votes[puzzleId] = action;
    }
    localStorage.setItem('userVotes', JSON.stringify(votes));
};
