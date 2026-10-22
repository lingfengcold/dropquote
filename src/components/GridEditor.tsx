import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, HelpCircle, LockKeyhole } from 'lucide-react';
import { fillMissingLetters, getColumnCounts } from '../lib/puzzle';
import type { Puzzle } from '../lib/puzzle';
import type { SearchOptions } from '../lib/solverProtocol';
import { normalizeWord } from '../lib/languageModel';
import { SEARCH_NODES, SEARCH_SECONDS } from '../lib/searchSettings';

interface GridEditorProps {
  puzzle: Puzzle;
  onChange: (puzzle: Puzzle) => void;
  onNext: (options: SearchOptions) => void;
  onBack: () => void;
  ready: boolean;
  options: SearchOptions;
  onOptionsChange: (options: SearchOptions) => void;
  customWords: string;
  onCustomWordsChange: (value: string) => void;
}

export function GridEditor({ puzzle, onChange, onNext, onBack, ready, options, onOptionsChange, customWords, onCustomWordsChange }: GridEditorProps) {
  const [mode, setMode] = useState<'blocks' | 'letters'>('blocks');
  const seconds = (options.timeLimitMs ?? 30000) / 1000;
  const maxNodes = options.maxNodes ?? 1000000;
  const counts = useMemo(() => getColumnCounts(puzzle), [puzzle]);
  const missing = counts.reduce((n, col) => n + Math.max(0, col.missing), 0);
  const excess = counts.some(col => col.missing < 0);
  const valid = counts.every(col => col.missing === 0) && counts.some(col => col.spaces > 0);
  const setLetter = (r: number, c: number, char: string) => onChange({ ...puzzle, fixedLetters: puzzle.fixedLetters.map((row, y) => row.map((old, x) => y === r && x === c ? char.toUpperCase().replace(/[^A-Z]/g, '').slice(-1) || null : old)) });

  return <section className="panel mx-auto mt-6 max-w-6xl p-5 sm:p-7">
    <p className="eyebrow">STEP 2 · GRID & CONSTRAINTS</p>
    <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-2xl font-bold">Set the shape of the quote</h2>
      <div className="flex rounded-lg bg-slate-100 p-1">
        <button className={`rounded-md px-3 py-2 text-sm ${mode === 'blocks' ? 'bg-white font-semibold shadow-sm' : 'text-slate-600'}`} aria-pressed={mode === 'blocks'} onClick={() => setMode('blocks')}>Black squares</button>
        <button className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${mode === 'letters' ? 'bg-white font-semibold shadow-sm' : 'text-slate-600'}`} aria-pressed={mode === 'letters'} onClick={() => setMode('letters')}><LockKeyhole size={14} /> Known letters</button>
      </div>
    </div>
    <p className="mt-3 text-sm text-slate-600">{mode === 'blocks' ? 'Click squares to mark spaces between words.' : 'Type letters you already know into white squares. Clear a letter to unlock it.'} Words continue across row edges until a black square.</p>
    <div className="mt-5 overflow-x-auto pb-3">
      <div className="w-max">
        <div className="mb-2 grid gap-1" style={{ gridTemplateColumns: `repeat(${puzzle.cols}, 36px)` }}>
          {counts.map(col => <div key={col.col} className={`text-center text-xs ${col.missing === 0 ? 'text-emerald-700' : 'font-semibold text-red-700'}`} title={`Column ${col.col + 1}: ${col.supplied} letters for ${col.spaces} white squares`}>
            <div className="text-[10px] text-slate-500">{col.col + 1}</div><div>{col.supplied}/{col.spaces}</div>
          </div>)}
        </div>
        <div className="grid w-max gap-px border-2 border-slate-800 bg-slate-300" style={{ gridTemplateColumns: `repeat(${puzzle.cols}, 39px)` }}>
          {puzzle.blocks.flatMap((row, r) => row.map((isBlock, c) => mode === 'letters' && !isBlock ?
            <input key={`${r}-${c}`} aria-label={`Known letter row ${r + 1} column ${c + 1}`} className={`h-9 w-full p-0 text-center font-mono font-bold uppercase outline-offset-[-2px] ${puzzle.fixedLetters[r][c] ? 'bg-amber-50 text-amber-900' : 'bg-white'}`} maxLength={1} value={puzzle.fixedLetters[r][c] ?? ''} onChange={e => setLetter(r, c, e.target.value)} spellCheck={false} /> :
            <button key={`${r}-${c}`} type="button" aria-label={`Row ${r + 1} column ${c + 1} ${isBlock ? 'black' : 'white'}`} aria-pressed={isBlock} className={`h-9 font-mono font-bold ${isBlock ? 'bg-slate-900 text-white' : puzzle.fixedLetters[r][c] ? 'bg-amber-50 text-amber-900' : 'bg-white hover:bg-blue-50'}`} onClick={() => {
              if (mode !== 'blocks') return;
              onChange({ ...puzzle, blocks: puzzle.blocks.map((old, y) => old.map((b, x) => y === r && x === c ? !b : b)), fixedLetters: puzzle.fixedLetters.map((old, y) => old.map((v, x) => y === r && x === c ? null : v)) });
            }}>{isBlock ? '' : puzzle.fixedLetters[r][c]}</button>))}
        </div>
      </div>
    </div>
    {!valid && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="status">
      {excess ? 'Some columns have more letters than white squares. Remove excess letters or adjust black squares.' : missing > 0 ? `The grid needs ${missing} more letters. Each column must match its own white-square count.` : 'The puzzle needs at least one white square.'}
      {!excess && missing > 0 && <button className="btn-secondary mt-3 border-amber-300 bg-white" onClick={() => onChange(fillMissingLetters(puzzle))}><HelpCircle size={16} /> Fill {missing} missing letters with ?</button>}
    </div>}
    <div className="mt-6 grid gap-4 rounded-lg bg-slate-50 p-4 sm:grid-cols-2">
      <label className="field-label">Search time<select className="field mt-1" value={seconds} onChange={e => onOptionsChange({ ...options, timeLimitMs: Number(e.target.value) * 1000 })}>{SEARCH_SECONDS.map(n => <option key={n} value={n}>{n} seconds</option>)}</select></label>
      <label className="field-label">Search effort<select className="field mt-1" value={maxNodes} onChange={e => onOptionsChange({ ...options, maxNodes: Number(e.target.value) })}>{SEARCH_NODES.map((value, i) => <option key={value} value={value}>{['Quick', 'Normal', 'Deep'][i]} · {value.toLocaleString()} nodes</option>)}</select></label>
      <label className="field-label sm:col-span-2">Extra words / names (optional)<textarea className="field mt-1 h-16 font-mono" value={customWords} onChange={e => onCustomWordsChange(e.target.value)} placeholder="Names or unusual words that may appear in this quote" /></label>
      <p className="text-xs text-slate-500 sm:col-span-2">More ? means more possible answers. Known letters narrow the search. You can stop at any time; a time or effort limit returns the best candidates found so far.</p>
    </div>
    <div className="mt-6 flex items-center justify-between gap-4 border-t border-slate-100 pt-5">
      <button className="btn-secondary" onClick={onBack}><ArrowLeft size={16} /> Edit column letters</button>
      <button className="btn-primary" disabled={!valid || !ready} onClick={() => onNext({ ...options, customWords: customWords.split(/[\s,;]+/).filter(Boolean).map(normalizeWord).filter((word): word is string => word !== null) })}>{ready ? 'Find quotes' : 'Loading dictionary…'}<ArrowRight size={16} /></button>
    </div>
  </section>;
}
