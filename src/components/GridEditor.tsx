import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, HelpCircle, LockKeyhole } from 'lucide-react';
import { fillMissingLetters, getColumnCounts } from '../lib/puzzle';
import type { Puzzle } from '../lib/puzzle';
import type { SearchOptions } from '../lib/solverProtocol';
import { normalizeWord } from '../lib/languageModel';
import { SEARCH_NODES, SEARCH_SECONDS } from '../lib/searchSettings';
import { useI18n } from '../lib/i18n';

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
  const { t } = useI18n();
  const [mode, setMode] = useState<'blocks' | 'letters'>('blocks');
  const seconds = (options.timeLimitMs ?? 30000) / 1000;
  const maxNodes = options.maxNodes ?? 1000000;
  const counts = useMemo(() => getColumnCounts(puzzle), [puzzle]);
  const missing = counts.reduce((n, col) => n + Math.max(0, col.missing), 0);
  const excess = counts.some(col => col.missing < 0);
  const valid = counts.every(col => col.missing === 0) && counts.some(col => col.spaces > 0);
  const setLetter = (r: number, c: number, char: string) => onChange({ ...puzzle, fixedLetters: puzzle.fixedLetters.map((row, y) => row.map((old, x) => y === r && x === c ? char.toUpperCase().replace(/[^A-Z]/g, '').slice(-1) || null : old)) });

  return <section className="panel mx-auto mt-6 max-w-6xl p-5 sm:p-7">
    <p className="eyebrow">{t('STEP 2 · GRID & CONSTRAINTS', '第 2 步 · 网格与约束')}</p>
    <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-2xl font-bold">{t('Set the shape of the quote', '设置答案的网格形状')}</h2>
      <div className="flex rounded-lg bg-slate-100 p-1">
        <button className={`rounded-md px-3 py-2 text-sm ${mode === 'blocks' ? 'bg-white font-semibold shadow-sm' : 'text-slate-600'}`} aria-pressed={mode === 'blocks'} onClick={() => setMode('blocks')}>{t('Black squares', '黑格')}</button>
        <button className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${mode === 'letters' ? 'bg-white font-semibold shadow-sm' : 'text-slate-600'}`} aria-pressed={mode === 'letters'} onClick={() => setMode('letters')}><LockKeyhole size={14} /> {t('Known letters', '已知字母')}</button>
      </div>
    </div>
    <p className="mt-3 text-sm text-slate-600">{mode === 'blocks' ? t('Click squares to mark spaces between words.', '点击格子，标记词与词之间的黑格。') : t('Type letters you already know into white squares. Clear a letter to unlock it.', '在白格中输入已知字母，清空即可解除锁定。')}{' '}{t('Words continue across row edges until a black square.', '单词可跨行延续，直到遇到黑格。')}</p>
    <div className="mt-5 overflow-x-auto pb-3">
      <div className="w-max">
        <div className="mb-2 grid gap-1" style={{ gridTemplateColumns: `repeat(${puzzle.cols}, 36px)` }}>
          {counts.map(col => <div key={col.col} className={`text-center text-xs ${col.missing === 0 ? 'text-emerald-700' : 'font-semibold text-red-700'}`} title={t(`Column ${col.col + 1}: ${col.supplied} letters for ${col.spaces} white squares`, `第 ${col.col + 1} 列：${col.supplied} 个字母，${col.spaces} 个白格`)}>
            <div className="text-[10px] text-slate-500">{col.col + 1}</div><div>{col.supplied}/{col.spaces}</div>
          </div>)}
        </div>
        <div className="grid w-max gap-px border-2 border-slate-800 bg-slate-300" style={{ gridTemplateColumns: `repeat(${puzzle.cols}, 39px)` }}>
          {puzzle.blocks.flatMap((row, r) => row.map((isBlock, c) => mode === 'letters' && !isBlock ?
            <input key={`${r}-${c}`} aria-label={t(`Known letter row ${r + 1} column ${c + 1}`, `第 ${r + 1} 行第 ${c + 1} 列的已知字母`)} className={`h-9 w-full p-0 text-center font-mono font-bold uppercase outline-offset-[-2px] ${puzzle.fixedLetters[r][c] ? 'bg-amber-50 text-amber-900' : 'bg-white'}`} maxLength={1} value={puzzle.fixedLetters[r][c] ?? ''} onChange={e => setLetter(r, c, e.target.value)} spellCheck={false} /> :
            <button key={`${r}-${c}`} type="button" aria-label={t(`Row ${r + 1} column ${c + 1} ${isBlock ? 'black' : 'white'}`, `第 ${r + 1} 行第 ${c + 1} 列${isBlock ? '黑格' : '白格'}`)} aria-pressed={isBlock} className={`h-9 font-mono font-bold ${isBlock ? 'bg-slate-900 text-white' : puzzle.fixedLetters[r][c] ? 'bg-amber-50 text-amber-900' : 'bg-white hover:bg-blue-50'}`} onClick={() => {
              if (mode !== 'blocks') return;
              onChange({ ...puzzle, blocks: puzzle.blocks.map((old, y) => old.map((b, x) => y === r && x === c ? !b : b)), fixedLetters: puzzle.fixedLetters.map((old, y) => old.map((v, x) => y === r && x === c ? null : v)) });
            }}>{isBlock ? '' : puzzle.fixedLetters[r][c]}</button>))}
        </div>
      </div>
    </div>
    {!valid && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="status">
      {excess ? t('Some columns have more letters than white squares. Remove excess letters or adjust black squares.', '某些列的字母数超过白格数，请删除多余字母或调整黑格。') : missing > 0 ? t(`The grid needs ${missing} more letters. Each column must match its own white-square count.`, `网格还缺 ${missing} 个字母。每列的字母数必须与该列白格数一致。`) : t('The puzzle needs at least one white square.', '题目至少需要一个白格。')}
      {!excess && missing > 0 && <button className="btn-secondary mt-3 border-amber-300 bg-white" onClick={() => onChange(fillMissingLetters(puzzle))}><HelpCircle size={16} /> {t(`Fill ${missing} missing letters with ?`, `用 ? 补齐 ${missing} 个缺失字母`)}</button>}
    </div>}
    <div className="mt-6 grid gap-4 rounded-lg bg-slate-50 p-4 sm:grid-cols-2">
      <label className="field-label">{t('Search time', '搜索时限')}<select className="field mt-1" value={seconds} onChange={e => onOptionsChange({ ...options, timeLimitMs: Number(e.target.value) * 1000 })}>{SEARCH_SECONDS.map(n => <option key={n} value={n}>{t(`${n} seconds`, `${n} 秒`)}</option>)}</select></label>
      <label className="field-label">{t('Search effort', '搜索强度')}<select className="field mt-1" value={maxNodes} onChange={e => onOptionsChange({ ...options, maxNodes: Number(e.target.value) })}>{SEARCH_NODES.map((value, i) => <option key={value} value={value}>{[t('Quick', '快速'), t('Normal', '标准'), t('Deep', '深入')][i]} · {t(`${value.toLocaleString()} nodes`, `${value.toLocaleString()} 个节点`)}</option>)}</select></label>
      <label className="field-label sm:col-span-2">{t('Extra words / names (optional)', '补充词汇 / 人名（可选）')}<textarea className="field mt-1 h-16 font-mono" value={customWords} onChange={e => onCustomWordsChange(e.target.value)} placeholder={t('Names or unusual words that may appear in this quote', '输入原文中可能出现的人名或生僻词')} /></label>
      <div className="sm:col-span-2">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={options.allowJoinedWords ?? false} onChange={e => onOptionsChange({ ...options, allowJoinedWords: e.target.checked })} />{t('Allow joined words', '允许组合词')}</label>
        <p className="mt-1 text-xs text-slate-500">{t('Try two common words of at least three letters joined in one slot, such as RAIN + COAT. Extra words can supply rare components. Adds search work and may suggest unlisted combinations.', '尝试将两个至少含 3 个字母的常见词合为一个单词，例如 RAIN + COAT。可通过补充词汇加入较少见的组成词。这会增加搜索量，也可能生成词典中不存在的组合。')}</p>
      </div>
      <p className="text-xs text-slate-500 sm:col-span-2">{t('More ? means more possible answers. Known letters narrow the search. You can stop at any time; a time or effort limit returns the best candidates found so far.', '? 越多，可能的答案越多；已知字母可以缩小搜索范围。你可以随时停止，达到时间或节点上限时会显示目前找到的最佳候选。')}</p>
    </div>
    <div className="mt-6 flex items-center justify-between gap-4 border-t border-slate-100 pt-5">
      <button className="btn-secondary" onClick={onBack}><ArrowLeft size={16} /> {t('Edit column letters', '修改列字母')}</button>
      <button className="btn-primary" disabled={!valid || !ready} onClick={() => onNext({ ...options, customWords: customWords.split(/[\s,;]+/).filter(Boolean).map(normalizeWord).filter((word): word is string => word !== null) })}>{ready ? t('Find quotes', '开始求解') : t('Loading dictionary…', '词典加载中…')}<ArrowRight size={16} /></button>
    </div>
  </section>;
}
