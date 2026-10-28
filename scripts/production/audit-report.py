"""Reports the npm audit findings and whether any of them is shipped.

A finding in a devDependency that is bundled into the browser build is a
different risk from a finding in a build-time-only tool, so the two are
reported separately.
"""

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DIST = ROOT / "dist"


def main() -> int:
    result = subprocess.run(
        ["npm.cmd", "audit", "--audit-level=high", "--json"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    try:
        report = json.loads(result.stdout)
    except json.JSONDecodeError:
        print("could not parse the audit report")
        print(result.stdout[:2000])
        return 1

    vulnerabilities = report.get("vulnerabilities", {})
    print(f"npm audit exit code: {result.returncode} (non-zero means a finding at or above the level)")
    print(f"metadata: {json.dumps(report.get('metadata', {}).get('vulnerabilities', {}))}\n")

    shipped_markers = ["xcode", "plist", "semver-regex", "micromatch"]
    dist_text = ""
    for path in DIST.rglob("*"):
        if path.is_file() and path.suffix in {".js", ".mjs", ".html", ".css"}:
            try:
                dist_text += path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                pass

    for name, entry in sorted(vulnerabilities.items()):
        severity = entry.get("severity", "?")
        via = entry.get("via", [])
        names = [v.get("name", "?") if isinstance(v, dict) else str(v) for v in via]
        nodes = entry.get("nodes", [])
        in_bundle = any(marker in dist_text for marker in shipped_markers) and name in dist_text
        print(f"  {name}  [{severity}]  via {', '.join(names)}")
        print(f"    path: {', '.join(nodes[:3])}")
        print(f"    present in the shipped bundle: {in_bundle}")
        print(f"    fix available: {entry.get('fixAvailable')}")
        print()

    if not vulnerabilities:
        print("no vulnerabilities reported")
    return 0


if __name__ == "__main__":
    sys.exit(main())
