"""Reports the environment configuration WITHOUT printing any secret value.

Only the NAME of each variable, whether it is set, and the length of its
value are shown. A value is never printed, so the output is safe to paste
into a report or a ticket.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# Variables the browser bundle inlines at build time.
VITE_PREFIX = "VITE_"

# Variables the server reads at runtime.
SERVER_NAMES = [
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "GEMINI_API_KEY",
    "GEMINI_MODEL",
    "ALLOWED_ORIGINS",
    "NODE_ENV",
]


def read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def main() -> int:
    print("=== .env (names and value lengths only; no secret is printed) ===")
    env = read_env(ROOT / ".env")
    for key in sorted(env):
        value = env[key]
        flag = "set" if value else "EMPTY"
        print(f"  {key:<32} {flag:<6} length={len(value)}")

    print("\n=== .env.test (names and value lengths only) ===")
    test_env = read_env(ROOT / ".env.test")
    for key in sorted(test_env):
        value = test_env[key]
        flag = "set" if value else "EMPTY"
        print(f"  {key:<32} {flag:<6} length={len(value)}")

    print("\n=== what the frontend build needs (VITE_*) ===")
    missing_vite = []
    for key in sorted(env):
        if key.startswith(VITE_PREFIX):
            print(f"  {key:<32} {'set' if env[key] else 'EMPTY'}")
    for key in ("VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"):
        if not env.get(key):
            missing_vite.append(key)
    if missing_vite:
        print(f"  MISSING FOR THE BROWSER BUILD: {', '.join(missing_vite)}")

    print("\n=== what the server needs at runtime ===")
    for key in SERVER_NAMES:
        value = env.get(key)
        if value is None:
            print(f"  {key:<32} not in .env (must come from the platform)")
        else:
            print(f"  {key:<32} {'set' if value else 'EMPTY':<6} length={len(value)}")

    print("\n=== danger check ===")
    service_role = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if service_role:
        print("  SUPABASE_SERVICE_ROLE_KEY is present in .env (server-side file).")
        # Is it referenced by any VITE_ variable or by the frontend source?
        for key, value in env.items():
            if key.startswith(VITE_PREFIX) and service_role in value:
                print(f"  !! LEAK: the service-role key is inside {key}")
        frontend_hits = []
        for path in (ROOT / "src").rglob("*.ts*"):
            if "SERVICE_ROLE" in path.read_text(encoding="utf-8", errors="replace"):
                frontend_hits.append(str(path.relative_to(ROOT)))
        if frontend_hits:
            print(f"  !! LEAK: the frontend references SERVICE_ROLE in {frontend_hits}")
        else:
            print("  OK: no VITE_ variable and no frontend file contains the service-role key.")
    else:
        print("  SUPABASE_SERVICE_ROLE_KEY is not in .env.")

    print("\n=== .gitignore covers the secret files? ===")
    ignored = (ROOT / ".gitignore").read_text(encoding="utf-8").splitlines()
    for name in (".env", ".env.test", ".env.android", ".env.*"):
        hit = any(
            line.strip() == name or line.strip() == name.replace(".*", "*") for line in ignored
        )
        print(f"  {name:<20} {'ignored' if hit else 'NOT IGNORED'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
