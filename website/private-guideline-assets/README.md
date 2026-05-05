# Private Guideline-Dateien (Downloads)

Binärdateien (PDF, Office, …) hier ablegen **unterhalb von `files/`** und in `manifest.json` eintragen.

Beispiel:

```json
{
  "files": [
    {
      "id": "handbuch-pdf",
      "path": "files/handbuch.pdf",
      "title": "Internes Handbuch"
    }
  ]
}
```

Synchronisation aus `Propus_Anleitungen`: Dateien nach `files/` kopieren und Manifest pflegen (oder Skript/Deploy-Schritt).
