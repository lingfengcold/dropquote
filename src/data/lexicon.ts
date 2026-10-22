import compressedLexiconUrl from './english-wordfreq.txt.gz?inline';
import { parseLexiconText } from './lexiconParse';

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
  // ?inline puts the compressed asset in the worker as a data URI. Decoding it
  // directly keeps dictionary availability independent of GitHub/raw or fetch.
  const separator = compressedLexiconUrl.indexOf(',');
  if (separator < 0 || !compressedLexiconUrl.slice(0, separator).endsWith(';base64')) {
    throw new Error('内置词库资源格式不正确。');
  }
  const binary = atob(compressedLexiconUrl.slice(separator + 1));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const words = parseLexiconText(await new Response(stream).text());
  // All entries have genuine corpus ranks, including rare vocabulary. Keeping
  // these aliases avoids duplicating a large array in every solver worker.
  return { words, rankedWords: words };
}
