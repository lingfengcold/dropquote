#!/usr/bin/env python3
"""Rebuild the bundled English lexicon, using only Python's standard library.

Usage: python scripts/build-lexicon.py [--source-dir /path/to/source-files]
Source files are downloaded only by this development script, never by the app.
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

REVISION = "42233e6c36ce792031bcccfa17cdd0cec9af5fa7"  # upstream v3.2 tag
FILES = {
    "large_en.msgpack.gz": ("wordfreq/data/large_en.msgpack.gz", "dffae8066b78dce0a6667cf5f58e567054f902674667090a7ac8a8a44628b05c"),
    "NOTICE.md": ("NOTICE.md", "d9b104dafe63886af55e7cea7484824e32e12d4e1f57f319923dd643b36d6b15"),
    "LICENSE.txt": ("LICENSE.txt", "8990c551671a51765c4dfe9428f3e1d58dc327f49aca346a32d28cc0fcc7aa88"),
}
OUTPUT = Path(__file__).resolve().parents[1] / "src" / "data"


def unpack_cbpack(data: bytes):
    """Decode the small MessagePack subset used by wordfreq's cBpack file.

    This avoids installing wordfreq (and its optional language dependencies) just
    to regenerate a single data asset. Unexpected structures fail explicitly.
    """
    position = 0

    def take(count: int) -> bytes:
        nonlocal position
        result = data[position:position + count]
        position += count
        if len(result) != count:
            raise ValueError("Truncated MessagePack source")
        return result

    def integer(count: int) -> int:
        return int.from_bytes(take(count), "big")

    def read():
        token = integer(1)
        if token < 0x80:
            return token
        if 0x80 <= token < 0x90:
            return {read(): read() for _ in range(token - 0x80)}
        if 0x90 <= token < 0xA0:
            return [read() for _ in range(token - 0x90)]
        if 0xA0 <= token < 0xC0:
            return take(token - 0xA0).decode("utf-8")
        if token in (0xCC, 0xCD, 0xCE):
            return integer({0xCC: 1, 0xCD: 2, 0xCE: 4}[token])
        if token in (0xD9, 0xDA, 0xDB):
            return take(integer({0xD9: 1, 0xDA: 2, 0xDB: 4}[token])).decode("utf-8")
        if token in (0xDC, 0xDD):
            return [read() for _ in range(integer(2 if token == 0xDC else 4))]
        raise ValueError(f"Unexpected MessagePack token: {token:#x}")

    result = read()
    if position != len(data) or result[0] != {"format": "cB", "version": 1}:
        raise ValueError("Unexpected cBpack source format")
    return result[1:]


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, help="Use/cache the three upstream source files in this directory")
    args = parser.parse_args()
    cache = args.source_dir or Path(tempfile.gettempdir()) / ("dropquote-wordfreq-" + REVISION)
    cache.mkdir(parents=True, exist_ok=True)
    sources = {}
    for name, (upstream_path, expected_hash) in FILES.items():
        target = cache / name
        if not target.exists():
            print(f"Downloading pinned wordfreq source: {name}")
            url = f"https://raw.githubusercontent.com/rspeer/wordfreq/{REVISION}/{upstream_path}"
            with urllib.request.urlopen(url, timeout=60) as response:
                source = response.read()
            if sha256(source) != expected_hash:
                raise ValueError(f"{name} checksum mismatch; no output files were written")
            target.write_bytes(source)
        sources[name] = target.read_bytes()
        if sha256(sources[name]) != expected_hash:
            raise ValueError(f"{name} checksum mismatch; no output files were written")

    packed = sources["large_en.msgpack.gz"]
    bins = unpack_cbpack(gzip.decompress(packed))
    # Bins are ordered by descending frequency; equal-frequency entries are
    # alphabetical. Keep the first occurrence after contraction normalization.
    words: dict[str, None] = {}
    for frequency_bin in bins:
        for source_word in frequency_bin:
            if not re.fullmatch(r"[a-zA-Z'\u2019]+", source_word):
                continue
            word = source_word.replace("'", "").replace("\u2019", "").upper()
            if word and (len(word) > 1 or word in {"A", "I", "O"}):
                words.setdefault(word, None)
    text = ("\n".join(words) + "\n").encode("ascii")
    buffer = io.BytesIO()
    with gzip.GzipFile(fileobj=buffer, mode="wb", filename="", mtime=0, compresslevel=9) as stream:
        stream.write(text)
    compressed = buffer.getvalue()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / "english-wordfreq.txt.gz").write_bytes(compressed)
    for name in ("NOTICE.md", "LICENSE.txt"):
        (OUTPUT / ("wordfreq-" + name)).write_bytes(sources[name])

    metadata = {
        "source": "wordfreq v3.2, large English frequency list",
        "author": "Robyn Speer",
        "license": "CC-BY-SA-4.0 (derived data); see README.md and wordfreq-NOTICE.md",
        "sourceUrl": f"https://github.com/rspeer/wordfreq/tree/{REVISION}",
        "sourceRevision": REVISION,
        "sourceFiles": {name: {"path": path, "sha256": digest} for name, (path, digest) in FILES.items()},
        "sourceDataSha256": sha256(packed),
        "normalization": "Uppercase ASCII words; remove apostrophes; single letters A/I/O only; deduplicate at highest frequency; preserve frequency order",
        "wordCount": len(words),
        "uncompressedBytes": len(text),
        "compressedBytes": len(compressed),
        "textSha256": sha256(text),
        "gzipSha256": sha256(compressed),
    }
    (OUTPUT / "lexicon-manifest.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"Bundled {len(words):,} ranked words; {len(text):,} bytes text / {len(compressed):,} bytes gzip")


if __name__ == "__main__":
    main()
