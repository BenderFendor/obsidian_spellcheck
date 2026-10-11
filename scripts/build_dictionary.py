#!/usr/bin/env python3
"""Deterministically build the offline spelling supplement from versioned sources.

No third-party Python dependencies. A normal build never resolves "latest": every
input URL and SHA-256 must match the committed lockfile. --refresh updates source
pins/digests intentionally. The checked-in output is used at plugin runtime.
"""
from __future__ import annotations

import argparse
from collections import Counter
from contextlib import closing
from datetime import date
import gzip
from hashlib import sha256
from html.parser import HTMLParser
import io
import json
from pathlib import Path
import re
import shutil
import tempfile
from urllib.parse import urljoin
from urllib.request import Request, urlopen

USER_AGENT = "ObsidianSpellcheckDictionaryBot/1.0 (https://github.com/BenderFendor/obsidian_spellcheck)"


def open_source(url: str, timeout: int = 30):
    return urlopen(Request(url, headers={"User-Agent": USER_AGENT}), timeout=timeout)


ROOT = Path(__file__).resolve().parent.parent
LOCK = ROOT / "src/data/dictionary-sources.json"
OUTPUT = ROOT / "src/data/modern-lexicon.txt"
REPORT = ROOT / "src/data/dictionary-build.json"
LETTERS = re.compile(r"^[A-Za-zÀ-ÖØ-öø-ÿ]{3,32}$")
BLOCKED = re.compile(r"[0-9:/\\.()\[\]{}|=+*<>#@]|(?:^|-)(?:wiki|list|category)(?:$|-)", re.I)
BAD_TAGS = {"misspelling", "nonstandard", "obsolete", "archaic", "historical",
            "rare", "dated", "humorous", "eye dialect", "alternative"}
BASIC = {"of", "the", "and", "in", "for", "to", "a", "an", "on", "by",
         "at", "with", "as", "is", "from", "de", "la", "el", "der", "von"}


def valid(token: str) -> bool:
    return bool(LETTERS.fullmatch(token) and not BLOCKED.search(token)
                and not token.startswith(("'", "’", "-"))
                and not token.endswith(("'", "’", "-")))


class ExtractLinks(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.href = ""
        self.links: list[tuple[str, str]] = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self.href = dict(attrs).get("href", "")

    def handle_data(self, data):
        if self.href:
            self.links.append((data.strip(), self.href))

    def handle_endtag(self, tag):
        if tag == "a":
            self.href = ""


def download(url: str, dest: Path) -> str:
    # Limit external sources, prevent accidental downloads from untrusted hosts.
    if not url.startswith(("https://raw.githubusercontent.com/en-wl/wordlist-diff/",
                           "https://dumps.wikimedia.org/other/pagetitles/",
                           "https://kaikki.org/simplewiktionary/")):
        raise ValueError("Unapproved dictionary URL: " + url)
    digest = sha256()
    request = Request(url, headers={"User-Agent": USER_AGENT})
    with closing(urlopen(request, timeout=120)) as response, dest.open("wb") as out:
        total = 0
        while chunk := response.read(1024 * 1024):
            total += len(chunk)
            if total > 180 * 1024 * 1024:
                raise ValueError("Dictionary source exceeds 180 MiB safety limit")
            digest.update(chunk)
            out.write(chunk)
    return digest.hexdigest()


def refresh_pins(lock: dict) -> None:
    # One immutable Git commit for English Speller Database (ESDB) wordlists.
    request = Request("https://api.github.com/repos/en-wl/wordlist-diff/commits/diff",
                      headers={"User-Agent": USER_AGENT})
    with closing(urlopen(request, timeout=30)) as response:
        lock["esdb"]["revision"] = json.load(response)["sha"]
    lock["esdb"]["url"] = (
        "https://raw.githubusercontent.com/en-wl/wordlist-diff/"
        + lock["esdb"]["revision"] + "/en_US.txt"
    )

    # Pin a dated daily English Wikipedia main-namespace title export.
    index_url = "https://dumps.wikimedia.org/other/pagetitles/"
    with closing(open_source(index_url)) as response:
        index = response.read().decode("utf-8")
    days = re.findall(r'href="(20\d{6})/"', index)
    if not days:
        raise ValueError("Cannot find a dated Wikimedia snapshot")
    day = max(days)
    lock["wikipedia"]["revision"] = day
    lock["wikipedia"]["url"] = (
        f"{index_url}{day}/enwiki-{day}-all-titles-in-ns-0.gz"
    )

    # Kaikki provides a much smaller Simple English Wiktionary JSONL snapshot.
    # Parse its advertised download link instead of guessing changing URLs.
    page = "https://kaikki.org/simplewiktionary/rawdata.html"
    with closing(open_source(page)) as response:
        html = response.read().decode("utf-8")
    parser = ExtractLinks()
    parser.feed(html)
    links = [(label, url) for label, url in parser.links if ".gz" in url
             and ("jsonl" in url or "extract" in url)]
    if not links:
        raise ValueError("Kaikki no longer advertises a compressed JSONL dump")
    lock["simplewiktionary"]["url"] = urljoin(page, links[0][1])
    match = re.search(r"simplewiktionary dump dated (20\d{2}-\d{2}-\d{2})", html)
    if not match:
        raise ValueError("Cannot determine Kaikki Wiktionary dump date")
    lock["simplewiktionary"]["revision"] = match[1]


def source_words(path: Path, stats: Counter) -> dict[str, tuple[str, int]]:
    words: dict[str, tuple[str, int]] = {}
    with path.open(encoding="utf-8") as file:
        for line in file:
            word = line.strip()
            if not valid(word):
                continue
            key = word.casefold()
            # ESDB spelling is considered authoritative for normal English.
            if key not in words:
                words[key] = (word, 45)
    stats["esdb"] = len(words)
    return words


def wiki_words(path: Path, stats: Counter, minimum=2, maximum=65000):
    counts = Counter()
    family_names = Counter()
    standalone_titles = set()
    names: dict[str, str] = {}
    with gzip.open(path, "rt", encoding="utf-8", errors="replace") as file:
        for raw in file:
            title = raw.rstrip("\n").replace("_", " ")
            if any(char in title for char in "()[]/:") or len(title) > 100:
                continue
            parts = title.split()
            if not 1 <= len(parts) <= 5:
                continue
            # Article titles consisting of one word are an independent source
            # of organization, technology and personal names (UNRWA, Qwen,
            # etc.). Treat them as recognition-only entries with low weights
            # unless other articles corroborate the same token.
            if len(parts) == 1 and valid(parts[0]) and parts[0][0].isupper():
                standalone_titles.add(parts[0].casefold())
            # Proper-family-name extraction is separate from global title
            # frequency. Rare contemporary surnames can be absent from the
            # top-K generic words despite appearing in multiple biographies.
            if 2 <= len(parts) <= 3 and all(
                valid(p) and p[0].isupper() for p in parts
            ):
                family_names[parts[-1].casefold()] += 1
            # Only reliably capitalized words from title-cased article names.
            # Do not index every lower-case Wikipedia word or digits.
            for word in parts:
                if word in BASIC or not valid(word) or not word[0].isupper():
                    continue
                key = word.casefold()
                counts[key] += 1
                names.setdefault(key, word)
    selected = sorted(
        ((key, n) for key, n in counts.items() if n >= minimum),
        key=lambda item: (-item[1], item[0]),
    )[:maximum]
    # Frequency caps are for generic titles, not established surnames.
    # Include surnames occurring in two independent person-like titles.
    result = {key: (names[key], min(55, 10 + n)) for key, n in selected}
    for key, n in sorted(family_names.items()):
        if n >= 2 and key not in result:
            result[key] = (names[key], min(55, 10 + counts[key]))
    # Recognize every valid one-word Wikipedia article title without treating
    # its spelling as a high-confidence correction candidate.
    for key in sorted(standalone_titles):
        if key not in result:
            result[key] = (names[key], 6)
    stats["wikipedia_standalone"] = len(standalone_titles)
    stats["wikipedia"] = len(result)
    return result


def wiktionary_words(path: Path, stats: Counter) -> dict[str, tuple[str, int]]:
    words = {}
    with gzip.open(path, "rt", encoding="utf-8", errors="replace") as file:
        for line in file:
            if not line.startswith("{"):
                continue
            obj = json.loads(line)
            if obj.get("lang_code") != "en" and obj.get("lang") != "English":
                continue
            word = obj.get("word")
            if not isinstance(word, str) or not valid(word):
                continue
            if obj.get("pos") in {"character", "symbol", "punct"}:
                continue
            if set(obj.get("tags", [])) & BAD_TAGS:
                continue
            senses = obj.get("senses", [])
            if senses and all(set(s.get("tags", [])) & BAD_TAGS for s in senses):
                continue
            words.setdefault(word.casefold(), (word, 24))
    stats["simplewiktionary"] = len(words)
    return words


def build(lock: dict, paths: dict[str, Path]) -> tuple[str, dict]:
    stats = Counter()
    words = source_words(paths["esdb"], stats)
    for source in ("simplewiktionary", "wikipedia"):
        extra = (wiktionary_words(paths[source], stats) if source == "simplewiktionary"
                 else wiki_words(paths[source], stats))
        for key, (spelling, weight) in extra.items():
            if key in words:
                canonical, existing = words[key]
                words[key] = (canonical, max(existing, weight))
            else:
                words[key] = (spelling, weight)
    lines = ["# GENERATED by scripts/build_dictionary.py; do not edit manually.",
             "# Sources, revisions, checksums: src/data/dictionary-sources.json",
             "# word approximate-frequency-weight"]
    lines += [f"{spelling} {weight}" for key, (spelling, weight)
              in sorted(words.items())]
    stats["total"] = len(words)
    report = {"sources": {k: {"revision": value["revision"], "sha256": value["sha256"]}
                           for k, value in lock.items()}, "counts": dict(stats)}
    return "\n".join(lines) + "\n", report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true",
                        help="Resolve new upstream snapshots and write pinned checksums")
    parser.add_argument("--check", action="store_true",
                        help="Verify existing generated files without writing")
    args = parser.parse_args()
    if args.refresh and args.check:
        parser.error("--refresh and --check are mutually exclusive")
    lock = json.loads(LOCK.read_text(encoding="utf-8"))
    if args.refresh:
        refresh_pins(lock)
    with tempfile.TemporaryDirectory(prefix="spellcheck-dict-") as temporary:
        paths = {}
        for name, meta in lock.items():
            path = Path(temporary) / (name + (".gz" if meta["url"].endswith(".gz") else ".txt"))
            digest = download(meta["url"], path)
            if args.refresh:
                meta["sha256"] = digest
            elif digest != meta["sha256"]:
                raise ValueError(f"{name}: SHA-256 mismatch, expected {meta['sha256']}, got {digest}")
            paths[name] = path
        content, report = build(lock, paths)
    serialized = json.dumps(report, indent=2, ensure_ascii=False) + "\n"
    if args.check:
        if content != OUTPUT.read_text(encoding="utf-8"):
            raise ValueError("Stale generated dictionary, run scripts/build_dictionary.py")
        if serialized != REPORT.read_text(encoding="utf-8"):
            raise ValueError("Stale dictionary report")
        print("Dictionary verified: " + str(report["counts"]))
    else:
        OUTPUT.write_text(content, encoding="utf-8")
        REPORT.write_text(serialized, encoding="utf-8")
        if args.refresh:
            LOCK.write_text(json.dumps(lock, indent=2) + "\n", encoding="utf-8")
        print("Built dictionary: " + str(report["counts"]))


if __name__ == "__main__":
    main()
