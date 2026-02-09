let puzzlePieces = [];
let referencePieces = [];
let currentPuzzle = null;

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
  puzzleCanvas.addEventListener('pointerdown', (e) =>
    handlePointerDown(e, puzzlePieces, renderPuzzleScoped, isPuzzleSolved)
  );
  puzzleCanvas.addEventListener('pointermove', (e) =>
    handleHover(e, puzzlePieces, renderPuzzleScoped, isPuzzleSolved)
  );
  puzzleCanvas.addEventListener('pointerleave', () => {
    if (hoveredPiece) {
      hoveredPiece = null;
      renderPuzzleScoped();
    }
  });

  document.querySelectorAll('#info-button, #info-button-mobile').forEach((button) => {
    button.addEventListener('click', () => showModal('info-modal'));
  });
  document.getElementById('info-modal').addEventListener('click', (e) => {
    if (e.target.id === 'info-modal') hideModal('info-modal');
  });

  document
    .getElementById('close-info-modal-button')
    .addEventListener('click', () => hideModal('info-modal'));

  document.getElementById('completion-modal').addEventListener('click', (e) => {
    if (e.target.id === 'completion-modal') hideModal('completion-modal');
  });

  document.getElementById('share-button').addEventListener('click', () => {
    const timeTaken = document.getElementById('time-taken').textContent;
    const movesMade = document.getElementById('moves-made').textContent;
    const puzzleName = document.getElementById('daily-puzzle-name').textContent;
    const puzzleDate = document.getElementById('daily-author').textContent;

    const timeDiffEl = document.getElementById('time-diff');
    const movesDiffEl = document.getElementById('moves-diff');

    let vsAverage = '';
    if (timeDiffEl && timeDiffEl.textContent) {
      vsAverage = `\nvs Average:\n- Time: ${timeDiffEl.textContent}\n- Moves: ${movesDiffEl.textContent}`;
    }

    const shareUrl = `https://prophecytablet.com`;
    const shareText = `${puzzleName} - ${puzzleDate}
Stats:
- Time: ${timeTaken}
- Moves: ${movesMade}${vsAverage}

Play here: ${shareUrl}`;

    navigator.clipboard.writeText(shareText).then(() => {
      const shareBtn = document.getElementById('share-button');
      const originalContent = shareBtn.innerHTML;
      shareBtn.innerHTML = 'Copied';
      setTimeout(() => {
        shareBtn.innerHTML = originalContent;
      }, 2000);
    });
  });

  document.getElementById('reset-button').addEventListener('click', () => {
    resetPuzzlePositions(puzzlePieces, renderPuzzleScoped);
  });
};

const updatePerformanceComparison = (userTimeMs, userMoves, stats) => {
  const comparisonSection = document.getElementById('performance-comparison');
  if (!comparisonSection || !stats) return;

  let avgTimeMs, avgMoves;

  if (stats.avgTimeMs !== undefined) {
    avgTimeMs = stats.avgTimeMs;
    avgMoves = stats.avgMoves;
  } else if (stats.completionCount > 0) {
    avgTimeMs = stats.totalTimeMs / stats.completionCount;
    avgMoves = stats.totalMoves / stats.completionCount;
  } else {
    comparisonSection.style.display = 'none';
    return;
  }

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

  timeDiffEl.textContent = formatTimeDiff(timeDiff);
  timeDiffEl.className =
    'comparison-value ' + (timeDiff < -500 ? 'better' : timeDiff > 500 ? 'worse' : 'same');

  const movesDiffSign = movesDiff > 0 ? '+' : '';
  movesDiffEl.textContent = `${movesDiffSign}${Math.round(movesDiff)}`;
  movesDiffEl.className =
    'comparison-value ' + (movesDiff < -0.5 ? 'better' : movesDiff > 0.5 ? 'worse' : 'same');

  comparisonSection.style.display = 'block';
};

const configureCompletionModal = (timeMs, moves, updatedStats) => {
  if (timeMs !== undefined && moves !== undefined) {
    updatePerformanceComparison(timeMs, moves, updatedStats || currentPuzzle);
  }

  if (currentPuzzle?.id) {
    markDailyCompleted(currentPuzzle.id, timeMs, moves);

    const viewStatsButton = document.getElementById('view-stats-button');
    if (viewStatsButton) {
      viewStatsButton.classList.remove('hidden');
      viewStatsButton.onclick = () => {
        showCompletionModal(timeMs, moves, true);
      };
    }
  }
};

const setupDailyPuzzle = async (puzzle) => {
  if (!puzzle) return;

  currentPuzzle = puzzle;
  resetGameplayStats();

  activePiece = null;
  hoveredPiece = null;
  isSnapping = false;

  resizeCanvases();

  const { puzzlePiecesData: rawPuzzlePieces, solutions: rawSolutions } = puzzle.puzzleData;
  const solutionForReference = processPuzzleData(rawSolutions[0]);
  const puzzlePiecesData = processPuzzleData(rawPuzzlePieces);

  try {
    const allPieceUrls = [
      ...new Set([
        ...puzzlePiecesData.map((p) => p.src),
        ...solutionForReference.map((p) => p.src),
      ]),
    ];
    const loadedImages = await Promise.all(allPieceUrls.map(loadImage));
    const imageMap = Object.fromEntries(allPieceUrls.map((url, i) => [url, loadedImages[i]]));

    puzzlePieces = puzzlePiecesData.map((data) => ({
      ...data,
      col: data.startCol,
      row: data.startRow,
      img: imageMap[data.src],
    }));
    puzzlePieces.forEach((p) => updatePiecePixelDimensions(p, puzzleCanvas));

    referencePieces = solutionForReference.map((data) => ({
      ...data,
      img: imageMap[data.src],
    }));
    referencePieces.forEach((p) => updatePiecePixelDimensions(p, referenceCanvas));

    renderReference(referencePieces);
    renderPuzzleScoped();

    const puzzleDate = new Date(puzzle.scheduledDate + 'T00:00:00');
    const formattedDate = puzzleDate.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    document.getElementById('daily-puzzle-name').textContent =
      `Daily Puzzle #${puzzle.dailyNumber || '?'}`;
    document.getElementById('daily-author').textContent = formattedDate;
  } catch (error) {
    console.error('Failed to load daily puzzle pieces:', error);
  }
};

const loadDaily = async () => {
  const loadingIndicator = document.getElementById('loading-indicator');
  const puzzleContainer = document.getElementById('daily-puzzle-container');
  const noDailyMessage = document.getElementById('no-daily-message');
  const viewStatsButton = document.getElementById('view-stats-button');

  try {
    const dailyPuzzle = await fetchDailyPuzzle();
    loadingIndicator.classList.add('hidden');

    if (dailyPuzzle) {
      await setupDailyPuzzle(dailyPuzzle);
      puzzleContainer.style.display = 'contents';
      recordPlay(dailyPuzzle.id);

      const completion = getDailyCompletion(dailyPuzzle.id);
      if (completion) {
        isPuzzleSolved = true;
        hoveredPiece = null;
        renderPuzzleScoped();

        if (viewStatsButton) {
          viewStatsButton.classList.remove('hidden');
          viewStatsButton.onclick = () => {
            showCompletionModal(completion.time, completion.moves, true);
          };
        }

        setTimeout(() => {
          showCompletionModal(completion.time, completion.moves, true);
        }, 500);
      }
    } else {
      puzzleContainer.style.display = 'none';
      noDailyMessage.style.display = 'block';
    }
  } catch (error) {
    console.error('Error loading daily puzzle:', error);
    loadingIndicator.classList.add('hidden');
    noDailyMessage.style.display = 'block';
  }
};

const startCountdown = () => {
  const countdownEl = document.getElementById('countdown-timer');
  if (!countdownEl) return;

  const update = () => {
    const now = new Date();
    const nextReset = new Date();
    nextReset.setUTCHours(24, 0, 0, 0);

    const diff = nextReset - now;
    if (diff <= 0) {
      countdownEl.textContent = '00:00:00';

      return;
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    countdownEl.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  update();
  setInterval(update, 1000);
};

window.onload = () => {
  initializeCoreCanvases(
    document.getElementById('puzzle-canvas'),
    document.getElementById('reference-canvas')
  );
  initializeEventListeners();
  loadDaily();
  startCountdown();
};
