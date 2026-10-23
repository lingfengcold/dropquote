/** Geometry and pixel processing shared by the browser importer and regression tests. */
export interface OcrBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OcrSymbol {
  text: string;
  confidence: number;
  bbox: OcrBox;
}

interface OcrBlock {
  paragraphs: Array<{ lines: Array<{ words: Array<{ symbols: OcrSymbol[] }> }> }>;
}

export interface OcrIssue {
  column: number | null;
  message: string;
}

export interface OcrColumnResult {
  columns: string[][];
  issues: OcrIssue[];
  symbols: Array<OcrSymbol & { column: number; uncertain: boolean }>;
}

/** Tesseract 7 only supplies symbol boxes when recognize(..., {}, { blocks: true }) is used. */
export function symbolsFromBlocks(blocks: OcrBlock[] | null | undefined): OcrSymbol[] {
  return (blocks ?? []).flatMap(block => block.paragraphs.flatMap(paragraph =>
    paragraph.lines.flatMap(line => line.words.flatMap(word => word.symbols))));
}

export function evenColumnBoundaries(width: number, numColumns: number): number[] {
  if (!Number.isFinite(width) || width <= 0 || !Number.isInteger(numColumns) || numColumns < 1) {
    throw new Error('The image width and column count must be positive.');
  }
  return Array.from({ length: numColumns + 1 }, (_, index) => width * index / numColumns);
}

export function validateColumnBoundaries(boundaries: number[]): void {
  if (boundaries.length < 2 || boundaries.some((value, index) =>
    !Number.isFinite(value) || (index > 0 && value <= boundaries[index - 1]))) {
    throw new Error('Column guides must be finite, strictly increasing positions.');
  }
}

/** Place each symbol using its actual x coordinate; missing row entries never move later columns. */
export function mapSymbolsToColumns(
  input: OcrSymbol[],
  boundaries: number[],
  imageHeight: number,
  lowConfidence = 75,
): OcrColumnResult {
  validateColumnBoundaries(boundaries);
  const columns = Array.from({ length: boundaries.length - 1 }, () => [] as string[]);
  const issues: OcrIssue[] = [];
  const symbols: OcrColumnResult['symbols'] = [];
  const addIssue = (column: number | null, message: string) => {
    if (!issues.some(issue => issue.column === column && issue.message === message)) issues.push({ column, message });
  };

  for (const source of input) {
    const { bbox } = source;
    if (![bbox.x0, bbox.x1, bbox.y0, bbox.y1].every(Number.isFinite)
      || bbox.x1 <= bbox.x0 || bbox.y1 <= bbox.y0) {
      addIssue(null, 'An invalid OCR box was ignored.');
      continue;
    }
    const text = source.text.toUpperCase().replace(/\s/g, '');
    const characters = Array.from(text);
    if (!characters.length) continue;
    // A merged box is split proportionally, never by its ordinal position in a row.
    // Its estimated positions remain explicitly marked for review.
    characters.forEach((raw, index) => {
      const box = {
        x0: bbox.x0 + (bbox.x1 - bbox.x0) * index / characters.length,
        x1: bbox.x0 + (bbox.x1 - bbox.x0) * (index + 1) / characters.length,
        y0: bbox.y0,
        y1: bbox.y1,
      };
      const x = (box.x0 + box.x1) / 2;
      const y = (box.y0 + box.y1) / 2;
      if (x < boundaries[0] || x >= boundaries[boundaries.length - 1] || y < 0 || y >= imageHeight) {
        addIssue(null, 'A symbol outside the selected letter area was ignored.');
        return;
      }
      const column = boundaries.findIndex((right, boundary) => boundary > 0 && x < right) - 1;
      const guess = raw === '0' ? 'O' : /[1|!]/.test(raw) ? 'I' : raw;
      const normalized = /^[A-Z]$/.test(guess) ? guess : '?';
      if (normalized === '?') addIssue(column, `Unrecognized character “${raw}” was kept as ?; replace it or leave a wildcard.`);
      let uncertain = !Number.isFinite(source.confidence) || source.confidence < lowConfidence;
      if (uncertain) addIssue(column, 'Low confidence: compare these letters with the image.');
      if ((normalized !== raw && normalized !== '?') || /[IO]/.test(normalized)) {
        addIssue(column, 'Check I / 1 / l and O / 0 shapes.');
      }
      if (characters.length > 1) {
        uncertain = true;
        addIssue(column, 'A merged OCR box was split using estimated positions; verify the letters and column.');
      }
      if (box.x0 < boundaries[column] || box.x1 > boundaries[column + 1]) {
        uncertain = true;
        addIssue(column, 'A letter overlaps a column guide; check the crop and guides.');
      }
      if (box.y0 < 0 || box.y1 > imageHeight) {
        uncertain = true;
        addIssue(column, 'A letter touches the crop edge; check for clipped letters.');
      }
      symbols.push({ text: normalized, confidence: source.confidence, bbox: box, column, uncertain });
    });
  }
  symbols.sort((a, b) => a.column - b.column || a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
  const uniqueSymbols: OcrColumnResult['symbols'] = [];
  const area = (box: OcrBox) => (box.x1 - box.x0) * (box.y1 - box.y0);
  for (const symbol of symbols) {
    const duplicate = uniqueSymbols.findIndex(previous => {
      if (previous.column !== symbol.column || previous.text !== symbol.text) return false;
      const overlapWidth = Math.max(0, Math.min(previous.bbox.x1, symbol.bbox.x1) - Math.max(previous.bbox.x0, symbol.bbox.x0));
      const overlapHeight = Math.max(0, Math.min(previous.bbox.y1, symbol.bbox.y1) - Math.max(previous.bbox.y0, symbol.bbox.y0));
      return overlapWidth * overlapHeight >= 0.85 * Math.min(area(previous.bbox), area(symbol.bbox));
    });
    if (duplicate < 0) {
      uniqueSymbols.push(symbol);
    } else {
      // Tesseract sometimes emits both a partial uppercase S and a lowercase s for
      // the very same glyph. Merge only same-letter boxes with substantial containment.
      const previous = uniqueSymbols[duplicate];
      const preferred = area(symbol.bbox) > area(previous.bbox) ? symbol : previous;
      uniqueSymbols[duplicate] = { ...preferred, confidence: Math.max(previous.confidence, symbol.confidence), uncertain: true };
      addIssue(symbol.column, 'Overlapping duplicate OCR detections were merged; verify this letter.');
    }
  }
  uniqueSymbols.forEach(symbol => columns[symbol.column].push(symbol.text));
  columns.forEach((column, index) => {
    if (!column.length) addIssue(index, 'No letters found. Verify whether this column is empty.');
  });
  return { columns, issues, symbols: uniqueSymbols };
}

/** Grayscale/contrast conversion with optional conservative, guide-aware grid removal. */
export function preprocessOcrPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  options: { removeGridLines?: boolean; boundaries?: number[] } = {},
): Uint8ClampedArray {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
    || pixels.length !== width * height * 4) throw new Error('Invalid image pixels.');
  const count = width * height;
  const grayscale = new Uint8Array(count);
  const histogram = new Uint32Array(256);
  let darkBackgroundPixels = 0;
  for (let index = 0; index < count; index++) {
    const offset = index * 4;
    const alpha = pixels[offset + 3] / 255;
    const value = Math.round((0.299 * pixels[offset] + 0.587 * pixels[offset + 1] + 0.114 * pixels[offset + 2]) * alpha + 255 * (1 - alpha));
    grayscale[index] = value;
    if (value < 128) darkBackgroundPixels++;
  }
  // A bright border around a dark letter bank makes the edge average misleading.
  // Text occupies a minority of a properly cropped bank; use the dominant background.
  const invert = darkBackgroundPixels > count / 2;
  for (let index = 0; index < count; index++) {
    if (invert) grayscale[index] = 255 - grayscale[index];
    histogram[grayscale[index]]++;
  }
  let total = 0;
  for (let value = 0; value < 256; value++) total += value * histogram[value];
  let backgroundCount = 0;
  let backgroundSum = 0;
  let bestVariance = -1;
  let threshold = 127;
  for (let value = 0; value < 255; value++) {
    backgroundCount += histogram[value];
    if (!backgroundCount) continue;
    const foregroundCount = count - backgroundCount;
    if (!foregroundCount) break;
    backgroundSum += value * histogram[value];
    const difference = backgroundSum / backgroundCount - (total - backgroundSum) / foregroundCount;
    const variance = backgroundCount * foregroundCount * difference * difference;
    if (variance > bestVariance) {
      bestVariance = variance;
      threshold = value;
    }
  }
  const dark = Uint8Array.from(grayscale, value => value <= threshold ? 1 : 0);
  const remove = new Uint8Array(count);
  if (options.removeGridLines) {
    // Require a line spanning most of the full grid: individual character strokes are preserved.
    if (width >= 160) {
      for (let y = 0; y < height; y++) {
        let darkCount = 0;
        for (let x = 0; x < width; x++) darkCount += dark[y * width + x];
        if (darkCount >= width * 0.88) {
          for (let x = 0; x < width; x++) remove[y * width + x] = 1;
        }
      }
    }
    // Vertical removal is limited to user-visible column boundaries. A tall I inside a column survives.
    if (height >= 100 && options.boundaries) {
      for (let guideIndex = 0; guideIndex < options.boundaries.length; guideIndex++) {
        const guide = options.boundaries[guideIndex];
        const neighborWidth = Math.min(
          guideIndex > 0 ? guide - options.boundaries[guideIndex - 1] : Infinity,
          guideIndex + 1 < options.boundaries.length ? options.boundaries[guideIndex + 1] - guide : Infinity,
        );
        // Upscaling a 2px white frame can produce a 4–8px dark stripe. Search the
        // narrow gutter around the guide, not only the single guide pixel.
        const tolerance = Math.max(1, Math.min(8, Math.round(neighborWidth * 0.08)));
        for (let x = Math.max(0, Math.round(guide) - tolerance); x <= Math.min(width - 1, Math.round(guide) + tolerance); x++) {
          let darkCount = 0;
          for (let y = 0; y < height; y++) darkCount += dark[y * width + x];
          if (darkCount >= height * 0.88) {
            for (let y = 0; y < height; y++) remove[y * width + x] = 1;
          }
        }
      }
    }
  }
  const result = new Uint8ClampedArray(pixels.length);
  for (let index = 0; index < count; index++) {
    const value = dark[index] && !remove[index] ? 0 : 255;
    result[index * 4] = value;
    result[index * 4 + 1] = value;
    result[index * 4 + 2] = value;
    result[index * 4 + 3] = 255;
  }
  return result;
}
