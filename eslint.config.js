import js from '@eslint/js';
import globals from 'globals';

export default [
    js.configs.recommended,
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script', // Using traditional scripts, not ES modules
            globals: {
                ...globals.browser,

                // --- puzzle-core.js globals ---
                activePiece: 'writable',
                hoveredPiece: 'writable',
                dragOffsetX: 'writable',
                dragOffsetY: 'writable',
                isSnapping: 'writable',
                GRID_COLS: 'readonly',
                GRID_ROWS: 'readonly',
                VISUAL_GRID_SIZE: 'readonly',
                puzzleCanvas: 'writable',
                puzzleCtx: 'writable',
                referenceCanvas: 'writable',
                referenceCtx: 'writable',
                tempCanvas: 'writable',
                tempCtx: 'writable',
                imageCache: 'writable',
                processPuzzleData: 'writable',
                loadImage: 'writable',
                initializeCoreCanvases: 'writable',
                resizeCanvases: 'writable',
                updatePiecePixelDimensions: 'writable',
                drawGrid: 'writable',
                drawImageTransformed: 'writable',
                addPiecePathToContext: 'writable',
                renderReference: 'writable',
                renderPuzzle: 'writable',
                drawBorder: 'writable',
                isPointInPiece: 'writable',
                getMousePos: 'writable',
                getRotatedBoundingBoxInPixels: 'writable',
                animateSnap: 'writable',
                renderPiecesToMask: 'writable',
                compareMasks: 'writable',

                // --- puzzle-gameplay.js globals ---
                isPuzzleSolved: 'writable',
                startTime: 'writable',
                moveCount: 'writable',
                handleHover: 'writable',
                handlePointerDown: 'writable',
                handlePointerMove: 'writable',
                handlePointerUp: 'writable',
                resetGameplayStats: 'writable',
                resetPuzzlePositions: 'writable',
                checkCompletion: 'writable',
                checkCompletionScoped: 'writable',
                playCompletionAnimation: 'writable',
                showModal: 'writable',
                hideModal: 'writable',
                showCompletionModal: 'writable',
                configureCompletionModal: 'writable',
                recordCompletion: 'writable',
                currentPuzzle: 'writable',

                // --- api.js globals ---
                fetchPuzzles: 'writable',
                fetchDailyPuzzle: 'writable',
                fetchScheduledDailies: 'writable',
                fetchPuzzleById: 'writable',
                createPuzzle: 'writable',
                ratePuzzle: 'writable',
                recordPlay: 'writable',
                getPlayedPuzzles: 'writable',
                markPuzzlePlayed: 'writable',
                getUserRating: 'writable',
                saveUserRating: 'writable',
                getCompletedDailies: 'writable',
                isDailyCompleted: 'writable',
                getDailyCompletion: 'writable',
                markDailyCompleted: 'writable',

                // --- Shared render/UI functions ---
                renderAll: 'writable',
                renderPuzzleScoped: 'writable',
                rerenderLevelPreviews: 'writable',
                rerenderExplorePreviews: 'writable',
                rerenderGameplayCanvases: 'writable',
            },
        },
        rules: {
            // Allow unused variables that start with underscore OR are shared globals
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            // Disable no-redeclare for files that define shared globals
            'no-redeclare': 'off',
            // Warn on console.log (but don't error)
            'no-console': 'off',
            // Require === instead of ==
            eqeqeq: ['error', 'always'],
            // No var, use let/const
            'no-var': 'error',
            // Prefer const when variable is never reassigned (disabled because
            // shared variables are reassigned in other files, which ESLint can't detect)
            'prefer-const': 'off',
        },
    },
    {
        // Ignore node_modules and build directories
        ignores: ['node_modules/**', 'dist/**', 'build/**'],
    },
];
