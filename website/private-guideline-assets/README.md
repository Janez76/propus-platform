# Private Guideline-Dateien (Downloads)

Binärdateien (PDF, Office, …) hier unter **`files/`** ablegen und denselben Eintrag in **`website/src/lib/guideline-static.ts`** (`GUIDELINE_DOWNLOADS`) pflegen — Downloads laufen nur mit gültiger Guideline-Session über `/api/guideline/download`.

Synchronisation aus `Propus_Anleitungen`: Dateien nach `files/` kopieren und `guideline-static.ts` ergänzen (oder Deploy-Schritt).
