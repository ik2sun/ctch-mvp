import React from "react";
import { AbsoluteFill, interpolate, random, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Grid } from "../components/Backdrop";
import { Marble } from "../components/Marble";
import { C } from "../theme";
import { H, W } from "../timeline";

const LANE = { x: 200, w: 140, top: 470, bottom: 1400 };
const GATE_Y = 600;
const RADAR = { cx: 810, cy: 960, r: 300 };
const KEYWORDS = ["키워드: 구매", "키워드: 가격", "키워드: 후기"];

export const MediaSplit: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const divider = interpolate(frame, [0, 25], [0, H], { extrapolateRight: "clamp" });
  const headS = spring({ frame: frame - 10, fps, config: { damping: 14 } });
  const gateRot = interpolate(frame, [40, 70], [0, -78], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Junk cleared out of the search lane.
  const junk = Array.from({ length: 6 }, (_, i) => {
    const p = interpolate(frame, [12 + i * 5, 50 + i * 5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const y = LANE.top + 120 + i * 190;
    return (
      <rect
        key={i}
        x={LANE.x + 20 + random(`jx${i}`) * 60 - p * 320}
        y={y}
        width={40 + random(`jw${i}`) * 50}
        height={26}
        rx={6}
        fill={C.grey}
        opacity={1 - p}
        transform={`rotate(${p * -40} ${LANE.x} ${y})`}
      />
    );
  });

  // Orderly marble stream through the open gate.
  const stream = Array.from({ length: 16 }, (_, i) => {
    const t = (frame - 72) * 24 - i * 95;
    if (t < 0) return null;
    const y = LANE.top - 40 + (t % (LANE.bottom - LANE.top + 60));
    return <Marble key={i} x={LANE.x + LANE.w / 2} y={y} size={30} />;
  });

  // Banner side: drifting marbles that get caught in the magnetic orbit.
  const caught = Array.from({ length: 18 }, (_, i) => {
    const y = RADAR.cy - 360 + random(`by${i}`) * 720;
    const v = 6 + random(`bv${i}`) * 5;
    const d = random(`bd${i}`) * 240;
    const dy = y - RADAR.cy;
    const inRange = Math.abs(dy) < RADAR.r - 20;
    const xCatch = inRange ? RADAR.cx + Math.sqrt(RADAR.r * RADAR.r - dy * dy) : 520;
    const driftFrames = (W + 40 - xCatch) / v;
    const spiralFrames = 70;
    const cycle = driftFrames + (inRange ? spiralFrames + 30 : 0);
    const t = frame - 30 - d;
    if (t < 0) return null;
    const lt = t % cycle;
    if (lt < driftFrames) {
      return <Marble key={i} x={W + 40 - lt * v} y={y} size={26} opacity={0.85} />;
    }
    if (!inRange) return null;
    const p = (lt - driftFrames) / spiralFrames;
    if (p > 1) return null;
    const theta0 = Math.atan2(dy, xCatch - RADAR.cx);
    const theta = theta0 + p * Math.PI * 2 * 1.5;
    const r = RADAR.r * Math.pow(1 - p, 0.85);
    return (
      <Marble
        key={i}
        x={RADAR.cx + Math.cos(theta) * r}
        y={RADAR.cy + Math.sin(theta) * r}
        size={26 - p * 8}
        opacity={interpolate(p, [0.85, 1], [1, 0], { extrapolateLeft: "clamp" })}
      />
    );
  });

  const sweep = frame * 5;
  const radarOpacity = interpolate(frame, [30, 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Grid opacity={0.25} />
      <div style={{ position: "absolute", left: 0, top: 0, width: 540, height: H, background: `${C.blue}0A` }} />
      <div
        style={{
          position: "absolute",
          left: 538,
          top: (H - divider) / 2,
          width: 4,
          height: divider,
          background: `linear-gradient(to bottom, transparent, ${C.white}, transparent)`,
        }}
      />

      {/* Headers */}
      <div style={{ position: "absolute", top: 300, left: 0, width: 540, textAlign: "center", transform: `scale(${headS})`, opacity: headS }}>
        <div style={{ color: C.white, fontSize: 46, fontWeight: 900 }}>검색 매체</div>
        <div style={{ color: C.blueGlow, fontSize: 28, fontWeight: 700, marginTop: 6 }}>직통 하이패스 차로</div>
      </div>
      <div style={{ position: "absolute", top: 300, left: 540, width: 540, textAlign: "center", transform: `scale(${headS})`, opacity: headS }}>
        <div style={{ color: C.white, fontSize: 46, fontWeight: 900 }}>배너 매체</div>
        <div style={{ color: C.blueGlow, fontSize: 28, fontWeight: 700, marginTop: 6 }}>자석형 궤도 · 레이더망</div>
      </div>

      {/* Radar sweep (conic gradient, clipped to a circle) */}
      <div
        style={{
          position: "absolute",
          left: RADAR.cx - RADAR.r,
          top: RADAR.cy - RADAR.r,
          width: RADAR.r * 2,
          height: RADAR.r * 2,
          borderRadius: "50%",
          background: `conic-gradient(from ${sweep}deg, ${C.blue}66 0deg, ${C.blue}00 70deg, transparent 360deg)`,
          opacity: radarOpacity,
        }}
      />

      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <linearGradient id="lane" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={C.blue} stopOpacity={0.05} />
            <stop offset="1" stopColor={C.blue} stopOpacity={0.35} />
          </linearGradient>
        </defs>
        {/* Search lane */}
        <rect x={LANE.x} y={LANE.top} width={LANE.w} height={LANE.bottom - LANE.top} rx={16} fill="url(#lane)" stroke={C.blue} strokeWidth={3} />
        <line
          x1={LANE.x + LANE.w / 2}
          y1={LANE.top}
          x2={LANE.x + LANE.w / 2}
          y2={LANE.bottom}
          stroke={C.blueGlow}
          strokeWidth={4}
          strokeDasharray="30 30"
          strokeDashoffset={-frame * 10}
          opacity={0.7}
        />
        {junk}
        {/* Toll gate */}
        <rect x={LANE.x - 22} y={GATE_Y - 40} width={22} height={80} rx={6} fill={C.panel} stroke={C.muted} strokeWidth={3} />
        <rect x={LANE.x + LANE.w} y={GATE_Y - 40} width={22} height={80} rx={6} fill={C.panel} stroke={C.muted} strokeWidth={3} />
        <g transform={`rotate(${gateRot} ${LANE.x - 6} ${GATE_Y})`}>
          <rect x={LANE.x - 6} y={GATE_Y - 9} width={LANE.w + 12} height={18} rx={9} fill={C.white} />
          {[0, 1, 2, 3].map((k) => (
            <rect key={k} x={LANE.x + 10 + k * 36} y={GATE_Y - 9} width={18} height={18} fill={C.red} />
          ))}
        </g>
        <text x={LANE.x + LANE.w / 2} y={GATE_Y - 60} textAnchor="middle" fill={gateRot < -60 ? C.blueGlow : C.muted} fontSize={24} fontWeight={800}>
          {gateRot < -60 ? "HI-PASS OPEN" : "TOLL GATE"}
        </text>
        {/* Keyword signposts */}
        {KEYWORDS.map((k, i) => {
          const s = spring({ frame: frame - (80 + i * 22), fps, config: { damping: 13 } });
          const y = 760 + i * 200;
          return (
            <g key={k} transform={`translate(${LANE.x + LANE.w + 24 - (1 - s) * 60} ${y})`} opacity={s}>
              <path d="M 0 0 L 16 -16 L 150 -16 L 150 16 L 16 16 Z" fill={C.panel} stroke={C.blueGlow} strokeWidth={3} />
              <text x={84} y={7} textAnchor="middle" fill={C.white} fontSize={20} fontWeight={800}>
                {k}
              </text>
            </g>
          );
        })}
        {/* Radar rings */}
        <g opacity={radarOpacity}>
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <circle key={f} cx={RADAR.cx} cy={RADAR.cy} r={RADAR.r * f} fill="none" stroke={C.blue} strokeWidth={2} opacity={0.6} />
          ))}
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return (
              <line
                key={i}
                x1={RADAR.cx}
                y1={RADAR.cy}
                x2={RADAR.cx + Math.cos(a) * RADAR.r}
                y2={RADAR.cy + Math.sin(a) * RADAR.r}
                stroke={C.blue}
                strokeWidth={1.5}
                opacity={0.35}
              />
            );
          })}
          <circle cx={RADAR.cx} cy={RADAR.cy} r={22} fill={C.blueGlow} opacity={0.6 + 0.4 * Math.sin(frame * 0.3)} />
          <circle cx={RADAR.cx} cy={RADAR.cy} r={10} fill={C.white} />
        </g>
      </svg>
      {stream}
      {caught}
    </AbsoluteFill>
  );
};
