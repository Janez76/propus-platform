"use client";

import { useEffect, useState } from "react";

type Token =
  | { type: "text"; value: string }
  | { type: "open"; value: string }
  | { type: "close"; value: string }
  | { type: "br" };

const TOKENS: Token[] = [
  { type: "text", value: "Willkommen " },
  { type: "open", value: '<em>' },
  { type: "text", value: "zurück" },
  { type: "close", value: "</em>" },
  { type: "text", value: "." },
  { type: "br" },
  { type: "text", value: "Bitte anmelden." },
];

export function Headline({ id }: { id?: string }) {
  const [html, setHtml] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduced) {
      // Sofort vollständig anzeigen
      setHtml(
        "Willkommen <em>zurück</em>.<br/>Bitte anmelden.",
      );
      setDone(true);
      return;
    }

    let buf = "";
    let tIdx = 0;
    let cIdx = 0;
    let timeoutId: ReturnType<typeof setTimeout>;

    const tick = () => {
      if (tIdx >= TOKENS.length) {
        setDone(true);
        return;
      }
      const tk = TOKENS[tIdx];
      if (tk.type === "text") {
        buf += tk.value.charAt(cIdx);
        cIdx++;
        setHtml(buf);
        if (cIdx >= tk.value.length) {
          tIdx++;
          cIdx = 0;
        }
        timeoutId = setTimeout(tick, 40 + Math.random() * 40);
      } else if (tk.type === "open" || tk.type === "close") {
        buf += tk.value;
        setHtml(buf);
        tIdx++;
        timeoutId = setTimeout(tick, 0);
      } else {
        buf += "<br/>";
        setHtml(buf);
        tIdx++;
        timeoutId = setTimeout(tick, 300);
      }
    };

    timeoutId = setTimeout(tick, 600);
    return () => clearTimeout(timeoutId);
  }, []);

  return (
    <h1 className="headline" id={id}>
      <span dangerouslySetInnerHTML={{ __html: html }} />
      {!done && <span className="caret" aria-hidden="true" />}
    </h1>
  );
}
