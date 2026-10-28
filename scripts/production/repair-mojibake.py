"""Repair double-encoded UTF-8 in the role catalogue.

Some catalogue files were saved with UTF-8 bytes that had already been
interpreted as Windows-1252 and written back out. The result is text that
renders as "a mis-decoded em dash" instead of "—" in the product UI.

The repair is a whole-file round trip: encode the current text as Windows-1252
and decode the result as UTF-8. That is only applied when it succeeds and
when it actually reduces the number of mojibake sequences, so a file that is
already correct is never touched.
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ROLE_FILES = sorted((ROOT / "shared" / "roles").glob("*.ts"))

# The classic signature of a Windows-1252 mis-decode of UTF-8: a lead byte
# such as U+00E2 followed by a Windows-1252 punctuation character.
LEAD_BYTES = "âÃ"


def count_mojibake(text: str) -> int:
    """Count sequences that look like a mis-decoded UTF-8 run."""
    total = 0
    for index, char in enumerate(text):
        if char in LEAD_BYTES:
            # A real character like "é" or "ü" is preceded/followed by plain
            # ASCII; a mis-decoded run is followed by a Windows-1252
            # punctuation mark such as a mis-decoded apostrophe or a mis-decoded em dash.
            nxt = text[index + 1] if index + 1 < len(text) else ""
            if nxt and not nxt.isascii() and not nxt.isalnum():
                total += 1
    return total


def main() -> int:
    total_fixed = 0
    for path in ROLE_FILES:
        raw = path.read_bytes()
        has_bom = raw.startswith(b"\xef\xbb\xbf")
        text = raw.decode("utf-8-sig")
        before = count_mojibake(text)
        if before == 0:
            continue
        try:
            candidate = text.encode("cp1252").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError) as exc:
            print(f"SKIP {path.name}: cannot round trip ({exc})")
            continue
        after = count_mojibake(candidate)
        if after >= before:
            print(f"SKIP {path.name}: repair did not help ({before} -> {after})")
            continue
        encoded = candidate.encode("utf-8")
        path.write_bytes(b"\xef\xbb\xbf" + encoded if has_bom else encoded)
        print(f"repaired {path.name}: {before} -> {after}")
        total_fixed += before - after

    print(f"\ntotal sequences repaired: {total_fixed}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
