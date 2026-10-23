/** Pure decoder, separated from Vite asset imports for validation and tests. */
export function parseLexiconText(text: string): string[] {
  const words = text.trim().split(/\r?\n/);
  if (words.length < 1 || words.some((word) => !/^[A-Z]+$/.test(word))) {
    throw new Error('内置词库数据损坏，请重新加载页面。');
  }
  return words;
}

/** Supplement dictionary coverage without inventing corpus ranks for rare words. */
export function mergeLexiconLayers(rankedWords: string[], extraWords: string[]): { words: string[]; rankedWords: string[] } {
  return { words: [...new Set([...rankedWords, ...extraWords])], rankedWords };
}
