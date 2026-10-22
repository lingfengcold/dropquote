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

`loadLexicon()` decodes the compressed, inline Vite asset inside the solver
worker. It makes **no dictionary network request** and works with GitHub Pages
subdirectory deployment. Both `words` and `rankedWords` refer to the same array in
descending frequency order. Consumers must not sort or modify it in place.
This is a frequency prior, not a complete sentence language model: names and
abbreviations still occur in corpus data, and uncommon but correct answers remain
possible. Puzzle-specific extra vocabulary can be supplied separately.

## Rebuilding

From the repository root, run:

```sh
python scripts/build-lexicon.py
```

Only Python 3's standard library is required. This development script downloads
the fixed English source (about 1.5 MB) and upstream notices, verifies every
SHA-256 hash, and rewrites the derived asset and manifest. It uses a temporary
source cache. For a fully offline rebuild, supply a directory containing the
original `large_en.msgpack.gz`, `NOTICE.md` and `LICENSE.txt` files:

```sh
python scripts/build-lexicon.py --source-dir /path/to/source-cache
```

Rebuilding does not use the current upstream branch, an unpinned package, or the
network during normal application startup. Rebuilding with the same pinned inputs
reproduces the same data checksums. Tesseract's OCR model distribution is separate
from this vocabulary asset.
