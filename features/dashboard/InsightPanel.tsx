"use client";

// 규칙 기반 인사이트 카드 — 상태는 색만이 아니라 아이콘+라벨로 함께 표시한다.
// onCreative를 주면 '기회'(매체 지정) 카드에 [🎨 이 소재와 유사한 숏폼 생성하기] 퀵 버튼 — 그 매체의 성과 1위 소재 정보를 소재 생성으로 넘긴다.
import type { Insight, InsightTone } from "./analysis";

const TONE: Record<InsightTone, { icon: string; label: string; cls: string; dot: string }> = {
  bad: { icon: "ti-alert-triangle", label: "주의", cls: "text-bad", dot: "bg-bad/10" },
  warn: { icon: "ti-alert-circle", label: "점검", cls: "text-warn", dot: "bg-warn/10" },
  good: { icon: "ti-trending-up", label: "기회", cls: "text-good", dot: "bg-good/10" },
  info: { icon: "ti-bulb", label: "참고", cls: "text-signal", dot: "bg-signal-soft" },
};

export function InsightPanel({
  insights,
  colors,
  onHighlight,
  columns = false,
  onCreative,
  creativeBusy,
}: {
  insights: Insight[];
  colors: Record<string, string>;
  onHighlight: (key: string | null) => void;
  columns?: boolean; // 넓은 카드에선 2~3단 Masonry(한 줄 글자 수를 읽기 좋게 유지)
  onCreative?: (it: Insight) => void;
  creativeBusy?: string | null; // 처리 중인 인사이트 id
}) {
  if (insights.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1.5 py-8 text-center">
        <i className="ti ti-circle-check text-[22px] text-good" aria-hidden />
        <p className="text-[15px] text-ink-soft">눈에 띄는 변화나 이상 신호가 없어요.</p>
        <p className="text-[12px] text-ink-muted">ROAS ±20%, CPA +25%, 예산·매출 비중 ±10%p 이상일 때 알려 드려요.</p>
      </div>
    );
  }
  return (
    <ul className={columns ? "gap-4 lg:columns-2 2xl:columns-3 [&>li]:mb-4 [&>li]:break-inside-avoid" : "space-y-3"}>
      {insights.map((it) => {
        const t = TONE[it.tone];
        return (
          <li
            key={it.id}
            onMouseEnter={() => onHighlight(it.mediaKey ?? null)}
            onMouseLeave={() => onHighlight(null)}
            className="flex gap-3.5 rounded-lg border border-line/80 px-4 py-3.5 transition hover:border-ink-faint"
          >
            <span className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${t.dot}`}>
              <i className={`ti ${t.icon} text-[17px] ${t.cls}`} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-[16px] font-semibold text-[#1A1A1A]">
                <span className={`text-[13px] font-semibold ${t.cls}`}>{t.label}</span>
                {it.mediaKey && colors[it.mediaKey] && <span className="h-2.5 w-2.5 rounded-full" style={{ background: colors[it.mediaKey] }} aria-hidden />}
                {it.title}
              </p>
              <p className="mt-1 text-[15px] leading-relaxed text-ink-soft">{it.detail}</p>
              {onCreative && it.tone === "good" && it.mediaKey && (
                <button
                  type="button"
                  onClick={() => onCreative(it)}
                  disabled={!!creativeBusy}
                  className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-signal/30 bg-signal-soft/60 px-3 py-1.5 text-[13px] font-medium text-signal transition hover:border-signal disabled:opacity-50"
                >
                  {creativeBusy === it.id ? "성과 1위 소재를 찾는 중…" : "🎨 이 소재와 유사한 숏폼 생성하기"}
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
