const API_URL = 'https://6l9qzyjsd8.execute-api.ap-southeast-2.amazonaws.com/prod';

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

const fetchScheduledDailies = async (days = 14) => {
  const results = [];
  const today = new Date();

  for (let i = 0; i < days; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() + i);
    const dateStr = checkDate.toISOString().split('T')[0];

    const puzzle = await fetchDailyPuzzle(dateStr);
    results.push({
      date: dateStr,
      puzzle: puzzle,
    });
  }

  return results;
};

const fetchPuzzleById = async (puzzleId) => {
  const url = `${API_URL}/puzzles/${puzzleId}`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch puzzle');
    const data = await response.json();
    return data.puzzle || data;
  } catch (error) {
    console.error('Error fetching puzzle:', error);
    return null;
  }
};

const createPuzzle = async (
  puzzleData,
  puzzleName,
  authorName,
  isDaily,
  scheduledDate,
  adminSecret = null
) => {
  const payload = {
    puzzleData,
    puzzleName: puzzleName || 'Untitled Puzzle',
    authorName: authorName || 'Nameless',
    isDaily: isDaily || false,
    scheduledDate: scheduledDate || null,
  };

  const headers = { 'Content-Type': 'application/json' };
  if (adminSecret) {
    headers['X-Admin-Secret'] = adminSecret;
  }

  const response = await fetch(`${API_URL}/puzzles`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to create puzzle');
  return data;
};

const ratePuzzle = async (puzzleId, rating, previousRating = null) => {
  try {
    const response = await fetch(`${API_URL}/puzzles/${puzzleId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating, previousRating }),
    });
    if (!response.ok) throw new Error('Failed to rate');
    return await response.json();
  } catch (error) {
    console.error('Error rating:', error);
    throw error;
  }
};

const recordPlay = async (puzzleId) => {
  try {
    const response = await fetch(`${API_URL}/puzzles/${puzzleId}/play`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) throw new Error('Failed to record play');
    return await response.json();
  } catch (error) {
    console.error('Error recording play:', error);
  }
};

const recordCompletion = async (puzzleId, timeMs, moves) => {
  try {
    const response = await fetch(`${API_URL}/puzzles/${puzzleId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ time: timeMs, moves }),
    });
    if (!response.ok) throw new Error('Failed to record completion');
    return await response.json();
  } catch (error) {
    console.error('Error recording completion:', error);
  }
};

const getPlayedPuzzles = () => {
  const played = localStorage.getItem('playedPuzzles');
  return new Set(played ? JSON.parse(played) : []);
};

const markPuzzlePlayed = (puzzleId) => {
  const played = getPlayedPuzzles();
  played.add(puzzleId);
  localStorage.setItem('playedPuzzles', JSON.stringify([...played]));
};

const getUserRating = (puzzleId) => {
  const ratings = JSON.parse(localStorage.getItem('userRatings') || '{}');
  return ratings[puzzleId] || null;
};

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
    return typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    return {};
  }
};

const isDailyCompleted = (puzzleId) => {
  return !!getCompletedDailies()[puzzleId];
};

const getDailyCompletion = (puzzleId) => {
  return getCompletedDailies()[puzzleId] || null;
};

const markDailyCompleted = (puzzleId, time, moves) => {
  const completed = getCompletedDailies();
  completed[puzzleId] = { time, moves, date: new Date().toISOString() };
  localStorage.setItem('completedDailies', JSON.stringify(completed));
};
