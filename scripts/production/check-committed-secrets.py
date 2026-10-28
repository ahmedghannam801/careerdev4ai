"""Checks the files that are meant to be committed for secrets.

`.env.example`, `.env.test.example` and `.env.android` are tracked by design.
This verifies that none of them contains a real secret: no service-role key,
no Management API token and no Gemini API key.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# The real values, read from the ignored .env so they can be compared without
# being printed.
env: dict[str, str] = {}
for line in (ROOT / ".env").read_text(encoding="utf-8", errors="replace").splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, _, value = line.partition("=")
    env[key.strip()] = value.strip().strip('"').strip("'")

SECRET_NAMES = [
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_ACCESS_TOKEN",
    "GEMINI_API_KEY",
    "SUPABASE_ANON_KEY",
]

# A JWT-shaped or key-shaped token, whatever it is called.
TOKEN_SHAPES = [
    re.compile(r"eyJ[A-Za-z0-9_-]{20,}"),          # a JWT
    re.compile(r"sbp_[A-Za-z0-9]{20,}"),           # a Supabase access token
    re.compile(r"AIza[0-9A-Za-z_-]{30,}"),          # a Google API key
    re.compile(r"sb_secret_[A-Za-z0-9_-]{20,}"),    # a Supabase secret key
]

PLACEHOLDER = re.compile(r"^<.*>$|^\$\{.*\}$|your-|YOUR_|^changeme|^replace", re.I)


def main() -> int:
    problems = 0

    for name in (".env.example", ".env.test.example", ".env.android"):
        path = ROOT / name
        if not path.exists():
            print(f"{name}: missing")
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        print(f"\n=== {name} ===")

        for line in text.splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, _, value = stripped.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if not value:
                print(f"  {key:<34} empty")
                continue
            if key in env and env[key] and value == env[key]:
                print(f"  {key:<34} !! MATCHES THE REAL VALUE IN .env")
                problems += 1
                continue
            placeholder = bool(PLACEHOLDER.match(value))
            shaped = any(pattern.search(value) for pattern in TOKEN_SHAPES)
            if shaped and not placeholder:
                print(f"  {key:<34} !! LOOKS LIKE A REAL TOKEN (length {len(value)})")
                problems += 1
                continue
            kind = "placeholder" if placeholder else "literal value"
            print(f"  {key:<34} {kind} (length {len(value)})")

    # The strongest check: is any real secret present verbatim in a file that
    # is about to be committed?
    print("\n=== verbatim secret scan of tracked-or-committable files ===")
    committable = [".env.example", ".env.test.example", ".env.android"]
    for secret_name in SECRET_NAMES:
        secret = env.get(secret_name, "")
        if not secret:
            continue
        for name in committable:
            path = ROOT / name
            if not path.exists():
                continue
            if secret in path.read_text(encoding="utf-8", errors="replace"):
                print(f"  !! {secret_name} appears in {name}")
                problems += 1
    if problems == 0:
        print("  OK: no real secret value appears in any committable file.")

    print(f"\nproblems: {problems}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
