import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Copy, Download, Loader2, RefreshCw, Square, X } from 'lucide-react';
import { Setup } from './components/Setup';
import { InputLetters } from './components/InputLetters';
import { GridEditor } from './components/GridEditor';
import { createPuzzle, DRAFT_KEY, EXAMPLE_TEXT, parsePuzzle, puzzleFromText } from './lib/puzzle';
import type { Puzzle } from './lib/puzzle';
import type { SolverReport } from './lib/solver';
import type { SearchOptions } from './lib/solverProtocol';
import { useSolver } from './lib/useSolver';
import { nextSearchNodes, nextSearchSeconds } from './lib/searchSettings';
import { useI18n } from './lib/i18n';
import { LanguageSelect } from './components/LanguageSelect';

type Step = 'setup' | 'letters' | 'grid' | 'solving' | 'results';

function loadDraft(): Puzzle {
  try { const draft = localStorage.getItem(DRAFT_KEY); if (draft) return parsePuzzle(JSON.parse(draft)); } catch { /* A corrupt/old draft must not block opening the app. */ }
  return createPuzzle(5, 5);
}

function download(name: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Results({ report, puzzle, onEdit, onAgain, onNew, canSearchLonger }: { report: SolverReport; puzzle: Puzzle; onEdit: () => void; onAgain: () => void; onNew: () => void; canSearchLonger: boolean }) {
  const { t } = useI18n();
  const [selected, setSelected] = useState(0);
  const [copyStatus, setCopyStatus] = useState<'' | 'copied' | 'blocked'>('');
  const result = report.results[selected];
  const complete = report.status === 'complete';
  return <section className="mx-auto mt-6 max-w-6xl">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div><p className="eyebrow">{t('SEARCH RESULTS', '求解结果')}</p><h2 className="mt-1 text-2xl font-bold">{report.results.length ? t(`${report.results.length} best candidate${report.results.length === 1 ? '' : 's'}`, `${report.results.length} 个最佳候选`) : t('No complete candidates found', '未找到完整候选答案')}</h2></div>
      <div className="flex flex-wrap gap-2"><button className="btn-secondary" onClick={onEdit}>{t('Adjust puzzle', '调整题目')}</button>{!complete && <button className="btn-secondary" disabled={!canSearchLonger} title={canSearchLonger ? t('Restart with a larger search budget', '增加搜索额度后重新搜索') : t('Maximum budget reached. Add known letters to narrow the search.', '已达到搜索额度上限，请添加已知字母以缩小范围。')} onClick={onAgain}>{t('Search longer', '延长搜索')}</button>}<button className="btn-secondary" onClick={onNew}>{t('New puzzle', '新建题目')}</button></div>
    </div>
    <div className={`mb-5 rounded-lg border px-4 py-3 text-sm ${complete ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`} role="status">
      {complete ? t('Search completed for this dictionary and these constraints.', '已完成当前词典和约束条件下的搜索。') : t(`${report.status === 'time-limit' ? 'Time limit' : 'Search effort limit'} reached. These are the best complete candidates found so far; more candidates may exist.`, `已达到${report.status === 'time-limit' ? '时间' : '搜索节点'}上限。以下是目前找到的最佳完整候选，可能仍有其他答案。`)}
      <span className="mt-1 block text-xs sm:ml-2 sm:inline">{t(`${report.stats.nodesVisited.toLocaleString()} nodes · ${(report.stats.elapsedMs / 1000).toFixed(1)} s · ${report.stats.solutionsFound.toLocaleString()} completed candidates evaluated`, `${report.stats.nodesVisited.toLocaleString()} 个节点 · ${(report.stats.elapsedMs / 1000).toFixed(1)} 秒 · 已评估 ${report.stats.solutionsFound.toLocaleString()} 个完整候选`)}</span>
    </div>
    {!result ? <div className="panel p-7 text-sm leading-relaxed text-slate-600">{complete ? t('No dictionary solution fits every column and known letter. Check OCR results, black squares, or add missing names and unusual words.', '词典中没有符合全部列和已知字母的解。请核对 OCR 结果与黑格，或补充缺失的人名、生僻词。') : t('The search stopped before reaching a complete candidate. Add known letters, check the column counts, or increase the search budget.', '搜索停止前未找到完整候选。请添加已知字母、核对每列数量，或提高搜索额度。')}{t(' More ? increases ambiguity. Empty results after a limit do not prove the puzzle has no solution.', ' ? 越多，可能的答案越多。达到上限后没有结果，并不代表题目无解。')}</div> : <div className="grid gap-5 lg:grid-cols-[minmax(230px,320px)_minmax(0,1fr)]">
      <div className="panel max-h-[650px] overflow-y-auto p-2" aria-label={t('Ranked candidates', '候选排名')}>
        {report.results.map((candidate, index) => <button key={index} aria-pressed={selected === index} className={`mb-1 w-full rounded-lg border p-3 text-left ${index === selected ? 'border-blue-200 bg-blue-50' : 'border-transparent hover:bg-slate-50'}`} onClick={() => { setSelected(index); setCopyStatus(''); }}>
          <div className="mb-1 flex justify-between gap-2 text-xs font-semibold text-slate-500"><span>#{index + 1}</span><span>{t('Score', '评分')} {candidate.score.toFixed(2)}</span></div>
          <p className="text-sm leading-relaxed text-slate-800">{candidate.validWords.join(' ')}</p>
        </button>)}
      </div>
      <article className="panel min-w-0 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-bold">{t(`Candidate #${selected + 1}`, `候选 #${selected + 1}`)}</h3><div className="flex gap-2">
          <button className="btn-secondary" onClick={async () => { try { await navigator.clipboard.writeText(result.validWords.join(' ')); setCopyStatus('copied'); } catch { setCopyStatus('blocked'); } }}><Copy size={14} /> {t('Copy quote', '复制答案')}</button>
          <button className="btn-secondary" onClick={() => download('dropquote-answer.txt', result.validWords.join(' '), 'text/plain')}><Download size={14} /> {t('Text', '下载文本')}</button>
        </div></div>
        {copyStatus && <p className="mt-2 text-xs text-slate-500" role="status">{copyStatus === 'copied' ? t('Copied', '已复制') : t('Use Download text if clipboard access is blocked.', '剪贴板访问受限时，可使用“下载文本”。')}</p>}
        <p className="mt-4 text-lg font-medium leading-relaxed text-slate-800">{result.validWords.join(' ')}</p>
        <div className="mt-5 overflow-x-auto pb-2">
          <div className="grid w-max gap-px border-2 border-slate-800 bg-slate-300" style={{ gridTemplateColumns: `repeat(${puzzle.cols}, 30px)` }}>
            {result.grid.flatMap((row, r) => row.map((char, c) => <div key={`${r}-${c}`} className={`flex h-8 items-center justify-center font-mono text-sm font-bold ${puzzle.blocks[r][c] ? 'bg-slate-900' : puzzle.fixedLetters[r][c] ? 'bg-amber-50 text-amber-900' : 'bg-white'}`}>{puzzle.blocks[r][c] ? '' : char}</div>))}
          </div>
        </div>
        {(result.resolvedUnknowns ?? []).some(col => col.letters.length) && <div className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-900"><h4 className="font-semibold">{t('Letters supplied for ?', '? 补出的字母')}</h4><div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">{result.resolvedUnknowns.filter(col => col.letters.length).map(col => <span key={col.col}>{t(`Column ${col.col + 1}:`, `第 ${col.col + 1} 列：`)} <strong className="font-mono">{col.letters.join(' ')}</strong></span>)}</div></div>}
        {(result.rareWords ?? []).length > 0 && <p className="mt-4 text-xs leading-relaxed text-slate-500">{t('Less common words to review:', '请核对以下较少见的词：')} {result.rareWords.join(', ')}.</p>}
        {(result.joinedWords ?? []).length > 0 && <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{t('Joined word candidates to review:', '请核对以下拼接词候选：')} <strong>{result.joinedWords.map(item => `${item.word} (${item.parts.join(' + ')})`).join(', ')}</strong>{t('. These combine two dictionary entries and may not be listed words themselves.', '。它们由两个词典词条拼接而成，本身可能不是已收录的词。')}</p>}
        <p className="mt-4 text-xs leading-relaxed text-slate-500">{t('Scores rank candidates for this puzzle using word frequency and neighboring words; they are not probabilities or a guarantee of the intended quote.', '评分依据词频和相邻词关系对当前题目的候选排序，不代表概率，也不保证就是预期答案。')}</p>
      </article>
    </div>}
  </section>;
}

function App() {
  const { t, localize } = useI18n();
  const [puzzle, setPuzzle] = useState<Puzzle>(loadDraft);
  const [step, setStep] = useState<Step>('setup');
  const [notice, setNotice] = useState('');
  const [storageError, setStorageError] = useState(false);
  const [lastOptions, setLastOptions] = useState<SearchOptions>({ timeLimitMs: 30000, maxNodes: 1000000, maxResults: 30 });
  const [customWords, setCustomWords] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const started = useRef(0);
  const solver = useSolver();
  const hasDraft = puzzle.columnLetters.some(col => col.length > 0) || puzzle.blocks.some(row => row.some(Boolean));

  useEffect(() => {
    const save = () => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(puzzle)); setStorageError(false); } catch { setStorageError(true); } };
    const id = setTimeout(save, 300);
    window.addEventListener('pagehide', save);
    return () => { clearTimeout(id); window.removeEventListener('pagehide', save); };
  }, [puzzle]);
  useEffect(() => {
    if (step === 'solving' && !solver.running && (solver.report || solver.error)) setStep('results');
  }, [step, solver.running, solver.report, solver.error]);
  useEffect(() => {
    if (!solver.running) return;
    const id = setInterval(() => setElapsed((performance.now() - started.current) / 1000), 200);
    return () => clearInterval(id);
  }, [solver.running]);
  const solve = (options: SearchOptions) => {
    if (!solver.solve(puzzle, options)) return;
    setLastOptions(options); started.current = performance.now(); setElapsed(0); setNotice(''); setStep('solving');
  };
  const newPuzzle = () => { setStep('setup'); setNotice(''); };
  const importPuzzle = async (file: File) => {
    try {
      if (file.size > 2_000_000) throw new Error('Puzzle files must be smaller than 2 MB.');
      const imported = parsePuzzle(JSON.parse(await file.text())); setPuzzle(imported); setStep('grid'); setNotice('Puzzle imported. Check the grid and known letters before searching.');
    } catch (e) { setNotice(e instanceof SyntaxError ? 'Could not read that puzzle.' : e instanceof Error ? e.message : 'Could not read that puzzle.'); }
  };

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white"><RefreshCw size={21} /></div><div><h1 className="text-lg font-bold tracking-tight">{t('Drop Quote Solver', 'Dropquote 求解器')}</h1><p className="text-xs text-slate-500">{t('Read · constrain · solve', '识图 · 设置约束 · 求解')}</p></div></div>
        <div className="flex max-w-full flex-wrap items-center gap-3 sm:gap-4">
          <span className={`flex items-center gap-1.5 text-xs ${solver.ready ? 'text-emerald-700' : 'text-slate-500'}`}>{solver.ready ? <CheckCircle2 size={14} /> : <Loader2 size={14} className="animate-spin" />}{solver.ready ? t(`${solver.wordCount.toLocaleString()} words · local dictionary`, `${solver.wordCount.toLocaleString()} 个词 · 本地词典`) : solver.error ? t('Dictionary unavailable', '词典不可用') : t('Loading dictionary…', '正在加载词典…')}</span>
          <LanguageSelect />
          <button className="btn-secondary" aria-label={t('Save puzzle', '保存题目')} title={t('Save puzzle', '保存题目')} onClick={() => download('dropquote-puzzle.json', JSON.stringify(puzzle, null, 2))}><Download size={14} /><span className="hidden sm:inline">{t('Save puzzle', '保存题目')}</span></button>
        </div>
      </div>
    </header>
    <main className="px-3 py-4 sm:px-6">
      {(notice || storageError) && <div className="mx-auto mb-4 flex max-w-6xl items-start justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900" role="status"><span>{notice ? localize(notice) : t('Local saving is unavailable. Use Save puzzle to download a copy.', '本地保存不可用，请使用“保存题目”下载副本。')}</span><button aria-label={t('Dismiss notice', '关闭提示')} onClick={() => setNotice('')}><X size={16} /></button></div>}
      {solver.error && <div className="error-box mx-auto mb-4 max-w-6xl" role="alert">{localize(solver.error)} {!solver.ready && <button className="ml-3 underline" onClick={solver.retry}>{t('Retry dictionary', '重新加载词典')}</button>}</div>}
      {step === 'setup' && <Setup initialRows={puzzle.rows} initialCols={puzzle.cols} hasDraft={hasDraft} onResume={() => setStep('grid')} onImport={importPuzzle} onExample={() => { setPuzzle(puzzleFromText(EXAMPLE_TEXT, 12)); setStep('grid'); setNotice('Example puzzle loaded. Find quotes to try the new search.'); }} onNext={(rows, cols) => { setPuzzle(createPuzzle(rows, cols)); setStep('letters'); setNotice(''); }} />}
      {step === 'letters' && <InputLetters puzzle={puzzle} onChange={setPuzzle} onNext={() => setStep('grid')} onBack={newPuzzle} />}
      {step === 'grid' && <GridEditor puzzle={puzzle} onChange={setPuzzle} onBack={() => setStep('letters')} onNext={solve} ready={solver.ready} options={lastOptions} onOptionsChange={setLastOptions} customWords={customWords} onCustomWordsChange={setCustomWords} />}
      {step === 'solving' && <section className="panel mx-auto mt-10 max-w-xl p-8 text-center">
        <Loader2 className="mx-auto h-10 w-10 animate-spin text-blue-600" />
        <h2 className="mt-5 text-xl font-bold">{solver.progress?.phase === 'indexing' ? t('Checking word candidates…', '正在检查单词候选…') : t('Searching for complete quotes…', '正在搜索完整答案…')}</h2>
        <p className="mt-3 text-sm text-slate-600">{t(`${elapsed.toFixed(1)} s · ${(solver.progress?.nodesVisited ?? 0).toLocaleString()} nodes explored`, `${elapsed.toFixed(1)} 秒 · 已搜索 ${(solver.progress?.nodesVisited ?? 0).toLocaleString()} 个节点`)}</p>
        <p className="mt-2 text-sm text-slate-600">{t(`${(solver.progress?.solutionsFound ?? 0).toLocaleString()} completed candidates evaluated`, `已评估 ${(solver.progress?.solutionsFound ?? 0).toLocaleString()} 个完整候选`)}</p>
        <p className="mt-4 text-xs leading-relaxed text-slate-500">{t(`Search budget: ${Number(lastOptions.timeLimitMs ?? 30000) / 1000} seconds. The page stays interactive while searching. Limits return the best candidates found; Cancel stops immediately and returns to editing.`, `搜索时限：${Number(lastOptions.timeLimitMs ?? 30000) / 1000} 秒。搜索期间仍可操作页面；达到上限时返回当前最佳候选，取消则立即停止并返回编辑。`)}</p>
        <button className="btn-secondary mx-auto mt-6" onClick={() => { solver.cancel(); setStep('grid'); setNotice('Search cancelled. You can edit the puzzle and start again.'); }}><Square size={14} /> {t('Cancel search', '取消搜索')}</button>
      </section>}
      {step === 'results' && solver.report && <Results report={solver.report} puzzle={puzzle} onEdit={() => setStep('grid')} onNew={newPuzzle} canSearchLonger={solver.ready && ((lastOptions.timeLimitMs ?? 30000) < 120000 || (lastOptions.maxNodes ?? 1000000) < 5000000)} onAgain={() => solve({ ...lastOptions, timeLimitMs: nextSearchSeconds((lastOptions.timeLimitMs ?? 30000) / 1000) * 1000, maxNodes: nextSearchNodes(lastOptions.maxNodes ?? 1000000) })} />}
      {step === 'results' && !solver.report && <div className="panel mx-auto max-w-xl p-6"><button className="btn-secondary" onClick={() => setStep('grid')}>{t('Back to puzzle', '返回题目')}</button></div>}
    </main>
    <footer className="mx-auto mt-10 max-w-6xl px-5 pb-6 text-xs leading-relaxed text-slate-500">{t('Your puzzle and images stay in this browser. OCR downloads its engine and English language data on first use. Word-frequency data:', '题目和图片均在浏览器本地处理。首次使用 OCR 时会下载识别引擎和英文字库。词频数据：')} <a className="underline" href="https://github.com/rspeer/wordfreq">wordfreq by Robyn Speer</a> (<a className="underline" href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>{t('). Additional vocabulary:', ')。补充词库：')} <a className="underline" href="https://github.com/wordnik/wordlist">Wordnik (MIT)</a>{t('. ', '。')}<a className="underline" href="https://github.com/lingfengcold/dropquote/tree/main/src/data">{t('Attribution and data licenses', '来源署名与数据许可')}</a>{t('.', '。')}</footer>
  </div>;
}

export default App;
