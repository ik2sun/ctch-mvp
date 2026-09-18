import React from "react";
import { AbsoluteFill, Img, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Grid } from "../components/Backdrop";
import { Marble } from "../components/Marble";
import { C } from "../theme";
import { H, W } from "../timeline";

const KEY = { x: 540, y: 820 };
const TANK = { x: 240, y: 1130, w: 600, h: 330 };
const ORBIT = { cx: 790, cy: 430, r: 130 };
const LANE = { x: 250, w: 110, top: 150, bottom: 640 };

export const Outro: React.FC<{ audioFrames: number }> = ({ audioFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const laneStream = Array.from({ length: 10 }, (_, i) => {
    const t = frame * 22 - i * 110;
    if (t < 0) return null;
    const span = LANE.bottom - LANE.top;
    const y = LANE.top + (t % span);
    const p = (y - LANE.top) / span;
    const x = LANE.x + LANE.w / 2 + Math.pow(p, 3) * (KEY.x - LANE.x - LANE.w / 2);
    const yy = y + Math.pow(p, 3) * (KEY.y - 60 - LANE.bottom);
    return <Marble key={i} x={x} y={yy} size={28} />;
  });

  const orbitStream = Array.from({ length: 10 }, (_, i) => {
    const cycle = 110;
    const t = (frame * 1 + i * 11) % cycle;
    const p = t / cycle;
    const theta = p * Math.PI * 2 * 1.4;
    const r = ORBIT.r * (1 - p * 0.8);
    const ox = ORBIT.cx + Math.cos(theta) * r;
    const oy = ORBIT.cy + Math.sin(theta) * r;
    const pull = Math.pow(p, 4);
    return <Marble key={i} x={ox + (KEY.x - ox) * pull} y={oy + (KEY.y - 60 - oy) * pull} size={26} />;
  });

  const level = interpolate(frame, [30, 250], [0.02, 0.86], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const surfaceY = TANK.y + TANK.h - TANK.h * level;

  const fall = Array.from({ length: 140 }, (_, i) => {
    const speed = 18 + random(`fv${i}`) * 10;
    const delay = random(`fd${i}`) * 60;
    const t = frame - 20 - delay;
    if (t < 0) return null;
    const dist = surfaceY - (KEY.y + 40);
    const lt = (t * speed) % (dist + 40);
    const p = lt / dist;
    if (p > 1) return null;
    const spread = (random(`fx${i}`) - 0.5) * 2;
    const x = KEY.x + spread * (30 + p * 190) + Math.sin(t * 0.3 + i) * 6;
    const y = KEY.y + 40 + lt;
    return <Marble key={i} x={x} y={y} size={14 + random(`fs${i}`) * 10} />;
  });

  const splash = Array.from({ length: 14 }, (_, i) => {
    const t = (frame * 2 + i * 13) % 40;
    return (
      <circle
        key={i}
        cx={KEY.x + (random(`sx${i}`) - 0.5) * 300 + Math.sin(i) * t}
        cy={surfaceY - t * 1.6}
        r={3 + random(`sr${i}`) * 4}
        fill={C.blueGlow}
        opacity={1 - t / 40}
      />
    );
  });

  const keyS = spring({ frame: frame - 5, fps, config: { damping: 12 } });
  const l1 = spring({ frame: frame - 15, fps, config: { damping: 14 } });
  const l2 = spring({ frame: frame - 85, fps, config: { damping: 14 } });
  const l3 = spring({ frame: frame - 200, fps, config: { damping: 14 } });
  const hideTop = interpolate(frame, [190, 205], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const logo = interpolate(frame, [audioFrames + 6, audioFrames + 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const total = Math.round(interpolate(level, [0.02, 0.86], [0, 12840000]));

  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Grid opacity={0.25} />

      {/* Headline lines */}
      <div style={{ position: "absolute", top: 40, left: 0, right: 0, textAlign: "center", opacity: hideTop }}>
        <div style={{ color: C.white, fontSize: 44, fontWeight: 900, transform: `translateY(${(1 - l1) * 30}px)`, opacity: l1 }}>
          촘촘한 트래픽 설계
        </div>
        <div style={{ color: C.gold, fontSize: 44, fontWeight: 900, transform: `translateY(${(1 - l2) * 30}px)`, opacity: l2 }}>
          × 정밀한 소재 발굴
        </div>
      </div>
      <div style={{ position: "absolute", top: 46, left: 0, right: 0, textAlign: "center", transform: `scale(${l3})`, opacity: l3 }}>
        <div style={{ color: C.white, fontSize: 60, fontWeight: 900, lineHeight: 1.2 }}>
          진정한 <span style={{ color: C.gold }}>퍼포먼스 마케팅</span>
        </div>
      </div>

      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <linearGradient id="lane2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={C.blue} stopOpacity={0.05} />
            <stop offset="1" stopColor={C.blue} stopOpacity={0.35} />
          </linearGradient>
          <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={C.blueGlow} />
            <stop offset="1" stopColor={C.blueDeep} />
          </linearGradient>
        </defs>
        {/* Hi-pass lane */}
        <rect x={LANE.x} y={LANE.top} width={LANE.w} height={LANE.bottom - LANE.top} rx={14} fill="url(#lane2)" stroke={C.blue} strokeWidth={3} />
        <line x1={LANE.x + LANE.w / 2} y1={LANE.top} x2={LANE.x + LANE.w / 2} y2={LANE.bottom} stroke={C.blueGlow} strokeWidth={3} strokeDasharray="24 24" strokeDashoffset={-frame * 10} opacity={0.7} />
        <text x={LANE.x + LANE.w / 2} y={LANE.top - 16} textAnchor="middle" fill={C.blueGlow} fontSize={24} fontWeight={800}>
          하이패스
        </text>
        {/* Magnet orbit */}
        {[0.4, 0.7, 1].map((f) => (
          <circle key={f} cx={ORBIT.cx} cy={ORBIT.cy} r={ORBIT.r * f} fill="none" stroke={C.blue} strokeWidth={2} opacity={0.6} />
        ))}
        <text x={ORBIT.cx} y={ORBIT.cy - ORBIT.r - 16} textAnchor="middle" fill={C.blueGlow} fontSize={24} fontWeight={800}>
          자석 궤도
        </text>
        {/* Funnel lines into the key */}
        <path d={`M ${LANE.x + LANE.w / 2} ${LANE.bottom} Q ${LANE.x + LANE.w / 2} ${KEY.y - 60} ${KEY.x - 40} ${KEY.y - 60}`} fill="none" stroke={C.blue} strokeWidth={3} opacity={0.5} />
        <path d={`M ${ORBIT.cx} ${ORBIT.cy + ORBIT.r} Q ${ORBIT.cx} ${KEY.y - 60} ${KEY.x + 40} ${KEY.y - 60}`} fill="none" stroke={C.blue} strokeWidth={3} opacity={0.5} />

        {/* Tank */}
        <clipPath id="tankClip">
          <rect x={TANK.x} y={TANK.y} width={TANK.w} height={TANK.h} rx={26} />
        </clipPath>
        <rect x={TANK.x} y={TANK.y} width={TANK.w} height={TANK.h} rx={26} fill={C.panel} stroke={C.line} strokeWidth={3} />
        <g clipPath="url(#tankClip)">
          <rect x={TANK.x} y={surfaceY} width={TANK.w} height={TANK.h} fill="url(#water)" />
          <path
            d={`M ${TANK.x} ${surfaceY} ${Array.from({ length: 13 }, (_, i) => `L ${TANK.x + i * 50} ${surfaceY + Math.sin(i * 1.2 + frame * 0.25) * 6}`).join(" ")} L ${TANK.x + TANK.w} ${surfaceY + 40} L ${TANK.x} ${surfaceY + 40} Z`}
            fill={C.blueGlow}
            opacity={0.5}
          />
        </g>
        <rect x={TANK.x} y={TANK.y} width={TANK.w} height={TANK.h} rx={26} fill="none" stroke={C.blueGlow} strokeWidth={4} />
        {splash}
        <text x={TANK.x + TANK.w / 2} y={TANK.y + TANK.h + 52} textAnchor="middle" fill={C.white} fontSize={30} fontWeight={800} letterSpacing={4}>
          결제 탱크
        </text>
      </svg>

      {laneStream}
      {orbitStream}
      {fall}

      {/* Master key ring */}
      <div
        style={{
          position: "absolute",
          left: KEY.x - 90,
          top: KEY.y - 90,
          width: 180,
          height: 180,
          borderRadius: "50%",
          border: `10px solid ${C.gold}`,
          boxShadow: `0 0 50px ${C.gold}88, inset 0 0 30px ${C.gold}55`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: C.gold,
          fontSize: 30,
          fontWeight: 900,
          transform: `scale(${keyS})`,
          background: `${C.bg}CC`,
        }}
      >
        위닝 소재
      </div>

      {/* Revenue counter inside the tank */}
      <div
        style={{
          position: "absolute",
          left: TANK.x,
          width: TANK.w,
          top: TANK.y + 110,
          textAlign: "center",
          color: C.white,
          fontSize: 62,
          fontWeight: 900,
          textShadow: "0 2px 12px rgba(0,0,0,0.8)",
        }}
      >
        ₩{total.toLocaleString("ko-KR")}
      </div>

      <div style={{ position: "absolute", bottom: 150, left: 0, right: 0, textAlign: "center", opacity: logo }}>
        <Img src={staticFile("nmg-logo-white.png")} style={{ height: 70, objectFit: "contain" }} />
      </div>
    </AbsoluteFill>
  );
};
