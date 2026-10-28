"""Scans the STAGED content for real secret values.

This is the last gate before a commit: it reads what git would actually
record, not what is sitting in the working tree, and checks that no real
secret value from the local .env appears in it.

Only the NAME of a leaked variable is printed. The value is never printed.
"""

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def git(*args: str) -> str:
    """Runs git and returns its output as text.

    The output is read as bytes and decoded as UTF-8: the patch contains the
    repository's own UTF-8 source, which the console's default code page
    cannot decode.
    """
    result = subprocess.run(
        ["git", *args],
        cwd=ROOT,
        capture_output=True,
        check=False,
    )
    return result.stdout.decode("utf-8", errors="replace")


def main() -> int:
    env: dict[str, str] = {}
    for line in (ROOT / ".env").read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        env[key.strip()] = value.strip().strip('"').strip("'")

    secrets = {
        name: value
        for name, value in env.items()
        if value and name in {
            "SUPABASE_SERVICE_ROLE_KEY",
            "SUPABASE_ACCESS_TOKEN",
            "SUPABASE_ANON_KEY",
            "VITE_SUPABASE_PUBLISHABLE_KEY",
            "GEMINI_API_KEY",
        }
    }

    # The staged patch: every line git would write.
    patch = git("diff", "--cached", "--no-color")
    staged_blob = git("diff", "--cached", "--no-color", "--binary")

    print(f"secrets in the local .env to look for: {', '.join(sorted(secrets))}")
    print(f"staged patch size: {len(patch)} characters\n")

    problems = 0
    for name, value in secrets.items():
        count = patch.count(value)
        if count:
            print(f"  !! {name} appears {count} time(s) in the staged patch")
            problems += 1
        else:
            print(f"  OK  {name} does not appear in the staged patch")

    # A token-shaped string in the staged patch that is not a placeholder.
    token_shapes = [
        re.compile(r"eyJ[A-Za-z0-9_-]{30,}"),
        re.compile(r"sbp_[A-Za-z0-9]{30,}"),
        re.compile(r"AIza[0-9A-Za-z_-]{30,}"),
        re.compile(r"sb_secret_[A-Za-z0-9_-]{30,}"),
    ]
    suspicious = set()
    for pattern in token_shapes:
        for match in pattern.finditer(patch):
            if match.group(0) not in secrets.values():
                suspicious.add(match.group(0)[:8] + "…")
    if suspicious:
        print(f"\n  !! token-shaped strings in the patch: {len(suspicious)}")
        for item in sorted(suspicious)[:10]:
            print(f"     {item}")
        problems += len(suspicious)
    else:
        print("\n  OK  no token-shaped string in the staged patch")

    print(f"\nproblems: {problems}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
