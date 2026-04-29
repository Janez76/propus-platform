#!/usr/bin/env python3
"""
Liest eine BKBN-Kontaktliste (xlsx), markiert Zeilen deren E-Mail/Haupt-E-Mail
in der MailerLite-Gruppe «Kunden» vorkommt, schreibt eine neue Datei.

Zusaetzliche Spalten: Firma_Text, E-Mail_Hauptmail_Status (gleich/abweichend/...).
Zusaetzliche Blaetter: Nach_Firma_sortiert, Mit_abweichender_Hauptmail, Mit_Firma,
Ohne_Firma, Firma_Hauptmail_Kurz.

Nutzt MAILERLITE_API_KEY aus .env.vps im Repo-Root (oder ENV).

Usage:
  python scripts/bkbn-kontaktliste-mailerlite-adjust.py "C:\\path\\liste.xlsx"
Optional:
  --group-id 185310218297541722   (MailerLite «Kunden»)
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import pandas as pd
import requests


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def load_token_from_env_file(env_path: Path) -> str | None:
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


def norm_firma(val) -> str:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return ""
    s = str(val).strip()
    if not s or s.lower() == "nan":
        return ""
    return s


def mail_relation(row, col_mail: str, col_haupt: str) -> str:
    m = norm_email(row.get(col_mail))
    h = norm_email(row.get(col_haupt)) if col_haupt in row.index else None
    if m and h:
        return "gleich" if m == h else "abweichend"
    if m and not h:
        return "nur E-Mail"
    if h and not m:
        return "nur Haupt-E-Mail"
    return "keine Mail"


def fetch_group_emails(token: str, group_id: str) -> set[str]:
    url = f"https://connect.mailerlite.com/api/groups/{group_id}/subscribers"
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    emails: set[str] = set()
    cursor = None
    while True:
        params: dict = {"limit": 1000}
        if cursor:
            params["cursor"] = cursor
        r = requests.get(url, headers=headers, params=params, timeout=120)
        r.raise_for_status()
        j = r.json()
        for row in j.get("data") or []:
            e = row.get("email")
            ne = norm_email(e)
            if ne:
                emails.add(ne)
        cursor = (j.get("meta") or {}).get("next_cursor")
        if not cursor:
            break
    return emails


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("xlsx", type=Path, help="Pfad zur Quell-xlsx")
    ap.add_argument(
        "--group-id",
        default=os.environ.get("MAILERLITE_KUNDEN_GROUP_ID", "185310218297541722"),
        help="MailerLite Gruppen-ID «Kunden»",
    )
    ap.add_argument(
        "--env-file",
        type=Path,
        default=repo_root() / ".env.vps",
        help="Pfad zu .env.vps mit MAILERLITE_API_KEY",
    )
    args = ap.parse_args()

    token = os.environ.get("MAILERLITE_API_KEY") or load_token_from_env_file(args.env_file)
    if not token:
        print("MAILERLITE_API_KEY fehlt (ENV oder --env-file).", file=sys.stderr)
        return 1

    src = args.xlsx.expanduser().resolve()
    if not src.is_file():
        print(f"Datei nicht gefunden: {src}", file=sys.stderr)
        return 1

    print(f"Lade MailerLite-Gruppe {args.group_id} ...", flush=True)
    ml_emails = fetch_group_emails(token, args.group_id)
    print(f"  -> {len(ml_emails)} E-Mail-Adressen in Gruppe Kunden.", flush=True)

    df = pd.read_excel(src, sheet_name=0, header=0)
    # Erwartete Spalten aus BKBN-Export
    col_mail = "E-Mail"
    col_haupt = "Haupt-E-Mail"
    if col_mail not in df.columns:
        print(f"Spalte «{col_mail}» fehlt. Vorhanden: {list(df.columns)}", file=sys.stderr)
        return 1

    col_firma = "Firma"
    firma_texts = (
        [norm_firma(row.get(col_firma)) for _, row in df.iterrows()]
        if col_firma in df.columns
        else [""] * len(df)
    )
    mail_stat = [mail_relation(row, col_mail, col_haupt) for _, row in df.iterrows()]
    df.insert(len(df.columns), "Firma_Text", firma_texts)
    df.insert(len(df.columns), "E-Mail_Hauptmail_Status", mail_stat)

    def row_is_kunde(row) -> tuple[bool, str]:
        m1 = norm_email(row.get(col_mail))
        m2 = norm_email(row.get(col_haupt)) if col_haupt in df.columns else None
        if m1 and m1 in ml_emails:
            return True, "E-Mail"
        if m2 and m2 in ml_emails:
            return True, "Haupt-E-Mail"
        return False, ""

    flags = []
    via = []
    for _, row in df.iterrows():
        ok, v = row_is_kunde(row)
        flags.append("Ja" if ok else "Nein")
        via.append(v if ok else "")

    df.insert(len(df.columns), "Bereits Kunde (MailerLite Kunden)", flags)
    df.insert(len(df.columns), "Match ueber", via)

    # Optional: BKBN-Hinweis wenn bereits Aufträge laut Liste
    auf_col = "Anzahl Aufträge"
    if auf_col in df.columns:

        def hat_auftraege(val) -> bool:
            try:
                if val is None or (isinstance(val, float) and pd.isna(val)):
                    return False
                return float(val) > 0
            except (TypeError, ValueError):
                return False

        df.insert(
            len(df.columns),
            "BKBN: Hat Aufträge (>0)",
            ["Ja" if hat_auftraege(row.get(auf_col)) else "Nein" for _, row in df.iterrows()],
        )

    col_ml = "Bereits Kunde (MailerLite Kunden)"
    neu = df[df[col_ml] == "Nein"].copy()
    kunden = df[df[col_ml] == "Ja"].copy()

    ft_sort = df["Firma_Text"].replace("", pd.NA)
    nach_firma = df.assign(_sort_ft=ft_sort).sort_values(by="_sort_ft", na_position="last").drop(
        columns=["_sort_ft"]
    )
    mit_abw_haupt = df[df["E-Mail_Hauptmail_Status"] == "abweichend"].copy()
    mit_firma = df[df["Firma_Text"].astype(str).str.len() > 0].copy()
    ohne_firma = df[df["Firma_Text"].astype(str).str.len() == 0].copy()
    kurz_cols = [
        c
        for c in (
            "Name",
            "Firma",
            "Firma_Text",
            "E-Mail",
            "Haupt-E-Mail",
            "E-Mail_Hauptmail_Status",
            col_ml,
            "Match ueber",
        )
        if c in df.columns
    ]
    firma_haupt_kurz = df[kurz_cols].copy()

    out = src.parent / (src.stem + "_bearbeitet.xlsx")
    with pd.ExcelWriter(out, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name="Kontakte_alle", index=False)
        neu.to_excel(writer, sheet_name="Nur_neue_Nicht_in_Kunden", index=False)
        kunden.to_excel(writer, sheet_name="Bereits_Kundenliste", index=False)
        nach_firma.to_excel(writer, sheet_name="Nach_Firma_sortiert", index=False)
        mit_abw_haupt.to_excel(writer, sheet_name="Mit_abweichender_Hauptmail", index=False)
        mit_firma.to_excel(writer, sheet_name="Mit_Firma", index=False)
        ohne_firma.to_excel(writer, sheet_name="Ohne_Firma", index=False)
        firma_haupt_kurz.to_excel(writer, sheet_name="Firma_Hauptmail_Kurz", index=False)

    print(f"Geschrieben: {out}")
    print(f"  Zeilen gesamt: {len(df)}, bereits Kunden: {len(kunden)}, neu (nicht in ML-Kunden): {len(neu)}")
    print(
        f"  Firma: mit={len(mit_firma)}, ohne={len(ohne_firma)}, abweichende Hauptmail={len(mit_abw_haupt)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
