#!/usr/bin/env python3
"""Import the public JIMTOF 2026 exhibitor list; protect the existing 54 records."""
import csv
import re
import time
import urllib.request
from pathlib import Path
from collections import Counter
from bs4 import BeautifulSoup

ROOT = Path("research/jimtof2026")
TARGET = ROOT / "exhibitors.csv"
BASE = "https://jimtof.org/jp/exhi_search_pronoun?k="
GROUPS = [(str(i), n) for i, n in enumerate(("ア行", "カ行", "サ行", "タ行", "ナ行", "ハ行", "マ行", "ヤ行", "ラ行", "ワ行"), 1)]
GROUPS += [("oversea", "海外出展者")]
BOOTH = re.compile(r"^(?:WA|E|S|W)\d{3,4}(?:-\d+)?$")
FIELDS = ["booth_no", "exhibitor_name", "listing_group", "participation_type", "official_source"]

def fetch(group):
    url = BASE + group
    last = None
    for retry in range(3):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; JIMTOF-2026-research/1.0)", "Accept-Language": "ja,en;q=0.7"})
            with urllib.request.urlopen(request, timeout=25) as response:
                raw = response.read()
            if len(raw) < 3000:
                raise ValueError(f"Unexpected short response ({len(raw)} bytes)")
            return raw, url
        except Exception as exc:
            last = exc
            print(f"GET {url} attempt {retry + 1} failed: {exc}", flush=True)
            time.sleep(retry + 1)
    raise RuntimeError(f"Cannot retrieve {url}") from last

def extract(group, groupname):
    raw, url = fetch(group)
    soup = BeautifulSoup(raw, "html.parser")
    anchors = [a.get_text(" ", strip=True) for a in soup.select("a")]
    booth_links = [a for a in anchors if BOOTH.fullmatch(a)]
    texts = [t.strip() for t in soup.get_text("\n", strip=True).splitlines() if t.strip()]
    start = next((i for i, t in enumerate(texts) if BOOTH.fullmatch(t)), None)
    if start is None:
        raise ValueError(f"No booth numbers found: {group}")
    try:
        end = next(i for i in range(start, len(texts)) if "オンラインカタログ＆オンラインチャンネル" in texts[i])
    except StopIteration:
        raise ValueError(f"Footer not found: {group}")
    selected = texts[start:end]
    rows = []
    for i, booth in enumerate(selected):
        if not BOOTH.fullmatch(booth):
            continue
        if i + 1 >= len(selected):
            raise ValueError(f"Missing exhibitor after {booth} in {group}")
        name = selected[i + 1].strip()
        if BOOTH.fullmatch(name) or not name:
            raise ValueError(f"Invalid exhibitor name after {booth} in {group}")
        flag = "単独（*印なし）"
        if name.endswith("(**)"):
            name = name[:-4].strip()
            flag = "内部出展者"
        elif name.endswith("(*)"):
            name = name[:-3].strip()
            flag = "共同出展者"
        rows.append(dict(zip(FIELDS, (booth, name, groupname, flag, url))))
    if len(rows) != len(booth_links):
        raise ValueError(f"Missing entries in {group}: parsed {len(rows)} but booth anchors {len(booth_links)}")
    if not rows:
        raise ValueError(f"Empty group {group}")
    print(f"{groupname}: {len(rows)} rows", flush=True)
    return rows

def booth_sort(r):
    m = re.fullmatch(r"(WA|E|S|W)(\d{3,4})(?:-(\d+))?", r["booth_no"])
    if not m:
        raise ValueError(f"Unsortable booth: {r['booth_no']}")
    return ({"E": 0, "S": 1, "W": 2, "WA": 3}[m[1]], int(m[2]), int(m[3] or 0), r["exhibitor_name"])

def main():
    with TARGET.open("r", encoding="utf-8", newline="") as stream:
        reader = csv.DictReader(stream)
        old = list(reader)
    if len(old) != 54:
        raise ValueError(f"Expected to preserve 54 pre-existing records, found {len(old)}")
    records = []
    for group, groupname in GROUPS:
        records.extend(extract(group, groupname))
        time.sleep(0.4)
    old_key = Counter((x["booth_no"], x["exhibitor_name"], x["listing_group"], x["participation_type"]) for x in old)
    new_key = Counter((x["booth_no"], x["exhibitor_name"], x["listing_group"], x["participation_type"]) for x in records)
    missing = old_key - new_key
    if missing:
        raise ValueError(f"Existing records mismatch; REFUSING overwrite: {list(missing.items())[:20]}")
    counts = Counter(r["listing_group"] for r in records)
    expected_known = {"ヤ行": 29, "ラ行": 19, "ワ行": 6}
    if any(counts[key] != value for key, value in expected_known.items()):
        raise ValueError(f"Previously verified groups changed: {counts}")
    if len(records) < 500 or len(counts) != 11:
        raise ValueError(f"Suspicious total {len(records)} / groups {len(counts)}")
    records.sort(key=booth_sort)
    with TARGET.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=FIELDS, quoting=csv.QUOTE_ALL)
        writer.writeheader()
        writer.writerows(records)
    print(f"SUCCESS: {len(records)} source rows, 11 sections, prior 54 preserved", flush=True)
    print("Counts:", dict(counts), flush=True)

if __name__ == "__main__":
    main()
