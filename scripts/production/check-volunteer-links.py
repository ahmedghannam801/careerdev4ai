"""Re-checks the volunteer opportunity links in the live database.

Each opportunity points at an organisation's own volunteering page, so a dead
link sends a user nowhere. This reads the catalogue from the database and
reports the status of every URL.
"""

import json
import os
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TOKEN_FILE = Path(os.environ.get("TEMP", "/tmp")) / "careerpilot-supabase-token.txt"
PROJECT_REF = "ciihprsfdojzvjnqgbxl"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)


def query(sql: str) -> object:
    token = TOKEN_FILE.read_text(encoding="utf-8").strip()
    request = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query",
        data=json.dumps({"query": sql}).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def check(url: str) -> int:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            return int(response.status)
    except urllib.error.HTTPError as error:
        return int(error.code)
    except Exception:
        return 0


def main() -> int:
    rows = query(
        "SELECT id, organization, application_url FROM public.volunteer_opportunities "
        "ORDER BY organization"
    )
    entries = list(rows)  # type: ignore[arg-type]
    print(f"checking {len(entries)} links\n")

    results = []
    for entry in entries:
        status = check(entry["application_url"])
        results.append((entry["organization"], entry["application_url"], status))
        flag = "ok " if status in (200, 301, 302, 403) else "!! "
        print(f"{flag}{status:>3}  {entry['organization']:<32} {entry['application_url']}")

    reachable = [r for r in results if r[2] in (200, 301, 302, 403)]
    blocked = [r for r in results if r[2] == 403]
    dead = [r for r in results if r[2] not in (200, 301, 302, 403)]

    print(
        f"\n{len(reachable)}/{len(results)} reachable "
        f"({len(blocked)} block the bot but are live servers, "
        f"{len(dead)} failed)"
    )
    for organization, url, status in dead:
        print(f"  DEAD {status} {organization} {url}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
