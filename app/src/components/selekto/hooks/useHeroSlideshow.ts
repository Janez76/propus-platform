import { useEffect, useState } from "react";

export function useHeroSlideshow(length: number, intervalMs = 7500) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [length]);

  useEffect(() => {
    if (length < 2) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [length, intervalMs]);

  return index;
}
