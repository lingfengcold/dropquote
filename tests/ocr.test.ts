import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evenColumnBoundaries, mapSymbolsToColumns, preprocessOcrPixels, symbolsFromBlocks,
  type OcrSymbol,
} from '../src/lib/ocr';

const symbol = (text: string, x: number, y: number, confidence = 96): OcrSymbol => ({
  text, confidence, bbox: { x0: x - 4, y0: y, x1: x + 4, y1: y + 10 },
});

test('unequal heights and interior blanks keep letters in their physical columns', () => {
  // A . C     The old row-by-row transpose incorrectly moved C into column two.
  // D E F
  // . G .
  const detected = [symbol('A', 15, 2), symbol('C', 75, 2), symbol('D', 15, 20), symbol('E', 45, 20), symbol('F', 75, 20), symbol('G', 45, 38)];
  assert.deepEqual(mapSymbolsToColumns(detected, [0, 30, 60, 90], 60).columns, [['A', 'D'], ['E', 'G'], ['C', 'F']]);
});

test('out-of-order symbol output is sorted top-to-bottom within each column', () => {
  const result = mapSymbolsToColumns([symbol('Z', 15, 30), symbol('A', 15, 2), symbol('B', 45, 10)], [0, 30, 60], 50);
  assert.deepEqual(result.columns, [['A', 'Z'], ['B']]);
});

test('custom uneven column widths use actual guide positions', () => {
  const result = mapSymbolsToColumns([symbol('A', 10, 2), symbol('B', 60, 2), symbol('C', 95, 2)], [0, 20, 85, 100], 20);
  assert.deepEqual(result.columns, [['A'], ['B'], ['C']]);
});

test('empty columns stay empty and produce a review warning', () => {
  const result = mapSymbolsToColumns([symbol('A', 15, 2), symbol('C', 75, 2)], [0, 30, 60, 90], 30);
  assert.deepEqual(result.columns, [['A'], [], ['C']]);
  assert.ok(result.issues.some(issue => issue.column === 1 && issue.message.includes('No letters')));
});

test('low confidence and O/0 I/1 ambiguity are visible without losing letters', () => {
  const result = mapSymbolsToColumns([symbol('0', 15, 1, 40), symbol('1', 15, 20, 90)], [0, 30], 40);
  assert.deepEqual(result.columns, [['O', 'I']]);
  assert.ok(result.symbols[0].uncertain);
  assert.ok(result.issues.some(issue => issue.message.includes('Low confidence')));
  assert.ok(result.issues.some(issue => issue.message.includes('O / 0')));
});

test('unrecognized symbols preserve a wildcard position', () => {
  const result = mapSymbolsToColumns([symbol('$', 15, 1), symbol('T', 15, 20)], [0, 30], 40);
  assert.deepEqual(result.columns, [['?', 'T']]);
  assert.ok(result.issues.some(issue => issue.message.includes('kept as ?')));
});

test('merged boxes are split proportionally and explicitly flagged', () => {
  const detected = { text: 'AB', confidence: 99, bbox: { x0: 5, x1: 55, y0: 1, y1: 12 } };
  const result = mapSymbolsToColumns([detected], [0, 30, 60], 30);
  assert.deepEqual(result.columns, [['A'], ['B']]);
  assert.ok(result.symbols.every(letter => letter.uncertain));
  assert.equal(result.issues.filter(issue => issue.message.includes('merged OCR box')).length, 2);
});

test('out-of-crop and invalid boxes are ignored while overlapping letters are flagged', () => {
  const result = mapSymbolsToColumns([
    symbol('X', -5, 1), symbol('Y', 65, 1), symbol('Z', 15, 60), symbol('A', 29, 1),
    { ...symbol('B', 15, 2), bbox: { x0: NaN, x1: 5, y0: 0, y1: 10 } },
  ], [0, 30, 60], 40);
  assert.deepEqual(result.columns, [['A'], []]);
  assert.ok(result.issues.some(issue => issue.column === null && issue.message.includes('outside')));
  assert.ok(result.issues.some(issue => issue.message.includes('invalid OCR box')));
  assert.ok(result.issues.some(issue => issue.column === 0 && issue.message.includes('overlaps')));
});

test('Tesseract 7 block output is flattened instead of reading nonexistent page.symbols', () => {
  const expected = [symbol('A', 15, 1), symbol('B', 45, 1)];
  assert.deepEqual(symbolsFromBlocks([{ paragraphs: [{ lines: [{ words: [{ symbols: expected }] }] }] }]), expected);
  assert.deepEqual(symbolsFromBlocks(null), []);
});

test('invalid column geometry is rejected', () => {
  assert.throws(() => evenColumnBoundaries(100, 0));
  assert.throws(() => mapSymbolsToColumns([], [0, 30, 20], 20));
  assert.throws(() => mapSymbolsToColumns([], [0, Infinity], 20));
  assert.deepEqual(evenColumnBoundaries(90, 3), [0, 30, 60, 90]);
});

function whitePixels(width: number, height: number): Uint8ClampedArray {
  return new Uint8ClampedArray(width * height * 4).fill(255);
}
function ink(pixels: Uint8ClampedArray, width: number, x: number, y: number, value = 0) {
  const offset = (y * width + x) * 4;
  pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = value;
}
const grayAt = (pixels: Uint8ClampedArray, width: number, x: number, y: number) => pixels[(y * width + x) * 4];

test('optional grid removal preserves a tall I inside the column', () => {
  const width = 200; const height = 120; const pixels = whitePixels(width, height);
  for (let y = 0; y < height; y++) { ink(pixels, width, 0, y); ink(pixels, width, 100, y); ink(pixels, width, 50, y); }
  for (let x = 0; x < width; x++) ink(pixels, width, x, 90);
  const result = preprocessOcrPixels(pixels, width, height, { removeGridLines: true, boundaries: [0, 100, 200] });
  assert.equal(grayAt(result, width, 100, 20), 255, 'vertical grid boundary removed');
  assert.equal(grayAt(result, width, 20, 90), 255, 'long horizontal grid line removed');
  assert.equal(grayAt(result, width, 50, 20), 0, 'I stroke away from boundaries retained');
});

test('grid removal is disabled by default', () => {
  const width = 200; const pixels = whitePixels(width, 120);
  for (let x = 0; x < width; x++) ink(pixels, width, x, 50);
  assert.equal(grayAt(preprocessOcrPixels(pixels, width, 120), width, 20, 50), 0);
});

test('transparent background composites to white and light text on dark backgrounds inverts', () => {
  const transparent = new Uint8ClampedArray(20 * 20 * 4);
  transparent[(10 * 20 + 10) * 4 + 3] = 255;
  const composited = preprocessOcrPixels(transparent, 20, 20);
  assert.equal(grayAt(composited, 20, 1, 1), 255);
  assert.equal(grayAt(composited, 20, 10, 10), 0);
  const dark = new Uint8ClampedArray(20 * 20 * 4);
  for (let offset = 3; offset < dark.length; offset += 4) dark[offset] = 255;
  ink(dark, 20, 10, 10, 255);
  const inverted = preprocessOcrPixels(dark, 20, 20);
  assert.equal(grayAt(inverted, 20, 1, 1), 255);
  assert.equal(grayAt(inverted, 20, 10, 10), 0);
});

test('malformed pixel buffers are rejected', () => {
  assert.throws(() => preprocessOcrPixels(new Uint8ClampedArray(4), 2, 2));
});

test('white grid borders do not prevent inversion of a dark letter bank', () => {
  const width = 20; const height = 20; const pixels = whitePixels(width, height);
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) ink(pixels, width, x, y);
  ink(pixels, width, 10, 10, 255);
  const result = preprocessOcrPixels(pixels, width, height);
  assert.equal(grayAt(result, width, 5, 5), 255, 'dominant black background becomes white');
  assert.equal(grayAt(result, width, 10, 10), 0, 'white glyph becomes dark');
});

test('upscaled thick frames are removed around guides without erasing interior I strokes', () => {
  const width = 200; const height = 120; const pixels = whitePixels(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x <= 4; x++) ink(pixels, width, x, y);
    for (let x = width - 5; x < width; x++) ink(pixels, width, x, y);
    ink(pixels, width, 50, y);
  }
  const result = preprocessOcrPixels(pixels, width, height, { removeGridLines: true, boundaries: [0, 100, 200] });
  assert.equal(grayAt(result, width, 3, 20), 255);
  assert.equal(grayAt(result, width, width - 3, 20), 255);
  assert.equal(grayAt(result, width, 50, 20), 0);
});

test('overlapping uppercase/lowercase detections of one glyph are merged without losing repeated rows', () => {
  const result = mapSymbolsToColumns([
    { text: 'S', confidence: 95, bbox: { x0: 10, x1: 18, y0: 1, y1: 20 } },
    { text: 's', confidence: 93, bbox: { x0: 10, x1: 26, y0: 1, y1: 20 } },
    { text: 's', confidence: 98, bbox: { x0: 10, x1: 26, y0: 30, y1: 49 } },
  ], [0, 40], 60);
  assert.deepEqual(result.columns, [['S', 'S']]);
  assert.equal(result.symbols[0].bbox.x1, 26, 'full glyph box retained');
  assert.ok(result.issues.some(issue => issue.message.includes('duplicate OCR detections')));
});
