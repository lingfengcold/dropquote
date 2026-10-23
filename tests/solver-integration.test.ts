import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import { DropQuoteSolver } from '../src/lib/solver.ts';
import { mergeLexiconLayers, parseLexiconText } from '../src/data/lexiconParse.ts';
import { parsePuzzle } from '../src/lib/puzzle.ts';
import loadHighs from 'highs';
import { createWordOptimizer } from '../src/lib/wordOptimizer.ts';
import { createContextScore } from '../src/lib/contextModel.ts';

// Use the actual distributed data, without injecting quote words or special ranks.
const readLayer = (name: string) => parseLexiconText(gunzipSync(readFileSync(new URL(`../src/data/${name}.txt.gz`, import.meta.url))).toString('utf8'));
const lexicon = mergeLexiconLayers(readLayer('english-wordfreq'), readLayer('english-wordnik-tail'));
const context = JSON.parse(gunzipSync(readFileSync(new URL('../src/data/english-context.json.gz', import.meta.url))).toString('utf8'));
const solver = new DropQuoteSolver(lexicon.words, lexicon.rankedWords, {
  contextScore: createContextScore(context), optimizer: createWordOptimizer(await loadHighs()),
});

function makePuzzle(text: string, cols: number, minimumRows = 1) {
  const rows = Math.max(minimumRows, Math.ceil(text.length / cols));
  const grid = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => text[r * cols + c] ?? ' '));
  const blocks = grid.map(row => row.map(char => char === ' '));
  const columnLetters = Array.from({ length: cols }, (_, c) => grid.map(row => row[c]).filter(char => char !== ' ').sort());
  return { rows, cols, grid, blocks, columnLetters };
}

for (const [answer, cols] of [
  ['THE ONLY WAY TO DO GREAT WORK IS TO LOVE WHAT YOU DO', 12],
  ['IN THE MIDDLE OF DIFFICULTY LIES OPPORTUNITY', 14],
  ['WISDOM COMES FROM EXPERIENCE AND EXPERIENCE COMES FROM MAKING MISTAKES', 18],
] as const) {
  test(`real vocabulary ranks a ${cols}-column quote among the best answers`, () => {
    const puzzle = makePuzzle(answer, cols);
    const report = solver.solve(puzzle.rows, cols, puzzle.columnLetters, puzzle.blocks, { timeLimitMs: 5_000, maxNodes: 500_000, maxResults: 20 });
    const rank = report.results.findIndex(result => result.text === answer);
    assert.ok(rank >= 0 && rank < 5, `expected answer in top 5; status=${report.status}, nodes=${report.stats.nodesVisited}, first=${report.results[0]?.text}`);
  });
}

test('real vocabulary honors fixed letters while resolving missing OCR letters', () => {
  const answer = 'THE ONLY WAY TO DO GREAT WORK IS TO LOVE WHAT YOU DO';
  const puzzle = makePuzzle(answer, 12);
  const fixedLetters = puzzle.grid.map(row => row.map((): string | null => null));
  for (let r = 0; r < puzzle.rows; r++) {
    const c = puzzle.grid[r].findIndex(char => char !== ' ');
    if (c >= 0) fixedLetters[r][c] = puzzle.grid[r][c];
  }
  // Replace one genuine pool letter by ?, retaining the same column capacity.
  const missingColumn = 0;
  puzzle.columnLetters[missingColumn][0] = '?';
  const report = solver.solve(puzzle.rows, puzzle.cols, puzzle.columnLetters, puzzle.blocks, { fixedLetters, timeLimitMs: 5_000, maxNodes: 500_000, maxResults: 20 });
  const result = report.results.find(candidate => candidate.text === answer);
  assert.ok(result, `the correct answer disappeared with one missing OCR letter: ${report.status}`);
  for (let r = 0; r < puzzle.rows; r++) {
    for (let c = 0; c < puzzle.cols; c++) {
      if (fixedLetters[r][c]) assert.equal(result.grid[r][c], fixedLetters[r][c]);
    }
  }
  assert.equal(result.resolvedUnknowns.reduce((total, column) => total + column.letters.length, 0), 1);
});

test('a 30x30 puzzle with the full vocabulary returns a bounded search report', () => {
  const sentence = 'WISDOM COMES FROM EXPERIENCE AND EXPERIENCE COMES FROM MAKING MISTAKES';
  const puzzle = makePuzzle(Array(12).fill(sentence).join(' '), 30, 30);
  const started = performance.now();
  const report = solver.solve(puzzle.rows, puzzle.cols, puzzle.columnLetters, puzzle.blocks, { timeLimitMs: 500, maxNodes: 10_000, maxResults: 10 });
  assert.ok(['complete', 'time-limit', 'node-limit'].includes(report.status));
  // A generous ceiling checks that the budget is honored without relying on
  // millisecond scheduling or requiring an underconstrained big quote to solve.
  assert.ok(performance.now() - started < 5_000, 'a 500 ms budget must not turn into an unbounded search');
  assert.ok(report.stats.nodesVisited <= 10_000);
});

test('the supplied senses word-list puzzle is found using dictionary layers and generic joined words', () => {
  const puzzle = parsePuzzle(JSON.parse(readFileSync(new URL('./fixtures/senses-word-list.json', import.meta.url), 'utf8')));
  const answer = 'ODORLESS WATCHTOWER EARSHOT HEARSAY FORESIGHT NOSECLIP TASTEABLE TOUCHDOWN EARRING HANDCRAFT NOSEGUARD';
  // No customWords or answer-specific priors: TASTEABLE/NOSEGUARD come from the
  // general dictionary supplement, while NOSECLIP must be inferred as NOSE+CLIP.
  assert.ok(!lexicon.words.includes('NOSECLIP'));
  const report = solver.solve(puzzle.rows, puzzle.cols, puzzle.columnLetters, puzzle.blocks, { allowJoinedWords: true, timeLimitMs: 5_000, maxNodes: 1_000_000, maxResults: 30 });
  const rank = report.results.findIndex(result => result.text === answer);
  assert.ok(rank >= 0 && rank < 5, `expected senses answer in top 5; status=${report.status}, nodes=${report.stats.nodesVisited}, first=${report.results[0]?.text}`);
  assert.ok(report.results[rank].joinedWords.some(item => item.word === 'NOSECLIP' && item.parts.join('+') === 'NOSE+CLIP'));
});

test('the supplied 26-column quotation ranks first with all seven missing letters inferred', () => {
  const puzzle = parsePuzzle(JSON.parse(readFileSync(new URL('./fixtures/wild-things.json', import.meta.url), 'utf8')));
  const answer = 'HIS MOTHER CALLED HIM WILD THING AND MAX SAID ILL EAT YOU UP SO HE WAS SENT TO BED WITHOUT EATING ANYTHING THAT VERY NIGHT IN MAXS ROOM A FOREST GREW AND GREW AND GREW UNTIL HIS CEILING HUNG WITH VINES';
  assert.ok(puzzle.fixedLetters.every(row => row.every(cell => cell === null)));
  const report = solver.solve(puzzle.rows, puzzle.cols, puzzle.columnLetters, puzzle.blocks, {
    timeLimitMs: 10_000, maxNodes: 1_000_000, maxResults: 20,
  });
  assert.equal(report.results[0]?.text, answer, `status=${report.status}; top=${report.results[0]?.text}`);
  assert.equal(new Set(report.results.map(result => result.text)).size, report.results.length);
  assert.deepEqual(report.results[0].resolvedUnknowns, [
    { col: 1, letters: ['R'] }, { col: 4, letters: ['I'] }, { col: 12, letters: ['R'] },
    { col: 13, letters: ['H'] }, { col: 17, letters: ['N'] }, { col: 18, letters: ['G'] }, { col: 20, letters: ['E'] },
  ]);
  assert.ok(report.stats.nodesVisited <= 1_000_000);
});
