let activePiece = null;
let hoveredPiece = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
let isSnapping = false;

const GRID_COLS = 16;
const GRID_ROWS = 16;
const VISUAL_GRID_SIZE = 8;

let puzzleCanvas, puzzleCtx, referenceCanvas, referenceCtx, tempCanvas, tempCtx;

const processPuzzleData = (pieceData) => {
  const baseSizes = {
    square: { w: 2, h: 2 },
    triangle: { w: 2, h: 1 },
    'right-triangle': { w: 2, h: 2 },
    diamond: { w: 2, h: 2 },
    'trapezoid-left': { w: 2, h: 3 },
    'trapezoid-right': { w: 2, h: 3 },
  };

  return pieceData.map((p) => {
    const base = baseSizes[p.shape];
    if (!base) {
      console.warn(`Unknown shape: ${p.shape}`);
      return p;
    }
    const multiplier = p.size === 1 ? 1.5 : 1;
    return {
      ...p,
      gridWidth: p.gridWidth || base.w * multiplier,
      gridHeight: p.gridHeight || base.h * multiplier,
    };
  });
};

const loadImage = (url) => {
  if (window.imageCache && window.imageCache[url]) {
    return Promise.resolve(window.imageCache[url]);
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
};

if (typeof imageCache !== 'undefined') {
  window.imageCache = imageCache;
}

const initializeCoreCanvases = (pCanvas, rCanvas) => {
  puzzleCanvas = pCanvas;
  referenceCanvas = rCanvas;
  puzzleCtx = puzzleCanvas.getContext('2d');
  referenceCtx = referenceCanvas.getContext('2d');

  tempCanvas = document.createElement('canvas');
  tempCtx = tempCanvas.getContext('2d');

  [puzzleCtx, referenceCtx, tempCtx].forEach((ctx) => {
    ctx.imageSmoothingEnabled = false;
  });
};

const resizeCanvases = (pieces = []) => {
  const puzzleContainer = document.getElementById('puzzle-container-wrapper');
  const referenceContainer = document.getElementById('reference-container-wrapper');
  if (!puzzleContainer || !referenceContainer) return;

  const puzzleStyle = getComputedStyle(puzzleContainer);
  const referenceStyle = getComputedStyle(referenceContainer);
  const puzzleSize = parseFloat(puzzleStyle.width);
  const referenceSize = parseFloat(referenceStyle.width);
  const dpr = window.devicePixelRatio;

  const adjustedPuzzleSize = Math.floor(puzzleSize / GRID_COLS) * GRID_COLS;
  const adjustedReferenceSize = Math.floor(referenceSize / GRID_COLS) * GRID_COLS;

  puzzleCanvas.width = adjustedPuzzleSize * dpr;
  puzzleCanvas.height = adjustedPuzzleSize * dpr;
  referenceCanvas.width = adjustedReferenceSize * dpr;
  referenceCanvas.height = adjustedReferenceSize * dpr;
  tempCanvas.width = adjustedPuzzleSize * dpr;
  tempCanvas.height = adjustedPuzzleSize * dpr;

  [puzzleCtx, referenceCtx, tempCtx].forEach((ctx) => {
    ctx.imageSmoothingEnabled = false;
  });

  pieces.forEach((piece) => updatePiecePixelDimensions(piece, puzzleCanvas));
};

const updatePiecePixelDimensions = (piece, canvas) => {
  const cellWidth = canvas.width / GRID_COLS;
  const cellHeight = canvas.height / GRID_ROWS;
  const visualCellWidth = canvas.width / VISUAL_GRID_SIZE;
  const visualCellHeight = canvas.height / VISUAL_GRID_SIZE;

  piece.x = piece.col * cellWidth;
  piece.y = piece.row * cellHeight;
  piece.width = piece.gridWidth * visualCellWidth;
  piece.height = piece.gridHeight * visualCellHeight;
};

const drawGrid = (ctx) => {
  const canvas = ctx.canvas;
  const gridSize = VISUAL_GRID_SIZE;
  const cellSize = canvas.width / gridSize;
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--container-grid-color');
  ctx.lineWidth = 1 * window.devicePixelRatio;
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1.0;

  for (let i = 1; i < gridSize; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cellSize, 0);
    ctx.lineTo(i * cellSize, canvas.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * cellSize);
    ctx.lineTo(canvas.width, i * cellSize);
    ctx.stroke();
  }
};

const drawImageTransformed = (ctx, piece) => {
  let x = piece.x;
  let y = piece.y;

  const isNonIntSize = piece.gridWidth % 1 !== 0 || piece.gridHeight % 1 !== 0;
  const is90or270deg = piece.rotation === 90 || piece.rotation === 270;

  if (isNonIntSize && is90or270deg) {
    const cellWidth = ctx.canvas.width / GRID_COLS;
    const cellHeight = ctx.canvas.height / GRID_ROWS;
    x -= cellWidth * 0.5;
    y -= cellHeight * 0.5;
  }

  const angleInRad = ((piece.rotation || 0) * Math.PI) / 180;
  ctx.save();
  ctx.translate(x + piece.width / 2, y + piece.height / 2);
  ctx.rotate(angleInRad);
  ctx.drawImage(piece.img, -piece.width / 2, -piece.height / 2, piece.width, piece.height);
  ctx.restore();
};

const addPiecePathToContext = (ctx, piece) => {
  let x = piece.x;
  let y = piece.y;
  const w = piece.width;
  const h = piece.height;

  const isNonIntSize = piece.gridWidth % 1 !== 0 || piece.gridHeight % 1 !== 0;
  const is90or270deg = piece.rotation === 90 || piece.rotation === 270;

  if (isNonIntSize && is90or270deg) {
    const cellWidth = ctx.canvas.width / GRID_COLS;
    const cellHeight = ctx.canvas.height / GRID_ROWS;
    x -= cellWidth * 0.5;
    y -= cellHeight * 0.5;
  }

  const angleInRad = ((piece.rotation || 0) * Math.PI) / 180;
  ctx.save();
  ctx.translate(x + piece.width / 2, y + piece.height / 2);
  ctx.rotate(angleInRad);

  if (piece.shape === 'triangle') {
    ctx.moveTo(0, -h / 2);
    ctx.lineTo(w / 2, h / 2);
    ctx.lineTo(-w / 2, h / 2);
    ctx.closePath();
  } else if (piece.shape === 'right-triangle') {
    ctx.moveTo(-w / 2, -h / 2);
    ctx.lineTo(w / 2, h / 2);
    ctx.lineTo(-w / 2, h / 2);
    ctx.closePath();
  } else if (piece.shape === 'diamond') {
    ctx.moveTo(0, -h / 2);
    ctx.lineTo(w / 2, 0);
    ctx.lineTo(0, h / 2);
    ctx.lineTo(-w / 2, 0);
    ctx.closePath();
  } else if (piece.shape === 'trapezoid-left') {
    ctx.moveTo(-w / 2, -h / 6);
    ctx.lineTo(0, -h / 2);
    ctx.lineTo(w / 2, -h / 6);
    ctx.lineTo(-w / 2, h / 2);
    ctx.closePath();
  } else if (piece.shape === 'trapezoid-right') {
    ctx.moveTo(-w / 2, -h / 6);
    ctx.lineTo(0, -h / 2);
    ctx.lineTo(w / 2, -h / 6);
    ctx.lineTo(w / 2, h / 2);
    ctx.closePath();
  } else {
    ctx.moveTo(-w / 2, -h / 2);
    ctx.lineTo(w / 2, -h / 2);
    ctx.lineTo(w / 2, h / 2);
    ctx.lineTo(-w / 2, h / 2);
    ctx.closePath();
  }

  ctx.restore();
};

const renderReference = (referencePieces) => {
  if (!referenceCtx) return;

  referenceCtx.clearRect(0, 0, referenceCanvas.width, referenceCanvas.height);

  drawGrid(referenceCtx);

  const tempRefCanvas = document.createElement('canvas');
  const tempRefCtx = tempRefCanvas.getContext('2d');
  tempRefCtx.imageSmoothingEnabled = false;
  tempRefCanvas.width = referenceCanvas.width;
  tempRefCanvas.height = referenceCanvas.height;

  tempRefCtx.globalCompositeOperation = 'source-over';
  tempRefCtx.fillStyle = 'black';
  tempRefCtx.beginPath();
  referencePieces.forEach((piece) => {
    updatePiecePixelDimensions(piece, referenceCanvas);
    addPiecePathToContext(tempRefCtx, piece);
  });
  tempRefCtx.fill('evenodd');

  const color = getComputedStyle(document.body).getPropertyValue('--accent-color');
  tempRefCtx.globalCompositeOperation = 'source-in';
  tempRefCtx.fillStyle = color;
  tempRefCtx.fillRect(0, 0, tempRefCanvas.width, tempRefCanvas.height);

  referenceCtx.globalCompositeOperation = 'source-over';
  referenceCtx.drawImage(tempRefCanvas, 0, 0);
};

const renderPuzzle = (puzzlePieces, pieceOpacity = 1.0, showGuide = true) => {
  if (!puzzleCtx) return;

  puzzleCtx.clearRect(0, 0, puzzleCanvas.width, puzzleCanvas.height);

  drawGrid(puzzleCtx);

  if (showGuide) {
    puzzleCtx.globalAlpha = 0.4;
    puzzleCtx.drawImage(referenceCanvas, 0, 0, puzzleCanvas.width, puzzleCanvas.height);
    puzzleCtx.globalAlpha = 1.0;
  }

  tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
  tempCtx.globalCompositeOperation = 'source-over';
  tempCtx.fillStyle = 'black';

  tempCtx.beginPath();
  puzzlePieces.forEach((piece) => {
    addPiecePathToContext(tempCtx, piece);
  });

  tempCtx.fill('evenodd');

  const color = getComputedStyle(document.body).getPropertyValue('--accent-color');

  tempCtx.globalCompositeOperation = 'source-in';
  tempCtx.fillStyle = color;
  tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

  tempCtx.globalCompositeOperation = 'source-over';

  puzzleCtx.globalAlpha = pieceOpacity;
  puzzleCtx.drawImage(tempCanvas, 0, 0);
  puzzleCtx.globalAlpha = 1.0;

  const hoverColor = getComputedStyle(document.body).getPropertyValue('--piece-hover-color').trim();
  if (activePiece) {
    drawBorder(activePiece, hoverColor);
  } else if (hoveredPiece && !isSnapping) {
    drawBorder(hoveredPiece, hoverColor);
  }
};

const drawBorder = (piece, color, ctx = puzzleCtx) => {
  let x = piece.x;
  let y = piece.y;

  const isNonIntSize = piece.gridWidth % 1 !== 0 || piece.gridHeight % 1 !== 0;
  const is90or270deg = piece.rotation === 90 || piece.rotation === 270;

  if (isNonIntSize && is90or270deg) {
    const cellWidth = ctx.canvas.width / GRID_COLS;
    const cellHeight = ctx.canvas.height / GRID_ROWS;
    x -= cellWidth * 0.5;
    y -= cellHeight * 0.5;
  }

  const angleInRad = ((piece.rotation || 0) * Math.PI) / 180;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3 * (window.devicePixelRatio || 1);
  ctx.translate(x + piece.width / 2, y + piece.height / 2);
  ctx.rotate(angleInRad);
  ctx.beginPath();

  const w = piece.width;
  const h = piece.height;

  if (piece.shape === 'triangle') {
    ctx.moveTo(0, -h / 2);
    ctx.lineTo(w / 2, h / 2);
    ctx.lineTo(-w / 2, h / 2);
    ctx.closePath();
  } else if (piece.shape === 'right-triangle') {
    ctx.moveTo(-w / 2, -h / 2);
    ctx.lineTo(w / 2, h / 2);
    ctx.lineTo(-w / 2, h / 2);
    ctx.closePath();
  } else if (piece.shape === 'diamond') {
    ctx.moveTo(0, -h / 2);
    ctx.lineTo(w / 2, 0);
    ctx.lineTo(0, h / 2);
    ctx.lineTo(-w / 2, 0);
    ctx.closePath();
  } else if (piece.shape === 'trapezoid-left') {
    ctx.moveTo(-w / 2, -h / 6);
    ctx.lineTo(0, -h / 2);
    ctx.lineTo(w / 2, -h / 6);
    ctx.lineTo(-w / 2, h / 2);
    ctx.closePath();
  } else if (piece.shape === 'trapezoid-right') {
    ctx.moveTo(-w / 2, -h / 6);
    ctx.lineTo(0, -h / 2);
    ctx.lineTo(w / 2, -h / 6);
    ctx.lineTo(w / 2, h / 2);
    ctx.closePath();
  } else {
    ctx.rect(-w / 2, -h / 2, w, h);
  }

  ctx.stroke();
  ctx.restore();
};

const isPointInPiece = (_ctx, piece, mouseX, mouseY) => {
  const angleInRad = ((piece.rotation || 0) * Math.PI) / 180;

  let ctx;
  if (typeof tempCtx !== 'undefined' && tempCtx) {
    ctx = tempCtx;
  } else {
    const localTempCanvas = document.createElement('canvas');
    localTempCanvas.width = 100;
    localTempCanvas.height = 100;
    ctx = localTempCanvas.getContext('2d');
  }

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.translate(piece.x + piece.width / 2, piece.y + piece.height / 2);
  ctx.rotate(angleInRad);

  ctx.beginPath();
  const w = piece.width;
  const h = piece.height;

  if (piece.shape === 'triangle') {
    ctx.moveTo(0, -h / 2);
    ctx.lineTo(w / 2, h / 2);
    ctx.lineTo(-w / 2, h / 2);
    ctx.closePath();
  } else if (piece.shape === 'right-triangle') {
    ctx.moveTo(-w / 2, -h / 2);
    ctx.lineTo(w / 2, h / 2);
    ctx.lineTo(-w / 2, h / 2);
    ctx.closePath();
  } else if (piece.shape === 'diamond') {
    ctx.moveTo(0, -h / 2);
    ctx.lineTo(w / 2, 0);
    ctx.lineTo(0, h / 2);
    ctx.lineTo(-w / 2, 0);
    ctx.closePath();
  } else if (piece.shape === 'trapezoid-left') {
    ctx.moveTo(-w / 2, -h / 6);
    ctx.lineTo(0, -h / 2);
    ctx.lineTo(w / 2, -h / 6);
    ctx.lineTo(-w / 2, h / 2);
    ctx.closePath();
  } else if (piece.shape === 'trapezoid-right') {
    ctx.moveTo(-w / 2, -h / 6);
    ctx.lineTo(0, -h / 2);
    ctx.lineTo(w / 2, -h / 6);
    ctx.lineTo(w / 2, h / 2);
    ctx.closePath();
  } else {
    ctx.rect(-w / 2, -h / 2, w, h);
  }

  const isInside = ctx.isPointInPath(mouseX, mouseY);
  ctx.restore();
  return isInside;
};

const getMousePos = (e) => {
  const rect = puzzleCanvas.getBoundingClientRect();
  const scaleX = puzzleCanvas.width / rect.width;
  const scaleY = puzzleCanvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
  };
};

const getRotatedBoundingBoxInPixels = (piece) => {
  const w = piece.width;
  const h = piece.height;
  let vertices = [];

  switch (piece.shape) {
    case 'square':
      vertices = [
        [-w / 2, -h / 2],
        [w / 2, -h / 2],
        [w / 2, h / 2],
        [-w / 2, h / 2],
      ];
      break;
    case 'right-triangle':
      vertices = [
        [-w / 2, -h / 2],
        [w / 2, h / 2],
        [-w / 2, h / 2],
      ];
      break;
    case 'triangle':
      vertices = [
        [0, -h / 2],
        [w / 2, h / 2],
        [-w / 2, h / 2],
      ];
      break;
    case 'diamond':
      vertices = [
        [0, -h / 2],
        [w / 2, 0],
        [0, h / 2],
        [-w / 2, 0],
      ];
      break;
    case 'trapezoid-left':
      vertices = [
        [-w / 2, -h / 6],
        [0, -h / 2],
        [w / 2, -h / 6],
        [-w / 2, h / 2],
      ];
      break;
    case 'trapezoid-right':
      vertices = [
        [-w / 2, -h / 6],
        [0, -h / 2],
        [w / 2, -h / 6],
        [w / 2, h / 2],
      ];
      break;
    default:
      vertices = [
        [-w / 2, -h / 2],
        [w / 2, -h / 2],
        [w / 2, h / 2],
        [-w / 2, h / 2],
      ];
      break;
  }

  const angleRad = ((piece.rotation || 0) * Math.PI) / 180;
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);

  const rotatedVertices = vertices.map(([x, y]) => {
    const xPrime = x * cosA - y * sinA;
    const yPrime = x * sinA + y * cosA;
    return [xPrime, yPrime];
  });

  const xs = rotatedVertices.map((v) => v[0]);
  const ys = rotatedVertices.map((v) => v[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    offsetX: minX,
    offsetY: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
};

const animateSnap = (piece, targetX, targetY, onComplete) => {
  const duration = 150;
  const startX = piece.x;
  const startY = piece.y;
  let startTime = null;

  function step(currentTime) {
    if (!startTime) startTime = currentTime;
    const elapsedTime = currentTime - startTime;
    const progress = Math.min(elapsedTime / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);

    piece.x = startX + (targetX - startX) * ease;
    piece.y = startY + (targetY - startY) * ease;

    renderPuzzleScoped();

    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      piece.x = targetX;
      piece.y = targetY;
      renderPuzzleScoped();
      if (onComplete) onComplete();
    }
  }
  requestAnimationFrame(step);
};

const renderPiecesToMask = (pieces, canvas) => {
  const maskCanvas = document.createElement('canvas');
  const maskCtx = maskCanvas.getContext('2d');
  maskCanvas.width = canvas.width;
  maskCanvas.height = canvas.height;
  maskCtx.imageSmoothingEnabled = false;

  maskCtx.fillStyle = 'white';
  maskCtx.beginPath();
  pieces.forEach((piece) => {
    updatePiecePixelDimensions(piece, canvas);
    addPiecePathToContext(maskCtx, piece);
  });
  maskCtx.fill('evenodd');

  return maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
};

const compareMasks = (mask1, mask2, tolerance = 0.005) => {
  const data1 = mask1.data;
  const data2 = mask2.data;
  const totalPixels = data1.length / 4;
  let mismatchCount = 0;

  for (let i = 0; i < data1.length; i += 4) {
    const filled1 = data1[i] > 128;
    const filled2 = data2[i] > 128;
    if (filled1 !== filled2) mismatchCount++;
  }

  const mismatchRatio = mismatchCount / totalPixels;
  return mismatchRatio <= tolerance;
};
