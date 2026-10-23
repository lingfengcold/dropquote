import test from 'node:test';
import assert from 'node:assert/strict';
import { DropQuoteSolver, type SolverOptions, type SolverResult } from '../src/lib/solver.ts';

function puzzle(text: string, cols: number) {
  const rows = Math.ceil(text.length / cols);
  const padded = text.padEnd(rows * cols, ' ');
  const grid = Array.from({ length: rows }, (_, row) => [...padded.slice(row * cols, (row + 1) * cols)]);
  const blocks = grid.map(row => row.map(char => char === ' '));
  const letters = Array.from({ length: cols }, (_, col) => grid.map(row => row[col]).filter(char => char !== ' ').sort().reverse());
  return { rows, cols, grid, blocks, letters };
}

function solve(text: string, cols: number, dictionary: string[], options: SolverOptions = {}, frequencies: string[] = []) {
  const input = puzzle(text, cols);
  const solver = new DropQuoteSolver(dictionary, frequencies);
  return { input, solver, report: solver.solve(input.rows, input.cols, input.letters, input.blocks, options) };
}

function assertColumns(result: SolverResult, input: ReturnType<typeof puzzle>) {
  for (let col = 0; col < input.cols; col++) {
    assert.deepEqual(result.grid.map(row => row[col]).filter(Boolean).sort(), [...input.letters[col]].sort());
  }
}

test('finds a complete quotation while preserving spaces, columns and duplicate words', () => {
  const text = 'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG';
  const { input, report } = solve(text, 13, text.split(' '));
  assert.equal(report.status, 'complete');
  assert.equal(report.results[0].text, text);
  assertColumns(report.results[0], input);
  assert.deepEqual(report.results[0].validWords, text.split(' '));
  assert.equal(report.results[0].resolvedUnknowns.length, 0);
});

test('words continue across row boundaries and may consume a column more than once', () => {
  const { input, report } = solve('HELLO WORLD', 3, ['HELLO', 'WORLD']);
  assert.equal(report.results[0].text, 'HELLO WORLD');
  assert.deepEqual(report.results[0].grid, input.grid.map(row => row.map(char => char === ' ' ? '' : char)));
});

test('repeated letters use their actual multiplicities, with no duplicate permutations', () => {
  const { input, report } = solve('ABBA', 2, ['AAAA', 'ABBA', 'BAAB', 'BBBB']);
  assert.deepEqual(report.results.map(result => result.text), ['ABBA', 'BAAB']);
  for (const result of report.results) assertColumns(result, input);
});

test('strictly rejects surplus, missing and malformed column letters', () => {
  const solver = new DropQuoteSolver(['CAT']);
  assert.throws(() => solver.solve(1, 3, [['C', 'C'], ['A'], ['T']], [[false, false, false]]), /Column 1 has 2 letters/);
  assert.throws(() => solver.solve(1, 3, [['C'], [], ['T']], [[false, false, false]]), /Add \?/);
  assert.throws(() => solver.solve(1, 3, [['CA'], ['A'], ['T']], [[false, false, false]]), /single A/);
  assert.throws(() => solver.solve(1, 3, [['C'], ['A'], ['T']], [[false, false]]), /dimensions/);
});

test('known letters constrain candidates and conflicting locks have a clear error', () => {
  const input = puzzle('ABBA', 2);
  const solver = new DropQuoteSolver(['ABBA', 'BAAB']);
  const report = solver.solve(input.rows, input.cols, input.letters, input.blocks, { fixedLetters: [['B', null], [null, null]] });
  assert.deepEqual(report.results.map(result => result.text), ['BAAB']);
  assert.throws(() => solver.solve(input.rows, input.cols, input.letters, input.blocks, { fixedLetters: [['C', null], [null, null]] }), /Fixed letters exceed/);
});

test('time and node budgets return explicit status and monotonic progress', () => {
  const { input, solver } = solve('ABBA', 2, ['ABBA', 'BAAB']);
  const events: number[] = [];
  const timed = solver.solve(input.rows, input.cols, input.letters, input.blocks, { timeLimitMs: 0, onProgress: event => events.push(event.elapsedMs) });
  assert.equal(timed.status, 'time-limit');
  assert.equal(timed.results.length, 0);
  assert(events.length >= 2);
  assert(events.every((elapsed, index) => index === 0 || elapsed >= events[index - 1]));
  const bounded = solver.solve(input.rows, input.cols, input.letters, input.blocks, { maxNodes: 1 });
  assert.equal(bounded.status, 'node-limit');
  assert.equal(bounded.stats.nodesVisited, 1);
  assert.equal(bounded.results.length, 1);
});

test('common words beat rare abbreviations without excluding rare valid answers', () => {
  const { report } = solve('TO BE', 3, ['TO', 'BE', 'BO', 'TE'], {}, ['TO', 'BE']);
  assert.equal(report.results[0].text, 'TO BE');
  assert(report.results.some(result => result.text === 'BO TE'));
  assert(report.results[0].score > report.results.find(result => result.text === 'BO TE')!.score);
  assert.deepEqual(report.results.find(result => result.text === 'BO TE')!.rareWords, ['BO', 'TE']);
});

test('ranked frequency and adjacent word order affect scoring', () => {
  const { report } = solve('TO BE', 3, ['TO', 'BE', 'BO', 'TE'], {}, ['TO', 'BE', 'BO', 'TE']);
  assert.equal(report.results[0].text, 'TO BE');
  assert(report.results[0].score > report.results.find(result => result.text === 'BE TO')!.score);
});

test('topK limits stored results, not the first 200 discovered solutions', () => {
  const dictionary: string[] = [];
  // The best word is lexically after the first 200 valid candidates.
  for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) dictionary.push(`ZA${String.fromCharCode(a, b)}`);
  const solver = new DropQuoteSolver(dictionary, ['ZAZZ', ...dictionary.filter(word => word !== 'ZAZZ')]);
  const report = solver.solve(1, 4, [['?'], ['?'], ['?'], ['?']], [[false, false, false, false]], { maxResults: 3, maxNodes: 1_000 });
  assert.equal(report.status, 'complete');
  assert.equal(report.results.length, 3);
  assert.equal(report.stats.solutionsFound, 676);
  assert.equal(report.results[0].text, 'ZAZZ');
  assert(report.results.every(result => result.score >= report.results[2].score));
  assert.equal(report.stats.nodesVisited, 676);
});

test('custom vocabulary admits missing proper names and is local to one solve', () => {
  const input = puzzle('ALICE', 3);
  const solver = new DropQuoteSolver([]);
  const custom = solver.solve(input.rows, input.cols, input.letters, input.blocks, { customWords: ['Alice'] });
  assert.equal(custom.results[0].text, 'ALICE');
  assert.equal(solver.solve(input.rows, input.cols, input.letters, input.blocks).results.length, 0);
});

test('unknown letters are resolved only within their own column', () => {
  const solver = new DropQuoteSolver(['CAT', 'BAT', 'CAR']);
  const report = solver.solve(1, 3, [['?'], ['A'], ['T']], [[false, false, false]]);
  assert.deepEqual(report.results.map(result => result.text).sort(), ['BAT', 'CAT']);
  for (const result of report.results) assert.deepEqual(result.resolvedUnknowns, [{ col: 0, letters: [result.text[0]] }]);
  assert(!report.results.some(result => result.text === 'CAR'));
});

test('real letters are used before wildcards, including repeated columns and locks', () => {
  const solver = new DropQuoteSolver(['ABBA', 'BBBB', 'AAAA']);
  const report = solver.solve(2, 2, [['A', '?'], ['A', 'B']], [[false, false], [false, false]], { fixedLetters: [['A', null], ['B', null]] });
  assert.equal(report.results[0].text, 'ABBA');
  assert.deepEqual(report.results[0].resolvedUnknowns, [{ col: 0, letters: ['B'] }]);
  const repeated = new DropQuoteSolver(['AAAA']).solve(2, 2, [['A', '?'], ['A', '?']], [[false, false], [false, false]]);
  assert.deepEqual(repeated.results[0].resolvedUnknowns, [{ col: 0, letters: ['A'] }, { col: 1, letters: ['A'] }]);
});

test('entirely unknown grids remain bounded and preserve partial best results', () => {
  const words = ['CAT', 'BAT', 'DOG', 'THE', 'AND', 'FOX', 'FLY', 'SKY'];
  const solver = new DropQuoteSolver(words, ['THE', 'AND', ...words]);
  const report = solver.solve(3, 4, [['?', '?', '?'], ['?', '?', '?'], ['?', '?', '?'], []], Array.from({ length: 3 }, () => [false, false, false, true]), { maxNodes: 25, maxResults: 5 });
  assert.equal(report.status, 'node-limit');
  assert.equal(report.stats.nodesVisited, 25);
  assert(report.results.length > 0 && report.results.length <= 5);
  for (const result of report.results) assert.equal(result.resolvedUnknowns.reduce((total, item) => total + item.letters.length, 0), 9);
});

test('constraint propagation agrees with exhaustive tiny-column assignments, including wildcards', () => {
  const dictionary: string[] = [];
  for (let length = 1; length <= 9; length++) {
    for (let mask = 0; mask < 2 ** length; mask++) dictionary.push(Array.from({ length }, (_, bit) => (mask >> bit) & 1 ? 'B' : 'A').join(''));
  }
  const solver = new DropQuoteSolver(dictionary);
  let seed = 0x1138;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let trial = 0; trial < 24; trial++) {
    const blocks = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => random() < 0.25));
    const slotLengths = Array.from({ length: 3 }, () => Array<number>(3).fill(0));
    let cells: [number, number][] = [];
    const endSlot = () => { for (const [row, col] of cells) slotLengths[row][col] = cells.length; cells = []; };
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
      if (blocks[row][col]) endSlot(); else cells.push([row, col]);
    }
    endSlot();
    const letters = Array.from({ length: 3 }, (_, col) => blocks.filter(row => !row[col]).map(() => random() < 0.3 ? '?' : random() < 0.5 ? 'A' : 'B'));
    const fixed = blocks.map(row => row.map(block => block || random() >= 0.15 ? null : random() < 0.5 ? 'A' : 'B'));
    const possibilities: number[] = [];
    let conflictingLocks = false;
    for (let col = 0; col < 3; col++) {
      const openRows = blocks.map((row, index) => row[col] ? -1 : index).filter(row => row !== -1);
      const actualA = letters[col].filter(char => char === 'A').length;
      const actualB = letters[col].filter(char => char === 'B').length;
      const unknowns = letters[col].filter(char => char === '?').length;
      const lockedA = openRows.filter(row => fixed[row][col] === 'A').length;
      const lockedB = openRows.filter(row => fixed[row][col] === 'B').length;
      if (Math.max(0, lockedA - actualA) + Math.max(0, lockedB - actualB) > unknowns) conflictingLocks = true;
      let valid = 0;
      for (let mask = 0; mask < 3 ** openRows.length; mask++) {
        const chars = openRows.map((_, index) => ['A', 'B', 'I'][Math.floor(mask / 3 ** index) % 3]);
        // I is always a valid standalone word; every longer test word uses A/B.
        if (openRows.some((row, index) => chars[index] === 'I' && slotLengths[row][col] !== 1)) continue;
        if (chars.filter(char => char === 'A').length < actualA || chars.filter(char => char === 'B').length < actualB) continue;
        if (openRows.some((row, index) => fixed[row][col] && fixed[row][col] !== chars[index])) continue;
        valid++;
      }
      possibilities.push(valid);
    }
    if (conflictingLocks) {
      assert.throws(() => solver.solve(3, 3, letters, blocks, { fixedLetters: fixed }), /Fixed letters exceed/);
      continue;
    }
    const expected = possibilities.reduce((product, count) => product * count, 1);
    const report = solver.solve(3, 3, letters, blocks, { fixedLetters: fixed, maxResults: 1_000 });
    assert.equal(report.status, 'complete');
    assert.equal(report.results.length, expected, `trial ${trial}: ${JSON.stringify({ blocks, letters, fixed })}`);
    assert.equal(new Set(report.results.map(result => result.text)).size, expected);
  }
});

test('a 5000-cell grid with 2500 forced single-letter slots does not recurse or allocate per-slot column arrays', () => {
  const rows = 50;
  const cols = 100;
  const blocks = Array.from({ length: rows }, () => Array.from({ length: cols }, (_, col) => col % 2 === 1));
  const letters = Array.from({ length: cols }, (_, col) => col % 2 === 1 ? [] : Array<string>(rows).fill('A'));
  const fixedLetters = blocks.map(row => row.map(block => block ? null : 'A'));
  const solver = new DropQuoteSolver(['A']);
  const report = solver.solve(rows, cols, letters, blocks, { fixedLetters, timeLimitMs: 2_000, maxNodes: 10_000, maxResults: 1 });
  assert.equal(report.status, 'complete');
  assert.equal(report.results.length, 1);
  assert.equal(report.results[0].validWords.length, 2_500);
  assert.equal(report.stats.nodesVisited, 2_500);
  const bounded = solver.solve(rows, cols, letters, blocks, { fixedLetters, maxNodes: 10 });
  assert.equal(bounded.status, 'node-limit');
  assert.equal(bounded.stats.nodesVisited, 10);
});

test('deeply ambiguous 5000-cell grids respect budgets without overflowing the call stack', () => {
  const cols = 5_000;
  const blocks = [Array.from({ length: cols }, (_, col) => col % 2 === 1)];
  const letters = Array.from({ length: cols }, (_, col) => col % 2 === 1 ? [] : ['?']);
  const solver = new DropQuoteSolver(['A', 'I']);
  const report = solver.solve(1, cols, letters, blocks, { maxNodes: 3_000, timeLimitMs: 5_000, maxResults: 1 });
  assert(report.status === 'node-limit' || report.status === 'time-limit');
  assert(report.stats.nodesVisited <= 3_000);
});

test('a custom word spanning all 5000 cells does not overflow prefix traversal', () => {
  const rows = 50;
  const cols = 100;
  const blocks = Array.from({ length: rows }, () => Array<boolean>(cols).fill(false));
  const letters = Array.from({ length: cols }, () => Array<string>(rows).fill('A'));
  const word = 'A'.repeat(rows * cols);
  const report = new DropQuoteSolver([]).solve(rows, cols, letters, blocks, { customWords: [word], timeLimitMs: 1_000 });
  assert.equal(report.status, 'complete');
  assert.equal(report.results[0].text, word);
});

test('optional joined-word mode infers two dictionary words without changing the default vocabulary', () => {
  const input = puzzle('NOSECLIP', 3);
  const solver = new DropQuoteSolver(['NOSE', 'CLIP'], ['NOSE', 'CLIP']);
  assert.equal(solver.solve(input.rows, input.cols, input.letters, input.blocks).results.length, 0);
  const joined = solver.solve(input.rows, input.cols, input.letters, input.blocks, { allowJoinedWords: true });
  assert.equal(joined.status, 'complete');
  assert.equal(joined.results[0].text, 'NOSECLIP');
  assert.deepEqual(joined.results[0].joinedWords, [{ word: 'NOSECLIP', parts: ['NOSE', 'CLIP'] }]);
  assert.deepEqual(joined.results[0].rareWords, ['NOSECLIP']);
  assert(joined.results[0].score < 1);
  assertColumns(joined.results[0], input);
});

test('joined parts require at least three letters and ordinary dictionary words are not relabeled', () => {
  const input = puzzle('NOSECLIP', 3);
  const tooShort = new DropQuoteSolver(['NO', 'SECLIP']).solve(input.rows, input.cols, input.letters, input.blocks, { allowJoinedWords: true });
  assert.equal(tooShort.results.length, 0);
  const normal = new DropQuoteSolver(['NOSECLIP', 'NOSE', 'CLIP']).solve(input.rows, input.cols, input.letters, input.blocks, { allowJoinedWords: true });
  assert.equal(normal.results.length, 1);
  assert.deepEqual(normal.results[0].joinedWords, []);
});

test('joined candidates respect local wildcards, repeated-column counts and distinct locks in cached slots', () => {
  const input = puzzle('NOSECLIP ROSECLIP', 9);
  input.letters[4][0] = '?';
  const fixed = Array.from({ length: input.rows }, () => Array<string | null>(input.cols).fill(null));
  fixed[0][0] = 'N';
  fixed[1][0] = 'R';
  const report = new DropQuoteSolver(['NOSE', 'ROSE', 'CLIP'], ['NOSE', 'ROSE', 'CLIP']).solve(input.rows, input.cols, input.letters, input.blocks, { allowJoinedWords: true, fixedLetters: fixed });
  assert.equal(report.results.length, 1);
  assert.equal(report.results[0].text, 'NOSECLIP ROSECLIP');
  assert.deepEqual(report.results[0].resolvedUnknowns, [{ col: 4, letters: ['C'] }]);
});

test('joined-word candidate generation consumes the node budget, even with entirely unknown columns', () => {
  const words = ['NOSE', 'ROSE', 'CLIP', 'CAST', 'CASE', 'TEST'];
  const solver = new DropQuoteSolver(words, words);
  const report = solver.solve(1, 8, Array.from({ length: 8 }, () => ['?']), [Array<boolean>(8).fill(false)], { allowJoinedWords: true, maxNodes: 3 });
  assert.equal(report.status, 'node-limit');
  assert.equal(report.stats.phase, 'indexing');
  assert.equal(report.stats.nodesVisited, 3);
  assert.equal(report.results.length, 0);
});

test('rare dictionary entries are not automatically joined, while explicit custom components remain available', () => {
  const input = puzzle('NOSECLIP', 3);
  const solver = new DropQuoteSolver(['NOSE', 'CLIP'], ['CLIP']);
  const ordinary = solver.solve(input.rows, input.cols, input.letters, input.blocks, { allowJoinedWords: true });
  assert.equal(ordinary.results.length, 0);
  const explicit = solver.solve(input.rows, input.cols, input.letters, input.blocks, { allowJoinedWords: true, customWords: ['NOSE'] });
  assert.equal(explicit.results[0].text, 'NOSECLIP');
  assert.deepEqual(explicit.results[0].joinedWords[0].parts, ['NOSE', 'CLIP']);
});

test('joined-word passes count each solution once and can require multiple inferred joins', () => {
  const input = puzzle('NOSECLIP ROSECLIP', 9);
  const parts = ['NOSE', 'ROSE', 'CLIP'];
  const multiple = new DropQuoteSolver(parts, parts).solve(input.rows, input.cols, input.letters, input.blocks, { allowJoinedWords: true });
  assert.equal(multiple.status, 'complete');
  assert.equal(multiple.results.length, 2);
  assert(multiple.results.every(result => result.joinedWords.length === 2));
  const mixed = new DropQuoteSolver([...parts, 'NOSECLIP'], parts).solve(input.rows, input.cols, input.letters, input.blocks, { allowJoinedWords: true });
  assert.equal(mixed.status, 'complete');
  assert.equal(mixed.results.length, 2);
  assert(mixed.results.every(result => result.joinedWords.length === 1));
  assert.equal(new Set(mixed.results.map(result => result.text)).size, 2);
});

test('joined traversal of a 5000-cell custom-component slot stays within the supported grid size', () => {
  const rows = 50;
  const cols = 100;
  const blocks = Array.from({ length: rows }, () => Array<boolean>(cols).fill(false));
  const letters = Array.from({ length: cols }, () => [...Array<string>(25).fill('A'), ...Array<string>(25).fill('B')]);
  const parts = ['A'.repeat(2_500), 'B'.repeat(2_500)];
  const report = new DropQuoteSolver([]).solve(rows, cols, letters, blocks, { allowJoinedWords: true, customWords: parts, timeLimitMs: 1_000 });
  assert.equal(report.status, 'complete');
  assert.equal(report.results.length, 2);
  assert(report.results.some(result => result.text === parts.join('')));
});
