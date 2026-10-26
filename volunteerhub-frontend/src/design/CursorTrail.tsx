import { useEffect, useRef } from "react";

/**
 * Tiny hearts and stars that float out of the mouse pointer, plus a small burst on every click.
 * Decorative only: the particles live in a fixed, click-through layer and are added and removed
 * directly in the DOM (no React state), so moving the mouse never re-renders the app.
 * Off for touch input and for users who prefer reduced motion.
 */

const HEART =
  '<svg viewBox="0 0 200 180" aria-hidden="true"><path fill="currentColor" d="M100 170 C 40 125 5 90 5 52 C 5 22 28 5 54 5 C 75 5 92 17 100 34 C 108 17 125 5 146 5 C 172 5 195 22 195 52 C 195 90 160 125 100 170 Z"/></svg>';
const STAR =
  '<svg viewBox="-12 -12 24 24" aria-hidden="true"><path fill="currentColor" d="M0 -12 C 1.2 -3 3 -1.2 12 0 C 3 1.2 1.2 3 0 12 C -1.2 3 -3 1.2 -12 0 C -3 -1.2 -1.2 -3 0 -12 Z"/></svg>';

const HEART_COLORS = ["#E3304C", "#FF7A90", "#F7A9C4", "#FFFFFF"];
const STAR_COLORS = ["#FFD866", "#FFF3C4", "#FFFFFF", "#FFC2D9"];

const MOVE_EVERY_MS = 45;
const MAX_PARTICLES = 60;

const between = (min: number, max: number) => min + Math.random() * (max - min);
const pick = (list: string[]) => list[Math.floor(Math.random() * list.length)];

const CursorTrail = () => {
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timers = new Set<number>();
    let lastMove = 0;

    const spawn = (x: number, y: number, burst: boolean) => {
      if (layer.childElementCount >= MAX_PARTICLES) return;
      const isHeart = Math.random() < 0.55;
      const particle = document.createElement("span");
      particle.className = `vh-particle ${isHeart ? "vh-particle--heart" : "vh-particle--star"}`;
      particle.innerHTML = isHeart ? HEART : STAR;

      const angle = burst ? between(0, Math.PI * 2) : between(-Math.PI * 0.85, -Math.PI * 0.15);
      const distance = burst ? between(40, 90) : between(18, 46);
      const life = burst ? between(0.9, 1.3) : between(0.8, 1.2);

      particle.style.left = `${x}px`;
      particle.style.top = `${y}px`;
      particle.style.setProperty("--size", `${(burst ? between(9, 16) : between(6, 12)).toFixed(1)}px`);
      particle.style.setProperty("--dx", `${(Math.cos(angle) * distance).toFixed(1)}px`);
      particle.style.setProperty("--dy", `${(Math.sin(angle) * distance - (burst ? 10 : 14)).toFixed(1)}px`);
      particle.style.setProperty("--rot", `${between(-90, 90).toFixed(0)}deg`);
      particle.style.setProperty("--life", `${life.toFixed(2)}s`);
      particle.style.setProperty("--color", isHeart ? pick(HEART_COLORS) : pick(STAR_COLORS));

      layer.appendChild(particle);
      const timer = window.setTimeout(() => {
        particle.remove();
        timers.delete(timer);
      }, life * 1000 + 50);
      timers.add(timer);
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const now = performance.now();
      if (now - lastMove < MOVE_EVERY_MS) return;
      lastMove = now;
      spawn(event.clientX, event.clientY, false);
    };

    const onDown = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      for (let i = 0; i < 9; i++) spawn(event.clientX, event.clientY, true);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      timers.forEach((timer) => window.clearTimeout(timer));
      layer.replaceChildren();
    };
  }, []);

  return <div ref={layerRef} className="vh-cursor-layer" aria-hidden="true" />;
};

export default CursorTrail;
