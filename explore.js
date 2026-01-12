// --- explore.js ---
// Logic for the Explore page - displays user-created puzzles from API

// --- Page State ---
let userPuzzles = [];
let puzzlePieces = [];
let referencePieces = [];
let imageMap = {};
let levelPreviews = [];
let currentPuzzle = null;

// --- DOM Elements ---
const gridView = document.getElementById('explore-grid-view');
const gameplayView = document.getElementById('explore-gameplay-view');
const searchInput = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select');
const timeSelect = document.getElementById('time-select');
const playedFilter = document.getElementById('played-filter');
const noPuzzlesMessage = document.getElementById('no-puzzles-message');

// --- Scoped Functions for puzzle-gameplay.js ---
const renderPuzzleScoped = (opacity, showGuide) => renderPuzzle(puzzlePieces, opacity, showGuide);
const checkCompletionScoped = () => checkCompletion(puzzlePieces, referencePieces);
const configureCompletionModal = () => {
  const nextPuzzleButton = document.getElementById('next-puzzle-button');
  if (nextPuzzleButton) nextPuzzleButton.style.display = 'none';
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

  // Filter controls
  let searchTimeout;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(loadPuzzlesFromAPI, 300);
  });
  sortSelect.addEventListener('change', loadPuzzlesFromAPI);
  timeSelect.addEventListener('change', loadPuzzlesFromAPI);
  playedFilter.addEventListener('change', filterByPlayed);
};

const loadPuzzlesFromAPI = async () => {
  const options = {
    search: searchInput.value,
    sortBy: sortSelect.value,
    timeRange: timeSelect.value
  };

  userPuzzles = await fetchPuzzles(options);
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

    const title = document.createElement('div');
    title.className = 'puzzle-card-title';
    title.textContent = puzzle.puzzleName;
    info.appendChild(title);

    const author = document.createElement('div');
    author.className = 'puzzle-card-author';
    author.textContent = `by ${puzzle.authorName}`;
    info.appendChild(author);

    const stats = document.createElement('div');
    stats.className = 'puzzle-card-stats';
    stats.innerHTML = `
      <span><i class="fa-solid fa-thumbs-up"></i> ${puzzle.likes}</span>
      <span><i class="fa-solid fa-thumbs-down"></i> ${puzzle.dislikes}</span>
      <span><i class="fa-solid fa-play"></i> ${puzzle.playCount}</span>
    `;
    info.appendChild(stats);

    // Vote buttons
    const votes = document.createElement('div');
    votes.className = 'vote-buttons';
    const userVote = getUserVote(puzzle.id);

    const likeBtn = document.createElement('button');
    likeBtn.className = `vote-btn ${userVote === 'like' ? 'voted' : ''}`;
    likeBtn.innerHTML = '<i class="fa-solid fa-thumbs-up"></i> Like';
    likeBtn.onclick = (e) => { e.stopPropagation(); handleVote(puzzle.id, 'like', likeBtn, dislikeBtn, stats); };

    const dislikeBtn = document.createElement('button');
    dislikeBtn.className = `vote-btn ${userVote === 'dislike' ? 'voted' : ''}`;
    dislikeBtn.innerHTML = '<i class="fa-solid fa-thumbs-down"></i>';
    dislikeBtn.onclick = (e) => { e.stopPropagation(); handleVote(puzzle.id, 'dislike', likeBtn, dislikeBtn, stats); };

    votes.appendChild(likeBtn);
    votes.appendChild(dislikeBtn);
    info.appendChild(votes);

    card.appendChild(info);

    // Play on canvas click
    canvas.onclick = () => openGameplayView(puzzle);

    grid.appendChild(card);
  });

  requestAnimationFrame(() => {
    previewsToDraw.forEach(drawFn => drawFn());
  });
};

const handleVote = async (puzzleId, action, likeBtn, dislikeBtn, statsEl) => {
  const currentVote = getUserVote(puzzleId);
  if (currentVote === action) return; // Already voted this way

  try {
    const result = await votePuzzle(puzzleId, action);
    saveUserVote(puzzleId, action);

    // Update UI
    likeBtn.classList.toggle('voted', action === 'like');
    dislikeBtn.classList.toggle('voted', action === 'dislike');

    statsEl.innerHTML = `
      <span><i class="fa-solid fa-thumbs-up"></i> ${result.likes}</span>
      <span><i class="fa-solid fa-thumbs-down"></i> ${result.dislikes}</span>
      <span><i class="fa-solid fa-play"></i> ${statsEl.querySelector('.fa-play').parentElement.textContent.trim().split(' ')[1] || 0}</span>
    `;
  } catch (error) {
    console.error('Vote failed:', error);
  }
};

const openGameplayView = async (puzzle) => {
  gridView.style.display = 'none';
  gameplayView.style.display = 'flex';
  currentPuzzle = puzzle;

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