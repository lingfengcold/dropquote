import compressedLexiconUrl from './english-wordfreq.txt.gz?inline';
import compressedTailUrl from './english-wordnik-tail.txt.gz?inline';
import { mergeLexiconLayers, parseLexiconText } from './lexiconParse';

export interface LexiconData {
  words: string[];
  rankedWords: string[];
}

let cached: Promise<LexiconData> | undefined;

/** Load the bundled frequency list inside the solver worker, without a network request. */
export function loadLexicon(): Promise<LexiconData> {
  if (!cached) {
    cached = decodeBundledLexicon().catch((error: unknown) => {
      cached = undefined;
      throw error;
    });
  }
  return cached;
}

async function decodeBundledLexicon(): Promise<LexiconData> {
  const [rankedWords, extraWords] = await Promise.all([
    decodeInlineAsset(compressedLexiconUrl), decodeInlineAsset(compressedTailUrl),
  ]);
  return mergeLexiconLayers(rankedWords, extraWords);
}

async function decodeInlineAsset(url: string): Promise<string[]> {
  // ?inline puts the compressed asset in the worker as a data URI. Decoding it
  // directly keeps dictionary availability independent of GitHub/raw or fetch.
  const separator = url.indexOf(',');
  if (separator < 0 || !url.slice(0, separator).endsWith(';base64')) {
    throw new Error('内置词库资源格式不正确。');
  }
  const binary = atob(url.slice(separator + 1));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return parseLexiconText(await new Response(stream).text());
}
