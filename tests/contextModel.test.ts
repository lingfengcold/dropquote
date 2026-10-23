import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import { createContextScore, MAX_CONTEXT_SCORE } from '../src/lib/contextModel.ts';

test('context uses directed observed pairs and falls back to zero', () => {
  const score = createContextScore({ 'BLUE SKY': 1.2 });
  assert.equal(score('BLUE', 'SKY'), 2.4);
  assert.equal(score('SKY', 'BLUE'), 0);
  assert.equal(score('BLUE', 'OCEAN'), 0);
});

test('class backoff shares evidence but chooses the strongest signal without adding it twice', () => {
  const score = createContextScore({
    'HER BOOK': 0.3,
    '@DET BOOK': 1.5,
    '@OBJ BOOK': 1,
    'SAW @OBJ': 0.8,
    'SAW @DET': 0.2,
    'THE SKY': 2,
    '@DET SKY': 1,
    '@SUBJ WALKED': 0.9,
    'WAITED @PREP': 0.7,
  });
  assert.equal(score('HER', 'BOOK'), 2 * 0.7 * 1.5);
  assert.equal(score('SAW', 'HER'), 2 * 0.7 * 0.8);
  assert.equal(score('THE', 'SKY'), 4);
  assert.equal(score('THEY', 'WALKED'), 2 * 0.7 * 0.9);
  assert.equal(score('WAITED', 'WITH'), 2 * 0.7 * 0.7);
  assert.equal(score('UNKNOWN', 'BOOK'), 0);
});

test('corpus score cap leaves a valid upper bound for search', () => {
  const score = createContextScore({ 'BLUE SKY': 2.5, '@DET BOOK': 2.5 });
  assert.equal(score('BLUE', 'SKY'), MAX_CONTEXT_SCORE);
  assert.ok(score('HIS', 'BOOK') <= MAX_CONTEXT_SCORE);
});

test('bundled context data matches its reproducible manifest and contains bounded statistics', () => {
  const directory = new URL('../src/data/', import.meta.url);
  const compressed = readFileSync(new URL('english-context.json.gz', directory));
  const bytes = gunzipSync(compressed);
  const data = JSON.parse(bytes.toString('utf8')) as Record<string, number>;
  const manifest = JSON.parse(readFileSync(new URL('context-manifest.json', directory), 'utf8'));
  const digest = (value: Buffer) => createHash('sha256').update(value).digest('hex');
  assert.equal(compressed.length, manifest.compressedBytes);
  assert.equal(bytes.length, manifest.uncompressedBytes);
  assert.equal(digest(compressed), manifest.gzipSha256);
  assert.equal(digest(bytes), manifest.textSha256);
  assert.equal(Object.keys(data).length, manifest.pairScoreCount);
  assert.equal(manifest.sourceFiles.length, 18);
  assert.ok(manifest.wordPairScoreCount > 50_000);
  assert.ok(manifest.classPairScoreCount > 5_000);
  assert.equal(digest(readFileSync(new URL('gutenberg-README.txt', directory))), manifest.sourceNoticeSha256);
  assert.ok(Object.entries(data).every(([key, value]) => /^(?:[A-Z]+|@(?:DET|OBJ|SUBJ|PREP)) (?:[A-Z]+|@(?:DET|OBJ|SUBJ|PREP))$/.test(key) && Number.isFinite(value) && value >= 0.08 && value <= MAX_CONTEXT_SCORE / 2));
});
