import { useRef, useState } from 'react';
import { ArrowRight, FileUp, FlaskConical } from 'lucide-react';
import { MAX_CELLS, MAX_COLS, MAX_ROWS, validateDimensions } from '../lib/puzzle';

interface SetupProps {
  onNext: (rows: number, cols: number) => void;
  onExample: () => void;
  onImport: (file: File) => void;
  initialRows: number;
  initialCols: number;
  hasDraft: boolean;
  onResume: () => void;
}

export function Setup({ onNext, onExample, onImport, initialRows, initialCols, hasDraft, onResume }: SetupProps) {
  const [rows, setRows] = useState(initialRows);
  const [cols, setCols] = useState(initialCols);
  const [error, setError] = useState('');
  const file = useRef<HTMLInputElement>(null);
  return <section className="panel mx-auto mt-8 max-w-xl p-6 sm:p-8">
    <p className="eyebrow">START A PUZZLE</p>
    <h2 className="mt-2 text-2xl font-bold">Drop the letters. Find the quote.</h2>
    <p className="mt-3 text-sm leading-relaxed text-slate-600">Set the answer grid size, enter the letters above each column, then mark the black squares. Missing letters can be entered as <code>?</code>.</p>
    {hasDraft && <button className="mt-5 w-full rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-left font-semibold text-blue-800" onClick={onResume}>Continue saved puzzle ({initialRows} × {initialCols}) →</button>}
    <form className="mt-6 space-y-5" onSubmit={e => {
      e.preventDefault();
      try { validateDimensions(rows, cols); setError(''); onNext(rows, cols); }
      catch (e) { setError(e instanceof Error ? e.message : 'Invalid dimensions.'); }
    }}>
      <div className="grid grid-cols-2 gap-4">
        <label className="field-label">Rows<input aria-label="Rows" className="field mt-1" type="number" min={1} max={MAX_ROWS} required value={rows || ''} onChange={e => setRows(Number(e.target.value))} /></label>
        <label className="field-label">Columns<input aria-label="Columns" className="field mt-1" type="number" min={1} max={MAX_COLS} required value={cols || ''} onChange={e => setCols(Number(e.target.value))} /></label>
      </div>
      <p className="text-xs text-slate-500">Up to {MAX_ROWS} rows, {MAX_COLS} columns and {MAX_CELLS.toLocaleString()} cells.</p>
      {error && <p role="alert" className="error-box">{error}</p>}
      <button className="btn-primary w-full" type="submit">Enter letters <ArrowRight size={17} /></button>
    </form>
    <div className="mt-5 flex flex-wrap justify-center gap-3 border-t border-slate-100 pt-5">
      <button className="btn-secondary" onClick={onExample}><FlaskConical size={16} /> Try an example</button>
      <button className="btn-secondary" onClick={() => file.current?.click()}><FileUp size={16} /> Import puzzle JSON</button>
      <input ref={file} aria-label="Import puzzle JSON" type="file" accept="application/json,.json" className="hidden" onChange={e => { if (e.target.files?.[0]) onImport(e.target.files[0]); e.target.value = ''; }} />
    </div>
  </section>;
}
