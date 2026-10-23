import { useState } from 'react';
import { ArrowLeft, ArrowRight, ClipboardPaste, ScanLine } from 'lucide-react';
import { ImageImporter } from './ImageImporter';
import { cleanLetters } from '../lib/puzzle';
import type { Puzzle } from '../lib/puzzle';
import { useI18n } from '../lib/i18n';

interface InputLettersProps {
  puzzle: Puzzle;
  onChange: (puzzle: Puzzle) => void;
  onNext: () => void;
  onBack: () => void;
}

export function InputLetters({ puzzle, onChange, onNext, onBack }: InputLettersProps) {
  const { t, localize } = useI18n();
  const [showImporter, setShowImporter] = useState(false);
  const [bulk, setBulk] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [error, setError] = useState('');
  const errorText = (message: string) => {
    const columnLimit = /^Column (\d+) cannot contain more than (\d+) letters\.$/.exec(message);
    if (columnLimit) return t(message, `第 ${columnLimit[1]} 列不能超过 ${columnLimit[2]} 个字母。`);
    const lineCount = /^Paste exactly (\d+) lines, one per column\.$/.exec(message);
    if (lineCount) return t(message, `请粘贴恰好 ${lineCount[1]} 行，每行对应一列。`);
    if (message === 'Columns may contain only letters, ?, spaces or - for empty.') return t(message, '每列只能包含字母、?、空格，或用 - 表示空列。');
    if (message === 'One or more columns contain more letters than rows.') return t(message, '某些列的字母数超过了网格行数。');
    if (message === 'OCR found more letters than answer rows in a column. Check the crop and recognition.') return t(message, 'OCR 识别出的某列字母数超过了答案行数，请检查裁剪范围和识别结果。');
    return localize(message);
  };
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
      <div><p className="eyebrow">{t('STEP 1 · COLUMN LETTERS', '第 1 步 · 输入列字母')}</p><h2 className="mt-1 text-2xl font-bold">{t('What letters can drop?', '每列有哪些可用字母？')}</h2></div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary" onClick={() => setShowBulk(!showBulk)}><ClipboardPaste size={16} /> {t('Paste columns', '批量粘贴')}</button>
        <button className="btn-secondary" onClick={() => setShowImporter(true)}><ScanLine size={16} /> {t('Read image', '识别图片')}</button>
      </div>
    </div>
    <p className="mt-3 text-sm text-slate-600">{t('Letters can be in any order within their column. Use ', '同列字母的输入顺序不限。每个缺失或无法辨认的字母用一个 ')}<strong>?</strong>{t(' for each missing or unreadable letter. An entirely unknown column needs one ? per white square.', ' 表示。整列未知时，每个白格都需要一个 ?。')}</p>
    {showBulk && <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <label className="field-label" htmlFor="bulk-columns">{t('One column per line; write - for an empty column.', '每行对应一列，空列用 - 表示。')}</label>
      <textarea id="bulk-columns" className="field mt-2 h-28 font-mono" value={bulk} onChange={e => setBulk(e.target.value)} placeholder={'ADE?\nEHL\n-\nORW'} />
      <button className="btn-secondary mt-2" onClick={() => {
        const lines = bulk.replace(/\r/g, '').trim().split('\n');
        if (lines.length !== puzzle.cols) { setError(`Paste exactly ${puzzle.cols} lines, one per column.`); return; }
        if (lines.some(line => !/^[A-Za-z?\s-]*$/.test(line))) { setError('Columns may contain only letters, ?, spaces or - for empty.'); return; }
        const columnLetters = lines.map(cleanLetters);
        if (columnLetters.some(col => col.length > puzzle.rows)) { setError('One or more columns contain more letters than rows.'); return; }
        onChange({ ...puzzle, columnLetters }); setError(''); setShowBulk(false);
      }}>{t('Apply pasted columns', '应用粘贴内容')}</button>
    </div>}
    {error && <p role="alert" className="error-box mt-4">{errorText(error)}</p>}
    <div className="mt-6 overflow-x-auto pb-4">
      <div className="flex w-max min-w-full justify-center gap-2">
        {puzzle.columnLetters.map((letters, col) => <label key={col} className="flex w-16 shrink-0 flex-col items-center gap-2">
          <span className="text-xs font-semibold text-slate-600">{t(`Col ${col + 1}`, `第 ${col + 1} 列`)}</span>
          <textarea aria-label={t(`Column ${col + 1} letters`, `第 ${col + 1} 列字母`)} spellCheck={false} autoCapitalize="characters" className="field h-40 resize-y px-2 text-center font-mono text-lg uppercase leading-7" value={letters.join('')} onChange={e => updateColumn(col, e.target.value)} placeholder="A?" />
          <span className="text-xs text-slate-500">{letters.length}{letters.includes('?') ? ` (${letters.filter(c => c === '?').length} ?)` : ''}</span>
        </label>)}
      </div>
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-5">
      <button className="btn-secondary" onClick={onBack}><ArrowLeft size={16} /> {t('Back', '返回')}</button>
      <p className="text-xs text-slate-500">{t(`${total} letters · ${unknown} unknown · draft saved locally`, `${total} 个字母 · ${unknown} 个未知字母 · 草稿已保存在本地`)}</p>
      <button className="btn-primary" onClick={onNext}>{t('Set black squares', '设置黑格')} <ArrowRight size={16} /></button>
    </div>
    {showImporter && <ImageImporter numColumns={puzzle.cols} maxLettersPerColumn={puzzle.rows} onClose={() => setShowImporter(false)} onImport={columnLetters => {
      if (columnLetters.some(col => col.length > puzzle.rows)) { setError('OCR found more letters than answer rows in a column. Check the crop and recognition.'); return; }
      onChange({ ...puzzle, columnLetters }); setShowImporter(false); setError('');
    }} />}
  </section>;
}
