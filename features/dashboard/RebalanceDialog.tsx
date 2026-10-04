"use client";

// 예산 재분배 — AI 제안(from → to, n%)을 매체 일 예산 목표로 바꿔 보여주고, 확인하면 예산 동기화(SyncDialog)로 넘긴다.
// 기준은 조회 기간 '실제 일평균 지출'(설정 예산 아님). 실제 반영은 SyncDialog가 캠페인별 계획을 다시 보여주고 체크 후 실행 —
// 메타·네이버 SA만 API로 바뀌고, GFA·카카오·구글 Ads는 수동 반영 안내. 뷰어는 계획 보기까지만(실행은 서버가 막음).
import { useState } from "react";
import { SyncDialog } from "@/features/media-mix/SyncDialog";

type Media = { key: string; label: string; color: string; cost: number };
const won = (v: number) => `₩${Math.round(v).toLocaleString("ko-KR")}`;
const AUTO = new Set(["meta", "naver"]);
const roundTo = (v: number, step: number) => Math.max(0, Math.round(v / step) * step);

export function RebalanceDialog({
  clientId,
  clientName,
  media,
  days,
  fromKey,
  toKey,
  percent: initial,
  reason,
  onClose,
}: {
  clientId: string;
  clientName: string;
  media: Media[];
  days: number;
  fromKey: string;
  toKey: string;
  percent: number;
  reason: string;
  onClose: () => void;
}) {
  const [percent, setPercent] = useState(Math.min(50, Math.max(5, Math.round(initial))));
  const [sync, setSync] = useState(false);
  const from = media.find((m) => m.key === fromKey);
  const to = media.find((m) => m.key === toKey);
  if (!from || !to) return null;
  const fromDaily = from.cost / Math.max(1, days);
  const toDaily = to.cost / Math.max(1, days);
  const moveDaily = (fromDaily * percent) / 100;
  const targets: Record<string, number> = { [from.key]: roundTo(fromDaily - moveDaily, 100), [to.key]: roundTo(toDaily + moveDaily, 100) };

  if (sync) {
    return <SyncDialog clientId={clientId} clientName={clientName} targets={targets} context={{ source: "dashboard_rebalance", fromKey, toKey, percent, reason, days }} onClose={onClose} />;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="w-full max-w-[560px] rounded-card bg-surface p-6 shadow-[0_24px_60px_rgba(16,24,40,0.25)]" onClick={(e) => e.stopPropagation()}>
        <p className="text-[13px] font-semibold text-signal">⚡ 예산 재분배</p>
        <h3 className="mt-1 text-[19px] font-semibold text-ink">
          {from.label} → {to.label}
        </h3>
        <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">{reason}</p>

        <div className="mt-5">
          <div className="flex items-baseline justify-between">
            <label htmlFor="rb-pct" className="text-[14px] font-medium text-ink-soft">
              옮길 비율 ({from.label} 일 예산 기준)
            </label>
            <span className="text-[18px] font-semibold tabular-nums text-ink">{percent}%</span>
          </div>
          <input id="rb-pct" type="range" min={5} max={50} step={5} value={percent} onChange={(e) => setPercent(Number(e.target.value))} className="mt-2 w-full accent-[#4F46E5]" />
        </div>

        <table className="mt-4 w-full text-[14px] tabular-nums">
          <thead>
            <tr className="border-b border-line text-left text-[12px] text-ink-muted">
              <th className="py-2 font-medium">매체</th>
              <th className="py-2 text-right font-medium">지금(일평균 지출)</th>
              <th className="py-2 text-right font-medium">새 일 예산</th>
              <th className="py-2 text-right font-medium">반영</th>
            </tr>
          </thead>
          <tbody>
            {[
              { m: from, now: fromDaily, next: targets[from.key] },
              { m: to, now: toDaily, next: targets[to.key] },
            ].map(({ m, now, next }) => (
              <tr key={m.key} className="border-b border-line last:border-0">
                <td className="py-2.5">
                  <span className="flex items-center gap-2 font-medium text-ink">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} aria-hidden />
                    {m.label}
                  </span>
                </td>
                <td className="py-2.5 text-right text-ink-soft">{won(now)}</td>
                <td className="py-2.5 text-right font-semibold text-ink">
                  {won(next)} <span className={`text-[12px] font-normal ${next >= now ? "text-good" : "text-bad"}`}>{next >= now ? "↗ +" : "↘ "}{won(next - now).replace("₩-", "-₩")}</span>
                </td>
                <td className="py-2.5 text-right">
                  <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] ${AUTO.has(m.key) ? "bg-good/10 text-good" : "bg-canvas text-ink-muted"}`}>{AUTO.has(m.key) ? "API 자동" : "수동 안내"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-[12px] leading-relaxed text-ink-muted">
          조회 기간 {days}일의 실제 일평균 지출을 기준으로 계산해요. 다음 단계에서 캠페인별 새 일 예산을 확인한 뒤에만 실제 계정에 반영돼요(메타·네이버 SA). GFA·카카오·구글 Ads는 반영할 금액을 안내해 드려요.
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost h-10 px-4 text-[14px]">
            취소
          </button>
          <button type="button" onClick={() => setSync(true)} className="btn-signal h-10 px-5 text-[14px]">
            캠페인별 변경 계획 보기 →
          </button>
        </div>
      </div>
    </div>
  );
}
