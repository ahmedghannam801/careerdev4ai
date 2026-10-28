"""Checks every source file for UTF-8 integrity.

The repository contains files that were once written through a Windows-1252
mis-decode, which shows up in the interface as "a mis-decoded em dash" instead of "—". Any file
that is edited from here on must stay valid UTF-8.

This reports:
  * replacement characters (U+FFFD), which mean a decode was lost;
  * Windows-1252 mis-decode sequences (the classic apostrophe and quote cases);
  * em dashes and curly apostrophes, as a sanity check that the file really
    is UTF-8 and has not been flattened to ASCII.
"""

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

SKIP_DIRS = {
    "node_modules",
    "dist",
    "dist-android",
    ".git",
    "android",
    ".wrangler",
    ".tmp-qa",
    "public",
}

TEXT_SUFFIXES = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".sql", ".css", ".html", ".md", ".json", ".ps1", ".py"}

# A mis-decoded UTF-8 run: a lead byte followed by a Windows-1252 punctuation
# character. The lead byte is one of the three that encode a Latin-1
# character which is not used in English text.
MOJIBAKE = re.compile(
    "[âÃ][\u0080-\u00BF\u20AC\u2018\u2019\u201C\u201D\u2013\u2014\u2026]"
)


def main() -> int:
    # Only the files this change touched, so the report is about the work and
    # not about the whole repository.
    try:
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
    except FileNotFoundError:
        print("git is not available; checking the whole tree instead")
        result = None

    if result is not None:
        paths: list[Path] = []
        for line in result.stdout.splitlines():
            name = line[3:].strip()
            if " -> " in name:
                name = name.split(" -> ")[-1].strip()
            candidate = ROOT / name
            if candidate.is_dir():
                paths.extend(
                    p for p in candidate.rglob("*") if p.is_file() and p.suffix in TEXT_SUFFIXES
                )
            elif candidate.is_file():
                paths.append(candidate)
    else:
        paths = [p for p in ROOT.rglob("*") if p.is_file() and p.suffix in TEXT_SUFFIXES]

    problems = 0
    for path in sorted(set(paths)):
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError as error:
            print(f"INVALID UTF-8  {path.relative_to(ROOT)}: {error}")
            problems += 1
            continue

        replacement = text.count("\ufffd")
        mojibake = len(MOJIBAKE.findall(text))
        if replacement or mojibake:
            print(f"MOJIBAKE       {path.relative_to(ROOT)}: {replacement} replacement, {mojibake} mis-decode")
            for match in MOJIBAKE.finditer(text):
                start = max(0, match.start() - 40)
                print(f"    ...{text[start:match.end() + 40]}...".replace("\n", " "))
                break
            problems += 1

    print(f"\nchecked {len(set(paths))} files, {problems} with encoding problems")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
