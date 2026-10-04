"use client";

import { useEffect, useRef } from "react";

// 로그인 좌측 배경 — 적은 수의 오렌지 노드가 천천히 도는 구 안에서 코어로 모여드는 데이터 네트워크.
// 절제가 원칙: 노드 수·속도·선 밝기를 낮게, 꼬리·흐름선 없음. 색은 로고 오렌지 하나.
// 움직임 줄이기 설정이면 한 장면만 그린다.
const O = "244,91,53"; // 로고 오렌지 #F45B35

type Node = { r: number; th: number; ph: number; speed: number; born: number };

export function SignalNetwork({ coreX = 0.66, coreY = 0.5 }: { coreX?: number; coreY?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0, h = 0, R = 0, nodes: Node[] = [];
    const spawn = (r?: number): Node => ({
      r: r ?? 1,
      th: Math.random() * Math.PI * 2,
      ph: Math.acos(2 * Math.random() - 1),
      speed: 0.7 + Math.random() * 0.6,
      born: r === undefined ? 0 : 1, // 새로 생긴 노드는 서서히 나타남
    });

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      R = Math.min(w * 0.4, h * 0.4);
      const n = Math.round(Math.min(70, Math.max(44, (w * h) / 12000)));
      nodes = Array.from({ length: n }, () => spawn(0.2 + Math.random() * 0.8));
    };
    resize();

    let raf = 0, last = performance.now(), t = 0;
    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      const cx = w * coreX, cy = h * coreY;
      const rotY = t * 0.035, tilt = -0.32;
      const f = R * 3;
      ctx.clearRect(0, 0, w, h);

      // 코어 주변 은은한 빛
      const haze = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      haze.addColorStop(0, `rgba(${O},0.12)`);
      haze.addColorStop(0.4, `rgba(${O},0.035)`);
      haze.addColorStop(1, `rgba(${O},0)`);
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, w, h);

      // 궤도 하나 — 입체감만
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(cx, cy, R * 0.72, R * 0.72 * 0.3, -0.2, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${O},0.08)`;
      ctx.stroke();

      // 노드: 아주 천천히 코어로 모임 + 3D 투영
      const cosY = Math.cos(rotY), sinY = Math.sin(rotY), cosX = Math.cos(tilt), sinX = Math.sin(tilt);
      const pts: { x: number; y: number; a: number }[] = [];
      for (let i = 0; i < nodes.length; i++) {
        const nd = nodes[i];
        if (!still) {
          nd.r -= dt * nd.speed * (0.012 + 0.03 * (1 - nd.r));
          nd.born = Math.min(1, nd.born + dt * 0.4);
          if (nd.r < 0.08) nodes[i] = spawn();
        }
        let x = nd.r * Math.sin(nd.ph) * Math.cos(nd.th), y = nd.r * Math.cos(nd.ph), z = nd.r * Math.sin(nd.ph) * Math.sin(nd.th);
        [x, z] = [x * cosY - z * sinY, x * sinY + z * cosY];
        [y, z] = [y * cosX - z * sinX, y * sinX + z * cosX];
        const s = f / (f + z * R);
        const depth = (1 - z) / 2; // 0 뒤 ~ 1 앞
        const fade = Math.min(1, (nd.r - 0.08) / 0.2) * nd.born; // 코어 직전·막 생긴 노드는 옅게
        pts.push({ x: cx + x * R * s, y: cy + y * R * s, a: (0.32 + depth * 0.6) * Math.max(0, fade) });
      }

      // 가까운 노드끼리 가는 선
      const maxD = R * 0.3;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
          const d2 = dx * dx + dy * dy;
          if (d2 > maxD * maxD) continue;
          const a = (1 - Math.sqrt(d2) / maxD) * Math.min(pts[i].a, pts[j].a) * 0.34;
          ctx.strokeStyle = `rgba(${O},${a})`;
          ctx.beginPath();
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y);
          ctx.stroke();
        }
      }

      for (const p of pts) {
        ctx.fillStyle = `rgba(${O},${p.a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1 + p.a * 1.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // 코어 — 6초 주기로 숨 쉬듯 + 느린 파동 하나
      const breath = still ? 0.5 : (Math.sin(t * 1.05) + 1) / 2;
      const coreR = R * 0.045;
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * (3 + breath * 0.6));
      glow.addColorStop(0, "rgba(255,238,230,0.95)");
      glow.addColorStop(0.2, `rgba(${O},0.85)`);
      glow.addColorStop(0.5, `rgba(${O},0.18)`);
      glow.addColorStop(1, `rgba(${O},0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 3.6, 0, Math.PI * 2);
      ctx.fill();
      if (!still) {
        const ph = (t / 5) % 1;
        ctx.strokeStyle = `rgba(${O},${0.22 * (1 - ph) ** 2})`;
        ctx.beginPath();
        ctx.arc(cx, cy, coreR * (1.2 + ph * 6), 0, Math.PI * 2);
        ctx.stroke();
      }

      if (!still) raf = requestAnimationFrame(draw);
    };

    const ro = new ResizeObserver(() => {
      resize();
      if (still) raf = requestAnimationFrame(draw); // 크기가 바뀌면 캔버스가 지워지므로 정지 장면을 다시 그림
    });
    ro.observe(canvas);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [coreX, coreY]);

  return <canvas ref={ref} className="absolute inset-0 h-full w-full" aria-hidden />;
}
