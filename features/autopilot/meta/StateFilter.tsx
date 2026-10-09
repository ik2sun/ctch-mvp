"use client";

// 메타 캠페인 목록 상태 필터 — GFA 캠페인 선택과 같은 전체 / ON / OFF 알약(개수는 검색 결과 기준)
export type StateKey = "all" | "on" | "off";
export const isOn = (status: string) => status === "ACTIVE";
// 지원 안 하는 목표·예약(도달·빈도) 캠페인 — 숨기지 않고 자물쇠로 보여 준다
export const lockReason = (c: { objective: string; buyingType: string }, supported: string[]) =>
  c.buyingType !== "AUCTION" ? "도달·빈도(예약) 구매 캠페인은 자동 세팅을 지원하지 않아요" : !supported.includes(c.objective) ? "앱 홍보 캠페인은 웹사이트용 이미지·영상 광고 세팅을 지원하지 않아요" : null;

export function StateFilter({ value, onChange, counts }: { value: StateKey; onChange: (v: StateKey) => void; counts?: Record<StateKey, number> }) {
  return (
    <div className="inline-flex shrink-0 rounded-full bg-[#F2F4F7] p-1">
      {(
        [
          { key: "all", label: "전체" },
          { key: "on", label: "ON" },
          { key: "off", label: "OFF" },
        ] as const
      ).map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          aria-pressed={value === o.key}
          className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1 text-[13px] transition ${value === o.key ? "bg-white font-semibold text-ink shadow-[0_1px_3px_rgba(16,24,40,0.12)]" : "text-ink-muted hover:text-ink"}`}
        >
          {o.label}
          {counts && <span className={`text-[12px] tabular-nums ${value === o.key ? "text-[#eb6834]" : "text-ink-faint"}`}>{counts[o.key]}</span>}
        </button>
      ))}
    </div>
  );
}
