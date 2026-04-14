import { useEffect, useRef } from "react";

export function usePageEnter() {
  const mainRef = useRef<HTMLElement>(null);
  const footerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        mainRef.current?.classList.add("is-page-enter");
        footerRef.current?.classList.add("is-page-enter");
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, []);

  return { mainRef, footerRef };
}
