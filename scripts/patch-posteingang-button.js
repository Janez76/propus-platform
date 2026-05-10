// Adds: (1) seed-prompt URL handler in ConversationView; (2) "Auftrag mit Propi" button in PosteingangPage.
// Idempotent + CRLF-aware.
const fs = require("fs");
const path = require("path");

function patch(filePath, mark, finder, inserter) {
  const p = path.join(__dirname, "..", filePath);
  let s = fs.readFileSync(p, "utf-8");
  if (s.includes(mark)) {
    console.log(`[skip] ${filePath} already patched`);
    return;
  }
  const NL = s.includes("\r\n") ? "\r\n" : "\n";
  const lf2 = (str) => (NL === "\r\n" ? str.replace(/\r?\n/g, "\r\n") : str);
  const target = lf2(finder);
  if (!s.includes(target)) {
    console.error(`[err] ${filePath}: needle not found`);
    process.exit(2);
  }
  s = s.replace(target, lf2(inserter(target)));
  fs.writeFileSync(p, s, "utf-8");
  console.log(`[ok] ${filePath} patched`);
}

// 1. ConversationView: seed-handler
patch(
  "app/src/app/(admin)/assistant/_components/ConversationView.tsx",
  "Seed-Prompt aus URL-Parameter",
  `  useEffect(() => {\n    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });\n  }, [messages, isLoading, pendingConfirmation]);`,
  (orig) =>
    `${orig}\n\n  // Seed-Prompt aus URL-Parameter \`?seed=...\` einmalig nach Mount auto-senden.\n  // Genutzt vom Posteingang-Knopf "Auftrag mit Propi": navigiert hierher mit\n  // einem vorbereiteten Prompt im Query, das gleich an den Bot gesendet wird.\n  useEffect(() => {\n    if (typeof window === "undefined") return;\n    const params = new URLSearchParams(window.location.search);\n    const seed = params.get("seed");\n    if (!seed) return;\n    setPendingSendQueue((prev) => (prev.includes(seed) ? prev : [...prev, seed]));\n    params.delete("seed");\n    const next = params.toString();\n    const url = window.location.pathname + (next ? \`?\${next}\` : "") + window.location.hash;\n    window.history.replaceState({}, "", url);\n    // eslint-disable-next-line react-hooks/exhaustive-deps\n  }, []);`,
);

// 2. PosteingangPage: button next to status/priority/assign selects
patch(
  "app/src/pages-legacy/admin/posteingang/PosteingangPage.tsx",
  "Auftrag mit Propi",
  `                  <span className="text-xs text-[#888]">\n                    {detail.conversation.channel === "email" ? <Mail className="inline h-3 w-3" /> : null}\n                  </span>\n                </div>`,
  () =>
    `                  <span className="text-xs text-[#888]">\n                    {detail.conversation.channel === "email" ? <Mail className="inline h-3 w-3" /> : null}\n                  </span>\n                  <button\n                    type="button"\n                    title="Auftrag aus dieser Mail mit Propi anlegen"\n                    onClick={() => {\n                      const conv = detail.conversation;\n                      const lastInbound = [...detail.messages].reverse().find((m) => m.direction === "inbound");\n                      const sender = lastInbound?.from_email || conv.last_inbound_from || "";\n                      const subject = conv.subject || "";\n                      const customer = conv.customer?.name || conv.customer?.company || "";\n                      const bodyExcerpt = lastInbound?.body_text\n                        ? lastInbound.body_text.replace(/\\s+/g, " ").trim().slice(0, 600)\n                        : "";\n                      const lines = [\n                        "Lege einen Auftrag aus dieser E-Mail an. Bitte zuerst Kunde + Kontaktperson, Adresse und gewuenschte Services klaeren — falls etwas fehlt, frag mit Click-Chips nach (NICHT raten).",\n                        "",\n                        \`Konversation #\${conv.id}: \${subject}\`,\n                        sender ? \`Absender: \${sender}\` : "",\n                        customer ? \`Erkannter Kunde: \${customer}\` : "",\n                        bodyExcerpt ? \`\\nMail-Inhalt (Auszug):\\n\${bodyExcerpt}\` : "",\n                      ].filter(Boolean);\n                      const seed = lines.join("\\n");\n                      window.location.assign(\`/assistant?seed=\${encodeURIComponent(seed)}\`);\n                    }}\n                    className="inline-flex items-center gap-1 rounded border border-[#B68E20]/40 bg-[#B68E20]/10 px-2 py-1 text-xs text-[#B68E20] hover:bg-[#B68E20]/20"\n                  >\n                    <ShoppingCart className="h-3 w-3" /> Auftrag mit Propi\n                  </button>\n                </div>`,
);

console.log("done");
