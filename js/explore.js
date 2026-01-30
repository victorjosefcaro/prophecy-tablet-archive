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

const formatNumber = (num) => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}m`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return num.toString();
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

  // Handle direct puzzle link
  const urlParams = new URLSearchParams(window.location.search);
  let puzzleId = urlParams.get('puzzle');

  // Also check path for domain/explore/CODE format
  if (!puzzleId) {
    const pathParts = window.location.pathname.split('/').filter((p) => p);
    const exploreIdx = pathParts.findIndex((p) => p.startsWith('explore'));
    if (exploreIdx !== -1 && pathParts.length > exploreIdx + 1) {
      puzzleId = pathParts[exploreIdx + 1];
    }
  }

  if (puzzleId) {
    // First check if it's already in the loaded list
    let puzzle = userPuzzles.find((p) => p.id === puzzleId);
    if (puzzle) {
      openGameplayView(puzzle);
    } else {
      // If not in list, fetch it specifically
      puzzle = await fetchPuzzleById(puzzleId);
      if (puzzle) {
        // We need to ensure we have images preloaded for this puzzle
        await preloadImages([puzzle]);
        openGameplayView(puzzle);
      }
    }
  }
};

const setupEventListeners = () => {
  // Back buttons
  document.getElementById('back-to-grid-button').addEventListener('click', showGridView);

  // Modal buttons
  document
    .getElementById('share-completion-button')
    .addEventListener('click', shareCurrentPuzzleLink);
  document.getElementById('back-to-explore-button').addEventListener('click', showGridView);

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
      setTimeout(() => (infoModal.style.display = 'none'), 300);
    };

    infoButton.addEventListener('click', openInfoModal);
    closeInfoButton.addEventListener('click', closeInfoModal);
    infoModal.addEventListener('click', (e) => {
      if (e.target === infoModal) closeInfoModal();
    });
  }

  // Canvas reset button
  document.getElementById('reset-button').addEventListener('click', () => {
    resetPuzzlePositions(puzzlePieces, renderPuzzleScoped);
  });

  // Completion modal close on overlay click
  const completionModal = document.getElementById('completion-modal');
  if (completionModal) {
    completionModal.addEventListener('click', (e) => {
      if (e.target === completionModal) hideModal('completion-modal');
    });
  }

  // Completion modal star rating
  const completionStars = document.getElementById('completion-star-rating');
  if (completionStars) {
    const stars = completionStars.querySelectorAll('i');
    stars.forEach((star) => {
      star.addEventListener('click', () => {
        const rating = parseInt(star.getAttribute('data-rating'));
        handleCompletionRating(rating);
      });
    });
  }

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
    timeRange: timeSelect.value,
  };

  userPuzzles = await fetchPuzzles(options);

  // Client-side sorting
  const field = sortField.value;
  const order = sortOrder.value;

  const getAvg = (puzzle, type) => {
    if (!puzzle.completionCount || puzzle.completionCount === 0)
      return order === 'asc' ? Infinity : -Infinity;
    return type === 'time'
      ? puzzle.totalTimeMs / puzzle.completionCount
      : puzzle.totalMoves / puzzle.completionCount;
  };

  const getRating = (puzzle) => {
    if (!puzzle.ratingCount || puzzle.ratingCount === 0)
      return order === 'asc' ? Infinity : -Infinity;
    return (puzzle.ratingSum || 0) / puzzle.ratingCount;
  };

  const sortFunctions = {
    date: (a, b) => b.createdAt - a.createdAt,
    rating: (a, b) => getRating(b) - getRating(a),
    playCount: (a, b) => b.playCount - a.playCount,
    avgTime: (a, b) => getAvg(b, 'time') - getAvg(a, 'time'),
    avgMoves: (a, b) => getAvg(b, 'moves') - getAvg(a, 'moves'),
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
    filtered = userPuzzles.filter((p) => playedSet.has(p.id));
  } else if (filter === 'unplayed') {
    filtered = userPuzzles.filter((p) => !playedSet.has(p.id));
  }

  populateExploreGrid(filtered);
};

const preloadImages = async (puzzles) => {
  const allPieceUrls = [
    ...new Set(
      puzzles.flatMap((p) => {
        const data = p.puzzleData;
        return [
          ...data.puzzlePiecesData.map((pd) => pd.src),
          ...data.solutions[0].map((s) => s.src),
        ];
      })
    ),
  ];

  try {
    const loadedImages = await Promise.all(allPieceUrls.map(loadImage));
    imageMap = Object.fromEntries(allPieceUrls.map((url, i) => [url, loadedImages[i]]));
  } catch (error) {
    console.error('Failed to preload images:', error);
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

    // Stats row: rating and plays on left
    const ratingCount = puzzle.ratingCount || 0;
    const ratingSum = puzzle.ratingSum || 0;
    const rating = ratingCount > 0 ? (ratingSum / ratingCount).toFixed(1) : '--';
    const statsRow = document.createElement('div');
    statsRow.className = 'puzzle-card-stats';
    statsRow.innerHTML = `
      <div class="stats-group rating">
        <span><i class="fa-solid fa-star"></i> ${rating}</span>
      </div>
      <div class="stats-group plays">
        <span><i class="fa-solid fa-play"></i> ${formatNumber(puzzle.playCount)}</span>
      </div>
    `;

    const shareBtn = document.createElement('button');
    shareBtn.className = 'share-card-btn';
    shareBtn.innerHTML =
      '<i class="fa-solid fa-share"></i> <span class="share-btn-text">Share</span>';
    shareBtn.title = 'Share puzzle';
    shareBtn.setAttribute('aria-label', 'Share puzzle');
    shareBtn.onclick = (e) => {
      e.stopPropagation();
      // Use query parameter for best local file support
      const url = new URL(window.location.href);
      url.searchParams.set('puzzle', puzzle.id);
      const shareUrl = url.toString();

      navigator.clipboard.writeText(shareUrl).then(() => {
        const icon = shareBtn.querySelector('i');
        const text = shareBtn.querySelector('.share-btn-text');

        icon.className = 'fa-solid fa-check';
        text.textContent = 'Link Copied';

        setTimeout(() => {
          icon.className = 'fa-solid fa-share';
          text.textContent = 'Share';
        }, 2000);
      });
    };
    statsRow.appendChild(shareBtn);

    info.appendChild(statsRow);

    card.appendChild(info);

    // Play on canvas click
    canvas.onclick = () => openGameplayView(puzzle);

    grid.appendChild(card);
  });

  requestAnimationFrame(() => {
    previewsToDraw.forEach((drawFn) => drawFn());
  });
};

const handleCompletionRating = (rating) => {
  if (!currentPuzzle) return;

  const puzzleId = currentPuzzle.id;
  const currentRating = getUserRating(puzzleId);

  // If clicking the same rating, remove it?
  // Most star systems don't allow 0 stars by clicking the same star.
  // But we can allow it if we want. Let's say clicking the same star clears it.
  const newRating = currentRating === rating ? null : rating;

  // Calculate new stats optimistically
  let newRatingSum = currentPuzzle.ratingSum || 0;
  let newRatingCount = currentPuzzle.ratingCount || 0;

  if (currentRating) {
    newRatingSum -= currentRating;
    newRatingCount--;
  }
  if (newRating) {
    newRatingSum += newRating;
    newRatingCount++;
  }

  // Save rating locally
  saveUserRating(puzzleId, newRating);
  currentPuzzle.ratingSum = newRatingSum;
  currentPuzzle.ratingCount = newRatingCount;

  // Update UI
  updateCompletionVoteButtons();

  // Fire API call
  ratePuzzle(puzzleId, newRating, currentRating).catch((error) => {
    console.error('Rating failed:', error);
  });
};

const highlightStars = (stars, rating) => {
  stars.forEach((star) => {
    const starRating = parseInt(star.getAttribute('data-rating'));
    if (starRating <= rating) {
      star.classList.replace('fa-regular', 'fa-solid');
      star.classList.add('active');
    } else {
      star.classList.replace('fa-solid', 'fa-regular');
      star.classList.remove('active');
    }
  });
};

// Update vote button states when completion modal opens
const updateCompletionVoteButtons = () => {
  if (!currentPuzzle) return;
  const userRating = getUserRating(currentPuzzle.id);
  const completionStars = document.getElementById('completion-star-rating');
  if (completionStars) {
    const stars = completionStars.querySelectorAll('i');
    highlightStars(stars, userRating || 0);
    stars.forEach((star) => {
      star.classList.toggle('voted', !!userRating);
    });
  }
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
  timeDiffEl.className =
    'comparison-value ' + (timeDiff < -500 ? 'better' : timeDiff > 500 ? 'worse' : 'same');

  // Moves comparison (lower is better)
  const movesDiffSign = movesDiff > 0 ? '+' : '';
  movesDiffEl.textContent = `${movesDiffSign}${Math.round(movesDiff)}`;
  movesDiffEl.className =
    'comparison-value ' + (movesDiff < -1 ? 'better' : movesDiff > 1 ? 'worse' : 'same');

  comparisonSection.style.display = 'block';
};

const openGameplayView = async (puzzle) => {
  window.scrollTo(0, 0);
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

  // Update URL in browser (without page reload)
  const url = new URL(window.location.href);
  url.searchParams.set('puzzle', puzzle.id);
  window.history.pushState({ puzzleId: puzzle.id }, '', url.toString());
};

const showGridView = () => {
  gameplayView.style.display = 'none';
  gridView.style.display = 'block';
  document.body.classList.remove('no-scroll');

  if (puzzleCtx) puzzleCtx.clearRect(0, 0, puzzleCanvas.width, puzzleCanvas.height);
  if (referenceCtx)
    referenceCtx.clearRect(0, 0, referenceCtx.canvas.width, referenceCtx.canvas.height);
  hideModal('completion-modal');

  // Clear URL parameter or path code
  const url = new URL(window.location.href);
  if (url.searchParams.has('puzzle')) {
    url.searchParams.delete('puzzle');
  }

  // Handle path cleanup if it ends with a code (e.g. /explore/nwlbx)
  let path = url.pathname;
  const pathParts = path.split('/').filter((p) => p);
  if (
    pathParts.length > 0 &&
    pathParts[pathParts.length - 2] &&
    pathParts[pathParts.length - 2].startsWith('explore')
  ) {
    path = '/' + pathParts.slice(0, -1).join('/');
  }

  window.history.replaceState({}, '', path + url.search);

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

  puzzlePieces = puzzleData.puzzlePiecesData.map((data) => ({
    ...data,
    col: data.startCol,
    row: data.startRow,
    img: imageMap[data.src],
  }));

  referencePieces = solutionForReference.map((data) => ({
    ...data,
    img: imageMap[data.src],
  }));

  resizeCanvases([...puzzlePieces, ...referencePieces]);
  renderReference(referencePieces);
  renderPuzzleScoped();

  puzzleCanvas.addEventListener('pointerdown', (e) =>
    handlePointerDown(e, puzzlePieces, renderPuzzleScoped, isPuzzleSolved)
  );
  puzzleCanvas.addEventListener('pointermove', (e) =>
    handleHover(e, puzzlePieces, renderPuzzleScoped, isPuzzleSolved)
  );
};

const resetCurrentPuzzle = () => {
  hideModal('completion-modal');
  if (currentPuzzle) {
    loadPuzzle(currentPuzzle);
  }
};

const shareCurrentPuzzleLink = (e) => {
  if (!currentPuzzle) return;

  const btn = e.currentTarget;
  const originalText = btn.textContent;

  const timeTaken = document.getElementById('time-taken').textContent;
  const movesMade = document.getElementById('moves-made').textContent;
  const puzzleName = document.getElementById('explore-puzzle-name').textContent;
  const puzzleAuthor = document.getElementById('explore-puzzle-author').textContent;

  const timeDiffEl = document.getElementById('time-diff');
  const movesDiffEl = document.getElementById('moves-diff');

  let vsAverage = '';
  if (
    timeDiffEl &&
    timeDiffEl.textContent &&
    document.getElementById('performance-comparison').style.display !== 'none'
  ) {
    vsAverage = `\nvs Average:\n- Time: ${timeDiffEl.textContent}\n- Moves: ${movesDiffEl.textContent}`;
  }

  const url = new URL(window.location.href);
  url.searchParams.set('puzzle', currentPuzzle.id);
  const shareUrl = url.toString();

  const shareText = `${puzzleName} ${puzzleAuthor}
Stats:
- Time: ${timeTaken}
- Moves: ${movesMade}${vsAverage}

Play here: ${shareUrl}`;

  navigator.clipboard.writeText(shareText).then(() => {
    btn.textContent = 'Copied';

    setTimeout(() => {
      btn.textContent = originalText;
    }, 2000);
  });
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

  puzzlePieces.forEach((data) => {
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
  // Skip if grid view is hidden (user is in gameplay mode)
  if (gridView && gridView.style.display === 'none') return;

  levelPreviews.forEach((preview) => {
    drawPuzzlePreview(preview.canvas, preview.puzzlePieces, preview.imageMap);
  });
};

// Expose function to re-render gameplay canvases when theme changes
const rerenderGameplayCanvases = () => {
  if (gameplayView && gameplayView.style.display !== 'none') {
    if (referencePieces.length > 0) {
      renderReference(referencePieces);
    }
    if (puzzlePieces.length > 0) {
      renderPuzzleScoped();
    }
  }
};
