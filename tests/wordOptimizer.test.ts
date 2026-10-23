import test from 'node:test';
import assert from 'node:assert/strict';
import loadHighs, { type Highs, type ModelData } from 'highs';
import { createWordOptimizer, type WordOptimizerInput } from '../src/lib/wordOptimizer.ts';
import type { WordPrior } from '../src/lib/languageModel.ts';

const highs = await loadHighs();
const word = (value: string, score = 1): WordPrior => ({ word: value, score, rare: false });
const counts = (columns: string[]) => {
  const result = new Int32Array(columns.length * 26);
  columns.forEach((letters, column) => { for (const letter of letters) result[column * 26 + letter.charCodeAt(0) - 65]++; });
  return result;
};
const base = (overrides: Partial<WordOptimizerInput> = {}): WordOptimizerInput => ({
  domains: [[word('AB'), word('CD')], [word('AB'), word('CD')]],
  columns: [[0, 1], [0, 1]], counts: counts(['AC', 'BD']), unknowns: new Int32Array(2),
  scorePair: () => 0, maxResults: 2, getBudget: () => ({ timeLimitMs: 5_000, maxNodes: 1_000 }),
  onSolution: () => {}, ...overrides,
});

test('optimizer preserves exact column multiplicities and enumerates a second distinct candidate', () => {
  const found: string[] = [];
  const report = createWordOptimizer(highs)(base({
    scorePair: (left, right) => left === 'AB' && right === 'CD' ? 3 : -2,
    onSolution: candidates => found.push(candidates.map(candidate => candidate.word).join(' ')),
  }));
  assert.deepEqual(found, ['AB CD', 'CD AB']);
  assert.equal(report.status, 'partial');
});

test('positive and negative adjacent scores are both enforced by pair variables', () => {
  const found: string[] = [];
  createWordOptimizer(highs)(base({
    domains: [[word('A'), word('I')], [word('A'), word('I')]], columns: [[0], [1]],
    counts: counts(['', '']), unknowns: new Int32Array([1, 1]),
    scorePair: (left, right) => left === right ? -10 : left === 'A' ? 2 : 0,
    onSolution: candidates => found.push(candidates.map(candidate => candidate.word).join(' ')),
  }));
  assert.deepEqual(found, ['A I', 'I A']);
});

test('wildcards remain in their own columns and repeated positions aggregate coefficients', () => {
  const found: string[] = [];
  createWordOptimizer(highs)(base({
    domains: [[word('AAA', 100), word('ABB', 2), word('AAB', 1)]], columns: [[0, 0, 1]],
    counts: counts(['A', 'B']), unknowns: new Int32Array([1, 0]),
    onSolution: candidates => found.push(candidates[0].word),
  }));
  assert.deepEqual(found, ['ABB', 'AAB']);
});

test('zero time or node budgets stop before constructing or solving a model', () => {
  let emitted = false;
  const optimize = createWordOptimizer(highs);
  assert.equal(optimize(base({ getBudget: () => ({ timeLimitMs: 0, maxNodes: 10 }), onSolution: () => { emitted = true; } })).status, 'time-limit');
  assert.equal(optimize(base({ getBudget: () => ({ timeLimitMs: 100, maxNodes: 0 }), onSolution: () => { emitted = true; } })).status, 'node-limit');
  assert.equal(emitted, false);
});

test('a verified optimum completes a top-1 request when no domain was truncated', () => {
  const found: string[] = [];
  const report = createWordOptimizer(highs)(base({
    maxResults: 1, scorePair: (left, right) => left === 'AB' && right === 'CD' ? 3 : 0,
    onSolution: candidates => found.push(candidates.map(candidate => candidate.word).join(' ')),
  }));
  assert.deepEqual(found, ['AB CD']);
  assert.equal(report.status, 'complete');
});

test('stage node limits share one global allowance and absent primal buffers are never read', () => {
  const limits: number[] = [];
  const progress: number[] = [];
  let disposed = 0;
  let readSolution = false;
  const fake = {
    constants: highs.constants, infinity: highs.infinity,
    createModel(_data: ModelData) {
      let nodeLimit = 0;
      let used = 0;
      return {
        options: { set(options: Record<string, unknown>) { if ('mip_max_nodes' in options) { nodeLimit = Number(options.mip_max_nodes); limits.push(nodeLimit); } } },
        zeroAllClocks() {}, run() { used = Math.min(3, nodeLimit); },
        info: { get(name: string) { return name === 'mip_node_count' ? BigInt(used) : 0; } },
        getModelStatus() { return used < 3 ? highs.constants.modelStatus.iterationLimit : highs.constants.modelStatus.optimal; },
        getSolution() { readSolution = true; throw new Error('No primal solution was proved.'); },
        dispose() { disposed++; },
      };
    },
  } as unknown as Highs;
  const words = Array.from({ length: 101 }, (_, index) => word(`A${String.fromCharCode(65 + Math.floor(index / 26), 65 + index % 26)}`));
  const report = createWordOptimizer(fake)(base({
    domains: [words], columns: [[0, 1, 2]], counts: counts(['', '', '']), unknowns: new Int32Array([1, 1, 1]),
    maxResults: 1, getBudget: () => ({ timeLimitMs: 5_000, maxNodes: 5 }),
    onProgress: nodes => progress.push(nodes),
  }));
  assert.deepEqual(limits, [5, 2]);
  assert.deepEqual(progress, [3, 5]);
  assert.equal(report.nodesVisited, 5);
  assert.equal(report.status, 'node-limit');
  assert.equal(readSolution, false);
  assert.equal(disposed, 2);
});

test('joined hypotheses are left for exhaustive search and do not claim optimizer completeness', () => {
  const found: string[] = [];
  const report = createWordOptimizer(highs)(base({
    domains: [[word('AB'), { ...word('AB', 20), joinedFrom: ['A', 'B'] }]], columns: [[0, 1]],
    counts: counts(['A', 'B']), unknowns: new Int32Array(2), maxResults: 1,
    onSolution: candidates => { assert.equal(candidates[0].joinedFrom, undefined); found.push(candidates[0].word); },
  }));
  assert.deepEqual(found, ['AB']);
  assert.equal(report.status, 'partial');
});
