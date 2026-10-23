import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import { mergeLexiconLayers, parseLexiconText } from '../src/data/lexiconParse.ts';

const dataDirectory = new URL('../src/data/', import.meta.url);
const compressed = readFileSync(new URL('english-wordfreq.txt.gz', dataDirectory));
const textBytes = gunzipSync(compressed);
const words = parseLexiconText(textBytes.toString('utf8'));
const ranks = new Map(words.map((word, index) => [word, index]));
const manifest = JSON.parse(readFileSync(new URL('lexicon-manifest.json', dataDirectory), 'utf8'));
const digest = (value: Buffer) => createHash('sha256').update(value).digest('hex');
const tailCompressed = readFileSync(new URL('english-wordnik-tail.txt.gz', dataDirectory));
const tailBytes = gunzipSync(tailCompressed);
const tail = parseLexiconText(tailBytes.toString('utf8'));
const tailManifest = JSON.parse(readFileSync(new URL('wordnik-manifest.json', dataDirectory), 'utf8'));

test('bundled dictionary is complete and matches its documented source-derived checksum', () => {
  assert.equal(words.length, manifest.wordCount);
  assert.ok(words.length > 250_000, 'a truncated or tiny fallback cannot silently replace the dictionary');
  assert.equal(compressed.length, manifest.compressedBytes);
  assert.equal(textBytes.length, manifest.uncompressedBytes);
  assert.equal(digest(compressed), manifest.gzipSha256);
  assert.equal(digest(textBytes), manifest.textSha256);
  assert.equal(ranks.size, words.length, 'normalized vocabulary must be unique');
  assert.deepEqual(words.slice(0, 5), ['THE', 'TO', 'AND', 'OF', 'A']);
});

test('natural-language ranks do not promote obscure words above common quote vocabulary', () => {
  for (const word of ['IS', 'ONLY', 'WASTREL', 'INHERITANCE', 'EXHAUST', 'EXPERIENCES',
    'SAVINGS', 'MISER', 'WISDOM', 'ADVERSITY', 'CONTROLLED', 'REACT']) {
    assert.ok(ranks.has(word), `missing quote word: ${word}`);
  }
  for (const common of ['THE', 'IS', 'ONLY', 'LOVE', 'LIVE', 'HAPPINESS', 'WISDOM', 'SAVINGS']) {
    assert.ok(ranks.get(common)! < ranks.get('MISER')!, `${common} must outrank MISER`);
    assert.ok(ranks.get(common)! < ranks.get('WASTREL')!, `${common} must outrank WASTREL`);
  }
});

test('the general Wordnik supplement adds dictionary coverage without fabricated frequency ranks', () => {
  assert.equal(tail.length, tailManifest.wordCount);
  assert.ok(tail.length > 90_000, 'the supplement must remain a general dictionary rather than a few hardcoded answers');
  assert.equal(tailCompressed.length, tailManifest.compressedBytes);
  assert.equal(tailBytes.length, tailManifest.uncompressedBytes);
  assert.equal(digest(tailCompressed), tailManifest.gzipSha256);
  assert.equal(digest(tailBytes), tailManifest.textSha256);
  assert.equal(digest(textBytes), tailManifest.wordfreqTextSha256);
  assert.equal(new Set(tail).size, tail.length);
  assert.ok(tail.every(word => !ranks.has(word)), 'frequency and dictionary-only layers must not overlap');
  for (const word of ['TASTEABLE', 'NOSEGUARD']) assert.ok(tail.includes(word));
  const combined = mergeLexiconLayers(words, tail);
  assert.equal(combined.words.length, tailManifest.combinedWordCount);
  assert.equal(combined.words.length, words.length + tail.length);
  assert.equal(combined.rankedWords, words);
  assert.ok(!combined.rankedWords.includes('TASTEABLE'));
  assert.ok(!combined.rankedWords.includes('NOSEGUARD'));
});

test('merging layers preserves source order, handles duplicate entries and leaves input arrays unchanged', () => {
  const ranked = ['THE', 'CAT'];
  const extra = ['CAT', 'QUIZZICAL'];
  assert.deepEqual(mergeLexiconLayers(ranked, extra), { words: ['THE', 'CAT', 'QUIZZICAL'], rankedWords: ['THE', 'CAT'] });
  assert.deepEqual(ranked, ['THE', 'CAT']);
  assert.deepEqual(extra, ['CAT', 'QUIZZICAL']);
});

test('letter-only contractions and normal short words remain available', () => {
  for (const word of ['A', 'I', 'O', 'DONT', 'CANT', 'IM', 'TV', 'OK', 'US', 'UK']) {
    assert.ok(ranks.has(word), `missing normalized word: ${word}`);
  }
  assert.ok(words.every((word) => /^[A-Z]+$/.test(word)));
  assert.deepEqual(words.filter((word) => word.length === 1).sort(), ['A', 'I', 'O']);
});

test('lexicon text parser handles line endings and reports corrupted data', () => {
  assert.deepEqual(parseLexiconText('THE\r\nCAT\r\n'), ['THE', 'CAT']);
  assert.throws(() => parseLexiconText(''));
  assert.throws(() => parseLexiconText('THE\nCORRUPT3D\n'));
});
