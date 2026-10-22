import { adjacentWordScore, LanguageModel, MAX_PAIR_SCORE, normalizeWord, type WordPrior } from './languageModel';

export interface GridCell {
  row: number;
  col: number;
  isBlock: boolean;
  char: string | null;
}

export interface SolverResult {
  grid: string[][];
  score: number;
  validWords: string[];
  text: string;
  rareWords: string[];
  resolvedUnknowns: { col: number; letters: string[] }[];
}

export interface WordSlot {
  cells: { r: number; c: number }[];
  index: number;
}

export interface SolverProgress {
  nodesVisited: number;
  solutionsFound: number;
  elapsedMs: number;
  phase: 'indexing' | 'searching';
  bestScore?: number;
}

export interface SolverOptions {
  timeLimitMs?: number;
  maxNodes?: number;
  maxResults?: number;
  fixedLetters?: (string | null)[][];
  customWords?: string[];
  onProgress?: (progress: SolverProgress) => void;
}

export interface SolverReport {
  results: SolverResult[];
  stats: SolverProgress;
  status: 'complete' | 'time-limit' | 'node-limit';
}

interface IndexedSlot extends WordSlot {
  columns: number[];
  fixed: (number | null)[];
}

// Compact, immutable sibling-linked tries avoid one Map object per prefix. A
// separate trie per length also prevents descending prefixes of the wrong length.
interface WordTrie {
  words: WordPrior[];
  firstChild: Int32Array;
  nextSibling: Int32Array;
  letter: Uint8Array;
  terminal: Int32Array;
}

const now = () => performance.now();
const compareWords = (a: WordPrior, b: WordPrior) => a.word < b.word ? -1 : a.word > b.word ? 1 : 0;
const comparePriors = (a: WordPrior, b: WordPrior) => b.score - a.score || compareWords(a, b);

function buildTrie(words: WordPrior[], shouldStop: () => boolean): WordTrie | null {
  const firstChild = [-1];
  const nextSibling = [-1];
  const letter = [26];
  const terminal = [-1];
  const lastChild = [-1];
  const stack = [0];
  let previous = '';
  for (let wordId = 0; wordId < words.length; wordId++) {
    if ((wordId & 255) === 0 && shouldStop()) return null;
    const word = words[wordId].word;
    let shared = 0;
    while (shared < previous.length && previous[shared] === word[shared]) shared++;
    let parent = stack[shared];
    for (let depth = shared; depth < word.length; depth++) {
      const node = letter.length;
      firstChild.push(-1);
      nextSibling.push(-1);
      letter.push(word.charCodeAt(depth) - 65);
      terminal.push(-1);
      lastChild.push(-1);
      if (firstChild[parent] === -1) firstChild[parent] = node;
      else nextSibling[lastChild[parent]] = node;
      lastChild[parent] = node;
      stack[depth + 1] = node;
      parent = node;
    }
    terminal[parent] = wordId;
    previous = word;
  }
  if (shouldStop()) return null;
  return { words, firstChild: Int32Array.from(firstChild), nextSibling: Int32Array.from(nextSibling), letter: Uint8Array.from(letter), terminal: Int32Array.from(terminal) };
}

export class DropQuoteSolver {
  private byLength = new Map<number, WordPrior[]>();
  private tries = new Map<number, WordTrie>();
  private language: LanguageModel;

  constructor(dictionaryWords: string[], commonWords: Set<string> | string[] = new Set()) {
    this.language = new LanguageModel(commonWords);
    const seen = new Set<string>();
    for (const value of [...dictionaryWords, 'A', 'I']) {
      const word = normalizeWord(value);
      if (!word || seen.has(word)) continue;
      seen.add(word);
      const bucket = this.byLength.get(word.length) ?? [];
      bucket.push(this.language.prior(word));
      this.byLength.set(word.length, bucket);
    }
    for (const bucket of this.byLength.values()) bucket.sort(compareWords);
  }

  solve(rows: number, cols: number, columnLetters: string[][], blocks: boolean[][], options: SolverOptions = {}): SolverReport {
    const started = now();
    const timeLimit = options.timeLimitMs ?? 10_000;
    const maxNodes = options.maxNodes ?? 1_000_000;
    const maxResults = options.maxResults ?? 50;
    if (!Number.isFinite(timeLimit) || timeLimit < 0) throw new Error('timeLimitMs must be a finite, nonnegative number.');
    if (!Number.isSafeInteger(maxNodes) || maxNodes < 0) throw new Error('maxNodes must be a nonnegative integer.');
    if (!Number.isSafeInteger(maxResults) || maxResults < 1) throw new Error('maxResults must be a positive integer.');
    if (!Number.isSafeInteger(rows) || !Number.isSafeInteger(cols) || rows < 1 || cols < 1) throw new Error('Grid rows and columns must be positive integers.');
    if (blocks.length !== rows || blocks.some(row => row.length !== cols || row.some(cell => typeof cell !== 'boolean'))) throw new Error('Block grid dimensions must match rows and columns.');
    if (columnLetters.length !== cols || columnLetters.some(column => !Array.isArray(column))) throw new Error('Provide exactly one letter list per column.');
    const fixed = options.fixedLetters;
    if (fixed && (fixed.length !== rows || fixed.some(row => row.length !== cols))) throw new Error('Fixed-letter grid dimensions must match the puzzle.');

    const original = new Int32Array(cols * 26);
    const originalUnknowns = new Int32Array(cols);
    const fixedDemand = new Int32Array(cols * 26);
    const slots: IndexedSlot[] = [];
    let cells: { r: number; c: number }[] = [];
    let fixedCodes: (number | null)[] = [];
    const finishSlot = () => {
      if (!cells.length) return;
      slots.push({ cells, index: slots.length, columns: cells.map(cell => cell.c), fixed: fixedCodes });
      cells = [];
      fixedCodes = [];
    };
    for (let col = 0; col < cols; col++) {
      let count = 0;
      for (const value of columnLetters[col]) {
        if (typeof value !== 'string') throw new Error(`Column ${col + 1} contains an invalid letter.`);
        const char = value.trim().toUpperCase();
        if (!char) continue;
        if (char === '?') originalUnknowns[col]++;
        else if (/^[A-Z]$/.test(char)) original[col * 26 + char.charCodeAt(0) - 65]++;
        else throw new Error(`Column ${col + 1}: use single A–Z letters or ? for missing letters.`);
        count++;
      }
      const needed = blocks.reduce((total, row) => total + (row[col] ? 0 : 1), 0);
      if (count !== needed) throw new Error(`Column ${col + 1} has ${count} letters, but ${needed} open cells. Add ? for each missing letter.`);
    }
    // Reading order is a continuous stream: a row boundary does not end a word.
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const value = fixed?.[r][c];
        const char = typeof value === 'string' ? value.trim().toUpperCase() : '';
        if (char && char !== '?' && !/^[A-Z]$/.test(char)) throw new Error(`Invalid fixed letter at row ${r + 1}, column ${c + 1}.`);
        if (blocks[r][c]) {
          if (char && char !== '?') throw new Error(`A block cannot have a fixed letter (row ${r + 1}, column ${c + 1}).`);
          finishSlot();
        } else {
          const code = char && char !== '?' ? char.charCodeAt(0) - 65 : null;
          cells.push({ r, c });
          fixedCodes.push(code);
          if (code !== null) fixedDemand[c * 26 + code]++;
        }
      }
    }
    finishSlot();
    for (let c = 0; c < cols; c++) {
      let deficit = 0;
      for (let code = 0; code < 26; code++) deficit += Math.max(0, fixedDemand[c * 26 + code] - original[c * 26 + code]);
      if (deficit > originalUnknowns[c]) throw new Error(`Fixed letters exceed the available letters and ? in column ${c + 1}.`);
    }

    const results: SolverResult[] = [];
    let status: SolverReport['status'] = 'complete';
    let phase: SolverProgress['phase'] = 'indexing';
    let nodesVisited = 0;
    let solutionsFound = 0;
    let lastProgress = -Infinity;
    const progress = (): SolverProgress => ({ nodesVisited, solutionsFound, elapsedMs: Math.max(0, now() - started), phase, ...(results.length ? { bestScore: results[0].score } : {}) });
    const reportProgress = (force = false) => {
      if (options.onProgress && (force || now() - lastProgress >= 100)) {
        lastProgress = now();
        options.onProgress(progress());
      }
    };
    const timeExpired = () => {
      if (status !== 'complete') return true;
      if (now() - started >= timeLimit) { status = 'time-limit'; return true; }
      reportProgress();
      return false;
    };
    const nodeLimitReached = () => {
      if (timeExpired()) return true;
      if (nodesVisited >= maxNodes) { status = 'node-limit'; return true; }
      return false;
    };
    reportProgress(true);
    const finish = (): SolverReport => {
      reportProgress(true);
      return { results, stats: progress(), status };
    };
    if (nodeLimitReached()) return finish();

    const customByLength = new Map<number, Map<string, WordPrior>>();
    for (const value of options.customWords ?? []) {
      const word = normalizeWord(value);
      if (!word) throw new Error(`Invalid custom word: ${value}. Use letters, apostrophes or hyphens.`);
      const bucket = customByLength.get(word.length) ?? new Map<string, WordPrior>();
      bucket.set(word, this.language.prior(word, true));
      customByLength.set(word.length, bucket);
    }
    const neededTries = new Map<number, WordTrie>();
    for (const slot of slots) {
      const length = slot.cells.length;
      if (neededTries.has(length)) continue;
      let trie = customByLength.has(length) ? undefined : this.tries.get(length);
      if (!trie) {
        let words = this.byLength.get(length) ?? [];
        const custom = customByLength.get(length);
        if (custom) words = [...new Map([...words.map(word => [word.word, word] as const), ...custom]).values()].sort(compareWords);
        if (!words.length) return finish();
        const built = buildTrie(words, timeExpired);
        if (!built) return finish();
        trie = built;
        if (!custom) this.tries.set(length, trie);
      }
      neededTries.set(length, trie);
    }

    const available = original.slice();
    const unknowns = originalUnknowns.slice();
    const domains: WordPrior[][] = [];
    const domainCache = new Map<string, WordPrior[]>();
    let prefixChecks = 0;
    for (const slot of slots) {
      const domainKey = slot.columns.map((col, index) => `${col}:${slot.fixed[index] ?? ''}`).join('|');
      const cachedDomain = domainCache.get(domainKey);
      if (cachedDomain) { domains.push(cachedDomain); continue; }
      const trie = neededTries.get(slot.cells.length)!;
      const domain: WordPrior[] = [];
      const visitPrefix = (parent: number, depth: number) => {
        if ((prefixChecks++ & 255) === 0 && timeExpired()) return;
        if (depth === slot.cells.length) {
          const id = trie.terminal[parent];
          if (id !== -1) domain.push(trie.words[id]);
          return;
        }
        const col = slot.columns[depth];
        const locked = slot.fixed[depth];
        for (let node = trie.firstChild[parent]; node !== -1; node = trie.nextSibling[node]) {
          const code = trie.letter[node];
          if (locked !== null && locked !== code) continue;
          const key = col * 26 + code;
          const useUnknown = available[key] === 0;
          if (useUnknown && unknowns[col] === 0) continue;
          if (useUnknown) unknowns[col]--; else available[key]--;
          visitPrefix(node, depth + 1);
          if (useUnknown) unknowns[col]++; else available[key]++;
          if (status !== 'complete') return;
        }
      };
      visitPrefix(0, 0);
      if (status !== 'complete') return finish();
      if (!domain.length) return finish();
      domain.sort(comparePriors);
      domains.push(domain);
      domainCache.set(domainKey, domain);
      if (timeExpired()) return finish();
    }

    phase = 'searching';
    reportProgress(true);
    const assigned: (WordPrior | null)[] = slots.map(() => null);
    const scratch = new Int32Array(original.length);
    const stamps = new Float64Array(original.length);
    const deficits = new Int32Array(cols);
    const deficitStamps = new Float64Array(cols);
    const maxUsage = new Int32Array(original.length);
    const usageKeys: number[] = [];
    const actualLetterKeys: number[] = [];
    for (let key = 0; key < original.length; key++) if (original[key]) actualLetterKeys.push(key);
    let stamp = 0;
    const scratchKeys: number[] = [];
    const fits = (word: string, slot: IndexedSlot): boolean => {
      stamp++;
      scratchKeys.length = 0;
      for (let i = 0; i < slot.columns.length; i++) {
        const col = slot.columns[i];
        const key = col * 26 + word.charCodeAt(i) - 65;
        if (stamps[key] !== stamp) {
          stamps[key] = stamp;
          scratch[key] = 0;
          scratchKeys.push(key);
        }
        scratch[key]++;
        if (scratch[key] > available[key]) {
          if (deficitStamps[col] !== stamp) { deficitStamps[col] = stamp; deficits[col] = 0; }
          if (++deficits[col] > unknowns[col]) return false;
        }
      }
      return true;
    };

    // Filter every remaining slot after consuming a word. Besides empty-domain
    // pruning, aggregate per-slot maxima check that every real letter can still
    // occur somewhere. This also handles a word crossing the same column twice.
    const propagate = (previous: WordPrior[][]): WordPrior[][] | null => {
      const next = previous.slice();
      const support = new Int32Array(original.length);
      let checks = 0;
      for (let index = 0; index < slots.length; index++) {
        if (assigned[index]) continue;
        const slot = slots[index];
        const filtered: WordPrior[] = [];
        usageKeys.length = 0;
        for (const candidate of previous[index]) {
          if ((checks++ & 255) === 0 && timeExpired()) {
            for (const key of usageKeys) maxUsage[key] = 0;
            return null;
          }
          if (!fits(candidate.word, slot)) continue;
          filtered.push(candidate);
          for (const key of scratchKeys) {
            if (maxUsage[key] === 0) usageKeys.push(key);
            if (scratch[key] > maxUsage[key]) maxUsage[key] = scratch[key];
          }
        }
        if (!filtered.length) return null;
        next[index] = filtered.length === previous[index].length ? previous[index] : filtered;
        for (const key of usageKeys) { support[key] += maxUsage[key]; maxUsage[key] = 0; }
      }
      for (const key of actualLetterKeys) if (available[key] > support[key]) return null;
      return next;
    };

    const saveResult = (score: number) => {
      solutionsFound++;
      if (results.length >= maxResults && score < results[results.length - 1].score) return;
      const grid = Array.from({ length: rows }, () => Array<string>(cols).fill(''));
      const words = assigned.map(word => word!.word);
      const used = new Int32Array(original.length);
      for (const slot of slots) {
        const word = words[slot.index];
        slot.cells.forEach(({ r, c }, index) => {
          grid[r][c] = word[index];
          used[c * 26 + word.charCodeAt(index) - 65]++;
        });
      }
      const resolvedUnknowns: SolverResult['resolvedUnknowns'] = [];
      for (let col = 0; col < cols; col++) {
        if (!originalUnknowns[col]) continue;
        const letters: string[] = [];
        for (let code = 0; code < 26; code++) {
          for (let n = original[col * 26 + code]; n < used[col * 26 + code]; n++) letters.push(String.fromCharCode(code + 65));
        }
        resolvedUnknowns.push({ col, letters });
      }
      const result = { grid, score, validWords: words, text: words.join(' '), rareWords: assigned.filter(word => word!.rare).map(word => word!.word), resolvedUnknowns };
      let low = 0;
      let high = results.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        const other = results[middle];
        if (other.score > score || (other.score === score && other.text < result.text)) low = middle + 1;
        else high = middle;
      }
      results.splice(low, 0, result);
      if (results.length > maxResults) results.pop();
    };

    const contextualScore = (candidate: WordPrior, index: number) => candidate.score
      + (index > 0 && assigned[index - 1] ? adjacentWordScore(assigned[index - 1]!.word, candidate.word) : 0)
      + (index + 1 < slots.length && assigned[index + 1] ? adjacentWordScore(candidate.word, assigned[index + 1]!.word) : 0);

    const consume = (index: number, candidate: WordPrior): number[] => {
      const consumed: number[] = [];
      const slot = slots[index];
      for (let i = 0; i < slot.columns.length; i++) {
        const col = slot.columns[i];
        const key = col * 26 + candidate.word.charCodeAt(i) - 65;
        if (available[key] > 0) { available[key]--; consumed.push(key); }
        else { unknowns[col]--; consumed.push(-col - 1); }
      }
      assigned[index] = candidate;
      return consumed;
    };
    const undo = (index: number, consumed: number[]) => {
      assigned[index] = null;
      for (const key of consumed) {
        if (key < 0) unknowns[-key - 1]++;
        else available[key]++;
      }
    };

    const search = (remaining: number, currentDomains: WordPrior[][], score: number) => {
      if (remaining === 0) { saveResult(score); return; }
      if (nodeLimitReached()) return;
      const forced: { index: number; consumed: number[] }[] = [];
      try {
        // Thousands of locked or forced one-letter slots form an iterative batch,
        // not thousands of recursive stack frames or full-domain copies.
        while (true) {
          let added = 0;
          for (let index = 0; index < slots.length; index++) {
            if (assigned[index] || currentDomains[index].length !== 1) continue;
            if (nodeLimitReached()) return;
            nodesVisited++;
            const candidate = currentDomains[index][0];
            if (!fits(candidate.word, slots[index])) return;
            score += contextualScore(candidate, index);
            forced.push({ index, consumed: consume(index, candidate) });
            remaining--;
            added++;
          }
          if (!added) break;
          if (remaining === 0) { saveResult(score); return; }
          const nextDomains = propagate(currentDomains);
          if (!nextDomains) return;
          currentDomains = nextDomains;
        }
        let chosen = -1;
        let upperBound = score;
        for (let index = 0; index < slots.length; index++) {
          if (!assigned[index]) {
            if (chosen === -1 || currentDomains[index].length < currentDomains[chosen].length
              || (currentDomains[index].length === currentDomains[chosen].length && slots[index].cells.length > slots[chosen].cells.length)) chosen = index;
            upperBound += currentDomains[index][0].score;
          }
          if (index > 0 && (!assigned[index - 1] || !assigned[index])) upperBound += MAX_PAIR_SCORE;
        }
        if (results.length >= maxResults && upperBound < results[results.length - 1].score) return;
        const slot = slots[chosen];
        // Domains retain frequency order for upper bounds. A small local copy may
        // prioritize contextual matches without changing those immutable domains.
        let candidates = currentDomains[chosen];
        if (candidates.length <= 2_000 && ((chosen > 0 && assigned[chosen - 1]) || assigned[chosen + 1])) {
          candidates = candidates.slice().sort((a, b) => contextualScore(b, chosen) - contextualScore(a, chosen) || compareWords(a, b));
        }
        for (const candidate of candidates) {
          if (nodeLimitReached()) return;
          nodesVisited++;
          if (!fits(candidate.word, slot)) continue;
          const nextScore = score + contextualScore(candidate, chosen);
          const consumed = consume(chosen, candidate);
          if (remaining === 1) search(0, currentDomains, nextScore);
          else {
            const nextDomains = propagate(currentDomains);
            if (nextDomains) search(remaining - 1, nextDomains, nextScore);
          }
          undo(chosen, consumed);
          if (status !== 'complete') return;
        }
      } finally {
        for (let index = forced.length - 1; index >= 0; index--) undo(forced[index].index, forced[index].consumed);
      }
    };
    const initialDomains = propagate(domains);
    if (initialDomains) search(slots.length, initialDomains, 0);
    if (timeExpired()) return finish();
    return finish();
  }
}
