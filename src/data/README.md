# Bundled English vocabulary and frequency order

`english-wordfreq.txt.gz` is a **derived data set licensed under
[Creative Commons Attribution-ShareAlike 4.0](https://creativecommons.org/licenses/by-sa/4.0/)**.
The complete license is included in `CC-BY-SA-4.0.txt`. This data license applies
to the derived vocabulary and its ranking, separately from the application's code.

Source: **wordfreq**, by **Robyn Speer**, the large English frequency list from
upstream tag `v3.2`, pinned to commit
[`42233e6c36ce792031bcccfa17cdd0cec9af5fa7`](https://github.com/rspeer/wordfreq/tree/42233e6c36ce792031bcccfa17cdd0cec9af5fa7).
The upstream attribution and license notices are preserved in
`wordfreq-NOTICE.md` and `wordfreq-LICENSE.txt`. Credit also goes to the
**SUBTLEX authors, including Marc Brysbaert and colleagues**; SUBTLEX remains
[freely available data](http://crr.ugent.be/programs-data/subtitle-frequencies).
Additional source acknowledgments include
[Google Books Ngram Viewer](https://books.google.com/ngrams), OpenSubtitles,
Wikipedia, the Leeds Internet Corpus and ParaCrawl, as described in the
unmodified upstream notice.

wordfreq estimates frequency across several text domains (including books,
subtitles, news, encyclopedic text and Internet text), rather than one website's
vocabulary. Its language data is a snapshot through approximately 2021. The
original data and methodology remain available from
[the wordfreq repository](https://github.com/rspeer/wordfreq).

## Changes made for Dropquote

- Keep ASCII English letter tokens, convert to uppercase, and remove apostrophes
  so contractions can fill letter-only puzzle grids (`DON'T` → `DONT`).
- Keep only `A`, `I` and `O` as single-letter entries. Retain two-letter words and
  abbreviations, names, inflections and rare words to avoid silently excluding
  puzzle answers.
- Deduplicate normalized forms at their highest observed source frequency.
- Preserve descending source frequency order. Source frequency ties retain the
  source's alphabetical ordering. No puzzle-specific word is manually promoted.
- Encode one word per line and gzip deterministically. There are no copied
  sentences, quotes or other passages of corpus text in this asset.

The resulting asset has **297,822 entries**, **2,466,090 uncompressed bytes** and
**1,215,048 gzip bytes**. `lexicon-manifest.json` records the source revision,
checksums, transformation and output sizes.

## General dictionary supplement (MIT)

Frequency data alone is not a complete dictionary. `english-wordnik-tail.txt.gz`
adds **98,554 unranked entries** from **Wordnik**, without artificially promoting
these uncommon words into the corpus frequency list. Its source is the
[Wordnik wordlist](https://github.com/wordnik/wordlist), file
`wordlist-20210729.txt`, pinned to commit
[`46e6215d0f90356afe9c8ba4be347e7e98cb425c`](https://github.com/wordnik/wordlist/tree/46e6215d0f90356afe9c8ba4be347e7e98cb425c).
**Copyright (c) 2020 Wordnik.** This separate dictionary supplement is available
under the **MIT License**, preserved in `wordnik-LICENSE.txt`.

The 198,422 quoted source entries are decoded, normalized to uppercase ASCII
letters with apostrophes and hyphens removed, and deduplicated. Single letters are
limited to A/I/O, as in the ranked layer. Words already in wordfreq are removed;
the remaining general vocabulary is sorted alphabetically, not by frequency.
The tail contains **1,042,139 uncompressed bytes** and **296,772 gzip bytes**.
`wordnik-manifest.json` records the source hashes, normalization, overlap
dependency and output hashes. This is a general dictionary supplement rather
than a list of special-cased puzzle answers.

Together, the layers provide **396,376 distinct entries**, including **297,822
corpus-ranked entries** and **98,554 dictionary-only entries**; compressed data
totals **1,511,820 bytes**. Their separate licenses and source notices are retained.

`loadLexicon()` decodes both compressed, inline Vite assets inside the solver
worker. It makes **no dictionary network request** and works with GitHub Pages
subdirectory deployment. `words` includes both layers; `rankedWords` includes
**only wordfreq's ranked entries**. Consumers must not sort or modify either in
place. The shared pure `mergeLexiconLayers` function is also used by integration
tests and benchmarks so they exercise the same dictionary as the browser.
This is a frequency prior, not a complete sentence language model: names and
abbreviations still occur in corpus data, and uncommon but correct answers remain
possible. Puzzle-specific extra vocabulary can be supplied separately.

## Adjacent-word context statistics

`english-context.json.gz` contains **494,612 directed pair scores**, derived
from **2,110,171 word tokens** in the 18 texts of NLTK's
[Project Gutenberg Selections](https://github.com/nltk/nltk_data/blob/550b6625bcef1f2abff2ff770a5a0d272c9c6b2a/packages/corpora/gutenberg.xml).
NLTK identifies this corpus as public domain. Its unmodified source notice,
including the authors and original distribution terms, is preserved in
`gutenberg-README.txt`. The source archive is pinned to `nltk_data` commit
`550b6625bcef1f2abff2ff770a5a0d272c9c6b2a`, with SHA-256
`2d3c3ab548c653944310f37f536443ec85d0a0ad855fcae217a0c9efdce2d611`.

The builder extracts uppercase ASCII word forms, removes internal apostrophes
and hyphens, and resets adjacent-word counting at `. ! ? ; :` and file boundaries.
It also aggregates pairs through four small, fixed function-word classes:
determiners (`@DET`), object pronouns (`@OBJ`), subject pronouns (`@SUBJ`) and
prepositions (`@PREP`). The complete memberships and individual source-file
hashes are recorded in `context-manifest.json`.

For a pair observed `c` times, its stored association score is:

```text
min(2.5, max(0, log10(c * tokenCount / (leftCount * rightCount)))) * c / (c + 4)
```

Pairs must occur at least once and reach 0.08 before rounding to three decimal
places. A single observation receives only one fifth of its unshrunk association
score. At runtime, the context bonus is twice the strongest of the direct score,
70% of a left-class score, or 70% of a right-class score. The bonus is bounded
by five. This supplies local statistical context without excluding uncommon or
previously unobserved word combinations. No puzzle-specific pairs are inserted.

The asset contains **439,477 word-pair scores** and **55,135 class-pair scores**,
occupying **10,301,989 uncompressed bytes** and **2,838,244 gzip bytes**. It stores
two-token statistical keys and numbers, with no copied sentences or quote list.
`contextModel.ts` is pure; loading and decompressing the bundled asset happens
separately inside the solver worker.

## Rebuilding

From the repository root, run:

```sh
python scripts/build-lexicon.py
python scripts/build-wordnik-tail.py
python scripts/build-context.py
```

Only Python 3's standard library is required. The scripts download the fixed
English frequency source (about 1.5 MB), Wordnik source (about 2.4 MB) and upstream
notices, verify every SHA-256 hash, and rewrite the derived assets and manifests.
Rebuild wordfreq first because the tail excludes its vocabulary. Temporary source
caches are used. For fully offline rebuilds, provide a directory with the original
`large_en.msgpack.gz`, `NOTICE.md` and `LICENSE.txt` files, and a second directory
with Wordnik's `wordlist-20210729.txt` and `LICENSE`:

```sh
python scripts/build-lexicon.py --source-dir /path/to/source-cache
python scripts/build-wordnik-tail.py --source-dir /path/to/wordnik-cache
```

The Wordnik builder also accepts `--proxy http://127.0.0.1:PORT` when source
downloads require a proxy. Rebuilding does not use the current upstream branch, an unpinned package, or the
network during normal application startup. Rebuilding with the same pinned inputs
reproduces the same data checksums. Tesseract's OCR model distribution is separate
from this vocabulary asset.

The context builder separately downloads the pinned 4.3 MB NLTK archive and
verifies its SHA-256 before writing any output. It uses only Python's standard
library and deterministically rewrites `english-context.json.gz`,
`context-manifest.json` and the preserved source README. An offline rebuild uses:

```sh
python scripts/build-context.py --source /path/to/gutenberg.zip
```
