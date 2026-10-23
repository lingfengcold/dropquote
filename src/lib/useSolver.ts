import { useCallback, useEffect, useRef, useState } from 'react';
import type { Puzzle } from './puzzle';
import type { SolverProgress, SolverReport } from './solver';
import type { SearchOptions, SolverResponse } from './solverProtocol';

export function useSolver() {
  const worker = useRef<Worker | null>(null);
  const job = useRef(0);
  const [ready, setReady] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<SolverProgress | null>(null);
  const [report, setReport] = useState<SolverReport | null>(null);

  const startWorker = useCallback(() => {
    worker.current?.terminate();
    worker.current = null;
    setReady(false);
    setError(null);
    try {
      const next = new Worker(new URL('../workers/solver.worker.ts', import.meta.url), { type: 'module' });
      worker.current = next;
      next.onmessage = ({ data }: MessageEvent<SolverResponse>) => {
        if (worker.current !== next) return;
        if (data.type === 'ready') { setReady(true); setWordCount(data.wordCount); return; }
        if (data.type === 'error' && data.id === undefined) { setError(data.message); setReady(false); return; }
        if ('id' in data && data.id !== job.current) return;
        if (data.type === 'progress') setProgress(data.progress);
        if (data.type === 'result') { setReport(data.report); setProgress(data.report.stats); setRunning(false); }
        if (data.type === 'error') { setError(data.message); setRunning(false); }
      };
      next.onerror = () => {
        if (worker.current !== next) return;
        setError('The solver worker could not run. Retry loading it or check that the site assets are available.');
        setReady(false); setRunning(false);
        next.terminate(); worker.current = null;
      };
      next.postMessage({ type: 'init' });
    } catch (e) { setError(e instanceof Error ? e.message : 'Web Workers are unavailable in this browser.'); }
  }, []);

  useEffect(() => { startWorker(); return () => { worker.current?.terminate(); worker.current = null; }; }, [startWorker]);

  const solve = (puzzle: Puzzle, options: SearchOptions) => {
    if (!worker.current || !ready) { setError('The dictionary is still loading. Wait for it or retry loading.'); return false; }
    const id = ++job.current;
    setReport(null); setError(null); setRunning(true);
    setProgress({ phase: 'indexing', nodesVisited: 0, solutionsFound: 0, elapsedMs: 0 });
    worker.current.postMessage({ type: 'solve', id, puzzle, options });
    return true;
  };

  const cancel = () => {
    ++job.current;
    // A busy synchronous worker cannot process a cancel message; terminate it from the UI thread.
    worker.current?.terminate(); worker.current = null;
    setRunning(false); setProgress(null); setReport(null);
    startWorker();
  };

  return { ready, wordCount, running, error, progress, report, solve, cancel, retry: startWorker };
}
