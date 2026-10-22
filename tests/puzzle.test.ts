import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanLetters, createPuzzle, fillMissingLetters, getColumnCounts, parsePuzzle, puzzleFromText } from '../src/lib/puzzle';

test('unknown placeholders retain their column and exact multiplicity', () => {
  assert.deepEqual(cleanLetters('a ? ?-b'), ['A', '?', '?', 'B']);
  const p = createPuzzle(3, 2); p.columnLetters = [['A'], ['E', '?']]; p.blocks[2][1] = true;
  const filled = fillMissingLetters(p);
  assert.deepEqual(filled.columnLetters, [['A', '?', '?'], ['E', '?']]);
  assert.deepEqual(p.columnLetters[0], ['A']);
  assert.ok(getColumnCounts(filled).every(col => col.missing === 0));
});
test('padding does not silently discard excess letters', () => {
  const p = createPuzzle(2, 2); p.columnLetters = [['A', 'B', 'C'], []];
  assert.throws(() => fillMissingLetters(p), /too many/);
});
test('saved puzzles round trip, including known and missing letters', () => {
  const p = puzzleFromText('THE ONLY WAY', 5); p.fixedLetters[0][0] = 'T'; p.columnLetters[0][0] = '?';
  assert.deepEqual(parsePuzzle(JSON.parse(JSON.stringify(p))), p);
});
test('malformed imports and excessive grid allocation are rejected', () => {
  assert.throws(() => createPuzzle(100000, 100000), /at most/);
  assert.throws(() => createPuzzle(2.5, 4), /at most/);
  assert.throws(() => parsePuzzle({ ...createPuzzle(2, 2), columnLetters: [['A']] }), /column/);
  const p = createPuzzle(2, 2); p.blocks[0][0] = true; p.fixedLetters[0][0] = 'A';
  assert.throws(() => parsePuzzle(p), /black square/);
});
