// daily.js - Logic for the Daily Puzzle page
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
    puzzleCanvas.addEventListener('pointerdown', (e) => handlePointerDown(e, puzzlePieces, renderPuzzleScoped, isPuzzleSolved));
    puzzleCanvas.addEventListener('pointermove', (e) => handleHover(e, puzzlePieces, renderPuzzleScoped, isPuzzleSolved));
    puzzleCanvas.addEventListener('pointerleave', () => {
        if (hoveredPiece) {
            hoveredPiece = null;
            renderPuzzleScoped();
        }
    });

    document.getElementById('play-again-button').addEventListener('click', () => {
        hideModal('completion-modal');
        setupDailyPuzzle(currentPuzzle);
    });

    document.getElementById('info-button').addEventListener('click', () => showModal('info-modal'));
    document.getElementById('info-modal').addEventListener('click', (e) => {
        if (e.target.id === 'info-modal') hideModal('info-modal');
    });

    document.getElementById('close-info-modal-button').addEventListener('click', () => hideModal('info-modal'));
};

const configureCompletionModal = () => {
    // No next/prev buttons for daily puzzle for now
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

        renderReference(referencePieces);
        renderPuzzleScoped();

        const puzzleDate = new Date(puzzle.scheduledDate + 'T00:00:00');
        const formattedDate = puzzleDate.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });

        document.getElementById('daily-puzzle-name').textContent = `Daily Puzzle #${puzzle.dailyNumber || '?'}`;
        document.getElementById('daily-author').textContent = formattedDate;

    } catch (error) {
        console.error("Failed to load daily puzzle pieces:", error);
    }
};

const loadDaily = async () => {
    const loadingIndicator = document.getElementById('loading-indicator');
    const puzzleContainer = document.getElementById('daily-puzzle-container');
    const noDailyMessage = document.getElementById('no-daily-message');

    try {
        const dailyPuzzle = await fetchDailyPuzzle();
        loadingIndicator.style.display = 'none';

        if (dailyPuzzle) {
            puzzleContainer.style.display = 'contents';
            await setupDailyPuzzle(dailyPuzzle);
            recordPlay(dailyPuzzle.id);
        } else {
            puzzleContainer.style.display = 'none';
            noDailyMessage.style.display = 'block';
        }
    } catch (error) {
        console.error("Error loading daily puzzle:", error);
        loadingIndicator.style.display = 'none';
        noDailyMessage.style.display = 'block';
    }
};

window.onload = () => {
    initializeCoreCanvases(
        document.getElementById('puzzle-canvas'),
        document.getElementById('reference-canvas')
    );
    initializeEventListeners();
    loadDaily();
};
