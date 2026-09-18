"use client";

import { useEffect, useState } from "react";
import { Badge, type BadgeTone } from "./MediaCard";

export type MediaItem = {
  id: string;
  kind: "job" | "reference";
  title: string;
  brand: string;
  date: string;
  owner?: string | null;
  platform: string;
  poster: string | null;
  video: string | null;
  durationSec?: number | null;
  badge: { label: string; tone: BadgeTone; icon?: string };
  description: string;
  details: { k: string; v: string }[];
  downloadName?: string;
  commands?: string[];
  notes?: string[];
  errorText?: string | null;
  logText?: string | null;
  actions?: { label: string; icon: string; tone?: "danger" | "default"; onClick: () => void | Promise<void> }[];
};

// 성과 지표 자리 — 매체 연동 후 실제 값으로 교체 (지금은 자리표시자)
const METRICS = [
  { k: "예상 ROAS", v: "—", hint: "매체 연동 후" },
  { k: "예상 CTR", v: "—", hint: "매체 연동 후" },
  { k: "3초 유지율", v: "—", hint: "게시 후 집계" },
  { k: "CPV", v: "—", hint: "게시 후 집계" },
];

export function VideoModal({ item, onClose }: { item: MediaItem | null; onClose: () => void }) {
  const [videoError, setVideoError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setVideoError(false);
  }, [item?.id]);

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [item, onClose]);

  if (!item) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/80 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-gray-900 text-gray-100 shadow-2xl">
        {/* 플레이어 */}
        <div className="flex flex-1 items-center justify-center bg-black">
          {item.video && !videoError ? (
            <video
              key={item.id}
              src={item.video}
              poster={item.poster ?? undefined}
              controls
              autoPlay
              playsInline
              className="max-h-[92vh] w-full object-contain"
              onError={() => setVideoError(true)}
            />
          ) : item.poster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.poster} alt="" className="max-h-[92vh] w-full object-contain" />
          ) : (
            <div className="flex flex-col items-center gap-2 p-10 text-gray-500">
              <i className="ti ti-movie-off text-[32px]" aria-hidden />
              <span className="text-[13px]">{item.kind === "job" ? "합성이 끝나면 여기서 재생됩니다." : "미리보기 파일이 없어요."}</span>
            </div>
          )}
        </div>

        {/* 사이드 패널 */}
        <aside className="flex w-[340px] shrink-0 flex-col border-l border-white/10 bg-gray-900">
          <div className="flex items-start justify-between gap-3 border-b border-white/10 p-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={item.badge.tone}>
                  {item.badge.icon && <i className={`ti ti-${item.badge.icon}`} aria-hidden />}
                  {item.badge.label}
                </Badge>
                <span className="text-[11px] text-gray-400">{item.platform}</span>
              </div>
              <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-gray-400">{item.brand}</p>
              <h3 className="mt-0.5 text-[15px] font-semibold leading-snug text-white">{item.title}</h3>
              <p className="mt-1 text-xs text-gray-500">
                {item.date}
                {item.owner ? ` · ${item.owner}` : ""}
                {item.durationSec ? ` · ${Math.round(item.durationSec)}초` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-white/10 hover:text-white"
              aria-label="닫기"
            >
              <i className="ti ti-x text-[18px]" aria-hidden />
            </button>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            <p className="text-[13px] leading-relaxed text-gray-300">{item.description}</p>

            {/* 다운로드 */}
            <div className="flex gap-2">
              {item.video ? (
                <a
                  href={item.video}
                  download={item.downloadName ?? `${item.title}.mp4`}
                  className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-white text-[13px] font-medium text-gray-900 transition hover:bg-gray-200"
                >
                  <i className="ti ti-download text-[16px]" aria-hidden /> MP4 다운로드
                </a>
              ) : (
                <span className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-white/10 text-[13px] text-gray-500">
                  <i className="ti ti-download-off text-[16px]" aria-hidden /> 결과물 없음
                </span>
              )}
              {item.actions?.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  disabled={busy === a.label}
                  onClick={async () => {
                    setBusy(a.label);
                    try {
                      await a.onClick();
                    } finally {
                      setBusy(null);
                    }
                  }}
                  title={a.label}
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition disabled:opacity-50 ${
                    a.tone === "danger"
                      ? "border-red-500/30 text-red-300 hover:bg-red-500/20"
                      : "border-white/10 text-gray-300 hover:bg-white/10"
                  }`}
                >
                  <i className={`ti ti-${busy === a.label ? "loader-2 animate-spin" : a.icon} text-[16px]`} aria-hidden />
                </button>
              ))}
            </div>

            {/* 성과 지표 */}
            <section>
              <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-500">성과 지표</h4>
              <div className="grid grid-cols-2 gap-2">
                {METRICS.map((m) => (
                  <div key={m.k} className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <p className="text-[11px] text-gray-400">{m.k}</p>
                    <p className="mt-0.5 font-mono text-[18px] font-semibold text-white">{m.v}</p>
                    <p className="text-[10px] text-gray-500">{m.hint}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* 상세 */}
            <section>
              <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-500">상세</h4>
              <dl className="divide-y divide-white/10 rounded-lg border border-white/10">
                {item.details.map((d) => (
                  <div key={d.k} className="flex items-baseline justify-between gap-3 px-3 py-2 text-[12px]">
                    <dt className="shrink-0 text-gray-400">{d.k}</dt>
                    <dd className="truncate text-right font-mono text-[11px] text-gray-200" title={d.v}>{d.v}</dd>
                  </div>
                ))}
              </dl>
            </section>

            {item.errorText && (
              <section className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-[12px] text-red-200">
                <p className="mb-1 font-medium">실패 원인</p>
                <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed">{item.errorText}</pre>
              </section>
            )}

            {item.commands && item.commands.length > 0 && (
              <section>
                <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-500">로컬 재렌더</h4>
                <pre className="overflow-x-auto rounded-lg bg-black/60 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-gray-300">
                  {item.commands.join("\n")}
                </pre>
              </section>
            )}

            {item.notes && item.notes.length > 0 && (
              <ul className="space-y-1 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-[12px] text-amber-200">
                {item.notes.map((n) => (
                  <li key={n} className="flex gap-1.5">
                    <i className="ti ti-info-circle mt-0.5 shrink-0" aria-hidden />
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
            )}

            {item.logText && (
              <details className="text-[12px] text-gray-400">
                <summary className="cursor-pointer select-none hover:text-gray-200">워커 로그</summary>
                <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-black/60 p-3 font-mono text-[10.5px] leading-relaxed text-gray-400">
                  {item.logText}
                </pre>
              </details>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
