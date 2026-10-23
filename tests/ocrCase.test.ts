import assert from 'node:assert/strict';
import test from 'node:test';
import { inferLetterCase, resolveLetterCase } from '../src/lib/ocrCase';
import { mapSymbolsToColumns, type OcrSymbol } from '../src/lib/ocr';

const symbol = (text: string, confidence = 95): OcrSymbol => ({ text, confidence, bbox: { x0: 2, y0: 2, x1: 7, y1: 22 } });
const anchors = (text: string) => [...text].map(char => symbol(char));
function stem(foot = false) {
  const pixels = new Uint8ClampedArray(12 * 24 * 4).fill(255);
  for (let y = 2; y < 22; y++) {
    for (let x = 2; x < (foot && y >= 19 ? 7 : 4); x++) {
      const offset = (y * 12 + x) * 4;
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0;
    }
  }
  return pixels;
}

test('case consensus excludes I/l and similar shapes, weak and mixed evidence', () => {
  assert.equal(inferLetterCase(anchors('AEGlllwww')), 'upper');
  assert.equal(inferLetterCase(anchors('aeglllIII')), 'lower');
  assert.equal(inferLetterCase(anchors('ILIOOSCVWXZ')), null);
  assert.equal(inferLetterCase(anchors('AB')), null);
  assert.equal(inferLetterCase(anchors('ABCdef')), null);
  assert.equal(inferLetterCase([symbol('A', 20), symbol('E', 20), symbol('G', 20)]), null);
});

test('uppercase context recovers a straight I without changing a true L foot', () => {
  const input = [...anchors('AEG'), symbol('l')];
  const corrected = resolveLetterCase(input, stem(), 12, 24);
  assert.equal(corrected[3].text, 'I');
  assert.match(corrected[3].review!, /straight stroke/);
  assert.equal(input[3].text, 'l', 'original OCR output is not mutated');
  assert.equal(resolveLetterCase(input, stem(true), 12, 24)[3].text, 'l');
  assert.equal(resolveLetterCase([symbol('L')], stem(true), 12, 24, 'upper')[0].text, 'L');
  const thinFoot = stem();
  for (const y of [20, 21]) {
    const offset = (y * 12 + 4) * 4;
    thinFoot[offset] = thinFoot[offset + 1] = thinFoot[offset + 2] = 0;
  }
  assert.equal(resolveLetterCase([symbol('L')], thinFoot, 12, 24, 'upper')[0].text, 'L', 'a one-pixel foot is still a real L');
});

test('identical lowercase l strokes stay L with lowercase evidence or an explicit hint', () => {
  assert.equal(resolveLetterCase([...anchors('aeg'), symbol('l')], stem(), 12, 24)[3].text, 'l');
  assert.equal(resolveLetterCase([...anchors('AEG'), symbol('l')], stem(), 12, 24, 'lower')[3].text, 'l');
  const sparse = resolveLetterCase([symbol('l')], stem(), 12, 24);
  assert.equal(sparse[0].text, 'l');
  assert.match(sparse[0].review!, /ambiguous/);
  assert.equal(resolveLetterCase([symbol('l')], stem(), 12, 24, 'upper')[0].text, 'I');
});

test('corrected strokes remain marked for review and literal ? stays a normal wildcard', () => {
  const resolved = resolveLetterCase([symbol('l')], stem(), 12, 24, 'upper');
  const result = mapSymbolsToColumns([...resolved, { ...symbol('?'), bbox: { x0: 2, y0: 25, x1: 7, y1: 45 } }], [0, 12], 50);
  assert.deepEqual(result.columns, [['I', '?']]);
  assert.equal(result.symbols[0].uncertain, true);
  assert.ok(result.issues.some(issue => /straight stroke/.test(issue.message)));
  assert.ok(!result.issues.some(issue => /Low confidence|Unrecognized character/.test(issue.message)));
});

test('empty and cropped glyph pixels are not rewritten as straight stems', () => {
  const white = new Uint8ClampedArray(12 * 24 * 4).fill(255);
  assert.equal(resolveLetterCase([symbol('L')], white, 12, 24, 'upper')[0].text, 'L');
  const invalid = { ...symbol('l'), bbox: { x0: NaN, x1: 4, y0: 2, y1: 22 } };
  assert.equal(resolveLetterCase([invalid], stem(), 12, 24, 'upper')[0].text, 'l');
  const cropped = { ...symbol('L'), bbox: { x0: -4, x1: 4, y0: 2, y1: 22 } };
  assert.equal(resolveLetterCase([cropped], stem(), 12, 24, 'upper')[0].text, 'L');
  assert.equal(resolveLetterCase([{ ...symbol('L'), bbox: { x0: 0, x1: 4, y0: 2, y1: 22 } }], stem(), 12, 24, 'upper')[0].text, 'L');
});
