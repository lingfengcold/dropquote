import { useState } from 'react';
import { ArrowLeft, ArrowRight, ClipboardPaste, ScanLine } from 'lucide-react';
import { ImageImporter } from './ImageImporter';
import { cleanLetters } from '../lib/puzzle';
import type { Puzzle } from '../lib/puzzle';

interface InputLettersProps {
  puzzle: Puzzle;
  onChange: (puzzle: Puzzle) => void;
  onNext: () => void;
  onBack: () => void;
}

export function InputLetters({ puzzle, onChange, onNext, onBack }: InputLettersProps) {
  const [showImporter, setShowImporter] = useState(false);
  const [bulk, setBulk] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [error, setError] = useState('');
  const total = puzzle.columnLetters.reduce((n, col) => n + col.length, 0);
  const unknown = puzzle.columnLetters.reduce((n, col) => n + col.filter(c => c === '?').length, 0);
  const updateColumn = (col: number, value: string) => {
    const letters = cleanLetters(value);
    if (letters.length > puzzle.rows) { setError(`Column ${col + 1} cannot contain more than ${puzzle.rows} letters.`); return; }
    onChange({ ...puzzle, columnLetters: puzzle.columnLetters.map((old, c) => c === col ? letters : old) });
    setError('');
  };
  return <section className="panel mx-auto mt-6 max-w-6xl p-5 sm:p-7">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="eyebrow">STEP 1 · COLUMN LETTERS</p><h2 className="mt-1 text-2xl font-bold">What letters can drop?</h2></div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary" onClick={() => setShowBulk(!showBulk)}><ClipboardPaste size={16} /> Paste columns</button>
        <button className="btn-secondary" onClick={() => setShowImporter(true)}><ScanLine size={16} /> Read image</button>
      </div>
    </div>
    <p className="mt-3 text-sm text-slate-600">Letters can be in any order within their column. Use <strong>?</strong> for each missing or unreadable letter. An entirely unknown column needs one ? per white square.</p>
    {showBulk && <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <label className="field-label" htmlFor="bulk-columns">One column per line; write - for an empty column.</label>
      <textarea id="bulk-columns" className="field mt-2 h-28 font-mono" value={bulk} onChange={e => setBulk(e.target.value)} placeholder={'ADE?\nEHL\n-\nORW'} />
      <button className="btn-secondary mt-2" onClick={() => {
        const lines = bulk.replace(/\r/g, '').trim().split('\n');
        if (lines.length !== puzzle.cols) { setError(`Paste exactly ${puzzle.cols} lines, one per column.`); return; }
        if (lines.some(line => !/^[A-Za-z?\s-]*$/.test(line))) { setError('Columns may contain only letters, ?, spaces or - for empty.'); return; }
        const columnLetters = lines.map(cleanLetters);
        if (columnLetters.some(col => col.length > puzzle.rows)) { setError('One or more columns contain more letters than rows.'); return; }
        onChange({ ...puzzle, columnLetters }); setError(''); setShowBulk(false);
      }}>Apply pasted columns</button>
    </div>}
    {error && <p role="alert" className="error-box mt-4">{error}</p>}
    <div className="mt-6 overflow-x-auto pb-4">
      <div className="flex w-max min-w-full justify-center gap-2">
        {puzzle.columnLetters.map((letters, col) => <label key={col} className="flex w-16 shrink-0 flex-col items-center gap-2">
          <span className="text-xs font-semibold text-slate-600">Col {col + 1}</span>
          <textarea aria-label={`Column ${col + 1} letters`} spellCheck={false} autoCapitalize="characters" className="field h-40 resize-y px-2 text-center font-mono text-lg uppercase leading-7" value={letters.join('')} onChange={e => updateColumn(col, e.target.value)} placeholder="A?" />
          <span className="text-xs text-slate-500">{letters.length}{letters.includes('?') ? ` (${letters.filter(c => c === '?').length} ?)` : ''}</span>
        </label>)}
      </div>
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-5">
      <button className="btn-secondary" onClick={onBack}><ArrowLeft size={16} /> Back</button>
      <p className="text-xs text-slate-500">{total} letters · {unknown} unknown · draft saved locally</p>
      <button className="btn-primary" onClick={onNext}>Set black squares <ArrowRight size={16} /></button>
    </div>
    {showImporter && <ImageImporter numColumns={puzzle.cols} maxLettersPerColumn={puzzle.rows} onClose={() => setShowImporter(false)} onImport={columnLetters => {
      if (columnLetters.some(col => col.length > puzzle.rows)) { setError('OCR found more letters than answer rows in a column. Check the crop and recognition.'); return; }
      onChange({ ...puzzle, columnLetters }); setShowImporter(false); setError('');
    }} />}
  </section>;
}
