"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type BgImage = Readonly<{
  src: string;
  alt: string;
  credit: string;
  photographer: string;
}>;

const SLIDE_INTERVAL_MS = 7500;

export function InteractiveBackground({
  images,
}: {
  images: readonly BgImage[];
}) {
  const [slideIdx, setSlideIdx] = useState(0);
  const reducedMotion = useReducedMotion();

  // Slideshow
  useEffect(() => {
    if (reducedMotion || images.length <= 1) return;
    const id = setInterval(() => {
      setSlideIdx((i) => (i + 1) % images.length);
    }, SLIDE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [images.length, reducedMotion]);

  // Tastatur-Navigation (Pfeile) — nicht, wenn der Fokus in einem Eingabefeld liegt.
  useEffect(() => {
    if (images.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowRight")
        setSlideIdx((i) => (i + 1) % images.length);
      if (e.key === "ArrowLeft")
        setSlideIdx((i) => (i - 1 + images.length) % images.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [images.length]);

  // Ohne Bilder (z. B. solange app/public/login/ leer ist): nur die statischen
  // Hintergrund-Layer rendern, kein Slide/Index/Modulo.
  if (images.length === 0) {
    return (
      <>
        <div className="bg-stage" aria-hidden="true" />
        <div className="bg-veil" aria-hidden="true" />
        <div className="bg-grid" aria-hidden="true" />
        {!reducedMotion && <CursorAndSpotlight />}
        {!reducedMotion && <ParticleConstellation />}
      </>
    );
  }

  const safeIdx = slideIdx % images.length;
  const current = images[safeIdx];

  return (
    <>
      {/* Slideshow */}
      <div className="bg-stage" aria-hidden="true">
        {images.map((img, i) => (
          <div
            key={img.src}
            className={`bg-slide${i === safeIdx ? " active" : ""}`}
          >
            <Image
              src={img.src}
              alt=""
              fill
              priority={i === 0}
              sizes="100vw"
              quality={80}
              style={{ objectFit: "cover" }}
            />
          </div>
        ))}
      </div>

      {/* Layer */}
      <div className="bg-veil" aria-hidden="true" />
      <div className="bg-grid" aria-hidden="true" />

      {/* Maus-Spotlight + Custom Cursor + Partikel */}
      {!reducedMotion && <CursorAndSpotlight />}
      {!reducedMotion && <ParticleConstellation />}

      {/* Bildcredit (rein dekorativ, rotiert automatisch — keine Live-Region) */}
      <aside className="image-credit" aria-hidden="true">
        <span className="label">— Aktuelles Bild</span>
        <span className="name">{current.credit}</span>
        <span className="meta">Foto: {current.photographer}</span>
      </aside>

      {/* Slide-Indikatoren */}
      <div className="slide-dots" role="tablist" aria-label="Hintergrundbild">
        {images.map((img, i) => (
          <button
            key={img.src}
            type="button"
            role="tab"
            aria-selected={i === safeIdx}
            aria-label={`Bild ${i + 1}: ${img.alt}`}
            className={`slide-dot${i === safeIdx ? " active" : ""}`}
            onClick={() => setSlideIdx(i)}
          />
        ))}
      </div>
    </>
  );
}

/* =========================================================== */
/* Custom Cursor + Maus-Spotlight                              */
/* =========================================================== */
function CursorAndSpotlight() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const spotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) return;

    // Erst jetzt — wenn der Custom-Cursor wirklich aktiv ist — den
    // System-Cursor ausblenden. Fällt dieses Skript aus, bleibt der native
    // Cursor sichtbar (cursor: none ist in login.css an `.cursor-active` gebunden).
    const shell = document.querySelector(".login-shell");
    shell?.classList.add("cursor-active");

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let ringX = mouseX;
    let ringY = mouseY;
    let raf = 0;

    const onMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      if (dotRef.current)
        dotRef.current.style.transform = `translate(${mouseX}px, ${mouseY}px)`;
      if (spotRef.current)
        spotRef.current.style.transform = `translate(${mouseX}px, ${mouseY}px) translate(-50%, -50%)`;
    };

    const tick = () => {
      ringX += (mouseX - ringX) * 0.18;
      ringY += (mouseY - ringY) * 0.18;
      if (ringRef.current)
        ringRef.current.style.transform = `translate(${ringX}px, ${ringY}px)`;
      raf = requestAnimationFrame(tick);
    };

    const onEnter = () => ringRef.current?.classList.add("hover");
    const onLeave = () => ringRef.current?.classList.remove("hover");

    document.addEventListener("mousemove", onMove);
    document
      .querySelectorAll("a, button, input, label.checkbox")
      .forEach((el) => {
        el.addEventListener("mouseenter", onEnter);
        el.addEventListener("mouseleave", onLeave);
      });
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      shell?.classList.remove("cursor-active");
      document.removeEventListener("mousemove", onMove);
      document
        .querySelectorAll("a, button, input, label.checkbox")
        .forEach((el) => {
          el.removeEventListener("mouseenter", onEnter);
          el.removeEventListener("mouseleave", onLeave);
        });
    };
  }, []);

  return (
    <>
      <div ref={ringRef} className="cursor-ring" aria-hidden="true" />
      <div ref={dotRef} className="cursor-dot" aria-hidden="true" />
      <div ref={spotRef} className="bg-spotlight" aria-hidden="true" />
    </>
  );
}

/* =========================================================== */
/* Partikel-Konstellation auf Canvas                           */
/* =========================================================== */
function ParticleConstellation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = (canvas.width = window.innerWidth);
    let H = (canvas.height = window.innerHeight);
    let mouseX = W / 2;
    let mouseY = H / 2;

    type P = { x: number; y: number; vx: number; vy: number; r: number; a: number };
    const PARTICLE_COUNT = Math.min(70, Math.floor((W * H) / 22000));
    const parts: P[] = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      r: Math.random() * 1.2 + 0.4,
      a: Math.random() * 0.5 + 0.15,
    }));

    const onMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };
    const onResize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };

    document.addEventListener("mousemove", onMove);
    window.addEventListener("resize", onResize);

    let raf = 0;
    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      // Punkte
      parts.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > W) p.vx *= -1;
        if (p.y < 0 || p.y > H) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(244,241,234,${p.a})`;
        ctx.fill();
      });

      // Linien
      for (let i = 0; i < parts.length; i++) {
        for (let j = i + 1; j < parts.length; j++) {
          const dx = parts[i].x - parts[j].x;
          const dy = parts[i].y - parts[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 130) {
            ctx.beginPath();
            ctx.moveTo(parts[i].x, parts[i].y);
            ctx.lineTo(parts[j].x, parts[j].y);
            ctx.strokeStyle = `rgba(182,142,32,${0.12 * (1 - d / 130)})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
        // Linie zum Cursor
        const dx = parts[i].x - mouseX;
        const dy = parts[i].y - mouseY;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 180) {
          ctx.beginPath();
          ctx.moveTo(parts[i].x, parts[i].y);
          ctx.lineTo(mouseX, mouseY);
          ctx.strokeStyle = `rgba(182,142,32,${0.3 * (1 - d / 180)})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("mousemove", onMove);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="particles-canvas" aria-hidden="true" />;
}

/* =========================================================== */
function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}
