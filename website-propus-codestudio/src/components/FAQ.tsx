import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface FaqItem {
  question: string;
  answer: string;
}

const faqs: FaqItem[] = [
  {
    question: "Wie lange dauert ein typisches Projekt?",
    answer:
      "Eine fokussierte Landingpage ist in zwei Wochen online. Eine vollständige Website dauert vier bis sechs Wochen, ein Custom Tool sechs bis zwölf – abhängig vom Scope. Nach dem Briefing erhalten Sie einen verbindlichen Zeitplan.",
  },
  {
    question: "Wer hostet die Website?",
    answer:
      "Das Hosting können Sie gerne über Propus laufen lassen – wir kümmern uns um Setup, Betrieb, Updates und Monitoring, alles aus einer Hand. Details dazu besprechen wir individuell nach Briefing.",
  },
  {
    question: "Bietet ihr Wartung und Support an?",
    answer:
      "Ja, optional via SLA: Sicherheits-Updates, kleinere Anpassungen und Monitoring zu festen monatlichen Preisen. Alternativ rechnen wir auf Stundenbasis ab, wenn Bedarf entsteht.",
  },
  {
    question: "Macht ihr auch SEO?",
    answer:
      "Technisches SEO ist bei jeder Website inkludiert: saubere Semantik, Performance, Meta-Tags, Sitemap, strukturierte Daten. Content-SEO und laufende Betreuung bieten wir als separate Leistung an.",
  },
  {
    question: "Was passiert nach dem Launch?",
    answer:
      "Sie bekommen eine kurze Einführung, eine schriftliche Dokumentation und 14 Tage Post-Launch-Support inklusive. Danach entscheiden Sie, ob ein SLA oder punktuelle Zusammenarbeit passt.",
  },
  {
    question: "Arbeitet ihr mit Agenturen zusammen?",
    answer:
      "Gerne. Wir übernehmen Entwicklung und technische Betreuung, während Agenturen Strategie, Content und Design beisteuern – diskret im White-Label-Modus, wenn gewünscht.",
  },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <ul
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        borderTop: "1px solid var(--color-border)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      {faqs.map((faq, i) => {
        const isOpen = openIndex === i;
        return (
          <li
            key={faq.question}
            style={{ borderBottom: i === faqs.length - 1 ? "none" : "1px solid var(--color-border)" }}
          >
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={`faq-panel-${i}`}
              id={`faq-trigger-${i}`}
              onClick={() => setOpenIndex(isOpen ? null : i)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "1rem",
                padding: "1.1rem 0",
                background: "transparent",
                border: 0,
                textAlign: "left",
                cursor: "pointer",
                color: "var(--color-text)",
                fontFamily: "inherit",
                fontSize: "0.9375rem",
                fontWeight: 600,
                letterSpacing: "-0.01em",
                lineHeight: 1.4,
              }}
            >
              <span>{faq.question}</span>
              <ChevronDown
                size={18}
                style={{
                  color: isOpen ? "var(--color-gold)" : "var(--color-text-muted)",
                  transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.3s ease, color 0.2s ease",
                  flexShrink: 0,
                }}
              />
            </button>
            <div
              id={`faq-panel-${i}`}
              role="region"
              aria-labelledby={`faq-trigger-${i}`}
              style={{
                display: "grid",
                gridTemplateRows: isOpen ? "1fr" : "0fr",
                opacity: isOpen ? 1 : 0,
                transition: "grid-template-rows 0.3s ease, opacity 0.3s ease",
                overflow: "hidden",
              }}
            >
              <div style={{ minHeight: 0 }}>
                <p
                  style={{
                    margin: 0,
                    padding: "0 0 1.25rem",
                    color: "var(--color-text-muted)",
                    fontSize: "0.9375rem",
                    lineHeight: 1.7,
                    maxWidth: "44rem",
                  }}
                >
                  {faq.answer}
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
