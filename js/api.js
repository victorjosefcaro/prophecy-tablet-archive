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
    if (options.isDaily) params.append('isDaily', options.isDaily);

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
 * Fetches the daily puzzle for a specific date
 * @param {string} date - Date in YYYY-MM-DD format (defaults to today)
 * @returns {Promise<Object|null>} Daily puzzle object or null
 */
const fetchDailyPuzzle = async (date = null) => {
    if (!date) {
        date = new Date().toISOString().split('T')[0];
    }
    const url = `${API_URL}/puzzles?dailyDate=${date}`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch daily puzzle');
        const data = await response.json();
        return data.puzzles && data.puzzles.length > 0 ? data.puzzles[0] : null;
    } catch (error) {
        console.error('Error fetching daily puzzle:', error);
        return null;
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
 * @param {boolean} isDaily - Whether this is a daily puzzle
 * @param {string} scheduledDate - Date for the daily puzzle (YYYY-MM-DD)
 * @returns {Promise<Object>} Created puzzle info
 */
const createPuzzle = async (puzzleData, puzzleName, authorName, isDaily, scheduledDate) => {
    const payload = {
        puzzleData,
        puzzleName: puzzleName || 'Untitled Puzzle',
        authorName: authorName || 'Nameless',
        isDaily: isDaily || false,
        scheduledDate: scheduledDate || null
    };

    try {
        const response = await fetch(`${API_URL}/puzzles`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to create puzzle');
        return data;
    } catch (error) {
        // We throw the error but don't log it here to avoid cluttering the console 
        // with expected validation errors.
        throw error;
    }
};

/**
 * Records a star rating
 * @param {string} puzzleId - The puzzle ID
 * @param {number} rating - Star rating (1-5)
 * @returns {Promise<Object>} Updated rating stats
 */
const ratePuzzle = async (puzzleId, rating, previousRating = null) => {
    try {
        const response = await fetch(`${API_URL}/puzzles/${puzzleId}/vote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rating, previousRating })
        });
        if (!response.ok) throw new Error('Failed to rate');
        return await response.json();
    } catch (error) {
        console.error('Error rating:', error);
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
 * Gets the user's rating for a puzzle from localStorage
 * @param {string} puzzleId - The puzzle ID
 * @returns {number|null} 1-5, or null
 */
const getUserRating = (puzzleId) => {
    const ratings = JSON.parse(localStorage.getItem('userRatings') || '{}');
    return ratings[puzzleId] || null;
};

/**
 * Saves the user's rating in localStorage
 * @param {string} puzzleId - The puzzle ID
 * @param {number|null} rating - 1-5, or null to remove
 */
const saveUserRating = (puzzleId, rating) => {
    const ratings = JSON.parse(localStorage.getItem('userRatings') || '{}');
    if (rating === null) {
        delete ratings[puzzleId];
    } else {
        ratings[puzzleId] = rating;
    }
    localStorage.setItem('userRatings', JSON.stringify(ratings));
};

const getCompletedDailies = () => {
    try {
        const stored = localStorage.getItem('completedDailies');
        if (!stored) return {};
        const parsed = JSON.parse(stored);
        return (typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    } catch (e) {
        return {};
    }
};

/**
 * Checks if a daily puzzle has been completed
 * @param {string} puzzleId - The puzzle ID
 * @returns {boolean} True if completed
 */
const isDailyCompleted = (puzzleId) => {
    return !!getCompletedDailies()[puzzleId];
};

/**
 * Gets historical stats for a completed daily
 * @param {string} puzzleId
 * @returns {Object|null} {time, moves} or null
 */
const getDailyCompletion = (puzzleId) => {
    return getCompletedDailies()[puzzleId] || null;
};

/**
 * Marks a daily puzzle as completed with stats
 * @param {string} puzzleId - The puzzle ID
 * @param {number} time - Time in ms
 * @param {number} moves - Moves count
 */
const markDailyCompleted = (puzzleId, time, moves) => {
    const completed = getCompletedDailies();
    completed[puzzleId] = { time, moves, date: new Date().toISOString() };
    localStorage.setItem('completedDailies', JSON.stringify(completed));
};
