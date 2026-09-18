import React from "react";
import { AbsoluteFill, interpolate, random, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { City } from "../components/Backdrop";
import { Marble } from "../components/Marble";
import { C } from "../theme";
import { W } from "../timeline";

const GATE_Y = 1330;

export const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const paths = Array.from({ length: 11 }, (_, i) => {
    const x0 = 40 + i * 100;
    return `M ${x0} -20 C ${x0} 600, ${540 + (x0 - 540) * 0.35} 950, 540 ${GATE_Y}`;
  });
  const draw = interpolate(frame, [0, 50], [0, 1], { extrapolateRight: "clamp" });

  const marbles = Array.from({ length: 110 }, (_, i) => {
    const delay = random(`in-d${i}`) * 150;
    const t = frame - delay;
    if (t < 0) return null;
    const x0 = 30 + random(`in-x${i}`) * (W - 60);
    const dur = 80 + random(`in-s${i}`) * 50;
    const p = t / dur;
    if (p > 1) return null;
    const y = -40 + p * (GATE_Y + 20);
    const x = x0 + (540 - x0) * Math.pow(p, 1.7) + Math.sin(t * 0.18 + i) * 34 * (1 - p);
    const size = 20 + random(`in-sz${i}`) * 16;
    return (
      <Marble
        key={i}
        x={x}
        y={y}
        size={size}
        opacity={interpolate(p, [0.92, 1], [1, 0], { extrapolateLeft: "clamp" })}
      />
    );
  });

  const s = spring({ frame: frame - 12, fps, config: { damping: 14, stiffness: 120 } });
  const pulse = 0.6 + 0.4 * Math.sin(frame * 0.25);

  return (
    <AbsoluteFill>
      <City />
      <svg width={W} height={1920} style={{ position: "absolute", inset: 0 }}>
        {paths.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={C.blue}
            strokeWidth={3}
            strokeOpacity={0.35}
            strokeDasharray={2200}
            strokeDashoffset={2200 * (1 - draw)}
          />
        ))}
        <ellipse cx={540} cy={GATE_Y} rx={150} ry={26} fill={C.blue} opacity={0.15 + pulse * 0.2} />
        <rect x={470} y={GATE_Y - 22} width={140} height={44} rx={8} fill={C.bg} stroke={C.blueGlow} strokeWidth={3} />
        <text x={540} y={GATE_Y + 9} textAnchor="middle" fill={C.white} fontSize={26} fontWeight={800}>
          결제창
        </text>
      </svg>
      {marbles}
      <div
        style={{
          position: "absolute",
          top: 210,
          left: 0,
          right: 0,
          textAlign: "center",
          transform: `scale(${s})`,
          opacity: s,
        }}
      >
        <div style={{ color: C.muted, fontSize: 30, fontWeight: 700, letterSpacing: 6 }}>마케팅 예산</div>
        <div
          style={{
            color: C.gold,
            fontSize: 120,
            fontWeight: 900,
            letterSpacing: -2,
            textShadow: `0 0 40px ${C.gold}66`,
            lineHeight: 1.1,
          }}
        >
          ₩10,000,000
        </div>
        <div
          style={{
            display: "inline-block",
            marginTop: 18,
            padding: "10px 28px",
            border: `2px solid ${C.blue}`,
            borderRadius: 999,
            color: C.blueGlow,
            fontSize: 34,
            fontWeight: 800,
          }}
        >
          거대한 마케팅 교통망
        </div>
      </div>
    </AbsoluteFill>
  );
};
