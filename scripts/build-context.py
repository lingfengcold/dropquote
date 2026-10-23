#!/usr/bin/env python3
"""Rebuild corpus-derived adjacent-word scores with Python's standard library.

Usage: python scripts/build-context.py [--source /path/to/gutenberg.zip]
Only this development script downloads source material; the app uses its bundled
statistical asset. The pinned corpus contains 18 Project Gutenberg selections.
"""

import argparse
from collections import Counter
import gzip
import hashlib
import io
import json
import math
from pathlib import Path
import re
import tempfile
import urllib.request
import zipfile

REVISION = "550b6625bcef1f2abff2ff770a5a0d272c9c6b2a"
SOURCE_URL = (
    f"https://raw.githubusercontent.com/nltk/nltk_data/{REVISION}"
    "/packages/corpora/gutenberg.zip"
)
SOURCE_SHA256 = "2d3c3ab548c653944310f37f536443ec85d0a0ad855fcae217a0c9efdce2d611"
README_SHA256 = "0bbe8db0799fcc3bee6a1dedb20d84477519f4e3c99b1f3156e7ce42c8140fab"
OUTPUT = Path(__file__).resolve().parents[1] / "src" / "data"
CLASSES = {
    "@DET": "A AN THE THIS THAT THESE THOSE MY YOUR HIS HER ITS OUR THEIR".split(),
    "@OBJ": "ME YOU HIM HER IT US THEM".split(),
    "@SUBJ": "I YOU HE SHE IT WE THEY".split(),
    "@PREP": "AT BY FOR FROM IN INTO OF ON TO WITH WITHOUT".split(),
}
MIN_COUNT = 1
MIN_SCORE = 0.08
MAX_SCORE = 2.5
SHRINKAGE = 4
TOKEN_PATTERN = re.compile(r"[A-Za-z]+(?:['’-][A-Za-z]+)*|[.!?;:]")
BOUNDARIES = ".!?;:"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_source(path: Path | None) -> bytes:
    target = path or Path(tempfile.gettempdir()) / ("dropquote-gutenberg-" + SOURCE_SHA256 + ".zip")
    if not target.exists():
        if path is not None:
            raise FileNotFoundError(f"Source archive does not exist: {target}")
        print("Downloading pinned NLTK Gutenberg corpus")
        with urllib.request.urlopen(SOURCE_URL, timeout=60) as response:
            source = response.read()
        if sha256(source) != SOURCE_SHA256:
            raise ValueError("Source checksum mismatch; no output files were written")
        target.write_bytes(source)
    source = target.read_bytes()
    if sha256(source) != SOURCE_SHA256:
        raise ValueError("Source checksum mismatch; no output files were written")
    return source


def build(source: bytes) -> tuple[bytes, bytes, dict]:
    words: Counter[str] = Counter()
    pairs: Counter[str] = Counter()
    files = []
    with zipfile.ZipFile(io.BytesIO(source)) as archive:
        notice = archive.read("gutenberg/README")
        if sha256(notice) != README_SHA256:
            raise ValueError("Upstream README checksum mismatch")
        for path in archive.namelist():
            if not path.endswith(".txt"):
                continue
            body = archive.read(path)
            files.append({"path": path, "bytes": len(body), "sha256": sha256(body)})
            previous = None
            for match in TOKEN_PATTERN.finditer(body.decode("utf-8", errors="replace")):
                token = match.group()
                if token[0] in BOUNDARIES:
                    previous = None
                    continue
                word = re.sub("[^A-Z]", "", token.upper())
                words[word] += 1
                if previous:
                    pairs[previous + " " + word] += 1
                previous = word
    if len(files) != 18:
        raise ValueError("Expected exactly 18 texts in the pinned corpus")

    # Aggregate only the original word pairs: backoff classes do not recursively
    # feed into one another, and punctuation/file boundaries never form pairs.
    raw_pairs = list(pairs.items())
    token_count = sum(words.values())
    for category, members in CLASSES.items():
        words[category] = sum(words[word] for word in members)
        membership = set(members)
        for pair, count in raw_pairs:
            left, right = pair.split()
            if left in membership:
                pairs[category + " " + right] += count
            if right in membership:
                pairs[left + " " + category] += count

    scores = {}
    for pair, count in pairs.items():
        if count < MIN_COUNT:
            continue
        left, right = pair.split()
        lift = math.log10(count * token_count / (words[left] * words[right]))
        score = min(MAX_SCORE, max(0, lift)) * count / (count + SHRINKAGE)
        if score >= MIN_SCORE:
            scores[pair] = round(score, 3)
    text = json.dumps(scores, separators=(",", ":"), sort_keys=True).encode("ascii")
    metadata = {
        "source": "NLTK Project Gutenberg Selections, 18 texts",
        "sourceUrl": SOURCE_URL,
        "sourceRevision": REVISION,
        "sourceSha256": SOURCE_SHA256,
        "sourceBytes": len(source),
        "sourceLicense": "Public domain, as designated by NLTK; upstream README retained in gutenberg-README.txt",
        "sourceNoticeSha256": README_SHA256,
        "sourceFiles": files,
        "normalization": "ASCII letter words; uppercase; remove internal apostrophes/hyphens; reset adjacent pairs at . ! ? ; : and file boundaries",
        "classes": CLASSES,
        "formula": "min(2.5, max(0, log10(pairCount * tokenCount / (leftCount * rightCount)))) * pairCount / (pairCount + 4)",
        "minimumPairCount": MIN_COUNT,
        "minimumScoreBeforeRounding": MIN_SCORE,
        "scoreDecimalPlaces": 3,
        "maximumStoredScore": MAX_SCORE,
        "backoffWeight": 0.7,
        "contextWeight": 2,
        "tokenCount": token_count,
        "pairScoreCount": len(scores),
        "wordPairScoreCount": sum(not pair.startswith("@") and " @" not in pair for pair in scores),
        "classPairScoreCount": sum(pair.startswith("@") or " @" in pair for pair in scores),
        "uncompressedBytes": len(text),
        "textSha256": sha256(text),
    }
    return text, notice, metadata


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, help="Read the pinned gutenberg.zip archive offline")
    args = parser.parse_args()
    text, notice, metadata = build(read_source(args.source))
    buffer = io.BytesIO()
    with gzip.GzipFile(fileobj=buffer, mode="wb", filename="", mtime=0, compresslevel=9) as stream:
        stream.write(text)
    compressed = buffer.getvalue()
    metadata.update({"compressedBytes": len(compressed), "gzipSha256": sha256(compressed)})
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / "english-context.json.gz").write_bytes(compressed)
    (OUTPUT / "gutenberg-README.txt").write_bytes(notice)
    (OUTPUT / "context-manifest.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"Bundled {metadata['pairScoreCount']:,} pair scores from {metadata['tokenCount']:,} tokens; {len(text):,} bytes JSON / {len(compressed):,} bytes gzip")


if __name__ == "__main__":
    main()
