let currentPuzzleIndex = 0;
let puzzles = [];
let currentPuzzle = null;
let puzzlePieces = [];
let referencePieces = [];
let levelPreviews = [];
let allSolutions = [];
let imageMap = {};

const renderPuzzleScoped = (opacity, showGuide) => {
  const finalOpacity = isPuzzleSolved && opacity === undefined ? 0 : opacity;
  const finalShowGuide = isPuzzleSolved && showGuide === undefined ? false : showGuide;
  renderPuzzle(puzzlePieces, finalOpacity, finalShowGuide);
};

const checkCompletionScoped = () => {
  checkCompletion(puzzlePieces, referencePieces);
};

const renderAll = () => {
  if (puzzleCtx && referenceCtx && referencePieces && referencePieces.length > 0) {
    renderReference(referencePieces);
    renderPuzzleScoped();
  }
};

const initializeEventListeners = () => {
  puzzleCanvas.addEventListener('pointerdown', (e) => handlePointerDown(e, puzzlePieces, renderPuzzleScoped, isPuzzleSolved));
  puzzleCanvas.addEventListener('pointermove', (e) => handleHover(e, puzzlePieces, renderPuzzleScoped, isPuzzleSolved));
  puzzleCanvas.addEventListener('pointerleave', () => {
    if (hoveredPiece) {
      hoveredPiece = null;
      renderPuzzleScoped();
    }
  });

  document.getElementById('play-again-button').addEventListener('click', resetPuzzle);
  document.getElementById('next-puzzle-button').addEventListener('click', goToNextPuzzleFromModal);
  document.getElementById('completion-modal').addEventListener('click', (e) => {
    if (e.target.id === 'completion-modal') hideModal('completion-modal');
  });

  document.getElementById('select-level-button').addEventListener('click', () => showModal('level-select-modal'));
  document.getElementById('level-select-modal').addEventListener('click', (e) => {
    if (e.target.id === 'level-select-modal') hideModal('level-select-modal');
  });

  document.getElementById('prev-puzzle-button').addEventListener('click', goToPreviousPuzzle);
  document.getElementById('next-puzzle-button-nav').addEventListener('click', goToNextPuzzle);

  document.getElementById('info-button').addEventListener('click', () => showModal('info-modal'));
  document.getElementById('info-modal').addEventListener('click', (e) => {
    if (e.target.id === 'info-modal') hideModal('info-modal');
  });

  document.getElementById('close-level-select-button').addEventListener('click', () => hideModal('level-select-modal'));
  document.getElementById('close-info-modal-button').addEventListener('click', () => hideModal('info-modal'));
};

window.onload = async () => {
  initializeCoreCanvases(
    document.getElementById('puzzle-canvas'),
    document.getElementById('reference-canvas')
  );

  await loadArchivePuzzles();
  initializeEventListeners();
};

const loadArchivePuzzles = async () => {
  const loadingIndicator = document.getElementById('loading-indicator');
  const archiveContent = document.getElementById('archive-content');
  const levelGrid = document.getElementById('level-grid');

  loadingIndicator.classList.remove('hidden');
  archiveContent.style.display = 'none';
  archiveContent.classList.remove('fade-in');
  levelGrid.innerHTML = '';

  puzzles = await fetchPuzzles({ isDaily: 'true', sortBy: 'oldest', limit: 100 });

  if (puzzles.length === 0) {
    loadingIndicator.classList.add('hidden');
    levelGrid.innerHTML = '<p>No daily puzzles found in archive.</p>';
    return;
  }

  // Preload images for current puzzle and selector
  await preloadImages(puzzles);

  loadingIndicator.classList.add('hidden');
  archiveContent.style.display = 'contents';
  archiveContent.classList.add('fade-in');

  loadPuzzle(0);
  populateLevelSelector();
};

const preloadImages = async (puzzlesToLoad) => {
  const allPieceUrls = [...new Set(puzzlesToLoad.flatMap(p => {
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

const loadPuzzle = async (index) => {
  if (index < 0 || index >= puzzles.length) return;

  currentPuzzleIndex = index;
  currentPuzzle = puzzles[currentPuzzleIndex]; // Set currentPuzzle for puzzle-gameplay.js
  resetGameplayStats();

  activePiece = null;
  hoveredPiece = null;
  isSnapping = false;

  resizeCanvases();

  const puzzle = currentPuzzle;
  const puzzleData = puzzle.puzzleData;
  const { puzzlePiecesData: rawPuzzlePieces, solutions: rawSolutions } = puzzleData;

  allSolutions = rawSolutions.map(processPuzzleData);
  const solutionForReference = allSolutions[0];
  const puzzlePiecesData = processPuzzleData(rawPuzzlePieces);

  puzzlePieces = puzzlePiecesData.map((data) => ({
    ...data,
    col: data.startCol,
    row: data.startRow,
    img: imageMap[data.src]
  }));
  puzzlePieces.forEach(p => updatePiecePixelDimensions(p, puzzleCanvas));

  referencePieces = solutionForReference.map(data => ({
    ...data,
    img: imageMap[data.src]
  }));
  referencePieces.forEach(p => updatePiecePixelDimensions(p, referenceCanvas));

  updatePuzzleCounter();
  updateNavButtons();

  renderReference(referencePieces);
  renderPuzzleScoped();

  // Highlight active level in selector if modal is open
  updateActiveLevelInSelector();
};

const configureCompletionModal = (timeMs, moves, stats) => {
  const nextPuzzlebutton = document.getElementById('next-puzzle-button');
  if (currentPuzzleIndex < puzzles.length - 1) {
    nextPuzzlebutton.style.display = 'inline-block';
  } else {
    nextPuzzlebutton.style.display = 'none';
  }
};

const resetPuzzle = () => {
  hideModal('completion-modal');
  loadPuzzle(currentPuzzleIndex);
};

const updatePuzzleCounter = () => {
  const groupNameEl = document.getElementById('puzzle-group-name');
  const counterEl = document.getElementById('puzzle-counter');
  if (!groupNameEl || !counterEl) return;

  const puzzle = puzzles[currentPuzzleIndex];
  const date = new Date(puzzle.scheduledDate + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  groupNameEl.textContent = `Daily Puzzle #${puzzle.dailyNumber}`;
  counterEl.textContent = date;
};

const updateNavButtons = () => {
  document.getElementById('prev-puzzle-button').disabled = (currentPuzzleIndex === 0);
  document.getElementById('next-puzzle-button-nav').disabled = (currentPuzzleIndex === puzzles.length - 1);
};

const goToPreviousPuzzle = () => {
  if (currentPuzzleIndex > 0) loadPuzzle(currentPuzzleIndex - 1);
};

const goToNextPuzzle = () => {
  if (currentPuzzleIndex < puzzles.length - 1) loadPuzzle(currentPuzzleIndex + 1);
};

const goToNextPuzzleFromModal = () => {
  hideModal('completion-modal');
  goToNextPuzzle();
};

const drawPuzzlePreview = (canvas, puzzlePieces, imageMap) => {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const size = 120; // Slightly larger for better visibility
  const adjustedSize = Math.floor(size / GRID_COLS) * GRID_COLS;
  canvas.width = adjustedSize * dpr;
  canvas.height = adjustedSize * dpr;
  canvas.style.width = `${adjustedSize}px`;
  canvas.style.height = `${adjustedSize}px`;
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

const populateLevelSelector = () => {
  const levelGrid = document.getElementById('level-grid');
  levelGrid.innerHTML = '';
  levelPreviews = [];

  // Group dailies by month
  const groups = {};
  puzzles.forEach((puzzle, index) => {
    const date = new Date(puzzle.scheduledDate + 'T00:00:00');
    const monthYear = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (!groups[monthYear]) groups[monthYear] = [];
    groups[monthYear].push({ puzzle, index });
  });

  // Sort groups (we already fetched puzzles sorted by oldest, so they should be in order)
  // But if we want newest first in the grid, we could reverse them.
  // Actually, oldest first is fine for an archive if that's how it's fetched.

  Object.keys(groups).forEach(monthYear => {
    const groupContainer = document.createElement('div');
    groupContainer.className = 'level-group';

    const header = document.createElement('p');
    header.className = 'level-group-header';
    header.textContent = monthYear;
    groupContainer.appendChild(header);

    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'level-group-buttons';

    groups[monthYear].forEach(({ puzzle, index }) => {
      const solutionPieces = processPuzzleData(puzzle.puzzleData.solutions[0]);

      const previewContainer = document.createElement('div');
      previewContainer.className = 'level-select-preview';
      previewContainer.id = `level-preview-${index}`;

      const canvas = document.createElement('canvas');
      const label = document.createElement('span');
      label.className = 'level-number';
      label.textContent = `#${puzzle.dailyNumber}`;

      drawPuzzlePreview(canvas, solutionPieces, imageMap);

      previewContainer.appendChild(canvas);
      previewContainer.appendChild(label);
      previewContainer.onclick = () => {
        hideModal('level-select-modal');
        loadPuzzle(index);
      };

      buttonsContainer.appendChild(previewContainer);
    });

    groupContainer.appendChild(buttonsContainer);
    levelGrid.appendChild(groupContainer);
  });

  updateActiveLevelInSelector();
};

const updateActiveLevelInSelector = () => {
  document.querySelectorAll('.level-select-preview').forEach(el => {
    el.classList.remove('active');
  });
  const current = document.getElementById(`level-preview-${currentPuzzleIndex}`);
  if (current) current.classList.add('active');
};

const rerenderLevelPreviews = () => {
  // Not used in simplified archive but good to have for theme changes
  populateLevelSelector();
};