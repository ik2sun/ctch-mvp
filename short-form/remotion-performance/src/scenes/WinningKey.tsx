import React from "react";
import { AbsoluteFill, interpolate, random, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Grid } from "../components/Backdrop";
import { C } from "../theme";
import { H, W } from "../timeline";

const VAULT = { cx: 540, cy: 900, r: 290 };
const KEY_COUNT = 22;
const KEY_START = 24;
const KEY_EVERY = 10;
const GOLD_START = KEY_START + KEY_COUNT * KEY_EVERY;
const TYPES = ["문구 강조", "이미지 강조", "혜택 강조", "후기 강조", "가격 강조", "긴급성 강조"];

const KeyShape: React.FC<{ color: string; glow?: string; stroke: string }> = ({ color, glow, stroke }) => (
  <g style={glow ? { filter: `drop-shadow(0 0 18px ${glow})` } : undefined}>
    <circle cx={-110} cy={0} r={34} fill="none" stroke={color} strokeWidth={16} />
    <rect x={-80} y={-9} width={150} height={18} rx={4} fill={color} stroke={stroke} strokeWidth={1} />
    <rect x={30} y={0} width={14} height={30} fill={color} />
    <rect x={54} y={0} width={14} height={22} fill={color} />
  </g>
);

export const WinningKey: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const vaultIn = spring({ frame, fps, config: { damping: 15 } });
  let hitting = false;

  const keys = Array.from({ length: KEY_COUNT }, (_, i) => {
    const t = frame - (KEY_START + i * KEY_EVERY);
    if (t < 0 || t > 44) return null;
    const flyIn = interpolate(t, [0, 7], [-320, VAULT.cx - 60], { extrapolateRight: "clamp" });
    const rejected = Math.max(0, t - 12);
    if (t >= 7 && t < 12) hitting = true;
    const x = flyIn - rejected * 4;
    const y = VAULT.cy + rejected * rejected * 1.1;
    const rot = Math.min(rejected * 4, 55);
    const opacity = interpolate(t, [0, 2, 28, 44], [0, 1, 1, 0]);
    const eff = (0.3 + random(`eff${i}`) * 1.6).toFixed(1);
    const label = `${String.fromCharCode(65 + i)}형 · ${TYPES[i % TYPES.length]}`;
    return (
      <g key={i} transform={`translate(${x} ${y})`} opacity={opacity}>
        <g transform={`rotate(${rot})`}>
          <KeyShape color="#B6BEC9" stroke="#6B7280" />
        </g>
        {t < 12 && (
          <text x={-60} y={-32} textAnchor="middle" fill={C.white} fontSize={22} fontWeight={800}>
            {label}
          </text>
        )}
        {t >= 9 && (
          <text x={-150} y={-40} textAnchor="middle" fill={C.red} fontSize={24} fontWeight={800}>
            {label} · 전환 {eff}% ✕
          </text>
        )}
      </g>
    );
  });

  const goldT = frame - GOLD_START;
  const goldS = spring({ frame: goldT, fps, config: { damping: 11, stiffness: 90 } });
  const goldX = interpolate(goldS, [0, 1], [-360, VAULT.cx - 60]);
  const goldHit = goldT >= 18;
  const doorOpen = interpolate(frame, [GOLD_START + 24, GOLD_START + 62], [0, -112], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const burst = interpolate(frame, [GOLD_START + 24, GOLD_START + 80], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const shake = hitting || (goldT >= 16 && goldT < 24) ? Math.sin(frame * 40) * 7 : 0;

  const sparks = Array.from({ length: 48 }, (_, i) => {
    const t = frame - (GOLD_START + 24) - random(`sd${i}`) * 20;
    if (t < 0 || t > 50) return null;
    const a = random(`sa${i}`) * Math.PI * 2;
    const v = 8 + random(`sv${i}`) * 14;
    return (
      <circle
        key={i}
        cx={VAULT.cx + Math.cos(a) * v * t}
        cy={VAULT.cy + Math.sin(a) * v * t}
        r={4 + random(`sr${i}`) * 6}
        fill={C.goldGlow}
        opacity={1 - t / 50}
      />
    );
  });

  const started = Math.min(KEY_COUNT, Math.max(0, Math.floor((frame - KEY_START) / KEY_EVERY) + 1));
  const winS = spring({ frame: frame - (GOLD_START + 40), fps, config: { damping: 12 } });

  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Grid opacity={0.25} />
      {/* Counter */}
      <div style={{ position: "absolute", top: 250, left: 0, right: 0, textAlign: "center", opacity: 1 - winS }}>
        <div style={{ color: C.muted, fontSize: 28, fontWeight: 700, letterSpacing: 4 }}>실시간 소재 테스트</div>
        <div style={{ color: goldHit ? C.gold : C.white, fontSize: 96, fontWeight: 900, lineHeight: 1.1 }}>
          #{goldHit ? KEY_COUNT + 1 : started}
        </div>
      </div>

      {/* Light burst behind the vault */}
      <div
        style={{
          position: "absolute",
          left: VAULT.cx - 400,
          top: VAULT.cy - 400,
          width: 800,
          height: 800,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${C.goldGlow} 0%, ${C.gold}88 30%, transparent 70%)`,
          transform: `scale(${0.2 + burst * 2.2})`,
          opacity: burst > 0 ? interpolate(burst, [0, 0.3, 1], [0, 1, 0]) : 0,
        }}
      />

      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <radialGradient id="vault" cx="0.4" cy="0.35" r="0.8">
            <stop offset="0" stopColor="#3B4A66" />
            <stop offset="1" stopColor="#0B1220" />
          </radialGradient>
          <radialGradient id="inside" cx="0.5" cy="0.5" r="0.6">
            <stop offset="0" stopColor={C.goldGlow} />
            <stop offset="1" stopColor={C.gold} />
          </radialGradient>
        </defs>
        <g transform={`translate(${VAULT.cx + shake} ${VAULT.cy}) scale(${vaultIn})`}>
          <circle cx={0} cy={0} r={VAULT.r + 20} fill="#111A2C" stroke={C.line} strokeWidth={4} />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return <circle key={i} cx={Math.cos(a) * (VAULT.r + 4)} cy={Math.sin(a) * (VAULT.r + 4)} r={9} fill="#2C3A55" />;
          })}
          {/* Inside of the vault (revealed when the door swings) */}
          <circle cx={0} cy={0} r={VAULT.r - 24} fill="url(#inside)" opacity={burst > 0 ? 1 : 0} />
          <text x={0} y={16} textAnchor="middle" fill="#3A2A00" fontSize={54} fontWeight={900} opacity={burst}>
            결제 완료
          </text>
        </g>
        <text x={VAULT.cx} y={VAULT.cy - VAULT.r - 50} textAnchor="middle" fill={C.muted} fontSize={30} fontWeight={800} letterSpacing={6}>
          결제창
        </text>
        {sparks}
      </svg>

      {/* Door: swings open on the left hinge via perspective */}
      <div
        style={{
          position: "absolute",
          left: VAULT.cx - (VAULT.r - 24) + shake,
          top: VAULT.cy - (VAULT.r - 24),
          width: (VAULT.r - 24) * 2,
          height: (VAULT.r - 24) * 2,
          borderRadius: "50%",
          background: "radial-gradient(circle at 40% 35%, #3B4A66, #0B1220)",
          border: `6px solid ${goldHit ? C.gold : "#2C3A55"}`,
          boxShadow: goldHit ? `0 0 60px ${C.gold}` : "inset 0 0 40px #000",
          transformOrigin: "left center",
          transform: `perspective(1400px) rotateY(${doorOpen}deg) scale(${vaultIn})`,
          opacity: vaultIn,
        }}
      >
        <svg width="100%" height="100%" viewBox={`0 0 ${(VAULT.r - 24) * 2} ${(VAULT.r - 24) * 2}`}>
          <g transform={`translate(${VAULT.r - 24} ${VAULT.r - 24})`}>
            <circle cx={0} cy={0} r={100} fill="none" stroke="#24304A" strokeWidth={16} />
            {[0, 1, 2].map((k) => (
              <line key={k} x1={0} y1={0} x2={Math.cos((k / 3) * Math.PI * 2) * 100} y2={Math.sin((k / 3) * Math.PI * 2) * 100} stroke="#24304A" strokeWidth={14} />
            ))}
            <circle cx={0} cy={0} r={30} fill="#05070D" stroke={goldHit ? C.gold : "#3B4A66"} strokeWidth={4} />
            <rect x={-11} y={10} width={22} height={48} rx={4} fill="#05070D" stroke={goldHit ? C.gold : "#3B4A66"} strokeWidth={4} />
          </g>
        </svg>
      </div>

      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        {keys}
        {goldT >= 0 && doorOpen > -30 && (
          <g transform={`translate(${goldX} ${VAULT.cy})`} opacity={interpolate(doorOpen, [-30, 0], [0, 1])}>
            <KeyShape color={C.gold} glow={C.gold} stroke="#B9860B" />
            <text x={-60} y={-38} textAnchor="middle" fill={C.gold} fontSize={26} fontWeight={900}>
              황금 열쇠
            </text>
          </g>
        )}
      </svg>

      <div
        style={{
          position: "absolute",
          top: 230,
          left: 0,
          right: 0,
          textAlign: "center",
          transform: `scale(${winS})`,
          opacity: winS,
        }}
      >
        <div style={{ color: C.gold, fontSize: 92, fontWeight: 900, textShadow: `0 0 40px ${C.gold}88`, lineHeight: 1.1 }}>위닝 소재</div>
        <div style={{ color: C.goldGlow, fontSize: 30, fontWeight: 700, marginTop: 6 }}>가장 압도적인 효율 · 단 하나의 마스터키</div>
      </div>
    </AbsoluteFill>
  );
};
