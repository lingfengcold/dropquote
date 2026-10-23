#!/usr/bin/env python3
"""Generate the unranked dictionary layer from the pinned MIT Wordnik wordlist.

Run after build-lexicon.py. Only words absent from the ranked wordfreq layer are
included. --source-dir permits an offline rebuild; --proxy is optional.
"""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import tempfile
import urllib.request

REVISION = "46e6215d0f90356afe9c8ba4be347e7e98cb425c"
FILES = {
    "wordlist-20210729.txt": "bfd1b4eb4ade1ba81e84c7e24248b9a1aecec9d9baa427453b367a83e30e0451",
    "LICENSE": "a568f0ac4c7ad5248ff748387d41e39519811b4a3e07d7438c9d1465dd4c9339",
}
OUTPUT = Path(__file__).resolve().parents[1] / "src" / "data"


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, help="Use/cache wordlist-20210729.txt and LICENSE in this directory")
    parser.add_argument("--proxy", help="Optional HTTP proxy URL used only when downloading source files")
    args = parser.parse_args()
    cache = args.source_dir or Path(tempfile.gettempdir()) / ("dropquote-wordnik-" + REVISION)
    cache.mkdir(parents=True, exist_ok=True)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({"http": args.proxy, "https": args.proxy})) if args.proxy else urllib.request.build_opener()
    sources = {}
    for name, checksum in FILES.items():
        path = cache / name
        if not path.exists():
            print(f"Downloading pinned Wordnik source: {name}")
            url = f"https://raw.githubusercontent.com/wordnik/wordlist/{REVISION}/{name}"
            with opener.open(url, timeout=45) as response:
                content = response.read()
            if digest(content) != checksum:
                raise ValueError(f"{name} checksum mismatch; no output files were written")
            path.write_bytes(content)
        sources[name] = path.read_bytes()
        if digest(sources[name]) != checksum:
            raise ValueError(f"{name} checksum mismatch; no output files were written")

    ranked_bytes = gzip.decompress((OUTPUT / "english-wordfreq.txt.gz").read_bytes())
    ranked = set(ranked_bytes.decode("ascii").splitlines())
    lines = sources["wordlist-20210729.txt"].decode("utf-8").splitlines()
    normalized = set()
    for line in lines:
        word = json.loads(line)
        if not isinstance(word, str) or not re.fullmatch(r"[a-zA-Z'\u2019-]+", word):
            continue
        word = word.upper().replace("'", "").replace("\u2019", "").replace("-", "")
        if word and (len(word) > 1 or word in {"A", "I", "O"}):
            normalized.add(word)
    extra = sorted(normalized - ranked)
    text = ("\n".join(extra) + "\n").encode("ascii")
    buffer = io.BytesIO()
    with gzip.GzipFile(fileobj=buffer, mode="wb", filename="", mtime=0, compresslevel=9) as stream:
        stream.write(text)
    compressed = buffer.getvalue()
    metadata = {
        "source": "Wordnik wordlist-20210729.txt",
        "author": "Wordnik",
        "license": "MIT",
        "sourceUrl": f"https://github.com/wordnik/wordlist/tree/{REVISION}",
        "sourceRevision": REVISION,
        "sourceFiles": {name: {"sha256": checksum} for name, checksum in FILES.items()},
        "sourceEntryCount": len(lines),
        "normalizedEntryCount": len(normalized),
        "wordfreqTextSha256": digest(ranked_bytes),
        "normalization": "Uppercase ASCII letters; remove apostrophes and hyphens; single letters A/I/O only; deduplicate; retain words absent from wordfreq; sort alphabetically; do not assign frequency ranks",
        "wordCount": len(extra),
        "combinedWordCount": len(ranked) + len(extra),
        "uncompressedBytes": len(text),
        "compressedBytes": len(compressed),
        "textSha256": digest(text),
        "gzipSha256": digest(compressed),
    }
    (OUTPUT / "english-wordnik-tail.txt.gz").write_bytes(compressed)
    (OUTPUT / "wordnik-LICENSE.txt").write_bytes(sources["LICENSE"])
    (OUTPUT / "wordnik-manifest.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"Bundled {len(extra):,} unranked tail words; {len(compressed):,} gzip bytes; {metadata['combinedWordCount']:,} total words")


if __name__ == "__main__":
    main()
