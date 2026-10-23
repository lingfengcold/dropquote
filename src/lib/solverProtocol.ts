import type { Puzzle } from './puzzle';
import type { SolverOptions, SolverProgress, SolverReport } from './solver';

export type SearchOptions = Omit<SolverOptions, 'onProgress' | 'fixedLetters'>;
export type SolverRequest = { type: 'init' } | { type: 'solve'; id: number; puzzle: Puzzle; options: SearchOptions };
export type SolverResponse =
  | { type: 'ready'; wordCount: number }
  | { type: 'progress'; id: number; progress: SolverProgress }
  | { type: 'result'; id: number; report: SolverReport }
  | { type: 'error'; id?: number; message: string };
