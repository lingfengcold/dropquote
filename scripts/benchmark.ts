/** Real bundled-vocabulary smoke/performance benchmark: node --import tsx scripts/benchmark.ts */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { DropQuoteSolver } from '../src/lib/solver.ts';
import { mergeLexiconLayers, parseLexiconText } from '../src/data/lexiconParse.ts';
import { parsePuzzle } from '../src/lib/puzzle.ts';
import loadHighs from 'highs';
import { createWordOptimizer } from '../src/lib/wordOptimizer.ts';
import { createContextScore } from '../src/lib/contextModel.ts';

const readLayer = (name: string) => parseLexiconText(gunzipSync(readFileSync(new URL(`../src/data/${name}.txt.gz`, import.meta.url))).toString('utf8'));
const lexicon = mergeLexiconLayers(readLayer('english-wordfreq'), readLayer('english-wordnik-tail'));
const constructionStarted = performance.now();
const context = JSON.parse(gunzipSync(readFileSync(new URL('../src/data/english-context.json.gz', import.meta.url))).toString('utf8'));
const solver = new DropQuoteSolver(lexicon.words, lexicon.rankedWords, { contextScore: createContextScore(context), optimizer: createWordOptimizer(await loadHighs()) });
console.log(JSON.stringify({ kind: 'dictionary', words: lexicon.words.length, rankedWords: lexicon.rankedWords.length, constructionMs: Math.round(performance.now() - constructionStarted), heapMiB: Math.round(process.memoryUsage().heapUsed / 1024 ** 2) }));

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

const senses = parsePuzzle(JSON.parse(readFileSync(new URL('../tests/fixtures/senses-word-list.json', import.meta.url), 'utf8')));
const sensesAnswer = 'ODORLESS WATCHTOWER EARSHOT HEARSAY FORESIGHT NOSECLIP TASTEABLE TOUCHDOWN EARRING HANDCRAFT NOSEGUARD';
const sensesReport = solver.solve(senses.rows, senses.cols, senses.columnLetters, senses.blocks, { allowJoinedWords: true, timeLimitMs: 5_000, maxNodes: 1_000_000, maxResults: 30 });
console.log(JSON.stringify({ kind: 'senses-word-list', rank: sensesReport.results.findIndex(result => result.text === sensesAnswer) + 1 || null, topText: sensesReport.results[0]?.text, ...sensesReport.stats, status: sensesReport.status }));

const wild = parsePuzzle(JSON.parse(readFileSync(new URL('../tests/fixtures/wild-things.json', import.meta.url), 'utf8')));
const wildAnswer = 'HIS MOTHER CALLED HIM WILD THING AND MAX SAID ILL EAT YOU UP SO HE WAS SENT TO BED WITHOUT EATING ANYTHING THAT VERY NIGHT IN MAXS ROOM A FOREST GREW AND GREW AND GREW UNTIL HIS CEILING HUNG WITH VINES';
const wildReport = solver.solve(wild.rows, wild.cols, wild.columnLetters, wild.blocks, { timeLimitMs: 10_000, maxNodes: 1_000_000, maxResults: 30 });
console.log(JSON.stringify({ kind: 'wild-things', rank: wildReport.results.findIndex(result => result.text === wildAnswer) + 1 || null, topText: wildReport.results[0]?.text, resolvedUnknowns: wildReport.results[0]?.resolvedUnknowns, ...wildReport.stats, status: wildReport.status }));
