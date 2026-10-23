import type { Highs, ModelData } from 'highs';
import type { WordPrior } from './languageModel';

export interface WordOptimizerBudget {
  /** Remaining time and nodes in the caller's global search budget. */
  timeLimitMs: number;
  maxNodes: number;
}

export interface WordOptimizerInput {
  domains: WordPrior[][];
  columns: number[][];
  counts: Int32Array;
  unknowns: Int32Array;
  scorePair: (left: string, right: string) => number;
  maxResults: number;
  getBudget: () => WordOptimizerBudget;
  onSolution: (candidates: WordPrior[]) => void;
  /** Cumulative nodes used by this invocation, rather than the current stage. */
  onProgress?: (nodes: number) => void;
}

export interface WordOptimizerReport {
  nodesVisited: number;
  status: 'complete' | 'partial' | 'time-limit' | 'node-limit';
}

export type WordOptimizer = (input: WordOptimizerInput) => WordOptimizerReport;

// This is a bounded source of good incumbent solutions. The exhaustive solver
// still considers the complete dictionary, including joined-word hypotheses.
const DOMAIN_CAPS = [100, 300];
const MAX_VARIABLES = 150_000;
const MAX_NONZEROS = 1_000_000;
const MAX_PAIR_CHECKS = 3_000_000;
const EPSILON = 1e-5;

export function createWordOptimizer(highs: Highs): WordOptimizer {
  return input => {
    const started = performance.now();
    const firstBudget = input.getBudget();
    const deadline = started + Math.max(0, firstBudget.timeLimitMs);
    const initialNodeLimit = Math.max(0, firstBudget.maxNodes);
    let nodesVisited = 0;
    let status: WordOptimizerReport['status'] = 'partial';
    let operations = 0;
    let guardedOut = false;
    const seen = new Set<string>();
    const budget = () => {
      const remaining = input.getBudget();
      return {
        timeLimitMs: Math.min(deadline - performance.now(), remaining.timeLimitMs),
        maxNodes: Math.min(initialNodeLimit - nodesVisited, remaining.maxNodes),
      };
    };
    const checkBudget = () => {
      const remaining = budget();
      if (remaining.timeLimitMs <= 0) { status = 'time-limit'; return false; }
      if (remaining.maxNodes <= 0) { status = 'node-limit'; return false; }
      return true;
    };
    const guard = () => (++operations & 255) !== 0 || checkBudget();
    const finish = (): WordOptimizerReport => ({ nodesVisited, status });
    if (!checkBudget()) return finish();
    if (!input.domains.length || input.columns.length !== input.domains.length
      || input.counts.length !== input.unknowns.length * 26 || input.maxResults < 1) return finish();

    const slotsPerColumn = new Int32Array(input.unknowns.length);
    for (const columnList of input.columns) {
      for (const column of columnList) {
        if (!Number.isInteger(column) || column < 0 || column >= slotsPerColumn.length || !guard()) return finish();
        slotsPerColumn[column]++;
      }
    }
    for (let column = 0; column < slotsPerColumn.length; column++) {
      let supplied = input.unknowns[column];
      if (supplied < 0) return finish();
      for (let code = 0; code < 26; code++) {
        const count = input.counts[column * 26 + code];
        if (count < 0) return finish();
        supplied += count;
      }
      if (supplied !== slotsPerColumn[column]) return finish();
    }

    const ordinaryDomains: WordPrior[][] = [];
    let excludedJoined = false;
    for (let slot = 0; slot < input.domains.length; slot++) {
      const candidates: WordPrior[] = [];
      for (const candidate of input.domains[slot]) {
        if (!guard()) return finish();
        if (candidate.joinedFrom) { excludedJoined = true; continue; }
        if (candidate.word.length !== input.columns[slot].length || !/^[A-Z]+$/.test(candidate.word)
          || !Number.isFinite(candidate.score)) return finish();
        candidates.push(candidate);
      }
      if (!candidates.length) return finish();
      candidates.sort((a, b) => b.score - a.score || a.word.localeCompare(b.word));
      ordinaryDomains.push(candidates);
    }

    for (const cap of DOMAIN_CAPS) {
      if (!checkBudget()) break;
      const domains = ordinaryDomains.map(domain => domain.slice(0, cap));
      const truncated = excludedJoined || ordinaryDomains.some(domain => domain.length > cap);
      const costs: number[] = [];
      const columnRows: number[][] = [];
      const columnValues: number[][] = [];
      const variableWords: { slot: number; candidate: WordPrior }[] = [];
      const slotVariables: number[][] = [];
      const lower: number[] = Array(input.domains.length).fill(1);
      const upper: number[] = Array(input.domains.length).fill(1);
      const letterRows = new Int32Array(input.counts.length).fill(-1);
      let nonzeros = 0;
      const addEntry = (variable: number, row: number, value: number) => {
        columnRows[variable].push(row);
        columnValues[variable].push(value);
        nonzeros++;
      };
      const addVariable = (score: number) => {
        const variable = costs.length;
        costs.push(score); columnRows.push([]); columnValues.push([]);
        return variable;
      };
      for (let key = 0; key < input.counts.length; key++) {
        // With no wildcard, even a zero count must prohibit that letter. With
        // wildcards, the fixed total plus real-letter lower bounds is exact.
        if (!input.counts[key] && input.unknowns[Math.floor(key / 26)]) continue;
        letterRows[key] = lower.length;
        lower.push(input.counts[key]);
        upper.push(input.unknowns[Math.floor(key / 26)] ? highs.infinity : input.counts[key]);
      }
      for (let slot = 0; slot < domains.length; slot++) {
        const variables: number[] = [];
        for (const candidate of domains[slot]) {
          if (!guard()) return finish();
          const variable = addVariable(candidate.score);
          variableWords.push({ slot, candidate });
          variables.push(variable);
          addEntry(variable, slot, 1);
          const usage = new Map<number, number>();
          for (let position = 0; position < candidate.word.length; position++) {
            if (!guard()) return finish();
            const key = input.columns[slot][position] * 26 + candidate.word.charCodeAt(position) - 65;
            usage.set(key, (usage.get(key) ?? 0) + 1);
          }
          for (const [key, count] of usage) if (letterRows[key] >= 0) addEntry(variable, letterRows[key], count);
          if (costs.length > MAX_VARIABLES || nonzeros > MAX_NONZEROS) { guardedOut = true; break; }
        }
        slotVariables.push(variables);
        if (guardedOut) break;
      }
      if (guardedOut) break;
      const wordVariableCount = costs.length;
      let pairChecks = 0;
      for (let slot = 0; slot + 1 < domains.length && !guardedOut; slot++) {
        for (const left of slotVariables[slot]) {
          for (const right of slotVariables[slot + 1]) {
            if (!guard()) return finish();
            if (++pairChecks > MAX_PAIR_CHECKS) { guardedOut = true; break; }
            const score = input.scorePair(variableWords[left].candidate.word, variableWords[right].candidate.word);
            if (!Number.isFinite(score)) { guardedOut = true; break; }
            if (!score) continue;
            const pair = addVariable(score);
            const row = lower.length;
            if (score > 0) {
              lower.push(-highs.infinity, -highs.infinity); upper.push(0, 0);
              addEntry(pair, row, 1); addEntry(left, row, -1);
              addEntry(pair, row + 1, 1); addEntry(right, row + 1, -1);
            } else {
              lower.push(-1); upper.push(highs.infinity);
              addEntry(pair, row, 1); addEntry(left, row, -1); addEntry(right, row, -1);
            }
            if (costs.length > MAX_VARIABLES || nonzeros > MAX_NONZEROS) { guardedOut = true; break; }
          }
          if (guardedOut) break;
        }
      }
      if (guardedOut || !checkBudget()) break;

      const starts = new Int32Array(costs.length + 1);
      const indices = new Int32Array(nonzeros);
      const values = new Float64Array(nonzeros);
      let offset = 0;
      for (let variable = 0; variable < costs.length; variable++) {
        if (!guard()) return finish();
        starts[variable] = offset;
        indices.set(columnRows[variable], offset);
        values.set(columnValues[variable], offset);
        offset += columnRows[variable].length;
      }
      starts[costs.length] = offset;
      const integrality = new Int32Array(costs.length);
      integrality.fill(highs.constants.variableType.integer, 0, wordVariableCount);
      const modelData: ModelData = {
        numCols: costs.length, numRows: lower.length,
        sense: highs.constants.objectiveSense.maximize,
        colCost: Float64Array.from(costs), colLower: new Float64Array(costs.length),
        colUpper: new Float64Array(costs.length).fill(1),
        rowLower: Float64Array.from(lower), rowUpper: Float64Array.from(upper), integrality,
        matrix: { format: 'csc', numCols: costs.length, numRows: lower.length, starts, indices, values },
      };
      if (!checkBudget()) break;
      const model = highs.createModel(modelData);
      let stageOptimal = false;
      try {
        model.options.set({ output_flag: false, mip_rel_gap: 0, mip_abs_gap: 0 });
        for (let solutionIndex = 0; solutionIndex < Math.min(2, input.maxResults); solutionIndex++) {
          if (!checkBudget()) break;
          const remaining = budget();
          model.zeroAllClocks();
          model.options.set({
            time_limit: Math.max(0, remaining.timeLimitMs / 1_000),
            mip_max_nodes: Math.min(2_147_483_647, Math.floor(remaining.maxNodes)),
          });
          let runNodes = 0;
          let interruptedFor: 'time-limit' | 'node-limit' | undefined;
          model.run({
            [highs.constants.callbackType.mipInterrupt](event) {
              runNodes = Math.max(runNodes, Number(event.data.mip_node_count ?? 0));
              input.onProgress?.(nodesVisited + runNodes);
              const current = input.getBudget();
              if (performance.now() >= deadline || current.timeLimitMs <= 0) interruptedFor = 'time-limit';
              else if (nodesVisited + runNodes >= initialNodeLimit || current.maxNodes <= 0) interruptedFor = 'node-limit';
              if (interruptedFor) event.interrupt();
            },
          });
          runNodes = Math.max(runNodes, Number(model.info.get('mip_node_count')));
          nodesVisited += runNodes;
          input.onProgress?.(nodesVisited);
          const modelStatus = model.getModelStatus();
          stageOptimal = modelStatus === highs.constants.modelStatus.optimal;
          // getSolution() can return buffers without a valid primal solution.
          // Require the native feasibility flag and independently check counts.
          if (model.info.get('primal_solution_status') === highs.constants.solutionStatus.feasible) {
            const primal = model.getSolution().colValue;
            const selected: number[] = [];
            const candidates: WordPrior[] = [];
            let valid = true;
            for (const variables of slotVariables) {
              let chosen = -1;
              let sum = 0;
              for (const variable of variables) {
                const value = primal[variable];
                if (!Number.isFinite(value) || Math.abs(value - Math.round(value)) > EPSILON || value < -EPSILON || value > 1 + EPSILON) { valid = false; break; }
                sum += value;
                if (value > 0.5) { if (chosen !== -1) { valid = false; break; } chosen = variable; }
              }
              if (!valid || chosen === -1 || Math.abs(sum - 1) > EPSILON) { valid = false; break; }
              selected.push(chosen); candidates.push(variableWords[chosen].candidate);
            }
            const usage = new Int32Array(input.counts.length);
            if (valid) {
              candidates.forEach((candidate, slot) => {
                for (let position = 0; position < candidate.word.length; position++) usage[input.columns[slot][position] * 26 + candidate.word.charCodeAt(position) - 65]++;
              });
              for (let column = 0; column < input.unknowns.length; column++) {
                let deficit = 0;
                for (let code = 0; code < 26; code++) {
                  const key = column * 26 + code;
                  if (usage[key] < input.counts[key]) valid = false;
                  deficit += Math.max(0, usage[key] - input.counts[key]);
                }
                if (deficit !== input.unknowns[column]) valid = false;
              }
            }
            if (valid) {
              const key = candidates.map(candidate => candidate.word).join(' ');
              if (!seen.has(key)) { seen.add(key); input.onSolution(candidates); }
              model.addRow(-highs.infinity, selected.length - 1, { indices: Int32Array.from(selected), values: new Float64Array(selected.length).fill(1) });
            } else stageOptimal = false;
          } else stageOptimal = false;
          if (interruptedFor) status = interruptedFor;
          else if (modelStatus === highs.constants.modelStatus.timeLimit) status = 'time-limit';
          else if (modelStatus === highs.constants.modelStatus.iterationLimit && budget().maxNodes <= 0) status = 'node-limit';
          if (status === 'time-limit' || status === 'node-limit' || !stageOptimal) break;
        }
      } finally {
        model.dispose();
      }
      if (status === 'time-limit' || status === 'node-limit') break;
      // Only top-1 can be complete after one optimum. Wider result requests are
      // incumbent seeding; exhaustive search must establish their completeness.
      if (!truncated && stageOptimal && input.maxResults === 1) status = 'complete';
      if (ordinaryDomains.every(domain => domain.length <= cap)) break;
    }
    return finish();
  };
}
