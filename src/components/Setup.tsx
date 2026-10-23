import { useRef, useState } from 'react';
import { ArrowRight, FileUp, FlaskConical, HelpCircle } from 'lucide-react';
import { MAX_CELLS, MAX_COLS, MAX_ROWS, validateDimensions } from '../lib/puzzle';
import { useI18n } from '../lib/i18n';

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
  const { t, localize } = useI18n();
  const [rows, setRows] = useState(initialRows);
  const [cols, setCols] = useState(initialCols);
  const [error, setError] = useState('');
  const [showImportHelp, setShowImportHelp] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  return <section className="panel mx-auto mt-8 max-w-xl p-6 sm:p-8">
    <p className="eyebrow">{t('START A PUZZLE', '开始新题')}</p>
    <h2 className="mt-2 text-2xl font-bold">{t('Drop the letters. Find the quote.', '排列下落字母，还原原文。')}</h2>
    <p className="mt-3 text-sm leading-relaxed text-slate-600">{t("Set the answer grid size, enter each column's available letters, then mark the black squares. Missing letters can be entered as ", '设置答案网格的行列数，输入每列可用的字母，再标记黑格。缺失字母可用 ')}<code>?</code>{t('.', ' 表示。')}</p>
    {hasDraft && <button className="mt-5 w-full rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-left font-semibold text-blue-800" onClick={onResume}>{t(`Continue saved puzzle (${initialRows} × ${initialCols}) →`, `继续已保存的题目（${initialRows} × ${initialCols}）→`)}</button>}
    <form className="mt-6 space-y-5" onSubmit={e => {
      e.preventDefault();
      try { validateDimensions(rows, cols); setError(''); onNext(rows, cols); }
      catch (e) { setError(e instanceof Error ? e.message : 'Invalid dimensions.'); }
    }}>
      <div className="grid grid-cols-2 gap-4">
        <label className="field-label">{t('Rows', '行数')}<input aria-label={t('Rows', '行数')} className="field mt-1" type="number" min={1} max={MAX_ROWS} required value={rows || ''} onChange={e => setRows(Number(e.target.value))} /></label>
        <label className="field-label">{t('Columns', '列数')}<input aria-label={t('Columns', '列数')} className="field mt-1" type="number" min={1} max={MAX_COLS} required value={cols || ''} onChange={e => setCols(Number(e.target.value))} /></label>
      </div>
      <p className="text-xs text-slate-500">{t(`Up to ${MAX_ROWS} rows, ${MAX_COLS} columns and ${MAX_CELLS.toLocaleString()} cells.`, `最多 ${MAX_ROWS} 行、${MAX_COLS} 列，总计不超过 ${MAX_CELLS.toLocaleString()} 格。`)}</p>
      {error && <p role="alert" className="error-box">{localize(error)}</p>}
      <button className="btn-primary w-full" type="submit">{t('Enter letters', '输入字母')} <ArrowRight size={17} /></button>
    </form>
    <div className="mt-5 flex flex-wrap justify-center gap-3 border-t border-slate-100 pt-5">
      <button className="btn-secondary" onClick={onExample}><FlaskConical size={16} /> {t('Try an example', '试用示例')}</button>
      <div className="flex items-center gap-1">
        <button className="btn-secondary" onClick={() => file.current?.click()}><FileUp size={16} /> {t('Import puzzle JSON', '导入题目 JSON')}</button>
        <button type="button" className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${showImportHelp ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-100 hover:text-blue-700'}`} aria-label={t('About puzzle JSON files', '了解题目 JSON 文件')} title={t('What is a puzzle JSON file?', '题目 JSON 文件是什么？')} aria-expanded={showImportHelp} aria-controls="json-import-help" onClick={() => setShowImportHelp(open => !open)}><HelpCircle size={20} aria-hidden="true" /></button>
      </div>
      <input ref={file} aria-label={t('Import puzzle JSON', '导入题目 JSON')} type="file" accept="application/json,.json" className="hidden" onChange={e => { if (e.target.files?.[0]) onImport(e.target.files[0]); e.target.value = ''; }} />
      {showImportHelp && <div id="json-import-help" role="region" aria-labelledby="json-import-help-title" className="w-full rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm leading-relaxed text-slate-700">
        <h3 id="json-import-help-title" className="font-semibold text-blue-900">{t('A save file for your puzzle', '题目的存档文件')}</h3>
        <p className="mt-2">{t('JSON is a text file that lets you back up, share or resume a puzzle.', 'JSON 是一种文本存档，可以用来备份、分享题目或继续解题。')}</p>
        <p className="mt-2">{t('It records the grid size, each column’s letters (including ?), black squares and known letters.', '它会记录棋盘的行列数、每列字母（包括 ?）、黑格位置和已知字母。')}</p>
        <p className="mt-2">{t('Click Save puzzle at the top right to download a .json file. Later, choose Import puzzle JSON to restore it. The app creates the file for you.', '先点击右上角“保存题目”下载 .json 文件，以后通过“导入题目 JSON”恢复。文件由软件生成，无需手写。')}</p>
        <p className="mt-2 text-xs text-slate-500">{t('Search settings and candidate answers are not included in this file.', '文件中不包含搜索设置和候选答案。')}</p>
      </div>}
    </div>
  </section>;
}
