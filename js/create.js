let selectedPieces = new Set();
let activeCanvas = null;
let selectionBox = null;
const solutionPieces = [];
const startPieces = [];
let deleteProgressFill = null;
let deleteAllTimer = null;
let deleteAllAnimationTimer = null;
let isPublishModalOpen = false;

const undoStack = [];
const redoStack = [];
const MAX_HISTORY = 50;

let solutionCanvas, solutionCtx, startCanvas, startCtx;
const paletteContainer = document.getElementById('piece-palette');
const controlsPanel = document.getElementById('controls-panel');
const exportbutton = document.getElementById('export-button');

const PIECE_TYPES = [
  { src: 'pieces/square.svg', gridWidth: 2, gridHeight: 2, shape: 'square' },
  { src: 'pieces/isosceles-triangle.svg', gridWidth: 2, gridHeight: 1, shape: 'triangle' },
  { src: 'pieces/right-triangle.svg', gridWidth: 2, gridHeight: 2, shape: 'right-triangle' },
  { src: 'pieces/diamond.svg', gridWidth: 2, gridHeight: 2, shape: 'diamond' },
  { src: 'pieces/trapezoid-left.svg', gridWidth: 2, gridHeight: 3, shape: 'trapezoid-left' },
  { src: 'pieces/trapezoid-right.svg', gridWidth: 2, gridHeight: 3, shape: 'trapezoid-right' },
];
let imageMap = {};
let paletteItems = [];

const initializeEditor = async () => {
  try {
    const allUrls = PIECE_TYPES.map((p) => p.src);

    const loadedImages = await Promise.all(allUrls.map(loadImage));
    imageMap = Object.fromEntries(allUrls.map((url, i) => [url, loadedImages[i]]));
    document.getElementById('loading-indicator').classList.add('hidden');
  } catch {
    console.error('Failed to load piece images for the editor.');
    document.getElementById('loading-indicator').classList.add('hidden');
    return;
  }

  solutionCanvas = document.getElementById('editor-canvas-solution');
  startCanvas = document.getElementById('editor-canvas-start');
  solutionCtx = solutionCanvas.getContext('2d');
  startCtx = startCanvas.getContext('2d');

  [solutionCtx, startCtx].forEach((ctx) => {
    ctx.imageSmoothingEnabled = false;
  });

  populatePalette();
  setupEventListeners();
  resizeEditorCanvases();

  deleteProgressFill = document
    .getElementById('delete-button')
    .querySelector('.delete-progress-fill');

  saveState();

  updatePaletteState();
  renderAll();
};

const resizeEditorCanvases = () => {
  const dpr = window.devicePixelRatio;
  [solutionCanvas, startCanvas].forEach((canvas) => {
    const rect = canvas.parentElement.getBoundingClientRect();
    const size = Math.floor(rect.width / GRID_COLS) * GRID_COLS;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
  });

  [...solutionPieces, ...startPieces].forEach((p) => {
    const canvas = p.canvasType === 'solution' ? solutionCanvas : startCanvas;
    updatePiecePixelDimensions(p, canvas);
  });
};

const renderPaletteItemPiece = (ctx, pieceType, img, color) => {
  const dpr = window.devicePixelRatio || 1;

  const size = ctx.canvas.width / dpr;
  ctx.clearRect(0, 0, size, size);

  const maxDim = size;
  const aspectRatio = pieceType.gridWidth / pieceType.gridHeight;
  let renderWidth, renderHeight;

  if (aspectRatio >= 1) {
    renderWidth = maxDim;
    renderHeight = maxDim / aspectRatio;
  } else {
    renderHeight = maxDim;
    renderWidth = maxDim * aspectRatio;
  }

  const pieceToRender = {
    ...pieceType,
    img: img,

    x: size / 2,
    y: size / 2,
    width: renderWidth,
    height: renderHeight,
    rotation: 0,
  };

  const tempPaletteCanvas = document.createElement('canvas');
  const tempPaletteCtx = tempPaletteCanvas.getContext('2d');
  tempPaletteCanvas.width = ctx.canvas.width;
  tempPaletteCanvas.height = ctx.canvas.height;
  tempPaletteCtx.scale(dpr, dpr);
  tempPaletteCtx.imageSmoothingEnabled = false;

  tempPaletteCtx.save();

  tempPaletteCtx.translate(pieceToRender.x, pieceToRender.y);

  tempPaletteCtx.rotate((pieceToRender.rotation * Math.PI) / 180);

  tempPaletteCtx.drawImage(
    pieceToRender.img,
    -pieceToRender.width / 2,
    -pieceToRender.height / 2,
    pieceToRender.width,
    pieceToRender.height
  );
  tempPaletteCtx.restore();

  tempPaletteCtx.globalCompositeOperation = 'source-in';
  tempPaletteCtx.fillStyle = color;
  tempPaletteCtx.fillRect(0, 0, size, size);

  ctx.drawImage(tempPaletteCanvas, 0, 0, size, size);
};

const populatePalette = () => {
  paletteContainer.innerHTML = '';
  paletteItems = [];
  PIECE_TYPES.forEach((type, index) => {
    const item = document.createElement('div');
    item.className = 'palette-item';

    const numberSpan = document.createElement('span');
    numberSpan.className = 'keybind';
    numberSpan.textContent = index + 1;
    item.appendChild(numberSpan);

    const canvas = document.createElement('canvas');
    item.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    const dpr = window.devicePixelRatio || 1;
    const cssSize = 50;
    canvas.width = cssSize * dpr;
    canvas.height = cssSize * dpr;
    canvas.style.width = `${cssSize}px`;
    canvas.style.height = `${cssSize}px`;
    ctx.scale(dpr, dpr);

    paletteItems.push({ canvas, ctx, type });

    renderPaletteItemPiece(
      ctx,
      type,
      imageMap[type.src],
      getComputedStyle(document.body).getPropertyValue('--accent-color')
    );

    item.addEventListener('click', () => addPiece(type));
    paletteContainer.appendChild(item);
  });
};

const rerenderPalette = () => {
  const color = getComputedStyle(document.body).getPropertyValue('--accent-color');
  paletteItems.forEach((item) => {
    renderPaletteItemPiece(item.ctx, item.type, imageMap[item.type.src], color);
  });
};

const addPiece = (type) => {
  if (solutionPieces.length >= 10) {
    return;
  }

  const newId = Date.now() + Math.random();

  const newSolutionPiece = {
    ...type,
    id: newId,
    img: imageMap[type.src],
    col: 6,
    row: 6,
    rotation: 0,
    canvasType: 'solution',
  };
  updatePiecePixelDimensions(newSolutionPiece, solutionCanvas);
  solutionPieces.push(newSolutionPiece);

  const newStartPiece = {
    ...newSolutionPiece,

    col: newSolutionPiece.col + (Math.floor(Math.random() * 9) - 4),
    row: newSolutionPiece.row + (Math.floor(Math.random() * 9) - 4),
    canvasType: 'start',
  };
  updatePiecePixelDimensions(newStartPiece, startCanvas);
  startPieces.push(newStartPiece);

  saveState();

  selectedPieces.clear();
  selectedPieces.add(newSolutionPiece);
  activeCanvas = 'solution';

  updateControls();
  updatePaletteState();
  renderAll();
};

const deleteSelectedPieces = () => {
  if (selectedPieces.size === 0) return;

  selectedPieces.forEach((piece) => {
    const indexInRef = solutionPieces.findIndex((p) => p.id === piece.id);
    if (indexInRef > -1) solutionPieces.splice(indexInRef, 1);

    const indexInStart = startPieces.findIndex((p) => p.id === piece.id);
    if (indexInStart > -1) startPieces.splice(indexInStart, 1);
  });

  saveState();

  selectedPieces.clear();
  activeCanvas = null;
  updateControls();
  updatePaletteState();
  renderAll();
};

const deleteAllPieces = () => {
  solutionPieces.length = 0;
  startPieces.length = 0;

  selectedPieces.clear();
  activeCanvas = null;

  updateControls();
  updatePaletteState();
  if (deleteProgressFill) {
    deleteProgressFill.style.transition = 'none';
    deleteProgressFill.style.width = '0%';
  }
  saveState();
  renderAll();
};

const syncPieceProperties = (sourcePiece) => {
  if (activeCanvas !== 'solution') return;

  const twinPiece = startPieces.find((p) => p.id === sourcePiece.id);
  if (twinPiece) {
    twinPiece.rotation = sourcePiece.rotation;
    twinPiece.gridWidth = sourcePiece.gridWidth;
    twinPiece.gridHeight = sourcePiece.gridHeight;

    updatePiecePixelDimensions(twinPiece, startCanvas);
  }
};

const updatePaletteState = () => {
  const pieceCount = solutionPieces.length;
  const isLimitReached = pieceCount >= 10;
  const paletteDivs = paletteContainer.querySelectorAll('.palette-item');

  paletteDivs.forEach((item) => {
    if (isLimitReached) {
      item.classList.add('disabled');
    } else {
      item.classList.remove('disabled');
    }
  });

  const pieceCounter = document.getElementById('piece-counter');
  if (pieceCounter) {
    pieceCounter.textContent = `${pieceCount} / 10`;
    if (isLimitReached) {
      pieceCounter.classList.add('limit-reached');
    } else {
      pieceCounter.classList.remove('limit-reached');
    }
  }
};

const saveState = () => {
  const clonePieces = (pieces) =>
    pieces.map((p) => {
      const { img, ...rest } = p;
      return { ...rest };
    });

  const state = {
    solution: clonePieces(solutionPieces),
    start: clonePieces(startPieces),
  };

  if (undoStack.length > 0) {
    const lastState = undoStack[undoStack.length - 1];
    if (JSON.stringify(lastState) === JSON.stringify(state)) return;
  }

  undoStack.push(state);
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0;
};

const restoreState = (state) => {
  const relinkPieces = (piecesData) =>
    piecesData.map((p) => ({
      ...p,
      img: imageMap[p.src],
    }));

  solutionPieces.length = 0;
  solutionPieces.push(...relinkPieces(state.solution));

  startPieces.length = 0;
  startPieces.push(...relinkPieces(state.start));

  solutionPieces.forEach((p) => updatePiecePixelDimensions(p, solutionCanvas));
  startPieces.forEach((p) => updatePiecePixelDimensions(p, startCanvas));

  selectedPieces.clear();
  activeCanvas = null;

  updateControls();
  updatePaletteState();
  renderAll();
};

const undo = () => {
  if (undoStack.length <= 1) return;

  const currentState = undoStack.pop();
  redoStack.push(currentState);

  const prevState = undoStack[undoStack.length - 1];
  restoreState(prevState);
};

const redo = () => {
  if (redoStack.length === 0) return;

  const state = redoStack.pop();
  undoStack.push(state);
  restoreState(state);
};

const renderAll = () => {
  if (solutionCtx) renderCanvas(solutionCtx, solutionPieces);
  if (startCtx) renderCanvas(startCtx, startPieces);

  window.rerenderPalette = rerenderPalette;
};

const renderCanvas = (ctx, pieces) => {
  if (ctx.canvas.width === 0 || ctx.canvas.height === 0) {
    return;
  }
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  drawGrid(ctx);

  if (ctx === startCtx && isPublishModalOpen) {
    const originalSelectedPieces = selectedPieces;
    const originalActiveCanvas = activeCanvas;
    selectedPieces = new Set();
    activeCanvas = null;

    renderCanvas(solutionCtx, solutionPieces);

    ctx.globalAlpha = 0.4;
    ctx.drawImage(solutionCanvas, 0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.globalAlpha = 1.0;

    selectedPieces = originalSelectedPieces;
    activeCanvas = originalActiveCanvas;
  }

  const tempRenderCanvas = document.createElement('canvas');
  const tempRenderCtx = tempRenderCanvas.getContext('2d');
  tempRenderCanvas.width = ctx.canvas.width;
  tempRenderCanvas.height = ctx.canvas.height;
  tempRenderCtx.imageSmoothingEnabled = false;
  tempRenderCtx.globalCompositeOperation = 'xor';

  pieces.forEach((piece) => {
    updatePiecePixelDimensions(piece, ctx.canvas);

    drawImageTransformed(tempRenderCtx, piece);
  });

  const color = getComputedStyle(document.body).getPropertyValue('--accent-color');
  tempRenderCtx.globalCompositeOperation = 'source-in';
  tempRenderCtx.fillStyle = color;
  tempRenderCtx.fillRect(0, 0, tempRenderCanvas.width, tempRenderCanvas.height);

  ctx.drawImage(tempRenderCanvas, 0, 0);

  const currentCanvasType = ctx === solutionCtx ? 'solution' : 'start';
  if (activeCanvas === currentCanvasType) {
    selectedPieces.forEach((piece) => {
      drawBorder(
        piece,
        getComputedStyle(document.body).getPropertyValue('--piece-hover-color').trim(),
        ctx
      );
    });
  }

  if (ctx === solutionCtx && hoveredPiece && !selectedPieces.has(hoveredPiece)) {
    drawBorder(
      hoveredPiece,
      getComputedStyle(document.body).getPropertyValue('--piece-hover-color').trim(),
      ctx
    );
  }

  if (selectionBox) {
    const activeBoxCanvas =
      activeCanvas === 'solution' || (!activeCanvas && selectionBox) ? solutionCanvas : startCanvas;

    if (ctx.canvas === activeBoxCanvas || (!activeCanvas && ctx === solutionCtx)) {
      ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--accent-color');
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1 * (window.devicePixelRatio || 1);
      const minX = Math.min(selectionBox.x1, selectionBox.x2);
      const maxX = Math.max(selectionBox.x1, selectionBox.x2);
      const minY = Math.min(selectionBox.y1, selectionBox.y2);
      const maxY = Math.max(selectionBox.y1, selectionBox.y2);
      ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
      ctx.setLineDash([]);
    }
  }
};

const setupEventListeners = () => {
  solutionCanvas.addEventListener('pointerdown', (e) => handlePointerDown(e, 'solution'));
  startCanvas.addEventListener('pointerdown', (e) => handlePointerDown(e, 'start'));

  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('keydown', handleKeyPress);
  exportbutton.addEventListener('click', openPublishModal);

  window.addEventListener('resize', () => {
    resizeEditorCanvases();
    renderAll();
  });

  solutionCanvas.addEventListener('pointermove', (e) => {
    const rect = solutionCanvas.getBoundingClientRect();
    const scaleX = solutionCanvas.width / rect.width;
    const scaleY = solutionCanvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    let foundPiece = null;
    for (let i = solutionPieces.length - 1; i >= 0; i--) {
      const piece = solutionPieces[i];
      if (isPointInPiece(solutionCtx, piece, mouseX, mouseY)) {
        foundPiece = piece;
        break;
      }
    }

    if (foundPiece !== hoveredPiece) {
      hoveredPiece = foundPiece;
      renderAll();
    }
  });

  solutionCanvas.addEventListener('pointerleave', () => {
    if (hoveredPiece) {
      hoveredPiece = null;
      renderAll();
    }
  });

  document.getElementById('rotate-button').addEventListener('click', (e) => {
    if (selectedPieces.size > 0 && !document.getElementById('rotate-button').disabled) {
      const rotationAmount = e.shiftKey ? -90 : 90;
      selectedPieces.forEach((p) => {
        p.rotation = (p.rotation + rotationAmount + 360) % 360;
        if (activeCanvas === 'solution') syncPieceProperties(p);
      });
      saveState();
      renderAll();
    }
  });

  const deleteBtn = document.getElementById('delete-button');
  deleteBtn.addEventListener('click', () => {
    if (!deleteAllTimer && selectedPieces.size > 0) {
      deleteSelectedPieces();
    }
  });

  const startDeleteAll = () => {
    if (solutionPieces.length === 0) return;

    deleteAllAnimationTimer = setTimeout(() => {
      if (deleteProgressFill) {
        deleteProgressFill.style.transition = 'none';
        deleteProgressFill.style.width = '0%';
        void deleteProgressFill.offsetWidth;
        deleteProgressFill.style.transition = 'width 0.9s linear';
        deleteProgressFill.style.width = '100%';
      }
    }, 200);

    deleteAllTimer = setTimeout(() => {
      deleteAllPieces();
      deleteAllTimer = null;
      clearTimeout(deleteAllAnimationTimer);
      deleteAllAnimationTimer = null;
    }, 1200);
  };

  deleteBtn.addEventListener('pointerdown', startDeleteAll);
  deleteBtn.addEventListener('pointerup', handleKeyUp);
  deleteBtn.addEventListener('pointerleave', handleKeyUp);
  document.getElementById('size-toggle-btn').addEventListener('click', togglePieceSize);
  document.getElementById('undo-button').addEventListener('click', undo);
  document.getElementById('redo-button').addEventListener('click', redo);

  const helpModal = document.getElementById('help-modal');
  const openHelpModal = () => {
    helpModal.style.display = 'flex';
    setTimeout(() => helpModal.classList.add('show'), 10);
  };
  const closeHelpModal = () => {
    helpModal.classList.remove('show');
    setTimeout(() => (helpModal.style.display = 'none'), 300);
  };
  document.getElementById('help-button').addEventListener('click', openHelpModal);
  document.getElementById('close-help-button').addEventListener('click', closeHelpModal);
  helpModal.addEventListener('click', (e) => {
    if (e.target === helpModal) closeHelpModal();
  });

  const infoButtons = document.querySelectorAll('#info-button, #info-button-mobile');
  const infoModal = document.getElementById('info-modal');
  const closeInfoButton = document.getElementById('close-info-modal-button');

  if (infoButtons.length > 0 && infoModal && closeInfoButton) {
    const openInfoModal = () => {
      infoModal.style.display = 'flex';
      setTimeout(() => infoModal.classList.add('show'), 10);
    };

    const closeInfoModal = () => {
      infoModal.classList.remove('show');
      setTimeout(() => (infoModal.style.display = 'none'), 300);
    };

    infoButtons.forEach((btn) => btn.addEventListener('click', openInfoModal));
    closeInfoButton.addEventListener('click', closeInfoModal);
    infoModal.addEventListener('click', (e) => {
      if (e.target === infoModal) closeInfoModal();
    });
  }
};

const handlePointerDown = (e, canvasName) => {
  const ctx = canvasName === 'solution' ? solutionCtx : startCtx;
  const pieces = canvasName === 'solution' ? solutionPieces : startPieces;

  const rect = ctx.canvas.getBoundingClientRect();
  const scaleX = ctx.canvas.width / rect.width;
  const scaleY = ctx.canvas.height / rect.height;
  const mouseX = (e.clientX - rect.left) * scaleX;
  const mouseY = (e.clientY - rect.top) * scaleY;

  let foundPiece = null;
  for (let i = pieces.length - 1; i >= 0; i--) {
    const piece = pieces[i];
    if (isPointInPiece(ctx, piece, mouseX, mouseY)) {
      foundPiece = piece;
      break;
    }
  }

  const isCtrl = e.ctrlKey || e.metaKey;

  if (foundPiece) {
    if (isCtrl) {
      if (selectedPieces.has(foundPiece)) {
        selectedPieces.delete(foundPiece);
        if (selectedPieces.size === 0) activeCanvas = null;
      } else {
        selectedPieces.add(foundPiece);
        activeCanvas = canvasName;
      }
    } else {
      if (!selectedPieces.has(foundPiece)) {
        selectedPieces.clear();
        selectedPieces.add(foundPiece);
        activeCanvas = canvasName;
      }
    }

    updateControls();
    renderAll();

    const dragData = new Map();
    selectedPieces.forEach((p) => {
      dragData.set(p, {
        offsetX: mouseX - p.x,
        offsetY: mouseY - p.y,
      });
    });

    const pointerMove = (moveEvent) => {
      const currentMouseX = (moveEvent.clientX - rect.left) * scaleX;
      const currentMouseY = (moveEvent.clientY - rect.top) * scaleY;

      selectedPieces.forEach((p) => {
        const data = dragData.get(p);
        if (!data) return;

        const targetX = currentMouseX - data.offsetX;
        const targetY = currentMouseY - data.offsetY;

        const bbox = getRotatedBoundingBoxInPixels(p);
        const centerX = targetX + p.width / 2;
        const centerY = targetY + p.height / 2;
        const paddingX = 0;
        const paddingY = 0;

        const minCenterX = -bbox.offsetX + paddingX;
        const maxCenterX = ctx.canvas.width - (bbox.width + bbox.offsetX) - paddingX;
        const minCenterY = -bbox.offsetY + paddingY;
        const maxCenterY = ctx.canvas.height - (bbox.height + bbox.offsetY) - paddingY;

        const clampedCenterX = Math.max(minCenterX, Math.min(centerX, maxCenterX));
        const clampedCenterY = Math.max(minCenterY, Math.min(centerY, maxCenterY));

        p.x = clampedCenterX - p.width / 2;
        p.y = clampedCenterY - p.height / 2;

        snapPieceToGrid(p, ctx);
        syncPieceProperties(p);
      });

      updateControls();
      renderAll();
    };

    const pointerUp = () => {
      window.removeEventListener('pointermove', pointerMove);
      window.removeEventListener('pointerup', pointerUp);
      saveState();
    };

    window.addEventListener('pointermove', pointerMove);
    window.addEventListener('pointerup', pointerUp, { once: true });
  } else {
    if (!isCtrl) {
      selectedPieces.clear();
      activeCanvas = null;
    }

    selectionBox = { x1: mouseX, y1: mouseY, x2: mouseX, y2: mouseY };
    renderAll();

    const pointerMoveSelection = (moveEvent) => {
      const currentMouseX = (moveEvent.clientX - rect.left) * scaleX;
      const currentMouseY = (moveEvent.clientY - rect.top) * scaleY;

      selectionBox.x2 = currentMouseX;
      selectionBox.y2 = currentMouseY;

      const minX = Math.min(selectionBox.x1, selectionBox.x2);
      const maxX = Math.max(selectionBox.x1, selectionBox.x2);
      const minY = Math.min(selectionBox.y1, selectionBox.y2);
      const maxY = Math.max(selectionBox.y1, selectionBox.y2);

      if (!isCtrl) selectedPieces.clear();

      pieces.forEach((p) => {
        const pCenterX = p.x + p.width / 2;
        const pCenterY = p.y + p.height / 2;
        if (pCenterX >= minX && pCenterX <= maxX && pCenterY >= minY && pCenterY <= maxY) {
          selectedPieces.add(p);
          activeCanvas = canvasName;
        }
      });

      renderAll();
    };

    const pointerUpSelection = () => {
      selectionBox = null;
      window.removeEventListener('pointermove', pointerMoveSelection);
      window.removeEventListener('pointerup', pointerUpSelection);
      updateControls();
      renderAll();
    };

    window.addEventListener('pointermove', pointerMoveSelection);
    window.addEventListener('pointerup', pointerUpSelection, { once: true });
  }
};

const snapPieceToGrid = (piece, ctx) => {
  const cellWidth = ctx.canvas.width / GRID_COLS;
  const cellHeight = ctx.canvas.height / GRID_ROWS;
  piece.col = Math.round(piece.x / cellWidth);
  piece.row = Math.round(piece.y / cellHeight);

  updatePiecePixelDimensions(piece, ctx.canvas);
};

const selectPiece = (piece, canvasName, multiSelect = false) => {
  if (!multiSelect) {
    selectedPieces.clear();
  }

  if (piece) {
    if (multiSelect && selectedPieces.has(piece)) {
      selectedPieces.delete(piece);
      if (selectedPieces.size === 0) activeCanvas = null;
    } else {
      selectedPieces.add(piece);
      activeCanvas = canvasName;
    }
  } else if (!multiSelect) {
    selectedPieces.clear();
    activeCanvas = null;
  }
  updateControls();
  renderAll();
};

const togglePieceSize = () => {
  if (selectedPieces.size === 0 || activeCanvas !== 'solution') return;

  selectedPieces.forEach((p) => {
    const originalPiece = PIECE_TYPES.find((pt) => pt.shape === p.shape);
    if (originalPiece) {
      const isDefault =
        p.gridWidth === originalPiece.gridWidth && p.gridHeight === originalPiece.gridHeight;
      if (isDefault) {
        p.gridWidth = originalPiece.gridWidth * 1.5;
        p.gridHeight = originalPiece.gridHeight * 1.5;
      } else {
        p.gridWidth = originalPiece.gridWidth;
        p.gridHeight = originalPiece.gridHeight;
      }
      syncPieceProperties(p);
    }
  });

  saveState();
  updateControls();
  renderAll();
};

const handleKeyUp = (e) => {
  const isTKey = e && (e.key === 't' || e.key === 'T');
  const isButtonRelease = e && e.type && (e.type === 'pointerup' || e.type === 'pointerleave');

  if (isPublishModalOpen && isTKey) return;

  if (isTKey || isButtonRelease) {
    clearTimeout(deleteAllTimer);
    clearTimeout(deleteAllAnimationTimer);

    if (isTKey && deleteAllTimer && selectedPieces.size > 0) {
      deleteSelectedPieces();
    }
    deleteAllTimer = null;
    if (deleteProgressFill) deleteProgressFill.style.width = '0%';
  }
};

const handleKeyPress = (e) => {
  const activeEl = document.activeElement;
  if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
    return;
  }

  const isCtrl = e.ctrlKey || e.metaKey;

  if (isCtrl && (e.key === 'z' || e.key === 'Z')) {
    e.preventDefault();
    if (e.shiftKey) {
      redo();
    } else {
      undo();
    }
    return;
  }
  if (isCtrl && (e.key === 'y' || e.key === 'Y')) {
    e.preventDefault();
    redo();
    return;
  }

  const keyNum = parseInt(e.key, 10);
  if (keyNum >= 1 && keyNum <= 6 && !isCtrl) {
    const pieceType = PIECE_TYPES[keyNum - 1];
    if (pieceType) {
      e.preventDefault();
      addPiece(pieceType);
      return;
    }
  }

  if ((e.key === 't' || e.key === 'T') && !e.repeat && !isPublishModalOpen) {
    e.preventDefault();

    if (solutionPieces.length === 0) return;

    deleteAllAnimationTimer = setTimeout(() => {
      if (deleteProgressFill) {
        deleteProgressFill.style.transition = 'none';
        deleteProgressFill.style.width = '0%';
        void deleteProgressFill.offsetWidth;
        deleteProgressFill.style.transition = 'width 0.9s linear';
        deleteProgressFill.style.width = '100%';
      }
    }, 200);

    deleteAllTimer = setTimeout(() => {
      deleteAllPieces();
      deleteAllTimer = null;
      clearTimeout(deleteAllAnimationTimer);
      deleteAllAnimationTimer = null;
    }, 1200);
    return;
  }

  if (selectedPieces.size === 0) return;

  let dCol = 0;
  let dRow = 0;
  let doRotate = false;
  let rotationAmount = 0;

  if ((e.key === 'r' || e.key === 'R') && activeCanvas === 'solution') {
    e.preventDefault();
    doRotate = true;
    rotationAmount = e.shiftKey ? -90 : 90;
  } else if (e.key === 'w' || e.key === 'W') {
    e.preventDefault();
    dRow = -1;
  } else if (e.key === 's' || e.key === 'S') {
    e.preventDefault();
    dRow = 1;
  } else if (e.key === 'a' || e.key === 'A') {
    e.preventDefault();
    dCol = -1;
  } else if (e.key === 'd' || e.key === 'D') {
    e.preventDefault();
    dCol = 1;
  } else if (e.key === 'e' || e.key === 'E') {
    e.preventDefault();
    togglePieceSize();
    return;
  } else {
    return;
  }

  const canvas = activeCanvas === 'solution' ? solutionCanvas : startCanvas;
  const cellWidth = canvas.width / GRID_COLS;
  const cellHeight = canvas.height / GRID_ROWS;

  selectedPieces.forEach((p) => {
    if (doRotate) {
      p.rotation = (p.rotation + rotationAmount + 360) % 360;
    } else {
      p.col += dCol;
      p.row += dRow;
    }

    updatePiecePixelDimensions(p, canvas);
    const bbox = getRotatedBoundingBoxInPixels(p);
    const centerX = p.x + p.width / 2;
    const centerY = p.y + p.height / 2;
    const paddingX = 0;
    const paddingY = 0;

    const minCenterX = -bbox.offsetX + paddingX;
    const maxCenterX = canvas.width - (bbox.width + bbox.offsetX) - paddingX;
    const minCenterY = -bbox.offsetY + paddingY;
    const maxCenterY = canvas.height - (bbox.height + bbox.offsetY) - paddingY;
    const clampedCenterX = Math.max(minCenterX, Math.min(centerX, maxCenterX));
    const clampedCenterY = Math.max(minCenterY, Math.min(centerY, maxCenterY));

    p.col = Math.round((clampedCenterX - p.width / 2) / cellWidth);
    p.row = Math.round((clampedCenterY - p.height / 2) / cellHeight);

    updatePiecePixelDimensions(p, canvas);
    syncPieceProperties(p);
  });

  saveState();
  updateControls();
  renderAll();
};

const updateControls = () => {
  const sizeBtn = document.getElementById('size-toggle-btn');
  const rotateBtn = document.getElementById('rotate-button');
  const deleteBtn = document.getElementById('delete-button');
  const publishBtn = document.getElementById('export-button');

  const pieceSelectedCount = selectedPieces.size;
  const isSolutionCanvas = activeCanvas === 'solution';
  const isRotationDisabled = !isSolutionCanvas || pieceSelectedCount === 0;
  const isSizeDisabled = !isSolutionCanvas || pieceSelectedCount === 0;

  deleteBtn.disabled = pieceSelectedCount === 0;

  publishBtn.disabled = solutionPieces.length < 3;

  rotateBtn.disabled = isRotationDisabled;

  sizeBtn.disabled = isSizeDisabled;

  if (pieceSelectedCount > 0 && isSolutionCanvas) {
    const firstPiece = selectedPieces.values().next().value;
    const originalPiece = PIECE_TYPES.find((p) => p.shape === firstPiece.shape);
    if (originalPiece) {
      const icon = sizeBtn.querySelector('i');
      const isDefaultSize =
        firstPiece.gridWidth === originalPiece.gridWidth &&
        firstPiece.gridHeight === originalPiece.gridHeight;

      icon.className = isDefaultSize
        ? 'fa-solid fa-expand-arrows-alt'
        : 'fa-solid fa-compress-arrows-alt';
      sizeBtn.title = isDefaultSize ? 'Make pieces 1.5x larger' : 'Set to default size';
    }
  } else {
    sizeBtn.querySelector('i').className = 'fa-solid fa-expand-arrows-alt';
    sizeBtn.title = 'Toggle Size (E)';
  }
};

document.addEventListener('DOMContentLoaded', () => {
  updateControls();
});

const openPublishModal = () => {
  const modal = document.getElementById('publish-confirm-modal');
  if (!modal) return;

  isPublishModalOpen = true;

  const confirmBtn = document.getElementById('confirm-publish-button');
  const puzzleNameInput = document.getElementById('puzzle-name-input');
  confirmBtn.disabled = false;
  confirmBtn.innerHTML = 'Publish';
  puzzleNameInput.value = '';
  document.getElementById('publish-error').classList.remove('show');

  modal.style.display = 'flex';
  setTimeout(() => modal.classList.add('show'), 10);

  resizeEditorCanvases();
  renderAll();

  const cancelBtn = document.getElementById('cancel-publish-button');

  confirmBtn.onclick = publishPuzzle;
  cancelBtn.onclick = closePublishModal;

  modal.onclick = (e) => {
    if (e.target.id === 'publish-confirm-modal') {
      closePublishModal();
    }
  };
};

const closePublishModal = () => {
  const modal = document.getElementById('publish-confirm-modal');
  if (!modal) return;

  isPublishModalOpen = false;

  modal.classList.remove('show');
  setTimeout(() => {
    modal.style.display = 'none';
  }, 400);

  document.getElementById('confirm-publish-button').onclick = null;
  document.getElementById('cancel-publish-button').onclick = null;
  modal.onclick = null;
};

const publishPuzzle = async () => {
  if (solutionPieces.length < 3) {
    console.error('Cannot publish a puzzle with fewer than 3 pieces.');
    return;
  }

  const puzzleNameInput = document.getElementById('puzzle-name-input');
  const authorNameInput = document.getElementById('author-name-input');
  const confirmBtn = document.getElementById('confirm-publish-button');

  confirmBtn.innerHTML = 'Publishing';
  confirmBtn.disabled = true;

  const puzzleData = {
    puzzlePiecesData: startPieces.map((p) => ({
      src: p.src,
      startCol: p.col,
      startRow: p.row,
      gridWidth: p.gridWidth,
      gridHeight: p.gridHeight,
      shape: p.shape,
      rotation: p.rotation,
    })),
    solutions: [
      solutionPieces.map((p) => ({
        src: p.src,
        col: p.col,
        row: p.row,
        gridWidth: p.gridWidth,
        gridHeight: p.gridHeight,
        shape: p.shape,
        rotation: p.rotation,
      })),
    ],
  };

  try {
    await createPuzzle(puzzleData, puzzleNameInput.value, authorNameInput.value);
    confirmBtn.innerHTML = 'Published';
    setTimeout(closePublishModal, 1500);
  } catch (error) {
    confirmBtn.innerHTML = 'Try Again';
    confirmBtn.disabled = false;

    const errorEl = document.getElementById('publish-error');
    if (errorEl) {
      errorEl.textContent = error.message;
      errorEl.classList.add('show');

      if (window.publishErrorTimeout) clearTimeout(window.publishErrorTimeout);
      window.publishErrorTimeout = setTimeout(() => {
        errorEl.classList.remove('show');
      }, 5000);
    }
  }
};

window.onload = initializeEditor;
