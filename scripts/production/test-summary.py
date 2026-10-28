"""Prints the summary lines of a test run, without the character-set trouble.

The test runner writes UTF-16 on Windows, and the console cannot render the
box-drawing characters it uses, so the summary is extracted and printed as
plain ASCII.
"""

import re
import sys
from pathlib import Path

SUMMARY = re.compile(r"^(tests|suites|pass|fail|skipped|todo|duration_ms)\s")


def main() -> int:
    path = Path(sys.argv[1])
    raw = path.read_bytes()
    if raw[:2] in (b"\xff\xfe", b"<\x00"):
        text = raw.decode("utf-16-le", errors="replace")
    else:
        text = raw.decode("utf-8", errors="replace")

    for line in text.split("\n"):
        clean = line.replace("\x00", "").strip()
        if not clean:
            continue
        if SUMMARY.match(clean):
            print(clean)
            continue
        if clean.startswith("\u2716") or clean.startswith("not ok"):
            print("FAIL:", clean.encode("ascii", "replace").decode())
        if "failing tests" in clean:
            print("--- failing tests ---")

    print("\n--- any FAIL lines in the body ---")
    failures = [
        line.replace("\x00", "").strip()
        for line in text.split("\n")
        if line.replace("\x00", "").strip().startswith("\u2716")
    ]
    for failure in failures:
        print(" ", failure.encode("ascii", "replace").decode())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
