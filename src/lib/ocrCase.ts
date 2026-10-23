import type { OcrSymbol } from './ocr';
import type { OcrLetterCase } from './ocrProtocol';

/** Vote only with glyphs whose upper/lowercase shapes differ substantially. */
export function inferLetterCase(symbols: OcrSymbol[]): 'upper' | 'lower' | null {
  let upper = 0, lower = 0;
  for (const symbol of symbols) {
    if (!Number.isFinite(symbol.confidence) || symbol.confidence < 60) continue;
    for (const char of symbol.text) {
      if (/[ABDEFGHKMNPQRTUY]/.test(char)) upper++;
      else if (/[abdefghkmnpqrtuy]/.test(char)) lower++;
    }
  }
  const count = upper + lower;
  if (count < 3) return null;
  if (upper / count >= 0.85) return 'upper';
  if (lower / count >= 0.85) return 'lower';
  return null;
}

/** A sans-serif I has a plain stem; even a narrow L expands into a bottom foot. */
function hasPlainStem(symbol: OcrSymbol, pixels: Uint8ClampedArray, width: number, height: number): boolean {
  const box = symbol.bbox;
  if (![box.x0, box.y0, box.x1, box.y1].every(Number.isFinite)) return false;
  // A clipped L can lose its foot and look exactly like I. Keep edge glyphs for review.
  if (box.x0 <= 0 || box.y0 <= 0 || box.x1 >= width || box.y1 >= height) return false;
  const left = Math.max(0, Math.floor(box.x0)), right = Math.min(width, Math.ceil(box.x1));
  const top = Math.max(0, Math.floor(box.y0)), bottom = Math.min(height, Math.ceil(box.y1));
  if (right <= left || bottom <= top || (right - left) / (bottom - top) > 0.5) return false;
  const rows: number[] = [];
  let minX = right, maxX = left;
  for (let y = top; y < bottom; y++) {
    let start = right, end = left - 1;
    for (let x = left; x < right; x++) {
      if (pixels[(y * width + x) * 4] < 128) { start = Math.min(start, x); end = Math.max(end, x); }
    }
    if (end >= start) { rows.push(end - start + 1); minX = Math.min(minX, start); maxX = Math.max(maxX, end); }
  }
  if (rows.length < 6 || rows.length < (bottom - top) * 0.85 || (maxX - minX + 1) / rows.length > 0.45) return false;
  const sorted = [...rows].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const bottomRows = rows.slice(-Math.max(3, Math.ceil(rows.length * 0.15))).sort((a, b) => a - b);
  if (bottomRows[Math.floor(bottomRows.length / 2)] > median) return false;
  // Reject a foot, serif or other expansion instead of guessing a universal font shape.
  if (rows.some(span => span > median * 1.6 && span >= median + 2)) return false;
  return rows.filter(span => span >= median * 0.7 && span <= median * 1.5).length >= rows.length * 0.85;
}

/** Keep mixed-case recognition: uppercase-only Tesseract drops plain I strokes entirely. */
export function resolveLetterCase(
  symbols: OcrSymbol[], pixels: Uint8ClampedArray, width: number, height: number, setting: OcrLetterCase = 'auto',
): OcrSymbol[] {
  const letterCase = setting === 'auto' ? inferLetterCase(symbols) : setting;
  return symbols.map(symbol => {
    if (!/^[lLI]$/.test(symbol.text)) return symbol;
    if (letterCase === 'upper' && hasPlainStem(symbol, pixels, width, height)) {
      if (symbol.text === 'I') return symbol;
      return { ...symbol, text: 'I', review: 'A straight stroke was read as I in an uppercase bank. Verify I / L against the image.' };
    }
    if (symbol.text === 'l' && letterCase !== 'lower') {
      return { ...symbol, review: 'I / l / L is ambiguous here. Choose the letter case or verify this letter.' };
    }
    return symbol;
  });
}
