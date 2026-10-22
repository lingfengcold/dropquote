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
  const [selected, setSelected] = useState(0);
  const [copyStatus, setCopyStatus] = useState('');
  const result = report.results[selected];
  const complete = report.status === 'complete';
  return <section className="mx-auto mt-6 max-w-6xl">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div><p className="eyebrow">SEARCH RESULTS</p><h2 className="mt-1 text-2xl font-bold">{report.results.length ? `${report.results.length} best candidate${report.results.length === 1 ? '' : 's'}` : 'No complete candidates found'}</h2></div>
      <div className="flex flex-wrap gap-2"><button className="btn-secondary" onClick={onEdit}>Adjust puzzle</button>{!complete && <button className="btn-secondary" disabled={!canSearchLonger} title={canSearchLonger ? 'Restart with a larger search budget' : 'Maximum budget reached. Add known letters to narrow the search.'} onClick={onAgain}>Search longer</button>}<button className="btn-secondary" onClick={onNew}>New puzzle</button></div>
    </div>
    <div className={`mb-5 rounded-lg border px-4 py-3 text-sm ${complete ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`} role="status">
      {complete ? 'Search completed for this dictionary and these constraints.' : `${report.status === 'time-limit' ? 'Time limit' : 'Search effort limit'} reached. These are the best complete candidates found so far; more candidates may exist.`}
      <span className="mt-1 block text-xs sm:ml-2 sm:inline">{report.stats.nodesVisited.toLocaleString()} nodes · {(report.stats.elapsedMs / 1000).toFixed(1)} s · {report.stats.solutionsFound.toLocaleString()} completed candidates evaluated</span>
    </div>
    {!result ? <div className="panel p-7 text-sm leading-relaxed text-slate-600">{complete ? 'No dictionary solution fits every column and known letter. Check OCR results, black squares, or add missing names and unusual words.' : 'The search stopped before reaching a complete candidate. Add known letters, check the column counts, or increase the search budget.'} More ? increases ambiguity. Empty results after a limit do not prove the puzzle has no solution.</div> : <div className="grid gap-5 lg:grid-cols-[minmax(230px,320px)_minmax(0,1fr)]">
      <div className="panel max-h-[650px] overflow-y-auto p-2" aria-label="Ranked candidates">
        {report.results.map((candidate, index) => <button key={index} aria-pressed={selected === index} className={`mb-1 w-full rounded-lg border p-3 text-left ${index === selected ? 'border-blue-200 bg-blue-50' : 'border-transparent hover:bg-slate-50'}`} onClick={() => { setSelected(index); setCopyStatus(''); }}>
          <div className="mb-1 flex justify-between gap-2 text-xs font-semibold text-slate-500"><span>#{index + 1}</span><span>Score {candidate.score.toFixed(2)}</span></div>
          <p className="text-sm leading-relaxed text-slate-800">{candidate.validWords.join(' ')}</p>
        </button>)}
      </div>
      <article className="panel min-w-0 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-bold">Candidate #{selected + 1}</h3><div className="flex gap-2">
          <button className="btn-secondary" onClick={async () => { try { await navigator.clipboard.writeText(result.validWords.join(' ')); setCopyStatus('Copied'); } catch { setCopyStatus('Use Download text if clipboard access is blocked.'); } }}><Copy size={14} /> Copy quote</button>
          <button className="btn-secondary" onClick={() => download('dropquote-answer.txt', result.validWords.join(' '), 'text/plain')}><Download size={14} /> Text</button>
        </div></div>
        {copyStatus && <p className="mt-2 text-xs text-slate-500" role="status">{copyStatus}</p>}
        <p className="mt-4 text-lg font-medium leading-relaxed text-slate-800">{result.validWords.join(' ')}</p>
        <div className="mt-5 overflow-x-auto pb-2">
          <div className="grid w-max gap-px border-2 border-slate-800 bg-slate-300" style={{ gridTemplateColumns: `repeat(${puzzle.cols}, 30px)` }}>
            {result.grid.flatMap((row, r) => row.map((char, c) => <div key={`${r}-${c}`} className={`flex h-8 items-center justify-center font-mono text-sm font-bold ${puzzle.blocks[r][c] ? 'bg-slate-900' : puzzle.fixedLetters[r][c] ? 'bg-amber-50 text-amber-900' : 'bg-white'}`}>{puzzle.blocks[r][c] ? '' : char}</div>))}
          </div>
        </div>
        {(result.resolvedUnknowns ?? []).some(col => col.letters.length) && <div className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-900"><h4 className="font-semibold">Letters supplied for ?</h4><div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">{result.resolvedUnknowns.filter(col => col.letters.length).map(col => <span key={col.col}>Column {col.col + 1}: <strong className="font-mono">{col.letters.join(' ')}</strong></span>)}</div></div>}
        {(result.rareWords ?? []).length > 0 && <p className="mt-4 text-xs leading-relaxed text-slate-500">Less common words to review: {result.rareWords.join(', ')}.</p>}
        <p className="mt-4 text-xs leading-relaxed text-slate-500">Scores rank candidates for this puzzle using word frequency and neighboring words; they are not probabilities or a guarantee of the intended quote.</p>
      </article>
    </div>}
  </section>;
}

function App() {
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
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Could not read that puzzle.'); }
  };

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white"><RefreshCw size={21} /></div><div><h1 className="text-lg font-bold tracking-tight">Drop Quote Solver</h1><p className="text-xs text-slate-500">Read · constrain · solve</p></div></div>
        <div className="flex items-center gap-4">
          <span className={`flex items-center gap-1.5 text-xs ${solver.ready ? 'text-emerald-700' : 'text-slate-500'}`}>{solver.ready ? <CheckCircle2 size={14} /> : <Loader2 size={14} className="animate-spin" />}{solver.ready ? `${solver.wordCount.toLocaleString()} words · local dictionary` : solver.error ? 'Dictionary unavailable' : 'Loading dictionary…'}</span>
          <button className="btn-secondary" onClick={() => download('dropquote-puzzle.json', JSON.stringify(puzzle, null, 2))}><Download size={14} /><span className="hidden sm:inline">Save puzzle</span></button>
        </div>
      </div>
    </header>
    <main className="px-3 py-4 sm:px-6">
      {(notice || storageError) && <div className="mx-auto mb-4 flex max-w-6xl items-start justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900" role="status"><span>{notice || 'Local saving is unavailable. Use Save puzzle to download a copy.'}</span><button aria-label="Dismiss notice" onClick={() => setNotice('')}><X size={16} /></button></div>}
      {solver.error && <div className="error-box mx-auto mb-4 max-w-6xl" role="alert">{solver.error} {!solver.ready && <button className="ml-3 underline" onClick={solver.retry}>Retry dictionary</button>}</div>}
      {step === 'setup' && <Setup initialRows={puzzle.rows} initialCols={puzzle.cols} hasDraft={hasDraft} onResume={() => setStep('grid')} onImport={importPuzzle} onExample={() => { setPuzzle(puzzleFromText(EXAMPLE_TEXT, 12)); setStep('grid'); setNotice('Example puzzle loaded. Find quotes to try the new search.'); }} onNext={(rows, cols) => { setPuzzle(createPuzzle(rows, cols)); setStep('letters'); setNotice(''); }} />}
      {step === 'letters' && <InputLetters puzzle={puzzle} onChange={setPuzzle} onNext={() => setStep('grid')} onBack={newPuzzle} />}
      {step === 'grid' && <GridEditor puzzle={puzzle} onChange={setPuzzle} onBack={() => setStep('letters')} onNext={solve} ready={solver.ready} options={lastOptions} onOptionsChange={setLastOptions} customWords={customWords} onCustomWordsChange={setCustomWords} />}
      {step === 'solving' && <section className="panel mx-auto mt-10 max-w-xl p-8 text-center">
        <Loader2 className="mx-auto h-10 w-10 animate-spin text-blue-600" />
        <h2 className="mt-5 text-xl font-bold">{solver.progress?.phase === 'indexing' ? 'Checking word candidates…' : 'Searching for complete quotes…'}</h2>
        <p className="mt-3 text-sm text-slate-600">{elapsed.toFixed(1)} s · {(solver.progress?.nodesVisited ?? 0).toLocaleString()} nodes explored</p>
        <p className="mt-2 text-sm text-slate-600">{(solver.progress?.solutionsFound ?? 0).toLocaleString()} completed candidates evaluated</p>
        <p className="mt-4 text-xs leading-relaxed text-slate-500">Search budget: {Number(lastOptions.timeLimitMs ?? 30000) / 1000} seconds. The page stays interactive while searching. Limits return the best candidates found; Cancel stops immediately and returns to editing.</p>
        <button className="btn-secondary mx-auto mt-6" onClick={() => { solver.cancel(); setStep('grid'); setNotice('Search cancelled. You can edit the puzzle and start again.'); }}><Square size={14} /> Cancel search</button>
      </section>}
      {step === 'results' && solver.report && <Results report={solver.report} puzzle={puzzle} onEdit={() => setStep('grid')} onNew={newPuzzle} canSearchLonger={solver.ready && ((lastOptions.timeLimitMs ?? 30000) < 120000 || (lastOptions.maxNodes ?? 1000000) < 5000000)} onAgain={() => solve({ ...lastOptions, timeLimitMs: nextSearchSeconds((lastOptions.timeLimitMs ?? 30000) / 1000) * 1000, maxNodes: nextSearchNodes(lastOptions.maxNodes ?? 1000000) })} />}
      {step === 'results' && !solver.report && <div className="panel mx-auto max-w-xl p-6"><button className="btn-secondary" onClick={() => setStep('grid')}>Back to puzzle</button></div>}
    </main>
    <footer className="mx-auto mt-10 max-w-6xl px-5 pb-6 text-xs leading-relaxed text-slate-500">Your puzzle and images stay in this browser. OCR downloads its engine and English language data on first use. Word-frequency data: <a className="underline" href="https://github.com/rspeer/wordfreq">wordfreq by Robyn Speer</a> (<a className="underline" href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>); <a className="underline" href="https://github.com/lingfengcold/dropquote/tree/main/src/data">attribution and data license</a>.</footer>
  </div>;
}

export default App;
