let isPuzzleSolved = false;
let startTime;
let moveCount = 0;

const handleHover = (e, puzzlePieces, renderFn, isGameSolved) => {
  if (isGameSolved || activePiece || isSnapping) return;

  const { x: mouseX, y: mouseY } = getMousePos(e);
  let foundPiece = null;
  for (let i = puzzlePieces.length - 1; i >= 0; i--) {
    const piece = puzzlePieces[i];
    if (isPointInPiece(puzzleCtx, piece, mouseX, mouseY)) {
      foundPiece = piece;
      break;
    }
  }
  if (hoveredPiece !== foundPiece) {
    hoveredPiece = foundPiece;
    renderFn();
  }
};

const handlePointerDown = (e, puzzlePieces, renderFn, isGameSolved) => {
  if (isGameSolved || isSnapping) return;

  const { x: mouseX, y: mouseY } = getMousePos(e);
  for (let i = puzzlePieces.length - 1; i >= 0; i--) {
    const piece = puzzlePieces[i];
    if (isPointInPiece(puzzleCtx, piece, mouseX, mouseY)) {
      activePiece = piece;
      hoveredPiece = null;
      activePiece.initialCol = piece.col;
      activePiece.initialRow = piece.row;
      dragOffsetX = mouseX - piece.x;
      dragOffsetY = mouseY - piece.y;

      puzzlePieces.splice(i, 1);
      puzzlePieces.push(activePiece);

      puzzleCanvas.addEventListener('pointermove', handlePointerMove);
      puzzleCanvas.addEventListener('pointerup', handlePointerUp, { once: true });
      puzzleCanvas.addEventListener('pointercancel', handlePointerUp, { once: true });
      if (e.pointerType === 'mouse') {
        puzzleCanvas.addEventListener('pointerleave', handlePointerUp, { once: true });
      }

      renderFn();
      break;
    }
  }
};

const handlePointerMove = (e) => {
  if (!activePiece) return;
  const { x: mouseX, y: mouseY } = getMousePos(e);

  let newX = mouseX - dragOffsetX;
  let newY = mouseY - dragOffsetY;

  const bbox = getRotatedBoundingBoxInPixels(activePiece);

  const centerX = newX + activePiece.width / 2;
  const centerY = newY + activePiece.height / 2;

  const minCenterX = -bbox.offsetX;
  const maxCenterX = puzzleCanvas.width - (bbox.width + bbox.offsetX);
  const minCenterY = -bbox.offsetY;
  const maxCenterY = puzzleCanvas.height - (bbox.height + bbox.offsetY);

  const clampedCenterX = Math.max(minCenterX, Math.min(centerX, maxCenterX));
  const clampedCenterY = Math.max(minCenterY, Math.min(centerY, maxCenterY));

  activePiece.x = clampedCenterX - activePiece.width / 2;
  activePiece.y = clampedCenterY - activePiece.height / 2;
  renderPuzzleScoped();
};

const handlePointerUp = () => {
  if (!activePiece) return;

  const pieceToSnap = activePiece;
  activePiece = null;
  isSnapping = true;
  puzzleCanvas.removeEventListener('pointermove', handlePointerMove);
  puzzleCanvas.removeEventListener('pointercancel', handlePointerUp);

  const cellWidth = puzzleCanvas.width / GRID_COLS;
  const cellHeight = puzzleCanvas.height / GRID_ROWS;
  const targetCol = Math.round(pieceToSnap.x / cellWidth);
  const targetRow = Math.round(pieceToSnap.y / cellHeight);

  const bbox = getRotatedBoundingBoxInPixels(pieceToSnap);

  const centerX = pieceToSnap.x + pieceToSnap.width / 2;
  const centerY = pieceToSnap.y + pieceToSnap.height / 2;

  const minCenterX = -bbox.offsetX;
  const maxCenterX = puzzleCanvas.width - (bbox.width + bbox.offsetX);
  const minCenterY = -bbox.offsetY;
  const maxCenterY = puzzleCanvas.height - (bbox.height + bbox.offsetY);
  const clampedCenterX = Math.max(minCenterX, Math.min(centerX, maxCenterX));
  const clampedCenterY = Math.max(minCenterY, Math.min(centerY, maxCenterY));

  const clampedCol = Math.round((clampedCenterX - pieceToSnap.width / 2) / cellWidth);
  const clampedRow = Math.round((clampedCenterY - pieceToSnap.height / 2) / cellHeight);

  const targetX = clampedCol * cellWidth;
  const targetY = clampedRow * cellHeight;

  animateSnap(pieceToSnap, targetX, targetY, () => {
    pieceToSnap.col = clampedCol;
    pieceToSnap.row = clampedRow;

    onPieceSnapComplete(pieceToSnap);

    isSnapping = false;

    checkCompletionScoped();
  });
};

const resetGameplayStats = () => {
  startTime = Date.now();
  moveCount = 0;
  isPuzzleSolved = false;
};

const onPieceSnapComplete = (piece) => {
  if (piece.col !== piece.initialCol || piece.row !== piece.initialRow) {
    moveCount++;
  }
};
const checkCompletion = (puzzlePieces, allSolutions) => {
  if (isSnapping || !allSolutions || allSolutions.length === 0) return;

  if (puzzlePieces.length !== allSolutions[0].length) return;

  const sorter = (a, b) => (a.row * GRID_COLS + a.col) - (b.row * GRID_COLS + b.col) || ((a.rotation || 0) - (b.rotation || 0));
  const currentPositions = puzzlePieces.map(p => ({ col: p.col, row: p.row, rotation: p.rotation || 0 })).sort(sorter);
  const currentPositionsString = JSON.stringify(currentPositions);

  for (const solution of allSolutions) {
    const solutionPositions = solution.map(p => ({ col: p.col, row: p.row, rotation: p.rotation || 0 })).sort(sorter);
    if (currentPositionsString === JSON.stringify(solutionPositions)) {
      isPuzzleSolved = true;
      hoveredPiece = null;
      setTimeout(() => {
        renderPuzzleScoped();
        playCompletionAnimation();
      }, 100);
      return;
    }
  }
};

const playCompletionAnimation = () => {
  const animationColor = getComputedStyle(document.body).getPropertyValue('--accent-color');
  const waveDelay = 120;
  const fillDuration = 240;
  const cellWidth = puzzleCanvas.width / VISUAL_GRID_SIZE;
  const cellHeight = puzzleCanvas.height / VISUAL_GRID_SIZE;
  const maxDistance = Math.ceil(VISUAL_GRID_SIZE / 2);
  const totalDuration = (maxDistance + 2) * waveDelay + fillDuration;
  const fadeDuration = totalDuration * 0.4;
  let animationStartTime = null;
  const cellData = [];
  for (let r = 0; r < VISUAL_GRID_SIZE; r++) {
    for (let c = 0; c < VISUAL_GRID_SIZE; c++) {
      const distance = Math.floor(Math.max(Math.abs(c - (VISUAL_GRID_SIZE / 2 - 0.5)), Math.abs(r - (VISUAL_GRID_SIZE / 2 - 0.5))));
      cellData.push({ r, c, distance });
    }
  }

  function animationLoop(currentTime) {
    if (!animationStartTime) animationStartTime = currentTime;
    const elapsedTime = currentTime - animationStartTime;

    const fadeProgress = Math.max(0, 1 - (elapsedTime / fadeDuration));
    renderPuzzleScoped(fadeProgress, false);

    cellData.forEach(cell => {
      let progress = 0;
      const fillStartTime = cell.distance * waveDelay;
      const fillEndTime = fillStartTime + fillDuration;
      const unfillStartTime = (cell.distance + 1) * waveDelay;
      const unfillEndTime = unfillStartTime + fillDuration;
      if (elapsedTime >= fillStartTime && elapsedTime < fillEndTime) {
        progress = (elapsedTime - fillStartTime) / fillDuration;
      } else if (elapsedTime >= fillEndTime && elapsedTime < unfillStartTime) {
        progress = 1;
      } else if (elapsedTime >= unfillStartTime && elapsedTime < unfillEndTime) {
        progress = 1 - ((elapsedTime - unfillStartTime) / fillDuration);
      }
      progress = Math.max(0, Math.min(progress, 1));
      if (progress > 0) {
        const rectWidth = cellWidth * progress;
        const rectHeight = cellHeight * progress;
        const rectX = (cell.c * cellWidth) + (cellWidth - rectWidth) / 2;
        const rectY = (cell.r * cellHeight) + (cellHeight - rectHeight) / 2;
        puzzleCtx.fillStyle = animationColor;
        puzzleCtx.globalCompositeOperation = 'source-over';
        puzzleCtx.fillRect(rectX, rectY, rectWidth, rectHeight);
      }
    });

    const normalizedTime = elapsedTime / totalDuration;
    const glowProgress = normalizedTime <= 0.5 ? (normalizedTime * 2) : ((1 - normalizedTime) * 2);

    if (glowProgress > 0) {
      puzzleCtx.save();
      puzzleCtx.globalCompositeOperation = 'screen';
      puzzleCtx.strokeStyle = animationColor;
      puzzleCtx.lineWidth = (2 * glowProgress) * window.devicePixelRatio;
      puzzleCtx.shadowColor = animationColor;
      puzzleCtx.shadowBlur = 15 * glowProgress;

      const gridSize = VISUAL_GRID_SIZE;
      const cellSize = puzzleCanvas.width / gridSize;
      for (let i = 1; i < gridSize; i++) {
        puzzleCtx.beginPath();
        puzzleCtx.moveTo(i * cellSize, 0);
        puzzleCtx.lineTo(i * cellSize, puzzleCanvas.height);
        puzzleCtx.stroke();
        puzzleCtx.beginPath();
        puzzleCtx.moveTo(0, i * cellSize);
        puzzleCtx.lineTo(puzzleCanvas.width, i * cellSize);
        puzzleCtx.stroke();
      }
      puzzleCtx.restore();
    }

    if (elapsedTime < totalDuration) {
      requestAnimationFrame(animationLoop);
    } else {
      renderPuzzleScoped(0, false);
      const timeTaken = Date.now() - startTime;
      setTimeout(() => {
        showCompletionModal(timeTaken);
      }, 400);
    }
  }
  requestAnimationFrame(animationLoop);
};

const showModal = (modalId) => {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.style.display = 'flex';
  setTimeout(() => modal.classList.add('show'), 10);
};

const hideModal = (modalId) => {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.remove('show');
  setTimeout(() => {
    modal.style.display = 'none';
  }, 400);
};

let showCompletionModal = (timeInMs, moves) => {
  const timeSpan = document.getElementById('time-taken');
  const movesSpan = document.getElementById('moves-made');
  const currentMoves = moves !== undefined ? moves : moveCount;

  if (timeSpan && movesSpan) {
    const seconds = Math.floor(timeInMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    timeSpan.textContent = `${minutes}m ${remainingSeconds}s`;
    movesSpan.textContent = currentMoves;
  }

  configureCompletionModal();

  showModal('completion-modal');
};