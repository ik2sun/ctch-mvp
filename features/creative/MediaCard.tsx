"use client";

export type BadgeTone = "blue" | "green" | "amber" | "red" | "gray" | "violet";

export const BADGE_TONE: Record<BadgeTone, string> = {
  blue: "bg-blue-100/80 text-blue-700",
  green: "bg-emerald-100/80 text-emerald-700",
  amber: "bg-amber-100/80 text-amber-700",
  red: "bg-red-100/80 text-red-700",
  gray: "bg-gray-100/90 text-gray-600",
  violet: "bg-violet-100/80 text-violet-700",
};

export function Badge({ tone, children, className = "" }: { tone: BadgeTone; children: React.ReactNode; className?: string }) {
  return (
    <span className={`whitespace-nowrap inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[13px] font-medium backdrop-blur ${BADGE_TONE[tone]} ${className}`}>
      {children}
    </span>
  );
}

export type MediaCardProps = {
  poster: string | null;
  title: string;
  brand: string;
  meta: string;            // 날짜 · 담당자
  badge?: { label: string; tone: BadgeTone; icon?: string };
  duration?: string;
  platform?: string;
  playable: boolean;
  progress?: boolean;      // 합성 중 스피너
  onClick: () => void;
};

// 숏폼 전용 미디어 카드 — 9:16 고정 썸네일, hover 시 살짝 떠오르고 재생 오버레이 표시
export function MediaCard({ poster, title, brand, meta, badge, duration, platform, playable, progress, onClick }: MediaCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-gray-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
    >
      <div className="relative aspect-[9/16] w-full overflow-hidden bg-gray-900">
        {poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={poster}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
            <i className={`ti ${progress ? "ti-loader-2 animate-spin" : "ti-movie"} text-[28px] text-white/40`} aria-hidden />
          </div>
        )}

        {badge && (
          <Badge tone={badge.tone} className="absolute left-2 top-2 shadow-sm">
            {badge.icon && <i className={`ti ti-${badge.icon}`} aria-hidden />}
            {badge.label}
          </Badge>
        )}
        {duration && (
          <span className="whitespace-nowrap absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[12px] text-white backdrop-blur">
            {duration}
          </span>
        )}

        {/* 재생 오버레이 */}
        <div
          className={`absolute inset-0 flex items-center justify-center bg-black/0 transition-all duration-200 group-hover:bg-black/25 ${
            playable ? "" : "pointer-events-none"
          }`}
        >
          <span className="flex h-12 w-12 scale-90 items-center justify-center rounded-full bg-white/85 text-gray-900 opacity-0 shadow-lg backdrop-blur transition-all duration-200 group-hover:scale-100 group-hover:opacity-100">
            <i className={`ti ${playable ? "ti-player-play-filled" : "ti-eye"} ml-0.5 text-[20px]`} aria-hidden />
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[13px] font-medium uppercase tracking-wide text-gray-500">{brand}</p>
          {platform && <span className="shrink-0 text-[12px] text-gray-400">{platform}</span>}
        </div>
        <p className="mt-0.5 line-clamp-2 text-[13.5px] font-semibold leading-snug text-gray-900">{title}</p>
        <p className="mt-auto pt-2 text-[13px] text-gray-500">{meta}</p>
      </div>
    </button>
  );
}
