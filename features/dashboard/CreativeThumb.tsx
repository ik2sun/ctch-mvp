"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";

// 대시보드 소재 썸네일(정사각형, 부모 너비에 맞춤) — 마우스를 올리면 화면 위에 크게(카드 overflow에 안 잘리게 body 포털 + fixed).
// 이미지가 없는 소재(검색광고 텍스트·구글 Ads)도 확대 창에 이름·지표를 보여 준다.
export function CreativeThumb({
  thumb,
  image,
  title,
  lines,
  color,
  mediaLabel,
  video,
  live,
}: {
  thumb: string | null;
  image?: string | null;
  title: string;
  lines: string[];
  color: string;
  mediaLabel: string;
  video?: boolean;
  live?: boolean; // 인스타 라이브 광고 — 방송 화면이 남지 않아 이미지가 없다
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [broken, setBroken] = useState(false);
  // 정사각형에 가깝지 않은 이미지(띠배너 750×160·1250×560, 9:16 등)는 잘라 내지 않고 흐린 배경 위에 전체를 담는다
  const [odd, setOdd] = useState(false);
  const src = broken ? null : thumb;

  const open = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const W = 320;
    const H = src ? 440 : 140;
    // 카드가 화면 오른쪽에 있으므로 왼쪽에 띄우고, 자리가 없으면 오른쪽
    const left = r.left - W - 12 >= 8 ? r.left - W - 12 : Math.min(window.innerWidth - W - 8, r.right + 12);
    const top = Math.max(8, Math.min(window.innerHeight - H - 8, r.top + r.height / 2 - H / 2));
    setPos({ left, top });
  };

  return (
    <div ref={ref} onMouseEnter={open} onMouseLeave={() => setPos(null)} className="relative aspect-square w-full cursor-zoom-in overflow-hidden rounded-md border border-line bg-canvas">
      {src ? (
        <>
          {odd && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="" aria-hidden referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full scale-125 object-cover opacity-60 blur-md" />
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={title}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setBroken(true)}
            onLoad={(e) => {
              const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
              setOdd(!!w && !!h && (w / h > 1.3 || w / h < 0.77));
            }}
            className={`relative h-full w-full ${odd ? "object-contain" : "object-cover"}`}
          />
          {video && (
            <span className="pointer-events-none absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[9px] text-white" aria-label="영상 소재">
              ▶
            </span>
          )}
        </>
      ) : live ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-[#833AB4]/15 via-[#E1306C]/15 to-[#F77737]/15 p-1 text-center">
          <span className="rounded bg-[#E1306C] px-1.5 py-px text-[10px] font-bold tracking-wide text-white">● LIVE</span>
          <span className="text-[10px] leading-tight text-ink-soft">인스타 라이브</span>
        </div>
      ) : (
        // 이미지 없는 소재 — 매체 색 텍스트 카드
        <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 p-1 text-center" style={{ background: `${color}14` }}>
          <i className="ti ti-file-text text-[16px]" style={{ color }} aria-hidden />
          <span className="line-clamp-2 break-all text-[10px] leading-tight text-ink-soft">{title}</span>
        </div>
      )}
      {pos &&
        createPortal(
          <div className="pointer-events-none fixed z-[100] w-[320px] rounded-xl border border-line bg-surface p-2 shadow-2xl" style={{ left: pos.left, top: pos.top }}>
            {src && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image || src} alt={title} referrerPolicy="no-referrer" className="mb-2 max-h-[340px] w-full rounded-lg bg-canvas object-contain" />
            )}
            <p className="px-1 text-[13px] font-semibold leading-snug text-ink">{title}</p>
            {live && <p className="px-1 text-[12px] text-ink-muted">인스타그램 라이브 광고 — 방송 화면은 메타에 남지 않아 이미지가 없어요.</p>}
            <p className="mt-0.5 flex items-center gap-1.5 px-1 text-[12px] text-ink-soft">
              <span className="h-2 w-2 rounded-full" style={{ background: color }} />
              {mediaLabel}
            </p>
            <p className="px-1 pb-0.5 text-[12px] text-ink-soft">{lines.join(" · ")}</p>
          </div>,
          document.body,
        )}
    </div>
  );
}
