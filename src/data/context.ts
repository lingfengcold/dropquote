import compressedContextUrl from './english-context.json.gz?inline';
import { decodeInlineText } from './lexicon';
import { createContextScore, type ContextData } from '../lib/contextModel';

export async function loadContextScore() {
  const data = JSON.parse(await decodeInlineText(compressedContextUrl)) as ContextData;
  return createContextScore(data);
}
