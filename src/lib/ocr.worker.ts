import { createWorker, OEM, PSM, type Worker as TesseractWorker } from 'tesseract.js';
import { mapSymbolsToColumns, preprocessOcrPixels, symbolsFromBlocks, type OcrSymbol } from './ocr';
import type { OcrCancelRequest, OcrWorkerRequest, OcrWorkerResponse } from './ocrProtocol';

const scope = self as unknown as {
  postMessage(message: OcrWorkerResponse): void;
  onmessage: ((event: MessageEvent<OcrWorkerRequest | OcrCancelRequest>) => void) | null;
};
let engine: TesseractWorker | undefined;
let cancelled = false;

scope.onmessage = async ({ data }) => {
  if (data.type === 'cancel') {
    cancelled = true;
    if (engine) await engine.terminate().catch(() => undefined);
    return;
  }
  let column = 0;
  let failed = false;
  const reportError = (cause: unknown) => {
    if (failed) return;
    failed = true;
    const detail = cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : '';
    scope.postMessage({ type: 'error', message: detail || 'Recognition failed. Check your connection for the initial OCR data download, then try again.' });
  };
  const progress = (value: number, status: string) => scope.postMessage({ type: 'progress', progress: value, status });
  try {
    if (typeof OffscreenCanvas === 'undefined') throw new Error('This browser does not support background image processing. Use a current Chrome, Edge, Firefox or Safari.');
    const { width, height, boundaries, mode } = data;
    const numColumns = boundaries.length - 1;
    progress(0, 'Preparing the selected letter area…');
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not prepare the image.');
    const pixels = preprocessOcrPixels(new Uint8ClampedArray(data.pixels), width, height, { removeGridLines: data.removeLines, boundaries });
    context.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
    scope.postMessage({ type: 'preview', blob: await canvas.convertToBlob({ type: 'image/png' }) });
    if (cancelled) return;
    progress(0, 'Loading local OCR engine (the first use downloads English recognition data)…');
    engine = await createWorker('eng', OEM.LSTM_ONLY, {
      logger: message => {
        if (message.status === 'recognizing text') {
          const fraction = mode === 'columns' ? (column + message.progress) / numColumns : message.progress;
          progress(Math.round(fraction * 100), mode === 'columns' ? `Reading column ${column + 1} of ${numColumns}…` : 'Reading letters and their positions…');
        }
      },
      // Tesseract's default handler rethrows asynchronously, and failed language downloads can
      // leave createWorker pending. Report to the owner, which terminates this entire worker.
      errorHandler: reportError,
    }, { load_system_dawg: '0', load_freq_dawg: '0', load_number_dawg: '0' });
    if (failed || cancelled) return;
    await engine.setParameters({
      // Dropquote screenshots also use lowercase fonts. Restricting recognition to
      // uppercase glyphs silently discards d/a/r/etc.; normalize case after recognition.
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
      // SINGLE_BLOCK preserves isolated characters within grid rows. SPARSE_TEXT can
      // silently discard a lone A/I as a small text fragment, even on a clean scan.
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      user_defined_dpi: '300',
    });
    const detected: OcrSymbol[] = [];
    if (mode === 'columns') {
      const padding = 12;
      for (column = 0; column < numColumns; column++) {
        if (cancelled) return;
        progress(Math.round(column / numColumns * 100), `Reading column ${column + 1} of ${numColumns}…`);
        const left = Math.round(boundaries[column]);
        const right = Math.round(boundaries[column + 1]);
        const columnCanvas = new OffscreenCanvas(right - left + padding * 2, height + padding * 2);
        const columnContext = columnCanvas.getContext('2d');
        if (!columnContext) throw new Error('Your browser could not prepare a column.');
        columnContext.fillStyle = '#fff';
        columnContext.fillRect(0, 0, columnCanvas.width, columnCanvas.height);
        columnContext.drawImage(canvas, left, 0, right - left, height, padding, padding, right - left, height);
        // Tesseract 7 requires explicit blocks output; data.symbols does not exist.
        const recognized = await engine.recognize(columnCanvas, {}, { blocks: true, text: true });
        for (const symbol of symbolsFromBlocks(recognized.data.blocks)) {
          detected.push({ ...symbol, bbox: {
            x0: symbol.bbox.x0 + left - padding, x1: symbol.bbox.x1 + left - padding,
            y0: symbol.bbox.y0 - padding, y1: symbol.bbox.y1 - padding,
          } });
        }
      }
    } else {
      const recognized = await engine.recognize(canvas, {}, { blocks: true, text: true });
      detected.push(...symbolsFromBlocks(recognized.data.blocks));
    }
    if (failed || cancelled) return;
    const result = mapSymbolsToColumns(detected, boundaries, height);
    if (!result.symbols.length) throw new Error('No letters were detected. Check the crop, try the other recognition mode, or enter letters manually.');
    // Release Tesseract's nested worker explicitly before the owner disposes of this worker.
    await engine.terminate();
    engine = undefined;
    scope.postMessage({ type: 'complete', result });
  } catch (cause) {
    reportError(cause);
  } finally {
    if (engine) await engine.terminate().catch(() => undefined);
  }
};
