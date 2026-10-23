import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Upload, Check, X } from 'lucide-react';
import { evenColumnBoundaries, type OcrColumnResult } from '../lib/ocr';
import type { OcrWorkerRequest, OcrWorkerResponse } from '../lib/ocrProtocol';

interface ImageImporterProps {
  numColumns: number;
  maxLettersPerColumn?: number;
  onImport: (columns: string[][]) => void;
  onClose: () => void;
}
interface Crop { left: number; top: number; right: number; bottom: number }
interface UploadedImage { url: string; element: HTMLImageElement; name: string }
interface OcrRun { cancelled: boolean; worker?: Worker; terminated: boolean }
const FULL_CROP: Crop = { left: 0, top: 0, right: 100, bottom: 100 };

function terminateRun(run: OcrRun | null) {
  if (!run) return;
  run.cancelled = true;
  if (run.worker && !run.terminated) {
    run.terminated = true;
    // Let an initialized engine release its child worker first, with a hard stop for stalled
    // model downloads or pixel processing. The outer worker also owns the nested worker.
    const worker = run.worker;
    worker.postMessage({ type: 'cancel' });
    setTimeout(() => worker.terminate(), 100);
  }
}
const nextFrame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

export function ImageImporter({ numColumns, maxLettersPerColumn, onImport, onClose }: ImageImporterProps) {
  const [image, setImage] = useState<UploadedImage | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [crop, setCrop] = useState<Crop>(FULL_CROP);
  const [guideText, setGuideText] = useState('');
  const [removeLines, setRemoveLines] = useState(true);
  const [mode, setMode] = useState<'columns' | 'grid'>('columns');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OcrColumnResult | null>(null);
  const [columnText, setColumnText] = useState<string[]>([]);
  const [checkedColumns, setCheckedColumns] = useState<Set<number>>(new Set());
  const [processedPreview, setProcessedPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeRun = useRef<OcrRun | null>(null);
  const objectUrl = useRef<string | null>(null);
  const previewUrl = useRef<string | null>(null);
  const mounted = useRef(true);
  const uploadVersion = useRef(0);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      uploadVersion.current++;
      terminateRun(activeRun.current);
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    };
  }, []);

  const guides = useMemo(() => {
    if (!guideText.trim()) return { positions: evenColumnBoundaries(100, numColumns), error: '' };
    const positions = guideText.split(/[,，\s]+/).filter(Boolean).map(Number);
    if (positions.length !== numColumns - 1 || positions.some((value, index) =>
      !Number.isFinite(value) || value <= 0 || value >= 100 || (index > 0 && value <= positions[index - 1]))) {
      return { positions: evenColumnBoundaries(100, numColumns), error: `Enter ${numColumns - 1} increasing guide positions between 0 and 100, or leave blank for equal columns.` };
    }
    return { positions: [0, ...positions, 100], error: '' };
  }, [guideText, numColumns]);

  const invalidateResult = () => {
    setResult(null);
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    setProcessedPreview(null);
    setError(null);
    setCheckedColumns(new Set());
  };
  const cancel = () => {
    terminateRun(activeRun.current);
    activeRun.current = null;
    setProcessing(false);
    setStatus('Recognition cancelled. You can adjust the crop and try again.');
  };
  const close = () => {
    terminateRun(activeRun.current);
    activeRun.current = null;
    onClose();
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    cancel();
    invalidateResult();
    if (file.size > 25 * 1024 * 1024) {
      setError('This image exceeds 25 MB. Resize it or upload a screenshot of the letter area.');
      return;
    }
    const version = ++uploadVersion.current;
    setLoadingImage(true);
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
    setImage(null);
    const url = URL.createObjectURL(file);
    try {
      const element = new Image();
      element.src = url;
      await element.decode();
      if (!mounted.current || version !== uploadVersion.current) { URL.revokeObjectURL(url); return; }
      if (!element.naturalWidth || element.naturalWidth * element.naturalHeight > 45_000_000) {
        throw new Error('This image is too large. Resize it to less than 45 megapixels before importing.');
      }
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = url;
      setImage({ url, element, name: file.name });
      setCrop(FULL_CROP);
      setStatus('');
    } catch (cause) {
      URL.revokeObjectURL(url);
      if (mounted.current && version === uploadVersion.current) {
        setError(cause instanceof Error && cause.message.includes('megapixels') ? cause.message : 'The image could not be opened. Try a PNG or JPEG screenshot.');
      }
    } finally {
      if (mounted.current && version === uploadVersion.current) setLoadingImage(false);
    }
  };

  const updateCrop = (field: keyof Crop, value: number) => {
    if (!Number.isFinite(value)) return;
    invalidateResult();
    setCrop(previous => {
      const next = { ...previous, [field]: Math.min(100, Math.max(0, value)) };
      return next.right - next.left < 0.5 || next.bottom - next.top < 0.5 ? previous : next;
    });
  };
  const imagePoint = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100)),
      y: Math.max(0, Math.min(100, (event.clientY - rect.top) / rect.height * 100)),
    };
  };

  const processImage = async () => {
    if (!image || guides.error || processing) return;
    const run: OcrRun = { cancelled: false, terminated: false };
    activeRun.current = run;
    const isCurrent = () => mounted.current && activeRun.current === run && !run.cancelled;
    setProcessing(true);
    invalidateResult();
    setProgress(0);
    setStatus('Preparing the selected letter area…');
    try {
      await nextFrame();
      if (!isCurrent()) return;
      const sourceX = image.element.naturalWidth * crop.left / 100;
      const sourceY = image.element.naturalHeight * crop.top / 100;
      const sourceWidth = image.element.naturalWidth * (crop.right - crop.left) / 100;
      const sourceHeight = image.element.naturalHeight * (crop.bottom - crop.top) / 100;
      if (sourceWidth < numColumns * 3 || sourceHeight < 5) throw new Error('The selected area is too small. Include the complete letter columns.');
      const desiredScale = Math.max(1, Math.min(4, numColumns * 80 / sourceWidth));
      const scale = Math.min(desiredScale, 4096 / Math.max(sourceWidth, sourceHeight), Math.sqrt(6_000_000 / (sourceWidth * sourceHeight)));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Your browser could not prepare the image.');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image.element, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
      const boundaries = guides.positions.map(position => canvas.width * position / 100);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      // Own the outer worker immediately, so even an engine/model download can be cancelled.
      // Pixel processing and Tesseract both run outside React's main thread.
      const worker = new Worker(new URL('../lib/ocr.worker.ts', import.meta.url), { type: 'module' });
      run.worker = worker;
      const finish = () => {
        setProcessing(false);
        activeRun.current = null;
        terminateRun(run);
      };
      worker.onmessage = ({ data }: MessageEvent<OcrWorkerResponse>) => {
        if (!isCurrent()) return;
        if (data.type === 'progress') {
          setProgress(data.progress);
          setStatus(data.status);
        } else if (data.type === 'preview') {
          if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
          previewUrl.current = URL.createObjectURL(data.blob);
          setProcessedPreview(previewUrl.current);
        } else if (data.type === 'complete') {
          setResult(data.result);
          setColumnText(data.result.columns.map(column => column.join('')));
          setProgress(100);
          setStatus('Recognition finished. Review every column, then apply.');
          finish();
        } else {
          setError(data.message);
          setStatus('Recognition stopped.');
          finish();
        }
      };
      worker.onerror = event => {
        event.preventDefault();
        if (!isCurrent()) return;
        setError(event.message || 'The OCR worker could not start. Check your connection and try again.');
        finish();
      };
      const request: OcrWorkerRequest = { type: 'recognize', pixels: pixels.data.buffer, width: canvas.width, height: canvas.height, boundaries, mode, removeLines };
      worker.postMessage(request, [request.pixels]);
    } catch (cause) {
      if (isCurrent()) {
        setError(cause instanceof Error ? cause.message : 'Recognition failed. Check the crop and try again.');
        setProcessing(false);
        activeRun.current = null;
      }
      terminateRun(run);
    }
  };

  const invalidColumn = columnText.some(text => /[^A-Z?\s]/.test(text));
  const overfullColumns = maxLettersPerColumn === undefined ? [] : columnText.flatMap((text, index) =>
    (text.match(/[A-Z?]/g)?.length ?? 0) > maxLettersPerColumn ? [index + 1] : []);
  const letterCount = columnText.reduce((total, text) => total + (text.match(/[A-Z?]/g)?.length ?? 0), 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3" role="dialog" aria-modal="true" aria-labelledby="image-import-title">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[94vh] overflow-hidden flex flex-col">
        <div className="shrink-0 bg-white flex justify-between items-center gap-3 border-b border-gray-100 p-4 sm:px-6">
          <h2 id="image-import-title" className="text-xl font-bold">Import letter columns from image</h2>
          <button onClick={close} aria-label="Close image importer" className="p-1 hover:bg-gray-100 rounded"><X size={24} /></button>
        </div>
        <div className="min-h-0 overflow-y-auto p-4 sm:p-6">
        <p className="text-sm text-gray-600 mb-4">Select only the letter bank, excluding the answer grid and instructions. Align the column guides with the puzzle columns; unequal column heights and blank spaces are preserved by position. Recognition runs in your browser. The first use downloads the OCR engine and English data.</p>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} aria-label="Upload puzzle image" />
        <button onClick={() => fileInputRef.current?.click()} disabled={processing || loadingImage} className="border border-dashed border-blue-400 rounded-md px-4 py-3 text-blue-700 hover:bg-blue-50 flex items-center gap-2 disabled:opacity-50"><Upload size={20} />{loadingImage ? 'Opening image…' : image ? 'Choose another image' : 'Upload image'}</button>
        {image && (
          <div className="space-y-4 mt-4">
            <div className="bg-gray-100 border rounded-md p-2 flex justify-center overflow-hidden">
              <div className={`relative select-none touch-none ${processing ? '' : 'cursor-crosshair'}`}
                onPointerDown={event => {
                  if (processing) return;
                  dragStart.current = imagePoint(event);
                  event.currentTarget.setPointerCapture(event.pointerId);
                  invalidateResult();
                }}
                onPointerMove={event => {
                  if (!dragStart.current || processing) return;
                  const point = imagePoint(event); const start = dragStart.current;
                  if (Math.abs(point.x - start.x) >= 0.5 && Math.abs(point.y - start.y) >= 0.5) setCrop({ left: Math.min(start.x, point.x), top: Math.min(start.y, point.y), right: Math.max(start.x, point.x), bottom: Math.max(start.y, point.y) });
                }}
                onPointerUp={() => { dragStart.current = null; }} onPointerCancel={() => { dragStart.current = null; }}>
                <img src={image.url} alt={`Puzzle preview: ${image.name}`} draggable={false} className="block max-h-[34vh] max-w-full object-contain" />
                <div className="absolute border-2 border-blue-500 pointer-events-none" style={{ left: `${crop.left}%`, top: `${crop.top}%`, width: `${crop.right - crop.left}%`, height: `${crop.bottom - crop.top}%`, boxShadow: '0 0 0 9999px rgb(0 0 0 / 35%)' }}>
                  {guides.positions.slice(1, -1).map((position, index) => <div key={index} className="absolute top-0 bottom-0 border-l border-cyan-400" style={{ left: `${position}%` }} />)}
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-600">Drag on the image to crop, or enter percentages below. Include complete cell widths at the left and right edges, not just the letters' ink.</p>
            <fieldset disabled={processing} className="space-y-3 disabled:opacity-60">
              <div className="flex flex-wrap items-end gap-3">
                {(['left', 'top', 'right', 'bottom'] as const).map(field => <label key={field} className="text-xs text-gray-700 capitalize">{field} %<input type="number" min="0" max="100" step="0.1" aria-label={`Crop ${field} percent`} value={Math.round(crop[field] * 10) / 10} onChange={event => updateCrop(field, event.target.valueAsNumber)} className="block w-20 border rounded p-1.5 mt-1" /></label>)}
                <button className="text-sm text-blue-700 underline py-1.5" onClick={() => { setCrop(FULL_CROP); setGuideText(''); invalidateResult(); }}>Reset crop and guides</button>
              </div>
              {numColumns > 1 && <details className="text-sm"><summary className="cursor-pointer text-gray-600">Adjust guides for uneven column widths</summary><label className="block text-xs text-gray-600 mt-2">Internal guide positions (% of cropped width, from left to right)<input value={guideText} onChange={event => { setGuideText(event.target.value); invalidateResult(); }} placeholder={guides.positions.slice(1, -1).map(value => value.toFixed(1)).join(', ')} className="block w-full border rounded p-2 mt-1" /></label></details>}
              {guides.error && <p className="text-red-700 text-xs">{guides.error}</p>}
              <div className="flex flex-wrap gap-4 items-center text-sm">
                <label>Recognition mode <select value={mode} onChange={event => { setMode(event.target.value as 'columns' | 'grid'); invalidateResult(); }} className="border rounded p-1.5 ml-1"><option value="columns">Each column (recommended)</option><option value="grid">Whole area (faster)</option></select></label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={removeLines} onChange={event => { setRemoveLines(event.target.checked); invalidateResult(); }} />Remove long grid lines</label>
              </div>
              {removeLines && <p className="text-xs text-amber-700">Grid removal can affect letters touching lines. Check the processed preview, especially I, L and T.</p>}
            </fieldset>
            <div className="flex flex-wrap items-center gap-3">
              <button disabled={processing || Boolean(guides.error)} onClick={processImage} className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">{processing ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}{processing ? 'Recognizing…' : result ? 'Recognize again' : 'Recognize letters'}</button>
              {processing && <button onClick={cancel} className="border rounded-md px-4 py-2 hover:bg-gray-50">Cancel recognition</button>}
              <span className="text-sm text-gray-600" role="status" aria-live="polite">{status}</span>
            </div>
            {processing && <div><progress value={progress} max={100} className="w-full h-2" aria-label="OCR progress" /><span className="text-xs text-gray-500">{progress}%</span></div>}
          </div>
        )}
        {error && <div role="alert" className="bg-red-50 text-red-700 p-3 rounded-md text-sm mt-4">{error}</div>}
        {processedPreview && <details className="mt-4 text-sm"><summary className="cursor-pointer text-gray-600">Processed crop preview</summary><img src={processedPreview} alt="Grayscale crop used by OCR" className="mt-2 max-h-48 max-w-full border object-contain" /></details>}
        {result && !processing && (
          <div className="mt-5 border-t pt-4">
            <h3 className="font-semibold">Review and edit columns</h3>
            <p className="text-xs text-gray-600 mt-1">Columns are numbered from left to right. Edit any missed or extra letters; use ? for an unreadable letter. Amber columns need attention; empty columns are allowed. No letters are imported until you click Apply.</p>
            {result.issues.filter(issue => issue.column === null).map((issue, index) => <p key={index} className="text-xs text-amber-700 mt-2">{issue.message}</p>)}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mt-3">
              {columnText.map((text, index) => {
                const issues = result.issues.filter(issue => issue.column === index);
                const needsReview = issues.length > 0 && !checkedColumns.has(index);
                return <div key={index} className={`border rounded-md p-2 ${needsReview ? 'border-amber-400 bg-amber-50' : 'border-gray-200'}`}>
                  <label className="text-xs font-medium block">Column {index + 1} · {text.replace(/\s/g, '').length} letters<textarea value={text} rows={2} spellCheck={false} aria-label={`Letters in column ${index + 1}`} className="block w-full border rounded p-2 mt-1 font-mono uppercase bg-white" onChange={event => { setColumnText(previous => previous.map((value, column) => column === index ? event.target.value.toUpperCase() : value)); setCheckedColumns(previous => new Set(previous).add(index)); }} /></label>
                  {issues.length > 0 && <><p className="text-xs text-amber-800 mt-1">{issues.map(issue => issue.message).join(' ')}</p><label className="flex items-center gap-1 text-xs mt-2"><input type="checkbox" checked={checkedColumns.has(index)} onChange={event => setCheckedColumns(previous => { const next = new Set(previous); if (event.target.checked) next.add(index); else next.delete(index); return next; })} />Reviewed</label></>}
                </div>;
              })}
            </div>
            {invalidColumn && <p role="alert" className="text-red-700 text-sm mt-2">Use only A–Z letters, ? wildcards and spaces in the edited columns.</p>}
            {overfullColumns.length > 0 && <p role="alert" className="text-red-700 text-sm mt-2">Columns {overfullColumns.join(', ')} exceed the {maxLettersPerColumn} answer rows. Remove extra letters or adjust the crop and recognize again.</p>}
            <div className="flex flex-wrap justify-between items-center gap-3 mt-4"><span className="text-sm text-gray-600">{letterCount} letters in {numColumns} columns</span><button disabled={invalidColumn || overfullColumns.length > 0 || letterCount === 0} onClick={() => onImport(columnText.map(text => text.match(/[A-Z?]/g) ?? []))} className="bg-green-700 hover:bg-green-800 text-white px-4 py-2 rounded-md disabled:opacity-50">Apply {letterCount} letters</button></div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
