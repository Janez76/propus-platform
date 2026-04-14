import { memo } from "react";
import type { GalleryItem } from "../data";

type GalleryProps = {
  items: GalleryItem[];
  onOpen: (index: number) => void;
  /** Magic-Link: nur Vorschaubild, kein weißer Bereich darunter, kein Text bei Hover */
  clientQuiet?: boolean;
};

export const Gallery = memo(function Gallery({ items, onOpen, clientQuiet = false }: GalleryProps) {
  return (
    <div className="gallery">
      {items.map((item, index) => (
        <button
          key={`${item.src}-${index}`}
          type="button"
          className={`gallery__item${item.wide ? " gallery__item--wide" : ""}`}
          onClick={() => onOpen(index)}
        >
          <img src={item.src} alt={item.label} loading="lazy" decoding="async" />
          {!clientQuiet ? <span>{item.label}</span> : null}
        </button>
      ))}
    </div>
  );
});
