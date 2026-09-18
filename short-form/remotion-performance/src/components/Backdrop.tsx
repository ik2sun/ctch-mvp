import React from "react";
import { random } from "remotion";
import { C } from "../theme";
import { H, W } from "../timeline";

export const Grid: React.FC<{ opacity?: number }> = ({ opacity = 0.35 }) => (
  <svg width={W} height={H} style={{ position: "absolute", inset: 0, opacity }}>
    <defs>
      <pattern id="g" width={80} height={80} patternUnits="userSpaceOnUse">
        <path d="M 80 0 L 0 0 0 80" fill="none" stroke={C.line} strokeWidth={1.5} />
      </pattern>
    </defs>
    <rect width={W} height={H} fill="url(#g)" />
  </svg>
);

export const City: React.FC<{ opacity?: number; horizon?: number }> = ({ opacity = 0.9, horizon = 1400 }) => {
  const buildings = Array.from({ length: 26 }, (_, i) => {
    const w = 40 + random(`bw${i}`) * 70;
    const h = 120 + random(`bh${i}`) * 520;
    const x = i * 44 - 20 + random(`bx${i}`) * 20;
    return { x, w, h };
  });
  const vLines = Array.from({ length: 21 }, (_, i) => (i / 20) * W * 2 - W / 2);
  const hLines = Array.from({ length: 12 }, (_, i) => horizon + Math.pow(i / 11, 2.2) * (H - horizon));
  return (
    <svg width={W} height={H} style={{ position: "absolute", inset: 0, opacity }}>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.bg} />
          <stop offset="1" stopColor="#0E1A33" />
        </linearGradient>
        <linearGradient id="bld" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#152238" />
          <stop offset="1" stopColor="#0A1120" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill="url(#sky)" />
      {buildings.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={horizon - b.h} width={b.w} height={b.h} fill="url(#bld)" stroke="#1D2B47" strokeWidth={1} />
          {Array.from({ length: Math.floor(b.h / 34) }, (_, r) =>
            Array.from({ length: Math.floor(b.w / 18) }, (_, c) => {
              const lit = random(`win${i}-${r}-${c}`) > 0.55;
              return (
                <rect
                  key={`${r}-${c}`}
                  x={b.x + 6 + c * 18}
                  y={horizon - b.h + 10 + r * 34}
                  width={8}
                  height={12}
                  fill={lit ? C.blue : "#0B1425"}
                  opacity={lit ? 0.35 + random(`wo${i}-${r}-${c}`) * 0.5 : 1}
                />
              );
            })
          )}
        </g>
      ))}
      <rect x={0} y={horizon} width={W} height={H - horizon} fill="#060A12" />
      {vLines.map((x, i) => (
        <line key={`v${i}`} x1={W / 2} y1={horizon} x2={x} y2={H} stroke={C.line} strokeWidth={1.5} />
      ))}
      {hLines.map((y, i) => (
        <line key={`h${i}`} x1={0} y1={y} x2={W} y2={y} stroke={C.line} strokeWidth={1.5} />
      ))}
    </svg>
  );
};

export const Vignette: React.FC = () => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      pointerEvents: "none",
      background:
        "radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,0.55) 100%), linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0) 28%)",
    }}
  />
);
