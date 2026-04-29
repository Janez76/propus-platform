#!/usr/bin/env python3
"""
Importiert aus Blatt «Nur_neue_Nicht_in_Kunden» nur in die MailerLite-Gruppe «BKBN»
(BKBN-Kontakte sind keine LinkedIn-Leads – LinkedIn nicht mischen).

Uebertraegt Name und Firma als MailerLite-Felder (name, company). Primaere Adresse:
Spalte E-Mail, sonst Haupt-E-Mail.

Optional: --also-group-ids id1,id2   zusaetzliche Gruppen (z. B. fuer Spezialfaelle).

Nutzt MAILERLITE_API_KEY aus .env.vps (Repo-Root) oder Umgebungsvariable.

Usage:
  python scripts/bkbn-import-neue-to-mailerlite.py "C:\\path\\..._bearbeitet.xlsx"
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

import pandas as pd
import requests


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def load_token(env_path: Path) -> str | None:
    if not env_path.is_file():
        return None
    for line in env_path.read_text(encoding="utf-8", errors="replace").splitlines():
        if line.startswith("MAILERLITE_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


def norm_email(val) -> str | None:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    s = str(val).strip().lower()
    if not s or s == "nan":
        return None
    return s


def primary_email(row: pd.Series) -> str | None:
    m = norm_email(row.get("E-Mail"))
    if m:
        return m
    return norm_email(row.get("Haupt-E-Mail"))


def build_mailerlite_fields(row: pd.Series) -> dict[str, str]:
    """Standardfelder MailerLite: name, company."""
    fields: dict[str, str] = {}
    name = row.get("Name")
    if name is not None and not (isinstance(name, float) and pd.isna(name)):
        ns = str(name).strip()
        if ns:
            fields["name"] = ns[:255]
    firma = row.get("Firma")
    if firma is not None and not (isinstance(firma, float) and pd.isna(firma)):
        fs = str(firma).strip()
        if fs:
            fields["company"] = fs[:255]
    return fields


def collect_import_rows(df: pd.DataFrame) -> list[tuple[str, dict[str, str]]]:
    """Eindeutige E-Mails mit Feldern (erste Zeile gewinnt)."""
    seen: set[str] = set()
    out: list[tuple[str, dict[str, str]]] = []
    for _, row in df.iterrows():
        em = primary_email(row)
        if not em:
            continue
        if em in seen:
            continue
        seen.add(em)
        fields = build_mailerlite_fields(row)
        out.append((em, fields))
    return out


def upsert_subscriber(
    session: requests.Session,
    token: str,
    email: str,
    group_ids: list[str],
    fields: dict[str, str],
    delay_s: float,
) -> tuple[str, str]:
    url = "https://connect.mailerlite.com/api/subscribers"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    body: dict = {"email": email, "groups": group_ids, "status": "active"}
    if fields:
        body["fields"] = fields
    time.sleep(delay_s)
    r = session.post(url, headers=headers, json=body, timeout=60)
    if r.status_code in (200, 201):
        return "ok", ""
    if r.status_code == 422:
        raw = r.text[:800]
        low = raw.lower()
        if "already" in low or "duplicate" in low or "exist" in low:
            return "ok", "duplicate"
        return "err", raw
    if r.status_code == 429:
        return "retry", r.text[:200]
    return "err", f"{r.status_code} {r.text[:500]}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("xlsx_bearbeitet", type=Path, help="Pfad zur *_bearbeitet.xlsx")
    ap.add_argument(
        "--group-bkbn",
        default=os.environ.get("ML_GROUP_BKBN", "186114905856803943"),
        help="MailerLite Gruppen-ID BKBN",
    )
    ap.add_argument(
        "--also-group-ids",
        default=os.environ.get("ML_IMPORT_EXTRA_GROUP_IDS", ""),
        help="Optional: weitere MailerLite-Gruppen-IDs (komma-separiert), z. B. LinkedIn nur wenn gewollt",
    )
    ap.add_argument("--delay", type=float, default=0.25, help="Sekunden zwischen Requests")
    ap.add_argument("--env-file", type=Path, default=repo_root() / ".env.vps")
    args = ap.parse_args()

    token = os.environ.get("MAILERLITE_API_KEY") or load_token(args.env_file)
    if not token:
        print("MAILERLITE_API_KEY fehlt.", file=sys.stderr)
        return 1

    src = args.xlsx_bearbeitet.expanduser().resolve()
    if not src.is_file():
        print(f"Datei nicht gefunden: {src}", file=sys.stderr)
        return 1

    sheet = "Nur_neue_Nicht_in_Kunden"
    try:
        df = pd.read_excel(src, sheet_name=sheet, header=0)
    except ValueError as e:
        print(f"Blatt «{sheet}» nicht lesbar: {e}", file=sys.stderr)
        return 1

    rows = collect_import_rows(df)
    if not rows:
        print("Keine E-Mails gefunden.")
        return 0

    extra = [x.strip() for x in str(args.also_group_ids).split(",") if x.strip()]
    groups = [args.group_bkbn] + extra
    print(f"{len(rows)} eindeutige E-Mails -> Gruppe(n): {', '.join(groups)} ...", flush=True)

    session = requests.Session()
    ok = err = 0
    for i, (em, flds) in enumerate(rows, 1):
        status, detail = upsert_subscriber(session, token, em, groups, flds, args.delay)
        if status == "ok":
            ok += 1
        elif status == "retry":
            time.sleep(2.0)
            status2, detail2 = upsert_subscriber(session, token, em, groups, flds, args.delay)
            if status2 == "ok":
                ok += 1
            else:
                err += 1
                print(f"ERR {em}: {detail2}", file=sys.stderr)
        else:
            err += 1
            print(f"ERR {em}: {detail}", file=sys.stderr)
        if i % 50 == 0:
            print(f"  ... {i}/{len(rows)}", flush=True)

    print(f"Fertig: erfolgreich {ok}, Fehler {err}")
    return 0 if err == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
