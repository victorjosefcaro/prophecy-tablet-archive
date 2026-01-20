// --- create.js ---
// Logic for the public-facing puzzle editor.
// Relies on functions from puzzle-core.js

// --- Editor State ---
let selectedPieces = new Set();
let activeCanvas = null; // 'solution' or 'start'
let selectionBox = null; // For holding the click-and-drag selection rectangle { x1, y1, x2, y2 }
const solutionPieces = [];
const startPieces = [];
let deleteProgressFill = null; // Reference to the delete button's progress fill element
let deleteAllTimer = null; // For holding T to delete all
let deleteAllAnimationTimer = null; // Timer to delay the start of the delete animation
let isPublishModalOpen = false;

// --- Undo / Redo History ---
let undoStack = [];
let redoStack = [];
const MAX_HISTORY = 50;

// --- Canvas & DOM Elements ---
let solutionCanvas, solutionCtx, startCanvas, startCtx;
const paletteContainer = document.getElementById('piece-palette');
const controlsPanel = document.getElementById('controls-panel');
const exportbutton = document.getElementById('export-button');

// --- Configuration ---
// Note: GRID_COLS, GRID_ROWS, VISUAL_GRID_SIZE are in puzzle-core.js
const PIECE_TYPES = [
  { src: 'pieces/square.svg', gridWidth: 2, gridHeight: 2, shape: 'square' },
  { src: 'pieces/isosceles-triangle.svg', gridWidth: 2, gridHeight: 1, shape: 'triangle' },
  { src: 'pieces/right-triangle.svg', gridWidth: 2, gridHeight: 2, shape: 'right-triangle' },
  { src: 'pieces/diamond.svg', gridWidth: 2, gridHeight: 2, shape: 'diamond' },
  { src: 'pieces/trapezoid-left.svg', gridWidth: 2, gridHeight: 3, shape: 'trapezoid-left' },
  { src: 'pieces/trapezoid-right.svg', gridWidth: 2, gridHeight: 3, shape: 'trapezoid-right' }
];
let imageMap = {};
let paletteItems = []; // To store palette info for re-rendering

// --- Initialization ---
const initializeEditor = async () => {
  try {
    const allUrls = PIECE_TYPES.map(p => p.src);
    // Use 'loadImage' from puzzle-core.js
    const loadedImages = await Promise.all(allUrls.map(loadImage));
    imageMap = Object.fromEntries(allUrls.map((url, i) => [url, loadedImages[i]]));
  } catch {
    console.error("Failed to load piece images for the editor.");
    return;
  }

  // Get canvases
  solutionCanvas = document.getElementById('editor-canvas-solution');
  startCanvas = document.getElementById('editor-canvas-start');
  solutionCtx = solutionCanvas.getContext('2d');
  startCtx = startCanvas.getContext('2d');

  // Use 'initializeCoreCanvases' from puzzle-core.js (even though we have 2)
  // This helps set up smoothing. We will manage them manually.
  [solutionCtx, startCtx].forEach(ctx => {
    ctx.imageSmoothingEnabled = false;
  });

  populatePalette();
  setupEventListeners();
  resizeEditorCanvases();

  deleteProgressFill = document.getElementById('delete-button').querySelector('.delete-progress-fill');

  // Initial save for undo baseline
  saveState();

  renderAll();
};

const resizeEditorCanvases = () => {
  const dpr = window.devicePixelRatio;
  [solutionCanvas, startCanvas].forEach(canvas => {
    const rect = canvas.parentElement.getBoundingClientRect();
    const size = Math.floor(rect.width / GRID_COLS) * GRID_COLS;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
  });

  // Update pixel coords for all pieces
  [...solutionPieces, ...startPieces].forEach(p => {
    const canvas = (p.canvasType === 'solution') ? solutionCanvas : startCanvas;
    updatePiecePixelDimensions(p, canvas); // From puzzle-core.js
  });
};

/**
 * Renders a single piece type centered onto a small palette canvas context.
 * @param {CanvasRenderingContext2D} ctx - The context of the palette item canvas.
 * @param {object} pieceType - The piece type definition from PIECE_TYPES.
 * @param {HTMLImageElement} img - The loaded image for the piece.
 * @param {string} color - The CSS color string for tinting.
 */
const renderPaletteItemPiece = (ctx, pieceType, img, color) => {
  const dpr = window.devicePixelRatio || 1;
  // Use the actual canvas size (set during populatePalette) divided by dpr
  const size = ctx.canvas.width / dpr;
  ctx.clearRect(0, 0, size, size); // Clear the palette canvas context (use scaled size)

  // Calculate width/height preserving aspect ratio to fit within 'size' with padding
  const maxDim = size; // Use 80% of the canvas size for the piece
  const aspectRatio = pieceType.gridWidth / pieceType.gridHeight;
  let renderWidth, renderHeight;

  if (aspectRatio >= 1) { // Wider than or equal height
    renderWidth = maxDim;
    renderHeight = maxDim / aspectRatio;
  } else { // Taller than wide
    renderHeight = maxDim;
    renderWidth = maxDim * aspectRatio;
  }

  // Create a temporary piece object for rendering centered
  const pieceToRender = {
    ...pieceType,
    img: img,
    // Set x/y to center of canvas, width/height to render size
    x: size / 2,
    y: size / 2,
    width: renderWidth, // The actual width to draw
    height: renderHeight,
    rotation: 0 // Palette pieces are never rotated
  };

  // Use a temporary canvas for tinting to avoid interfering with ctx state
  const tempPaletteCanvas = document.createElement('canvas');
  const tempPaletteCtx = tempPaletteCanvas.getContext('2d');
  tempPaletteCanvas.width = ctx.canvas.width; // Match target canvas size * dpr
  tempPaletteCanvas.height = ctx.canvas.height;
  tempPaletteCtx.scale(dpr, dpr); // Scale temp context same as target ctx
  tempPaletteCtx.imageSmoothingEnabled = false;

  // --- Draw the centered piece image onto the temporary canvas ---
  // This logic is now self-contained to avoid dependency on a modified drawImageTransformed
  tempPaletteCtx.save();
  // Translate to the center point (which is already pieceToRender.x/y)
  tempPaletteCtx.translate(pieceToRender.x, pieceToRender.y);
  // Rotation is 0, but we keep the structure
  tempPaletteCtx.rotate(pieceToRender.rotation * Math.PI / 180);
  // Draw the image centered on the translation point
  tempPaletteCtx.drawImage(pieceToRender.img, -pieceToRender.width / 2, -pieceToRender.height / 2, pieceToRender.width, pieceToRender.height);
  tempPaletteCtx.restore();

  // Tint the image on the temporary canvas
  tempPaletteCtx.globalCompositeOperation = 'source-in';
  tempPaletteCtx.fillStyle = color;
  tempPaletteCtx.fillRect(0, 0, size, size); // Fill the scaled area

  // Draw the tinted result from the temp canvas back to the original palette canvas context
  ctx.drawImage(tempPaletteCanvas, 0, 0, size, size); // Draw image at scaled size
};

const populatePalette = () => {
  paletteContainer.innerHTML = ''; // Clear existing items
  paletteItems = []; // Reset the array
  PIECE_TYPES.forEach((type, index) => {
    const item = document.createElement('div');
    item.className = 'palette-item';

    // Add the hotkey number to the corner
    const numberSpan = document.createElement('span');
    numberSpan.className = 'keybind';
    numberSpan.textContent = index + 1;
    item.appendChild(numberSpan);

    const canvas = document.createElement('canvas');
    item.appendChild(canvas);
    const ctx = canvas.getContext('2d'); // Get context here

    // --- Setup canvas size and scaling once ---
    const dpr = window.devicePixelRatio || 1;
    const cssSize = 50; // Or get from CSS if preferred: parseFloat(getComputedStyle(item).width);
    canvas.width = cssSize * dpr;
    canvas.height = cssSize * dpr;
    canvas.style.width = `${cssSize}px`;
    canvas.style.height = `${cssSize}px`;
    ctx.scale(dpr, dpr); // Scale the context FOR DRAWING
    // -----------------------------------------

    // Store canvas, context, and type for re-rendering on theme change
    paletteItems.push({ canvas, ctx, type });

    // Render the piece onto this small canvas using the new function
    renderPaletteItemPiece(
      ctx, // Pass the scaled context
      type,
      imageMap[type.src],
      getComputedStyle(document.body).getPropertyValue('--accent-color')
    );

    item.addEventListener('click', () => addPiece(type));
    paletteContainer.appendChild(item);
  });
};

/** Rerenders the palette items with the current theme color. */
const rerenderPalette = () => {
  const color = getComputedStyle(document.body).getPropertyValue('--accent-color');
  paletteItems.forEach(item => {
    // Pass the stored context, type, image, and color
    renderPaletteItemPiece(item.ctx, item.type, imageMap[item.type.src], color);
  });
};

// --- Piece Management ---
const addPiece = (type) => {
  if (solutionPieces.length >= 10) {
    // Optional: Provide feedback to the user
    // For example, flash the controls panel or show a temporary message.
    console.log("Maximum number of pieces (10) reached.");
    return;
  }

  const newId = Date.now() + Math.random();

  // Add to solution canvas
  const newSolutionPiece = {
    ...type,
    id: newId,
    img: imageMap[type.src],
    col: 6,
    row: 6,
    rotation: 0,
    canvasType: 'solution'
  };
  updatePiecePixelDimensions(newSolutionPiece, solutionCanvas); // From puzzle-core.js
  solutionPieces.push(newSolutionPiece);

  // Add to start canvas
  const newStartPiece = {
    ...newSolutionPiece,
    // Place the start piece within a 4-unit radius of the solution piece
    col: newSolutionPiece.col + (Math.floor(Math.random() * 9) - 4), // Random offset from -4 to 4
    row: newSolutionPiece.row + (Math.floor(Math.random() * 9) - 4), // Random offset from -4 to 4
    canvasType: 'start'
  };
  updatePiecePixelDimensions(newStartPiece, startCanvas); // From puzzle-core.js
  startPieces.push(newStartPiece);

  saveState(); // Save state after adding

  // Select the new piece (and clear others)
  selectedPieces.clear();
  selectedPieces.add(newSolutionPiece);
  activeCanvas = 'solution';

  updateControls();
  updatePaletteState(); // Update palette after adding
  renderAll();
};

const deleteSelectedPieces = () => {
  if (selectedPieces.size === 0) return;

  selectedPieces.forEach(piece => {
    const indexInRef = solutionPieces.findIndex(p => p.id === piece.id);
    if (indexInRef > -1) solutionPieces.splice(indexInRef, 1);

    const indexInStart = startPieces.findIndex(p => p.id === piece.id);
    if (indexInStart > -1) startPieces.splice(indexInStart, 1);
  });

  saveState(); // Save state after deleting

  selectedPieces.clear();
  activeCanvas = null;
  updateControls();
  updatePaletteState(); // Update palette after deleting
  renderAll();
};

/** Deletes all pieces from both canvases. */
const deleteAllPieces = () => {
  solutionPieces.length = 0;
  startPieces.length = 0;

  selectedPieces.clear(); // Changed from selectedPiece = null;
  activeCanvas = null;

  updateControls();
  updatePaletteState();
  if (deleteProgressFill) {
    // Ensure progress bar resets if deleteAllPieces is called
    deleteProgressFill.style.transition = 'none'; // Disable transition for instant reset
    deleteProgressFill.style.width = '0%';
  }
  saveState(); // Save state after delete all
  renderAll();
};

/** Syncs rotation/size from solution piece to start piece */
const syncPieceProperties = (sourcePiece) => {
  // Only sync if we are editing the SOLUTION piece
  if (activeCanvas !== 'solution') return;

  const twinPiece = startPieces.find(p => p.id === sourcePiece.id);
  if (twinPiece) {
    twinPiece.rotation = sourcePiece.rotation;
    twinPiece.gridWidth = sourcePiece.gridWidth;
    twinPiece.gridHeight = sourcePiece.gridHeight;
    // Recalculate pixel size for its canvas
    updatePiecePixelDimensions(twinPiece, startCanvas); // From puzzle-core.js
  }
};

/** Disables or enables the piece palette based on the piece count. */
const updatePaletteState = () => {
  const isLimitReached = solutionPieces.length >= 10;
  const paletteDivs = paletteContainer.querySelectorAll('.palette-item');

  paletteDivs.forEach(item => {
    if (isLimitReached) {
      item.classList.add('disabled');
    } else {
      item.classList.remove('disabled');
    }
  });
};

// --- History Management ---

/** Captures current puzzle state into the undo stack. */
const saveState = () => {
  // Deep clone pieces, but ignore the 'img' property (we relink it on restore)
  const clonePieces = (pieces) => pieces.map(p => {
    const { img, ...rest } = p;
    return { ...rest };
  });

  const state = {
    solution: clonePieces(solutionPieces),
    start: clonePieces(startPieces)
  };

  // Don't save if it's identical to the last state
  if (undoStack.length > 0) {
    const lastState = undoStack[undoStack.length - 1];
    if (JSON.stringify(lastState) === JSON.stringify(state)) return;
  }

  undoStack.push(state);
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0; // Clear redo stack on new action
};

const restoreState = (state) => {
  const relinkPieces = (piecesData) => piecesData.map(p => ({
    ...p,
    img: imageMap[p.src]
  }));

  solutionPieces.length = 0;
  solutionPieces.push(...relinkPieces(state.solution));

  startPieces.length = 0;
  startPieces.push(...relinkPieces(state.start));

  // Update pixel dimensions for all restored pieces
  solutionPieces.forEach(p => updatePiecePixelDimensions(p, solutionCanvas));
  startPieces.forEach(p => updatePiecePixelDimensions(p, startCanvas));

  // Clear selection after restore to avoid stale references
  selectedPieces.clear();
  activeCanvas = null;

  updateControls();
  updatePaletteState();
  renderAll();
};

const undo = () => {
  if (undoStack.length <= 1) return; // Keep at least one baseline state

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

// --- Rendering ---
/** Global render function called by theme.js */
const renderAll = () => {
  if (solutionCtx) renderCanvas(solutionCtx, solutionPieces);
  if (startCtx) renderCanvas(startCtx, startPieces);
  // Also make rerenderPalette globally available for theme changes
  // Note: This is a simple approach. A more robust solution might use custom events.
  window.rerenderPalette = rerenderPalette;
};

const renderCanvas = (ctx, pieces) => {
  // Prevent drawing if the canvas has no size, which causes errors.
  if (ctx.canvas.width === 0 || ctx.canvas.height === 0) {
    return;
  }
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  drawGrid(ctx); // From puzzle-core.js

  // If we are rendering the start canvas AND the modal is open, draw the solution guide without any selection borders.
  if (ctx === startCtx && isPublishModalOpen) {
    // Temporarily remove selection to render a clean guide image.
    const originalSelectedPieces = selectedPieces;
    const originalActiveCanvas = activeCanvas;
    selectedPieces = new Set();
    activeCanvas = null;

    // Re-render the solution canvas to a temporary canvas without the border.
    renderCanvas(solutionCtx, solutionPieces);

    // Now draw the clean solution canvas as the guide.
    ctx.globalAlpha = 0.4;
    ctx.drawImage(solutionCanvas, 0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.globalAlpha = 1.0;

    // Restore the selection state so the main editor view remains correct.
    selectedPieces = originalSelectedPieces;
    activeCanvas = originalActiveCanvas;
  }

  // --- Revert to XOR + Tint Logic ---
  // Use a temporary canvas to draw all pieces with XOR
  const tempRenderCanvas = document.createElement('canvas');
  const tempRenderCtx = tempRenderCanvas.getContext('2d');
  tempRenderCanvas.width = ctx.canvas.width;   // Match target canvas size exactly
  tempRenderCanvas.height = ctx.canvas.height;
  tempRenderCtx.imageSmoothingEnabled = false;
  tempRenderCtx.globalCompositeOperation = 'xor'; // Use XOR for combining pieces

  pieces.forEach(piece => {
    // Ensure pixel coords are up-to-date BEFORE drawing
    updatePiecePixelDimensions(piece, ctx.canvas);
    // Draw piece onto the temporary canvas
    drawImageTransformed(tempRenderCtx, piece); // From puzzle-core.js
  });

  // Now tint the entire result on the temporary canvas
  const color = getComputedStyle(document.body).getPropertyValue('--accent-color');
  tempRenderCtx.globalCompositeOperation = 'source-in'; // Use source-in for tinting
  tempRenderCtx.fillStyle = color;
  tempRenderCtx.fillRect(0, 0, tempRenderCanvas.width, tempRenderCanvas.height);

  // Draw the final tinted result onto the main canvas
  ctx.drawImage(tempRenderCanvas, 0, 0);
  // ---------------------------------

  // Draw border on selected pieces, if they are on this canvas
  const currentCanvasType = (ctx === solutionCtx ? 'solution' : 'start');
  if (activeCanvas === currentCanvasType) {
    selectedPieces.forEach(piece => {
      // Use 'drawBorder' from puzzle-core.js, passing the correct context
      drawBorder(piece, getComputedStyle(document.body).getPropertyValue('--piece-hover-color').trim(), ctx);
    });
  }

  // Draw selection box if it exists and we're rendering the active canvas
  if (selectionBox) {
    const activeBoxCanvas = (activeCanvas === 'solution' || (!activeCanvas && selectionBox)) ? solutionCanvas : startCanvas;
    // We only draw the selection box on the canvas it started on (managed by event listener context, but here we check ctx)
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

// --- Event Handlers & Interaction ---
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

  // --- Add Control Button Listeners ---
  document.getElementById('rotate-button').addEventListener('click', (e) => {
    if (selectedPieces.size > 0 && !document.getElementById('rotate-button').disabled) {
      const rotationAmount = e.shiftKey ? -90 : 90;
      selectedPieces.forEach(p => {
        p.rotation = (p.rotation + rotationAmount + 360) % 360;
        if (activeCanvas === 'solution') syncPieceProperties(p);
      });
      saveState(); // Save after rotation
      renderAll();
    }
  });

  const deleteBtn = document.getElementById('delete-button');
  deleteBtn.addEventListener('click', () => {
    // Only run single delete if a long-press timer isn't active and a piece is selected
    if (!deleteAllTimer && selectedPieces.size > 0) {
      deleteSelectedPieces();
    }
  });

  const startDeleteAll = () => {
    // Do nothing if there are no pieces on the canvas
    if (solutionPieces.length === 0) return;

    // Set a timer to start the animation after a short delay
    deleteAllAnimationTimer = setTimeout(() => {
      // Start visual progress animation
      if (deleteProgressFill) {
        deleteProgressFill.style.transition = 'none';
        deleteProgressFill.style.width = '0%';
        void deleteProgressFill.offsetWidth;
        deleteProgressFill.style.transition = 'width 0.9s linear';
        deleteProgressFill.style.width = '100%';
      }
    }, 200); // 200ms delay

    deleteAllTimer = setTimeout(() => {
      deleteAllPieces();
      deleteAllTimer = null;
      clearTimeout(deleteAllAnimationTimer);
      deleteAllAnimationTimer = null;
    }, 1200); // Total hold time: 200ms delay + 1000ms for action
  };

  deleteBtn.addEventListener('pointerdown', startDeleteAll);
  deleteBtn.addEventListener('pointerup', handleKeyUp); // Reuse keyup logic to cancel
  deleteBtn.addEventListener('pointerleave', handleKeyUp); // Reuse keyup logic to cancel
  document.getElementById('size-toggle-btn').addEventListener('click', togglePieceSize);

  // Help modal
  const helpModal = document.getElementById('help-modal');
  const openHelpModal = () => {
    helpModal.style.display = 'flex';
    setTimeout(() => helpModal.classList.add('show'), 10);
  };
  const closeHelpModal = () => {
    helpModal.classList.remove('show');
    setTimeout(() => helpModal.style.display = 'none', 300);
  };
  document.getElementById('help-button').addEventListener('click', openHelpModal);
  document.getElementById('close-help-button').addEventListener('click', closeHelpModal);
  helpModal.addEventListener('click', (e) => {
    if (e.target === helpModal) closeHelpModal();
  });

  // Info modal
  const infoButton = document.getElementById('info-button');
  const infoModal = document.getElementById('info-modal');
  const closeInfoButton = document.getElementById('close-info-modal-button');

  if (infoButton && infoModal && closeInfoButton) {
    const openInfoModal = () => {
      infoModal.style.display = 'flex';
      setTimeout(() => infoModal.classList.add('show'), 10);
    };

    const closeInfoModal = () => {
      infoModal.classList.remove('show');
      setTimeout(() => infoModal.style.display = 'none', 300);
    };

    infoButton.addEventListener('click', openInfoModal);
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
    // Selection logic
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

    // Prepare for multi-drag
    const dragData = new Map();
    selectedPieces.forEach(p => {
      dragData.set(p, {
        offsetX: mouseX - p.x,
        offsetY: mouseY - p.y
      });
    });

    const pointerMove = (moveEvent) => {
      const currentMouseX = (moveEvent.clientX - rect.left) * scaleX;
      const currentMouseY = (moveEvent.clientY - rect.top) * scaleY;

      selectedPieces.forEach(p => {
        const data = dragData.get(p);
        if (!data) return;

        let targetX = currentMouseX - data.offsetX;
        let targetY = currentMouseY - data.offsetY;

        // Bounding box for clamping
        const bbox = getRotatedBoundingBoxInPixels(p);
        const centerX = targetX + p.width / 2;
        const centerY = targetY + p.height / 2;
        const paddingX = ctx.canvas.width / VISUAL_GRID_SIZE;
        const paddingY = ctx.canvas.height / VISUAL_GRID_SIZE;

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
      saveState(); // Save state after dragging
    };

    window.addEventListener('pointermove', pointerMove);
    window.addEventListener('pointerup', pointerUp, { once: true });

  } else {
    // Selection box logic
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

      pieces.forEach(p => {
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
  // Re-set pixel x/y to the snapped grid position
  updatePiecePixelDimensions(piece, ctx.canvas); // From puzzle-core.js
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

  selectedPieces.forEach(p => {
    const originalPiece = PIECE_TYPES.find(pt => pt.shape === p.shape);
    if (originalPiece) {
      const isDefault = p.gridWidth === originalPiece.gridWidth && p.gridHeight === originalPiece.gridHeight;
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

  saveState(); // Save after toggle size
  updateControls();
  renderAll();
};

const handleKeyUp = (e) => {
  // Can be triggered by keyup or pointerup/leave on the delete button
  const isTKey = e && (e.key === 't' || e.key === 'T');
  const isButtonRelease = e && e.type && (e.type === 'pointerup' || e.type === 'pointerleave');

  if (isPublishModalOpen && isTKey) return;

  if (isTKey || isButtonRelease) {
    clearTimeout(deleteAllTimer);
    clearTimeout(deleteAllAnimationTimer);
    // If timer was active and it was a T-key quick tap, delete selected pieces
    if (isTKey && deleteAllTimer && selectedPieces.size > 0) {
      deleteSelectedPieces();
    }
    deleteAllTimer = null;
    if (deleteProgressFill) deleteProgressFill.style.width = '0%';
  }
};

const handleKeyPress = (e) => {
  // Ignore keypresses when focused on input fields (e.g., in publish modal)
  const activeEl = document.activeElement;
  if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
    return;
  }

  const isCtrl = e.ctrlKey || e.metaKey;

  // --- Undo/Redo Keybinds ---
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

  // --- Piece Creation Hotkeys (1-6) ---
  // These should work even if no piece is selected.
  const keyNum = parseInt(e.key, 10);
  if (keyNum >= 1 && keyNum <= 6 && !isCtrl) {
    const pieceType = PIECE_TYPES[keyNum - 1];
    if (pieceType) {
      e.preventDefault();
      addPiece(pieceType);
      return; // Stop further processing
    }
  }

  // --- T-Key Handling (Start Delete All Timer & Progress) ---
  if ((e.key === 't' || e.key === 'T') && !e.repeat && !isPublishModalOpen) {
    e.preventDefault();

    // Do nothing if there are no pieces on the canvas
    if (solutionPieces.length === 0) return;

    // Set a timer to start the animation after a short delay
    deleteAllAnimationTimer = setTimeout(() => {
      // Start visual progress animation
      if (deleteProgressFill) {
        deleteProgressFill.style.transition = 'none'; // Disable transition for instant reset
        deleteProgressFill.style.width = '0%';
        void deleteProgressFill.offsetWidth; // Force reflow to apply width: 0% immediately
        deleteProgressFill.style.transition = 'width 0.9s linear';
        deleteProgressFill.style.width = '100%';
      }
    }, 200); // 200ms delay

    deleteAllTimer = setTimeout(() => {
      deleteAllPieces();
      deleteAllTimer = null; // Reset timer
      clearTimeout(deleteAllAnimationTimer);
      deleteAllAnimationTimer = null;
    }, 1200); // Total hold time: 200ms delay + 1000ms for action
    return; // Stop further processing for the 'T' key
  }

  if (selectedPieces.size === 0) return;

  let dCol = 0;
  let dRow = 0;
  let doRotate = false;
  let rotationAmount = 0;

  // Allow rotation only on the solution canvas
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

  selectedPieces.forEach(p => {
    if (doRotate) {
      p.rotation = (p.rotation + rotationAmount + 360) % 360;
    } else {
      p.col += dCol;
      p.row += dRow;
    }

    // Apply clamping logic
    updatePiecePixelDimensions(p, canvas);
    const bbox = getRotatedBoundingBoxInPixels(p);
    const centerX = p.x + p.width / 2;
    const centerY = p.y + p.height / 2;
    const paddingX = canvas.width / VISUAL_GRID_SIZE;
    const paddingY = canvas.height / VISUAL_GRID_SIZE;

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

  saveState(); // Save state after keyboard manipulation
  updateControls();
  renderAll();
};

// --- UI Updates & Export ---
const updateControls = () => {
  // Get references to the static elements
  const sizeBtn = document.getElementById('size-toggle-btn');
  const rotateBtn = document.getElementById('rotate-button');
  const deleteBtn = document.getElementById('delete-button');
  const publishBtn = document.getElementById('export-button');

  // Determine if a piece is selected and if rotation/sizing is allowed
  const pieceSelectedCount = selectedPieces.size;
  const isSolutionCanvas = activeCanvas === 'solution';
  const isRotationDisabled = !isSolutionCanvas || pieceSelectedCount === 0;
  const isSizeDisabled = !isSolutionCanvas || pieceSelectedCount === 0;

  // --- Update Delete Button ---
  deleteBtn.disabled = pieceSelectedCount === 0;

  // --- Update Publish Button ---
  publishBtn.disabled = solutionPieces.length < 3;

  // --- Update Rotate Button & Notice ---
  rotateBtn.disabled = isRotationDisabled;

  // --- Update Size Button & Notice ---
  sizeBtn.disabled = isSizeDisabled;

  if (pieceSelectedCount > 0 && isSolutionCanvas) {
    // For simplicity, we base the icon on the first selected piece
    const firstPiece = selectedPieces.values().next().value;
    const originalPiece = PIECE_TYPES.find(p => p.shape === firstPiece.shape);
    if (originalPiece) {
      const icon = sizeBtn.querySelector('i');
      const isDefaultSize = firstPiece.gridWidth === originalPiece.gridWidth && firstPiece.gridHeight === originalPiece.gridHeight;
      // Change icon based on size state
      icon.className = isDefaultSize ? 'fa-solid fa-expand-arrows-alt' : 'fa-solid fa-compress-arrows-alt';
      sizeBtn.title = isDefaultSize ? 'Make pieces 1.5x larger' : 'Set to default size';
    }
  } else {
    // Reset to default icon and text when not applicable
    sizeBtn.querySelector('i').className = 'fa-solid fa-expand-arrows-alt';
    sizeBtn.title = 'Toggle Size (E)';
  }
};

// --- Add this line at the end of create.js ---
// Call updateControls once on initial load to display the default state
document.addEventListener('DOMContentLoaded', () => {
  updateControls();
});

const openPublishModal = () => {
  const modal = document.getElementById('publish-confirm-modal');
  if (!modal) return;

  isPublishModalOpen = true;

  // Show modal
  modal.style.display = 'flex';
  setTimeout(() => modal.classList.add('show'), 10);

  // The start canvas is now visible, so we need to resize and render it
  resizeEditorCanvases();
  renderAll();

  // Attach modal-specific listeners
  document.getElementById('confirm-publish-button').addEventListener('click', publishPuzzle);
  document.getElementById('cancel-publish-button').addEventListener('click', closePublishModal);
  document.getElementById('close-publish-modal-x').addEventListener('click', closePublishModal);
  modal.addEventListener('click', (e) => {
    if (e.target.id === 'publish-confirm-modal') {
      closePublishModal();
    }
  });
};

const closePublishModal = () => {
  const modal = document.getElementById('publish-confirm-modal');
  if (!modal) return;

  isPublishModalOpen = false;

  modal.classList.remove('show');
  setTimeout(() => {
    modal.style.display = 'none';
  }, 400); // Match CSS transition duration

  // Clean up listeners to avoid multiple bindings
  // Note: A more robust solution might use .removeEventListener with named functions
  // but for this simple case, re-cloning the button is an effective way to clear them.
  const confirmBtn = document.getElementById('confirm-publish-button');
  confirmBtn.replaceWith(confirmBtn.cloneNode(true));
};

const publishPuzzle = async () => {
  if (solutionPieces.length < 3) {
    console.error("Cannot publish a puzzle with fewer than 3 pieces.");
    return;
  }

  const puzzleNameInput = document.getElementById('puzzle-name-input');
  const authorNameInput = document.getElementById('author-name-input');
  const confirmBtn = document.getElementById('confirm-publish-button');

  confirmBtn.innerHTML = 'Publishing...';
  confirmBtn.disabled = true;

  // Format piece data for API
  const puzzleData = {
    puzzlePiecesData: startPieces.map(p => ({ src: p.src, startCol: p.col, startRow: p.row, gridWidth: p.gridWidth, gridHeight: p.gridHeight, shape: p.shape, rotation: p.rotation })),
    solutions: [
      solutionPieces.map(p => ({ src: p.src, col: p.col, row: p.row, gridWidth: p.gridWidth, gridHeight: p.gridHeight, shape: p.shape, rotation: p.rotation }))
    ]
  };

  try {
    await createPuzzle(puzzleData, puzzleNameInput.value, authorNameInput.value);
    confirmBtn.innerHTML = 'Published!';
    setTimeout(closePublishModal, 1500);
  } catch (error) {
    confirmBtn.innerHTML = 'Failed - Try Again';
    confirmBtn.disabled = false;
    console.error('Publish error:', error);
  }
};


// --- Start Editor ---
window.onload = initializeEditor;