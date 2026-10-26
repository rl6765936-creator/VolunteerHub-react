import type { CSSProperties } from "react";

let seed = 7;
const rnd = () => {
  seed = (seed * 9301 + 49297) % 233280;
  return seed / 233280;
};
const pick = <T,>(list: T[]) => list[Math.floor(rnd() * list.length)];
const range = <T,>(n: number, make: (i: number) => T) => Array.from({ length: n }, (_, i) => make(i));

const BOKEH = range(9, () => ({
  left: `${Math.round(rnd() * 95)}%`,
  top: `${Math.round(rnd() * 90)}%`,
  size: Math.round(90 + rnd() * 160),
  color: pick(["#FFD3B0", "#FFE7A3", "#FFC2D4", "#FFFFFF", "#FFDCC8"]),
  delay: -(rnd() * 11),
}));

const BUBBLES = range(14, () => ({
  left: `${Math.round(rnd() * 96)}%`,
  size: Math.round(26 + rnd() * 92),
  duration: Math.round(18 + rnd() * 16),
  delay: -(rnd() * 34),
}));

const HEARTS = range(5, () => ({
  left: `${Math.round(5 + rnd() * 90)}%`,
  size: Math.round(20 + rnd() * 18),
  duration: Math.round(20 + rnd() * 10),
  delay: -(rnd() * 30),
}));

const SPARKS = range(22, () => ({
  left: `${Math.round(rnd() * 97)}%`,
  top: `${Math.round(rnd() * 94)}%`,
  size: Math.round(10 + rnd() * 18),
  duration: 3 + rnd() * 4,
  delay: -(rnd() * 7),
  color: pick(["#FFF6D6", "#FFE58F", "#FFFFFF", "#FFD1E0"]),
}));

const DUST = range(18, () => ({
  left: `${Math.round(rnd() * 100)}%`,
  size: 2 + rnd() * 3,
  duration: Math.round(16 + rnd() * 14),
  delay: -(rnd() * 30),
}));

const HEART_PATH =
  "M100 170 C 40 125 5 90 5 52 C 5 22 28 5 54 5 C 75 5 92 17 100 34 C 108 17 125 5 146 5 C 172 5 195 22 195 52 C 195 90 160 125 100 170 Z";
const STAR_PATH = "M0 -12 C 1.2 -3 3 -1.2 12 0 C 3 1.2 1.2 3 0 12 C -1.2 3 -3 1.2 -12 0 C -3 -1.2 -1.2 -3 0 -12 Z";

const Ambience = () => (
  <div className="vh-amb" aria-hidden="true">
    <span className="vh-amb__cloud vh-amb__cloud--1" />
    <span className="vh-amb__cloud vh-amb__cloud--2" />
    <span className="vh-amb__cloud vh-amb__cloud--3" />

    {BOKEH.map((b, i) => (
      <span
        key={`k${i}`}
        className="vh-amb__bokeh"
        style={{ left: b.left, top: b.top, width: b.size, height: b.size, background: b.color, animationDelay: `${b.delay}s` }}
      />
    ))}

    {BUBBLES.map((b, i) => (
      <span
        key={`b${i}`}
        className="vh-amb__bubble"
        style={{ left: b.left, width: b.size, height: b.size, animationDuration: `${b.duration}s`, animationDelay: `${b.delay}s` }}
      />
    ))}

    {HEARTS.map((h, i) => (
      <span
        key={`h${i}`}
        className="vh-amb__heart"
        style={{ left: h.left, animationDuration: `${h.duration}s`, animationDelay: `${h.delay}s` }}
      >
        <svg width={h.size} height={h.size} viewBox="0 0 200 180">
          <defs>
            <radialGradient id={`vh-amb-heart-${i}`} cx="36%" cy="28%" r="78%">
              <stop offset="0" stopColor="#FF8396" />
              <stop offset=".55" stopColor="#E3304C" />
              <stop offset="1" stopColor="#AF1A35" />
            </radialGradient>
          </defs>
          <path d={HEART_PATH} fill={`url(#vh-amb-heart-${i})`} />
          <ellipse cx="58" cy="44" rx="22" ry="12" fill="#fff" opacity=".55" transform="rotate(-28 58 44)" />
        </svg>
      </span>
    ))}

    {SPARKS.map((s, i) => (
      <svg
        key={`s${i}`}
        className="vh-amb__spark"
        width={s.size}
        height={s.size}
        viewBox="-12 -12 24 24"
        style={{ left: s.left, top: s.top, animationDuration: `${s.duration}s`, animationDelay: `${s.delay}s` } as CSSProperties}
      >
        <path d={STAR_PATH} fill={s.color} />
      </svg>
    ))}

    {DUST.map((d, i) => (
      <span
        key={`d${i}`}
        className="vh-amb__dust"
        style={{ left: d.left, width: d.size, height: d.size, animationDuration: `${d.duration}s`, animationDelay: `${d.delay}s` }}
      />
    ))}
  </div>
);

export default Ambience;
