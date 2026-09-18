import React from "react";
import { AbsoluteFill, interpolate, random, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Grid } from "../components/Backdrop";
import { Marble } from "../components/Marble";
import { C } from "../theme";
import { W } from "../timeline";

const MAZE = { x: 70, y: 560, cell: 46, cols: 10, rows: 10 };

const Megaphone: React.FC<{ x: number; y: number; scale: number }> = ({ x, y, scale }) => (
  <g transform={`translate(${x} ${y}) scale(${scale}) rotate(200)`}>
    <path d="M -10 -22 L 90 -70 L 90 70 L -10 22 Z" fill="#C0392B" stroke={C.redGlow} strokeWidth={3} />
    <rect x={-60} y={-22} width={52} height={44} rx={10} fill="#7F1D1D" stroke={C.redGlow} strokeWidth={3} />
    <rect x={-50} y={22} width={22} height={40} rx={6} fill="#7F1D1D" />
  </g>
);

export const Problem: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Budget gauge with stepped drops.
  const raw = interpolate(frame, [30, 420], [0, 94], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pct = 100 - Math.floor(raw / 4) * 4;
  const gaugeW = 900;
  const gaugeShake = pct < 100 && raw % 4 < 0.6 ? Math.sin(frame * 30) * 4 : 0;

  // Maze walls (deterministic).
  const walls: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let r = 0; r <= MAZE.rows; r++) {
    for (let c = 0; c <= MAZE.cols; c++) {
      const x = MAZE.x + c * MAZE.cell;
      const y = MAZE.y + r * MAZE.cell;
      if (c < MAZE.cols && (r === 0 || r === MAZE.rows || random(`mh${r}-${c}`) > 0.55)) {
        walls.push({ x1: x, y1: y, x2: x + MAZE.cell, y2: y });
      }
      if (r < MAZE.rows && (c === 0 || c === MAZE.cols || random(`mv${r}-${c}`) > 0.55)) {
        walls.push({ x1: x, y1: y, x2: x, y2: y + MAZE.cell });
      }
    }
  }
  // Runner marble looping through a zig-zag route.
  const wp = [
    [1, 1], [4, 1], [4, 3], [2, 3], [2, 5], [6, 5], [6, 2], [8, 2], [8, 6], [5, 6], [5, 8], [8, 8], [8, 9], [3, 9], [3, 7], [1, 7], [1, 1],
  ];
  const segFrames = 14;
  const cycle = (wp.length - 1) * segFrames;
  const tt = frame % cycle;
  const si = Math.floor(tt / segFrames);
  const sp = (tt % segFrames) / segFrames;
  const eased = sp < 0.5 ? 2 * sp * sp : 1 - Math.pow(-2 * sp + 2, 2) / 2;
  const rx = MAZE.x + (wp[si][0] + (wp[si + 1][0] - wp[si][0]) * eased) * MAZE.cell;
  const ry = MAZE.y + (wp[si][1] + (wp[si + 1][1] - wp[si][1]) * eased) * MAZE.cell;

  // Marbles flung out of the maze.
  const flung = Array.from({ length: 40 }, (_, i) => {
    const start = 40 + random(`fs${i}`) * 300;
    const t = frame - start;
    if (t < 0 || t > 38) return null;
    const ang = random(`fa${i}`) * Math.PI * 2;
    const v = 12 + random(`fv${i}`) * 10;
    const cx = MAZE.x + MAZE.cell * 5;
    const cy = MAZE.y + MAZE.cell * 5;
    return (
      <Marble
        key={i}
        x={cx + Math.cos(ang) * v * t}
        y={cy + Math.sin(ang) * v * t + t * t * 0.25}
        size={18}
        opacity={interpolate(t, [0, 24, 38], [1, 1, 0])}
      />
    );
  });

  // Won signs evaporating from the gauge.
  const won = Array.from({ length: 22 }, (_, i) => {
    const p = ((frame * 2 + i * 41) % 170) / 170;
    if (frame < 40) return null;
    return (
      <div
        key={i}
        style={{
          position: "absolute",
          left: 90 + ((i * 43) % gaugeW),
          top: 330 - p * 160,
          color: C.red,
          fontSize: 26 + (i % 3) * 8,
          fontWeight: 900,
          opacity: (1 - p) * 0.65,
          transform: `rotate(${(p - 0.5) * 40}deg)`,
        }}
      >
        ₩
      </div>
    );
  });

  // Megaphone victim.
  const victimCycle = 150;
  const vt = frame % victimCycle;
  const shake = interpolate(vt, [0, 90], [0, 10], { extrapolateRight: "clamp" });
  const blown = interpolate(vt, [90, 130], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const victimX = 700 + Math.sin(frame * 1.7) * shake + blown * 500;
  const victimY = 900 + Math.cos(frame * 2.3) * shake + blown * blown * 300;
  const waves = [0, 1, 2].map((k) => {
    const r = ((frame * 5 + k * 50) % 150) + 20;
    return <circle key={k} cx={870} cy={700} r={r} fill="none" stroke={C.red} strokeWidth={4} opacity={1 - r / 170} />;
  });

  // Boss silhouette.
  const bossS = spring({ frame: frame - 300, fps, config: { damping: 12 } });
  const bossRot = frame > 300 ? Math.sin(frame * 0.9) * 2 : 0;
  const armPath = "M 150 -80 Q 240 -200 110 -230 Q 70 -240 40 -200";

  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Grid />
      <div style={{ position: "absolute", top: 250, left: 90, width: gaugeW, transform: `translateX(${gaugeShake}px)` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", color: C.white }}>
          <span style={{ fontSize: 30, fontWeight: 700, color: C.muted, letterSpacing: 4 }}>남은 예산</span>
          <span style={{ fontSize: 64, fontWeight: 900, color: pct < 40 ? C.red : C.white }}>{pct}%</span>
        </div>
        <div style={{ height: 34, borderRadius: 17, background: "#1a1020", border: `2px solid ${C.red}55`, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              background: `linear-gradient(90deg, #7F1D1D, ${C.red}, ${C.redGlow})`,
              boxShadow: `0 0 24px ${C.red}`,
            }}
          />
        </div>
      </div>
      {won}

      <svg width={W} height={1920} style={{ position: "absolute", inset: 0 }}>
        <rect
          x={MAZE.x - 10}
          y={MAZE.y - 10}
          width={MAZE.cols * MAZE.cell + 20}
          height={MAZE.rows * MAZE.cell + 20}
          rx={14}
          fill={C.panel}
          stroke={C.line}
          strokeWidth={2}
        />
        {walls.map((w, i) => (
          <line key={i} x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke={C.muted} strokeWidth={4} strokeLinecap="round" />
        ))}
        <text x={MAZE.x + (MAZE.cols * MAZE.cell) / 2} y={MAZE.y - 30} textAnchor="middle" fill={C.blueGlow} fontSize={28} fontWeight={800}>
          살 마음 있는 고객
        </text>
        <text
          x={MAZE.x + (MAZE.cols * MAZE.cell) / 2}
          y={MAZE.y + MAZE.rows * MAZE.cell + 56}
          textAnchor="middle"
          fill={C.red}
          fontSize={26}
          fontWeight={800}
        >
          빙빙 도는 미로 ✕
        </text>
        <text x={840} y={MAZE.y - 30} textAnchor="middle" fill={C.muted} fontSize={28} fontWeight={800}>
          관심 없는 고객
        </text>
        {waves}
        <Megaphone x={870} y={700} scale={1.1} />
        <text x={840} y={MAZE.y + MAZE.rows * MAZE.cell + 56} textAnchor="middle" fill={C.red} fontSize={26} fontWeight={800}>
          억지 전단지 ✕
        </text>
        <g transform={`translate(540 1300) scale(${bossS * 0.82}) rotate(${bossRot})`} opacity={bossS}>
          <circle cx={0} cy={-60} r={230} fill={C.red} opacity={0.14} />
          <path d="M -190 80 Q -190 -110 -70 -130 L 70 -130 Q 190 -110 190 80 Z" fill="#05070D" stroke="#2A3550" strokeWidth={3} />
          <rect x={-34} y={-190} width={68} height={70} rx={14} fill="#05070D" stroke="#2A3550" strokeWidth={3} />
          <circle cx={0} cy={-230} r={70} fill="#05070D" stroke="#2A3550" strokeWidth={3} />
          <path d={armPath} fill="none" stroke="#2A3550" strokeWidth={46} strokeLinecap="round" opacity={0.6} />
          <path d={armPath} fill="none" stroke="#05070D" strokeWidth={40} strokeLinecap="round" />
          <text x={-250} y={-150} fill={C.red} fontSize={64} fontWeight={900}>
            !!
          </text>
        </g>
      </svg>
      <Marble x={rx} y={ry} size={30} />
      <Marble x={victimX} y={victimY} size={34} opacity={1 - blown * 0.9} />
      {flung}
    </AbsoluteFill>
  );
};
