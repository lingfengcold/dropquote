/** Real bundled-vocabulary smoke/performance benchmark: node --import tsx scripts/benchmark.ts */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { DropQuoteSolver } from '../src/lib/solver.ts';
import { parseLexiconText } from '../src/data/lexiconParse.ts';

const words = parseLexiconText(gunzipSync(readFileSync(new URL('../src/data/english-wordfreq.txt.gz', import.meta.url))).toString('utf8'));
const constructionStarted = performance.now();
const solver = new DropQuoteSolver(words, words);
console.log(JSON.stringify({ kind: 'dictionary', words: words.length, constructionMs: Math.round(performance.now() - constructionStarted), heapMiB: Math.round(process.memoryUsage().heapUsed / 1024 ** 2) }));

function makePuzzle(text: string, cols: number, minimumRows = 1) {
  const rows = Math.max(minimumRows, Math.ceil(text.length / cols));
  const blocks = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => !text[r * cols + c] || text[r * cols + c] === ' '));
  const columnLetters = Array.from({ length: cols }, (_, c) => Array.from({ length: rows }, (_, r) => text[r * cols + c]).filter(char => char && char !== ' ').sort());
  return { rows, cols, blocks, columnLetters };
}

for (const [text, cols] of [
  ['THE ONLY WAY TO DO GREAT WORK IS TO LOVE WHAT YOU DO', 12],
  ['IN THE MIDDLE OF DIFFICULTY LIES OPPORTUNITY', 14],
  ['WISDOM COMES FROM EXPERIENCE AND EXPERIENCE COMES FROM MAKING MISTAKES', 18],
] as const) {
  const puzzle = makePuzzle(text, cols);
  const report = solver.solve(puzzle.rows, puzzle.cols, puzzle.columnLetters, puzzle.blocks, { timeLimitMs: 5_000, maxNodes: 500_000, maxResults: 50 });
  console.log(JSON.stringify({ text, dimensions: `${puzzle.rows}x${cols}`, rank: report.results.findIndex(result => result.text === text) + 1 || null, topText: report.results[0]?.text, ...report.stats, status: report.status, heapMiB: Math.round(process.memoryUsage().heapUsed / 1024 ** 2) }));
}

const longText = Array(12).fill('WISDOM COMES FROM EXPERIENCE AND EXPERIENCE COMES FROM MAKING MISTAKES').join(' ');
const large = makePuzzle(longText, 30, 30);
const report = solver.solve(large.rows, large.cols, large.columnLetters, large.blocks, { timeLimitMs: 500, maxNodes: 10_000, maxResults: 10 });
console.log(JSON.stringify({ kind: 'bounded-large', dimensions: `${large.rows}x${large.cols}`, ...report.stats, status: report.status, heapMiB: Math.round(process.memoryUsage().heapUsed / 1024 ** 2) }));
