export const MAX_ROWS = 100;
export const MAX_COLS = 100;
export const MAX_CELLS = 5000;

export interface Puzzle {
  version: 1;
  rows: number;
  cols: number;
  columnLetters: string[][];
  blocks: boolean[][];
  fixedLetters: (string | null)[][];
}

export function validateDimensions(rows: number, cols: number): void {
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1 || rows > MAX_ROWS || cols > MAX_COLS || rows * cols > MAX_CELLS) {
    throw new Error(`Use 1–${MAX_ROWS} rows, 1–${MAX_COLS} columns, and at most ${MAX_CELLS.toLocaleString()} cells.`);
  }
}

export function createPuzzle(rows: number, cols: number): Puzzle {
  validateDimensions(rows, cols);
  return {
    version: 1, rows, cols,
    columnLetters: Array.from({ length: cols }, () => []),
    blocks: Array.from({ length: rows }, () => Array<boolean>(cols).fill(false)),
    fixedLetters: Array.from({ length: rows }, () => Array<string | null>(cols).fill(null)),
  };
}

export function cleanLetters(value: string): string[] {
  return value.toUpperCase().replace(/[^A-Z?]/g, '').split('');
}

export function getColumnCounts(puzzle: Pick<Puzzle, 'rows' | 'cols' | 'columnLetters' | 'blocks'>) {
  return Array.from({ length: puzzle.cols }, (_, col) => {
    const supplied = puzzle.columnLetters[col]?.length ?? 0;
    const spaces = puzzle.blocks.reduce((n, row) => n + Number(!row[col]), 0);
    return { col, supplied, spaces, missing: spaces - supplied, unknown: puzzle.columnLetters[col]?.filter(c => c === '?').length ?? 0 };
  });
}

/** Add exactly the column deficits, never silently remove excess or move letters between columns. */
export function fillMissingLetters(puzzle: Puzzle): Puzzle {
  const counts = getColumnCounts(puzzle);
  if (counts.some(c => c.missing < 0)) throw new Error('Some columns have too many letters. Correct them before filling missing letters.');
  return { ...puzzle, columnLetters: counts.map(c => [...puzzle.columnLetters[c.col], ...Array<string>(c.missing).fill('?')]) };
}

export function parsePuzzle(input: unknown): Puzzle {
  if (!input || typeof input !== 'object') throw new Error('This file does not contain a puzzle.');
  const p = input as Record<string, unknown>;
  if (p.version !== 1) throw new Error('Unsupported puzzle format. Expected version 1.');
  const rows = p.rows as number, cols = p.cols as number;
  validateDimensions(rows, cols);
  if (!Array.isArray(p.columnLetters) || p.columnLetters.length !== cols || !p.columnLetters.every(col => Array.isArray(col) && col.length <= rows && col.every(c => typeof c === 'string' && /^[A-Z?]$/.test(c)))) {
    throw new Error('Each column must contain uppercase A–Z letters or ?, with no more letters than rows.');
  }
  if (!Array.isArray(p.blocks) || p.blocks.length !== rows || !p.blocks.every(row => Array.isArray(row) && row.length === cols && row.every(c => typeof c === 'boolean'))) {
    throw new Error('The black-square grid does not match its dimensions.');
  }
  const fixed = p.fixedLetters ?? createPuzzle(rows, cols).fixedLetters;
  if (!Array.isArray(fixed) || fixed.length !== rows || !fixed.every(row => Array.isArray(row) && row.length === cols && row.every(c => c === null || (typeof c === 'string' && /^[A-Z]$/.test(c))))) {
    throw new Error('Known letters must be A–Z or null in a grid of the same dimensions.');
  }
  const blocks = p.blocks as boolean[][];
  if ((fixed as (string | null)[][]).some((row, r) => row.some((char, c) => char !== null && blocks[r][c]))) throw new Error('A black square cannot also contain a known letter.');
  return { version: 1, rows, cols, columnLetters: p.columnLetters as string[][], blocks, fixedLetters: fixed as (string | null)[][] };
}

export function puzzleFromText(text: string, cols: number): Puzzle {
  const cleaned = text.toUpperCase().replace(/[^A-Z\s]/g, '').replace(/\s+/g, ' ').trim();
  const rows = Math.ceil(cleaned.length / cols);
  const puzzle = createPuzzle(rows, cols);
  for (let i = 0; i < rows * cols; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    const char = cleaned[i];
    puzzle.blocks[r][c] = !char || char === ' ';
    if (char && char !== ' ') puzzle.columnLetters[c].push(char);
  }
  puzzle.columnLetters.forEach(col => col.sort());
  return puzzle;
}

export const EXAMPLE_TEXT = 'THE ONLY WAY TO DO GREAT WORK IS TO LOVE WHAT YOU DO';
export const DRAFT_KEY = 'dropquote.puzzle.v1';
