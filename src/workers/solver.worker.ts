import { DropQuoteSolver } from '../lib/solver';
import { loadLexicon } from '../data/lexicon';
import { loadContextScore } from '../data/context';
import loadHighs from 'highs';
import highsWasmUrl from 'highs/runtime?url';
import { createWordOptimizer } from '../lib/wordOptimizer';
import { parsePuzzle } from '../lib/puzzle';
import type { SolverRequest, SolverResponse } from '../lib/solverProtocol';

const scope = self as unknown as {
  postMessage: (message: SolverResponse) => void;
  onmessage: ((event: MessageEvent<SolverRequest>) => void) | null;
};
let initialization: Promise<DropQuoteSolver> | undefined;
function initialize() {
  initialization ??= Promise.all([
    loadLexicon(), loadContextScore(), loadHighs({ locateFile: () => highsWasmUrl }),
  ]).then(([data, contextScore, highs]) => {
    const solver = new DropQuoteSolver(data.words, data.rankedWords, { contextScore, optimizer: createWordOptimizer(highs) });
    scope.postMessage({ type: 'ready', wordCount: data.words.length });
    return solver;
  });
  return initialization;
}

scope.onmessage = async ({ data }) => {
  try {
    const solver = await initialize();
    if (data.type === 'init') return;
    const puzzle = parsePuzzle(data.puzzle);
    const report = solver.solve(puzzle.rows, puzzle.cols, puzzle.columnLetters, puzzle.blocks, {
      ...data.options,
      fixedLetters: puzzle.fixedLetters,
      onProgress: progress => scope.postMessage({ type: 'progress', id: data.id, progress }),
    });
    scope.postMessage({ type: 'result', id: data.id, report });
  } catch (error) {
    scope.postMessage({ type: 'error', id: data.type === 'solve' ? data.id : undefined, message: error instanceof Error ? error.message : 'Could not start the solver.' });
  }
};
