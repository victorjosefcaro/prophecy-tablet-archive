// --- explore.js ---
// Logic for the Explore page - displays user-created puzzles from API

// --- Page State ---
let userPuzzles = [];
let puzzlePieces = [];
let referencePieces = [];
let imageMap = {};
let levelPreviews = [];
let currentPuzzle = null;

// --- Helper Functions ---
const formatDate = (timestamp) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${diffDays >= 14 ? 's' : ''} ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatTime = (ms) => {
  if (!ms || ms === 0) return '--';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
};

const getAvgStats = (puzzle) => {
  if (!puzzle.completionCount || puzzle.completionCount === 0) {
    return { avgTime: '--', avgMoves: '--' };
  }
  const avgTime = formatTime(Math.round(puzzle.totalTimeMs / puzzle.completionCount));
  const avgMoves = Math.round(puzzle.totalMoves / puzzle.completionCount);
  return { avgTime, avgMoves };
};

// --- DOM Elements ---
const gridView = document.getElementById('explore-grid-view');
const gameplayView = document.getElementById('explore-gameplay-view');
const searchInput = document.getElementById('search-input');
const sortField = document.getElementById('sort-field');
const sortOrder = document.getElementById('sort-order');
const timeSelect = document.getElementById('time-select');
const playedFilter = document.getElementById('played-filter');
const noPuzzlesMessage = document.getElementById('no-puzzles-message');
const loadingIndicator = document.getElementById('loading-indicator');
const exploreGrid = document.getElementById('explore-grid');

// --- Scoped Functions for puzzle-gameplay.js ---
const renderPuzzleScoped = (opacity, showGuide) => renderPuzzle(puzzlePieces, opacity, showGuide);
const checkCompletionScoped = () => checkCompletion(puzzlePieces, referencePieces);
const configureCompletionModal = (timeMs, moves) => {
  const nextPuzzleButton = document.getElementById('next-puzzle-button');
  if (nextPuzzleButton) nextPuzzleButton.style.display = 'none';

  // Update vote button states when completion modal opens
  updateCompletionVoteButtons();

  // Update performance comparison if time and moves provided
  if (timeMs !== undefined && moves !== undefined) {
    updatePerformanceComparison(timeMs, moves);
  }
};

// --- Initialization ---
window.onload = async () => {
  await loadPuzzlesFromAPI();
  setupEventListeners();
};

const setupEventListeners = () => {
  // Back buttons
  document.getElementById('back-to-grid-button').addEventListener('click', showGridView);
  document.getElementById('back-to-explore-button').addEventListener('click', showGridView);

  // Modal buttons
  document.getElementById('close-completion-x-button').addEventListener('click', () => hideModal('completion-modal'));
  document.getElementById('play-again-button').addEventListener('click', resetCurrentPuzzle);

  // Completion modal vote buttons
  const completionLikeBtn = document.getElementById('completion-like-btn');
  const completionDislikeBtn = document.getElementById('completion-dislike-btn');

  completionLikeBtn.addEventListener('click', () => {
    if (currentPuzzle) handleCompletionVote('like', completionLikeBtn, completionDislikeBtn);
  });
  completionDislikeBtn.addEventListener('click', () => {
    if (currentPuzzle) handleCompletionVote('dislike', completionLikeBtn, completionDislikeBtn);
  });

  // Filter controls
  let searchTimeout;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(loadPuzzlesFromAPI, 300);
  });
  sortField.addEventListener('change', loadPuzzlesFromAPI);
  sortOrder.addEventListener('change', loadPuzzlesFromAPI);
  timeSelect.addEventListener('change', loadPuzzlesFromAPI);
  playedFilter.addEventListener('change', filterByPlayed);
};

const loadPuzzlesFromAPI = async () => {
  // Show loading indicator
  loadingIndicator.classList.remove('hidden');
  exploreGrid.style.display = 'none';
  noPuzzlesMessage.style.display = 'none';

  const options = {
    search: searchInput.value,
    timeRange: timeSelect.value
  };

  userPuzzles = await fetchPuzzles(options);

  // Client-side sorting
  const field = sortField.value;
  const order = sortOrder.value;

  const getAvg = (puzzle, type) => {
    if (!puzzle.completionCount || puzzle.completionCount === 0) return order === 'asc' ? Infinity : -Infinity;
    return type === 'time'
      ? puzzle.totalTimeMs / puzzle.completionCount
      : puzzle.totalMoves / puzzle.completionCount;
  };

  const sortFunctions = {
    date: (a, b) => b.createdAt - a.createdAt,
    likes: (a, b) => b.likes - a.likes,
    dislikes: (a, b) => b.dislikes - a.dislikes,
    playCount: (a, b) => b.playCount - a.playCount,
    avgTime: (a, b) => getAvg(b, 'time') - getAvg(a, 'time'),
    avgMoves: (a, b) => getAvg(b, 'moves') - getAvg(a, 'moves')
  };

  userPuzzles.sort(sortFunctions[field] || sortFunctions.date);
  if (order === 'asc') userPuzzles.reverse();

  // Hide loading indicator
  loadingIndicator.classList.add('hidden');
  exploreGrid.style.display = '';

  filterByPlayed();
};

const filterByPlayed = () => {
  const filter = playedFilter.value;
  const playedSet = getPlayedPuzzles();

  let filtered = userPuzzles;
  if (filter === 'played') {
    filtered = userPuzzles.filter(p => playedSet.has(p.id));
  } else if (filter === 'unplayed') {
    filtered = userPuzzles.filter(p => !playedSet.has(p.id));
  }

  populateExploreGrid(filtered);
};

const preloadImages = async (puzzles) => {
  const allPieceUrls = [...new Set(puzzles.flatMap(p => {
    const data = p.puzzleData;
    return [
      ...data.puzzlePiecesData.map(pd => pd.src),
      ...data.solutions[0].map(s => s.src)
    ];
  }))];

  try {
    const loadedImages = await Promise.all(allPieceUrls.map(loadImage));
    imageMap = Object.fromEntries(allPieceUrls.map((url, i) => [url, loadedImages[i]]));
  } catch (error) {
    console.error("Failed to preload images:", error);
  }
};

const populateExploreGrid = async (puzzles) => {
  const grid = document.getElementById('explore-grid');
  grid.innerHTML = '';
  levelPreviews = [];

  if (puzzles.length === 0) {
    noPuzzlesMessage.style.display = 'block';
    return;
  }
  noPuzzlesMessage.style.display = 'none';

  await preloadImages(puzzles);
  const playedSet = getPlayedPuzzles();
  const previewsToDraw = [];

  puzzles.forEach((puzzle) => {
    const card = document.createElement('div');
    card.className = 'explore-preview-card';
    if (playedSet.has(puzzle.id)) card.classList.add('played');

    // Canvas preview
    const canvas = document.createElement('canvas');
    card.appendChild(canvas);

    const solutionPieces = puzzle.puzzleData.solutions[0];
    levelPreviews.push({ canvas, puzzlePieces: solutionPieces, imageMap });
    previewsToDraw.push(() => drawPuzzlePreview(canvas, solutionPieces, imageMap));

    // Info section
    const info = document.createElement('div');
    info.className = 'puzzle-card-info';

    // Puzzle name heading
    const title = document.createElement('div');
    title.className = 'puzzle-card-title';
    title.textContent = puzzle.puzzleName;
    info.appendChild(title);

    // 2x2 grid: author/date on left, avg stats on right
    const { avgTime, avgMoves } = getAvgStats(puzzle);
    const gridSection = document.createElement('div');
    gridSection.className = 'puzzle-card-grid';

    const hasAvg = puzzle.completionCount > 0;
    gridSection.innerHTML = `
      <div class="grid-left">
        <div class="puzzle-card-author">by ${puzzle.authorName}</div>
        <div class="puzzle-card-date">${formatDate(puzzle.createdAt)}</div>
      </div>
      <div class="grid-right">
        <div class="avg-inline">Avg Time: <span class="avg-value">${hasAvg ? avgTime : '--'}</span></div>
        <div class="avg-inline">Avg Moves: <span class="avg-value">${hasAvg ? avgMoves : '--'}</span></div>
      </div>
    `;
    info.appendChild(gridSection);

    // Stats row: votes and plays on left
    const statsRow = document.createElement('div');
    statsRow.className = 'puzzle-card-stats';
    statsRow.innerHTML = `
      <div class="stats-group votes">
        <span><i class="fa-solid fa-thumbs-up"></i> ${puzzle.likes}</span>
        <span><i class="fa-solid fa-thumbs-down"></i> ${puzzle.dislikes}</span>
      </div>
      <div class="stats-group plays">
        <span><i class="fa-solid fa-play"></i> ${puzzle.playCount}</span>
      </div>
    `;
    info.appendChild(statsRow);

    card.appendChild(info);

    // Play on canvas click
    canvas.onclick = () => openGameplayView(puzzle);

    grid.appendChild(card);
  });

  requestAnimationFrame(() => {
    previewsToDraw.forEach(drawFn => drawFn());
  });
};

const handleVote = async (puzzleId, action, likeBtn, dislikeBtn, statsEl, puzzle) => {
  const currentVote = getUserVote(puzzleId);

  // Calculate new counts optimistically
  let newLikes = puzzle.likes;
  let newDislikes = puzzle.dislikes;
  let newVote = action;

  // If clicking the same button, remove the vote (toggle off)
  if (currentVote === action) {
    if (action === 'like') {
      newLikes--;
    } else {
      newDislikes--;
    }
    newVote = null; // Clear the vote
  } else if (currentVote === 'like' && action === 'dislike') {
    // Switching from like to dislike
    newLikes--;
    newDislikes++;
  } else if (currentVote === 'dislike' && action === 'like') {
    // Switching from dislike to like
    newDislikes--;
    newLikes++;
  } else if (action === 'like') {
    // New like
    newLikes++;
  } else if (action === 'dislike') {
    // New dislike
    newDislikes++;
  }

  // Save vote locally first (optimistic)
  saveUserVote(puzzleId, newVote);
  puzzle.likes = newLikes;
  puzzle.dislikes = newDislikes;

  // Update UI immediately (optimistic)
  likeBtn.classList.toggle('voted', newVote === 'like');
  dislikeBtn.classList.toggle('voted', newVote === 'dislike');
  updateStatsDisplay(statsEl, newLikes, newDislikes, puzzle.playCount);

  // Fire API call in background (don't await)
  votePuzzle(puzzleId, newVote, currentVote).catch(error => {
    console.error('Vote failed:', error);
    // Optionally rollback on error
  });
};

const updateStatsDisplay = (statsEl, likes, dislikes, playCount) => {
  statsEl.innerHTML = `
    <span><i class="fa-solid fa-thumbs-up"></i> ${likes}</span>
    <span><i class="fa-solid fa-thumbs-down"></i> ${dislikes}</span>
    <span><i class="fa-solid fa-play"></i> ${playCount}</span>
  `;
};

const handleCompletionVote = (action, likeBtn, dislikeBtn) => {
  if (!currentPuzzle) return;

  const puzzleId = currentPuzzle.id;
  const currentVote = getUserVote(puzzleId);

  let newLikes = currentPuzzle.likes;
  let newDislikes = currentPuzzle.dislikes;
  let newVote = action;

  // If clicking the same button, remove the vote (toggle off)
  if (currentVote === action) {
    if (action === 'like') {
      newLikes--;
    } else {
      newDislikes--;
    }
    newVote = null;
  } else if (currentVote === 'like' && action === 'dislike') {
    newLikes--;
    newDislikes++;
  } else if (currentVote === 'dislike' && action === 'like') {
    newDislikes--;
    newLikes++;
  } else if (action === 'like') {
    newLikes++;
  } else if (action === 'dislike') {
    newDislikes++;
  }

  // Save vote locally
  saveUserVote(puzzleId, newVote);
  currentPuzzle.likes = newLikes;
  currentPuzzle.dislikes = newDislikes;

  // Update button styles
  likeBtn.classList.toggle('voted', newVote === 'like');
  dislikeBtn.classList.toggle('voted', newVote === 'dislike');

  // Fire API call in background
  votePuzzle(puzzleId, newVote, currentVote).catch(error => {
    console.error('Vote failed:', error);
  });
};

// Update vote button states when completion modal opens
const updateCompletionVoteButtons = () => {
  if (!currentPuzzle) return;
  const userVote = getUserVote(currentPuzzle.id);
  const likeBtn = document.getElementById('completion-like-btn');
  const dislikeBtn = document.getElementById('completion-dislike-btn');
  likeBtn.classList.toggle('voted', userVote === 'like');
  dislikeBtn.classList.toggle('voted', userVote === 'dislike');
};

// Update performance comparison section
const updatePerformanceComparison = (userTimeMs, userMoves) => {
  const comparisonSection = document.getElementById('performance-comparison');
  if (!comparisonSection) return;

  // Check if puzzle has average data
  if (!currentPuzzle || !currentPuzzle.completionCount || currentPuzzle.completionCount === 0) {
    comparisonSection.style.display = 'none';
    return;
  }

  const avgTimeMs = currentPuzzle.totalTimeMs / currentPuzzle.completionCount;
  const avgMoves = currentPuzzle.totalMoves / currentPuzzle.completionCount;

  const timeDiff = userTimeMs - avgTimeMs;
  const movesDiff = userMoves - avgMoves;

  const formatTimeDiff = (diffMs) => {
    const absDiff = Math.abs(diffMs);
    const seconds = Math.floor(absDiff / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    const sign = diffMs < 0 ? '-' : '+';
    if (minutes > 0) return `${sign}${minutes}m ${remainingSeconds}s`;
    return `${sign}${remainingSeconds}s`;
  };

  const timeDiffEl = document.getElementById('time-diff');
  const movesDiffEl = document.getElementById('moves-diff');

  // Time comparison (lower is better)
  timeDiffEl.textContent = formatTimeDiff(timeDiff);
  timeDiffEl.className = 'comparison-value ' + (timeDiff < -500 ? 'better' : timeDiff > 500 ? 'worse' : 'same');

  // Moves comparison (lower is better)
  const movesDiffSign = movesDiff > 0 ? '+' : '';
  movesDiffEl.textContent = `${movesDiffSign}${Math.round(movesDiff)}`;
  movesDiffEl.className = 'comparison-value ' + (movesDiff < -1 ? 'better' : movesDiff > 1 ? 'worse' : 'same');

  comparisonSection.style.display = 'block';
};

const openGameplayView = async (puzzle) => {
  gridView.style.display = 'none';
  gameplayView.style.display = 'flex';
  document.body.classList.add('no-scroll');
  currentPuzzle = puzzle;

  // Display puzzle info
  document.getElementById('explore-puzzle-name').textContent = puzzle.puzzleName;
  document.getElementById('explore-puzzle-author').textContent = `by ${puzzle.authorName}`;

  initializeCoreCanvases(
    document.getElementById('puzzle-canvas'),
    document.getElementById('reference-canvas')
  );

  loadPuzzle(puzzle);

  // Record play
  recordPlay(puzzle.id);
  markPuzzlePlayed(puzzle.id);
};

const showGridView = () => {
  gameplayView.style.display = 'none';
  gridView.style.display = 'block';
  document.body.classList.remove('no-scroll');

  if (puzzleCtx) puzzleCtx.clearRect(0, 0, puzzleCanvas.width, puzzleCanvas.height);
  if (referenceCtx) referenceCtx.clearRect(0, 0, referenceCtx.canvas.width, referenceCtx.canvas.height);
  hideModal('completion-modal');

  // Refresh to show updated play counts
  loadPuzzlesFromAPI();
};

const loadPuzzle = (puzzle) => {
  const puzzleData = puzzle.puzzleData;

  resetGameplayStats();
  activePiece = null;
  hoveredPiece = null;
  isSnapping = false;

  const solutionForReference = puzzleData.solutions[0];

  puzzlePieces = puzzleData.puzzlePiecesData.map(data => ({
    ...data,
    col: data.startCol,
    row: data.startRow,
    img: imageMap[data.src]
  }));

  referencePieces = solutionForReference.map(data => ({
    ...data,
    img: imageMap[data.src]
  }));

  resizeCanvases([...puzzlePieces, ...referencePieces]);
  renderReference(referencePieces);
  renderPuzzleScoped();

  puzzleCanvas.addEventListener('pointerdown', (e) => handlePointerDown(e, puzzlePieces, renderPuzzleScoped, isPuzzleSolved));
  puzzleCanvas.addEventListener('pointermove', (e) => handleHover(e, puzzlePieces, renderPuzzleScoped, isPuzzleSolved));
};

const resetCurrentPuzzle = () => {
  hideModal('completion-modal');
  if (currentPuzzle) {
    loadPuzzle(currentPuzzle);
  }
};

const drawPuzzlePreview = (canvas, puzzlePieces, imageMap) => {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  const size = Math.floor(rect.width / GRID_COLS) * GRID_COLS;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  ctx.imageSmoothingEnabled = false;

  const tempPreviewCanvas = document.createElement('canvas');
  tempPreviewCanvas.width = canvas.width;
  tempPreviewCanvas.height = canvas.height;
  const tempPreviewCtx = tempPreviewCanvas.getContext('2d');
  tempPreviewCtx.imageSmoothingEnabled = false;
  tempPreviewCtx.globalCompositeOperation = 'xor';

  puzzlePieces.forEach(data => {
    const piece = { ...data, img: imageMap[data.src] };
    updatePiecePixelDimensions(piece, canvas);
    drawImageTransformed(tempPreviewCtx, piece);
  });

  const color = getComputedStyle(document.body).getPropertyValue('--accent-color');
  tempPreviewCtx.globalCompositeOperation = 'source-in';
  tempPreviewCtx.fillStyle = color;
  tempPreviewCtx.fillRect(0, 0, tempPreviewCanvas.width, tempPreviewCanvas.height);

  ctx.drawImage(tempPreviewCanvas, 0, 0);
};

const rerenderExplorePreviews = () => {
  levelPreviews.forEach(preview => {
    drawPuzzlePreview(preview.canvas, preview.puzzlePieces, preview.imageMap);
  });
};