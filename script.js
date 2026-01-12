let currentPuzzleIndex = 0;
let puzzlePieces = [];
let referencePieces = [];
let levelPreviews = [];
let allSolutions = [];
let puzzleToGroupMap = {};

const buildPuzzleToGroupMap = () => {
  puzzleGroups.forEach(group => {
    group.puzzles.forEach(puzzleIndex => {
      puzzleToGroupMap[puzzleIndex] = group;
    });
  });
};

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

window.onload = () => {
  initializeCoreCanvases(
    document.getElementById('puzzle-canvas'),
    document.getElementById('reference-canvas')
  );
  buildPuzzleToGroupMap();
  loadPuzzle(0);
  populateLevelSelector();
  initializeEventListeners();
};

const loadPuzzle = async (index) => {
  currentPuzzleIndex = index;
  resetGameplayStats();

  activePiece = null;
  hoveredPiece = null;
  isSnapping = false;

  resizeCanvases();
  const puzzleData = puzzles[currentPuzzleIndex];
  const { puzzlePiecesData: rawPuzzlePieces, solutions: rawSolutions, referencePiecesData: rawReferencePieces } = puzzleData;

  allSolutions = rawSolutions ? rawSolutions.map(processPuzzleData) : [processPuzzleData(rawReferencePieces)];
  const solutionForReference = allSolutions[0];
  const puzzlePiecesData = processPuzzleData(rawPuzzlePieces);

  try {
    const allPieceUrls = [...new Set([...puzzlePiecesData.map(p => p.src), ...solutionForReference.map(p => p.src)])];
    const loadedImages = await Promise.all(allPieceUrls.map(loadImage));
    const imageMap = Object.fromEntries(allPieceUrls.map((url, i) => [url, loadedImages[i]]));

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

  } catch (error) {
    console.error("Failed to load puzzle piece images:", error);
    return;
  }

  updatePuzzleCounter();
  updateNavButtons();

  renderReference(referencePieces);
  renderPuzzleScoped();
};

const configureCompletionModal = () => {
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

  const currentGroup = puzzleToGroupMap[currentPuzzleIndex];
  if (currentGroup) {
    groupNameEl.textContent = currentGroup.name;
    const localIndex = currentGroup.puzzles.indexOf(currentPuzzleIndex);
    counterEl.textContent = `${localIndex + 1} of ${currentGroup.puzzles.length}`;
  } else {
    groupNameEl.textContent = "Miscellaneous";
    counterEl.textContent = `${currentPuzzleIndex + 1}`;
  }
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
  const dpr = window.devicePixelRatio;
  const size = 100;
  const adjustedSize = Math.floor(size / GRID_COLS) * GRID_COLS;
  canvas.width = adjustedSize * dpr;
  canvas.height = adjustedSize * dpr;
  ctx.imageSmoothingEnabled = false;

  const tempPreviewCanvas = document.createElement('canvas');
  tempPreviewCanvas.width = canvas.width;
  tempPreviewCanvas.height = canvas.height;
  const tempPreviewCtx = tempPreviewCanvas.getContext('2d');
  tempPreviewCtx.imageSmoothingEnabled = false;

  const cellWidth = canvas.width / GRID_COLS;
  const cellHeight = canvas.height / GRID_ROWS;
  const visualCellWidth = canvas.width / VISUAL_GRID_SIZE;
  const visualCellHeight = canvas.height / VISUAL_GRID_SIZE;

  tempPreviewCtx.globalCompositeOperation = 'source-over';
  tempPreviewCtx.fillStyle = 'black';
  tempPreviewCtx.beginPath();

  puzzlePieces.forEach(data => {
    const piece = {
      ...data,
      x: data.col * cellWidth,
      y: data.row * cellHeight,
      width: data.gridWidth * visualCellWidth,
      height: data.gridHeight * visualCellHeight,
      rotation: data.rotation || 0
    };
    addPiecePathToContext(tempPreviewCtx, piece);
  });

  tempPreviewCtx.fill('evenodd');

  const color = getComputedStyle(document.body).getPropertyValue('--accent-color');
  tempPreviewCtx.globalCompositeOperation = 'source-in';
  tempPreviewCtx.fillStyle = color;
  tempPreviewCtx.fillRect(0, 0, tempPreviewCanvas.width, tempPreviewCanvas.height);

  ctx.drawImage(tempPreviewCanvas, 0, 0);
};

const populateLevelSelector = async () => {
  const levelGrid = document.getElementById('level-grid');
  levelGrid.innerHTML = 'Loading levels...';

  const allPieceUrls = [...new Set(puzzles.flatMap(p => {
    const solutionData = p.solutions ? p.solutions[0] : p.referencePiecesData;
    return solutionData ? solutionData.map(piece => piece.src) : [];
  }))];

  const imageMap = {};

  levelGrid.innerHTML = '';
  levelPreviews = [];

  puzzleGroups.forEach(group => {
    const groupContainer = document.createElement('div');
    groupContainer.className = 'level-group';

    const header = document.createElement('p');
    header.className = 'level-group-header';
    header.textContent = group.name;
    groupContainer.appendChild(header);

    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'level-group-buttons';

    group.puzzles.forEach((puzzleIndex) => {
      const puzzleDefinition = puzzles[puzzleIndex];
      const rawPuzzleData = puzzleDefinition.solutions ? puzzleDefinition.solutions[0] : puzzleDefinition.referencePiecesData;
      const puzzleData = processPuzzleData(rawPuzzleData);
      const previewContainer = document.createElement('div');
      previewContainer.className = 'level-select-preview';
      const canvas = document.createElement('canvas');

      levelPreviews.push({ canvas, puzzlePieces: puzzleData, imageMap });
      drawPuzzlePreview(canvas, puzzleData, imageMap);

      previewContainer.appendChild(canvas);
      previewContainer.onclick = () => {
        hideModal('level-select-modal');
        loadPuzzle(puzzleIndex);
      };
      buttonsContainer.appendChild(previewContainer);
    });

    groupContainer.appendChild(buttonsContainer);
    levelGrid.appendChild(groupContainer);
  });
};

const rerenderLevelPreviews = () => {
  levelPreviews.forEach(preview => {
    drawPuzzlePreview(preview.canvas, preview.puzzlePieces, preview.imageMap);
  });
};