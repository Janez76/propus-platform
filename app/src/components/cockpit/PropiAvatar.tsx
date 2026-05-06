'use client';

import { useEffect, useRef } from 'react';

interface PropiAvatarProps {
  size?: number;
  /** Augen folgen Maus. Default true. Auto-deaktiviert bei prefers-reduced-motion. */
  followCursor?: boolean;
  className?: string;
}

export function PropiAvatar({ size = 56, followCursor = true, className }: PropiAvatarProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!followCursor) return;
    if (typeof window === 'undefined') return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;

    const onMove = (e: MouseEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const cx = rect.left + rect.width * 0.4;
      const cy = rect.top + rect.height * 0.46;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      const max = 1.4;
      const scale = Math.min(1, dist / 200);
      const angle = Math.atan2(dy, dx);
      const tx = Math.cos(angle) * max * scale;
      const ty = Math.sin(angle) * max * scale;
      const pupil = svg.querySelector<SVGGElement>('.propi-pupil');
      if (pupil) pupil.setAttribute('transform', `translate(${tx.toFixed(2)} ${ty.toFixed(2)})`);
    };

    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [followCursor]);

  return (
    <svg
      ref={svgRef}
      className={['propi-avatar', className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <radialGradient id="propi-bg" cx="50%" cy="35%">
          <stop offset="0" stopColor="#fce6b8" />
          <stop offset="1" stopColor="#B68E20" />
        </radialGradient>
        <radialGradient id="propi-lens" cx="40%" cy="40%">
          <stop offset="0" stopColor="#5a3a1a" />
          <stop offset=".5" stopColor="#1a0e05" />
          <stop offset="1" stopColor="#0a0500" />
        </radialGradient>
        <clipPath id="propi-clip"><circle cx="50" cy="50" r="48" /></clipPath>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#propi-bg)" />
      <circle cx="50" cy="50" r="48" fill="none" stroke="rgba(255,255,255,.4)" strokeWidth="1.5" />
      <g clipPath="url(#propi-clip)">
        <path d="M 8 100 Q 8 72, 32 66 L 68 66 Q 92 72, 92 100 Z" fill="#8c5820" />
        <path d="M 32 66 Q 50 78, 68 66 L 64 70 Q 50 80, 36 70 Z" fill="#5a3a14" opacity=".5" />
        <path d="M 44 58 L 56 58 L 56 70 L 44 70 Z" fill="#e8b889" />
        <ellipse cx="50" cy="45" rx="20" ry="22" fill="#f0c89a" />
        <path d="M 50 23 Q 70 25, 70 45 Q 70 65, 50 67 Z" fill="#d9a772" opacity=".25" />
        <ellipse cx="30.5" cy="46" rx="2.5" ry="3.5" fill="#d9a772" />
        <path d="M 31 38 Q 35 30, 50 28 Q 65 30, 69 38 L 69 42 L 31 42 Z" fill="#3a2818" />
        <path d="M 28 38 Q 28 16, 50 16 Q 72 16, 72 38 Z" fill="#5a3a1a" />
        <path d="M 28 36 L 72 36 L 72 41 L 28 41 Z" fill="#3a2510" />
        <rect x="28" y="36" width="44" height="2.5" fill="#B68E20" opacity=".7" />
        <circle cx="50" cy="14" r="4" fill="#B68E20" />
        <circle cx="48.5" cy="13" r="1.2" fill="#fce6b8" opacity=".6" />
        <ellipse cx="40" cy="46" rx="3.8" ry="4" fill="white" />
        <g className="propi-pupil">
          <circle cx="40" cy="46" r="2.2" fill="#2a1a08" />
          <circle cx="40.7" cy="45.3" r=".9" fill="white" />
        </g>
        <path d="M 35 40 Q 40 38, 44 40" stroke="#3a2818" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <rect x="46" y="40" width="42" height="24" rx="3" fill="#1f1410" />
        <rect x="46" y="40" width="42" height="3" fill="#0e0905" />
        <rect x="46" y="61" width="42" height="3" fill="#0e0905" />
        <rect x="46" y="42" width="7" height="20" rx="1" fill="#3a2818" />
        <path d="M 56 36 L 70 36 L 71 40 L 55 40 Z" fill="#1f1410" />
        <rect x="59" y="34" width="8" height="3" rx=".5" fill="#0e0905" />
        <circle cx="83" cy="42" r="2" fill="#c44a3a" />
        <rect x="58" y="44" width="10" height="2" rx=".3" fill="#B68E20" opacity=".5" />
        <circle cx="64" cy="52" r="11" fill="#0a0500" />
        <circle cx="64" cy="52" r="9.5" fill="url(#propi-lens)" />
        <circle cx="64" cy="52" r="6" fill="#0a0500" />
        <circle cx="64" cy="52" r="3.5" fill="#1a0e05" />
        <ellipse cx="61" cy="49" rx="2.4" ry="1.6" fill="#fff" opacity=".9" transform="rotate(-30 61 49)" />
        <circle cx="60" cy="48" r=".7" fill="#fff" opacity=".7" />
        <circle cx="64" cy="52" r="9.5" fill="none" stroke="#B68E20" strokeWidth=".5" opacity=".4" />
        <path d="M 47 56 Q 44 52, 46 48 Q 50 47, 52 50 L 52 58 Z" fill="#e8b889" />
        <path d="M 48 44 Q 32 50, 26 64" stroke="#3a2818" strokeWidth="2.2" fill="none" />
        <path d="M 86 44 Q 92 50, 94 60" stroke="#3a2818" strokeWidth="2.2" fill="none" />
        <path d="M 36 58 Q 40 61, 44 58" stroke="#8c5820" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}
