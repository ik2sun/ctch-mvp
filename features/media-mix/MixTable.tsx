"use client";

// 상세 믹스안 — 매체 | 기존 예산 | 제안 예산(슬라이더) | 증감 | 예상 ROAS·CPA | 효율 한계점
// 슬라이더로 한 매체를 움직이면 잠기지 않은 다른 매체가 비율대로 줄거나 늘어 총액을 지킨다(페이지의 onTune).
import type { MediaPlanRow, Objective } from "./model";
import { Amount, BudgetDelta, man, pct, won } from "./parts";

const CONF: Record<MediaPlanRow["confidence"], { label: string; cls: string }> = {
  high: { label: "신뢰 높음", cls: "text-good" },
  mid: { label: "신뢰 보통", cls: "text-ink-muted" },
  low: { label: "신뢰 낮음", cls: "text-warn" },
};

export function MixTable({
  rows,
  objective,
  sliderMax,
  step,
  tuned,
  highlight,
  onHighlight,
  onTune,
  footer,
}: {
  rows: MediaPlanRow[];
  objective: Objective;
  sliderMax: number;
  step: number;
  tuned: boolean;
  highlight: string | null;
  onHighlight: (k: string | null) => void;
  onTune: (key: string, value: number) => void;
  footer: React.ReactNode;
}) {
  const asIs = rows.reduce((s, r) => s + r.asIs, 0);
  const toBe = rows.reduce((s, r) => s + r.toBe, 0);
  const rev = rows.reduce((s, r) => s + r.toBePred.revenue, 0);
  const conv = rows.reduce((s, r) => s + r.toBePred.conversions, 0);
  const showRoas = objective === "revenue";

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-[15px]">
          <thead>
            <tr className="border-b border-line text-left text-[13px] font-medium text-ink-muted">
              <th className="py-2 pr-3 font-medium">매체</th>
              <th className="px-3 py-2 text-right font-medium">기존 예산</th>
              <th className="w-[32%] px-3 py-2 font-medium">제안 예산 {tuned && <span className="whitespace-nowrap ml-1 rounded bg-signal-soft px-1.5 py-0.5 text-[12px] text-signal">수동 조정됨</span>}</th>
              <th className="px-3 py-2 font-medium">증감</th>
              <th className="px-3 py-2 text-right font-medium">{showRoas ? "예상 ROAS" : "예상 CPA"}</th>
              <th className="px-3 py-2 text-right font-medium">{showRoas ? "한계 ROAS" : "한계 CPA"}</th>
              <th className="py-2 pl-3 text-right font-medium">효율 한계점</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const p = r.toBePred;
              const roas = p.cost > 0 ? p.revenue / p.cost : null;
              const cpa = p.conversions > 0 ? p.cost / p.conversions : null;
              const asIsRoas = r.asIsPred.cost > 0 ? r.asIsPred.revenue / r.asIsPred.cost : null;
              const asIsCpa = r.asIsPred.conversions > 0 ? r.asIsPred.cost / r.asIsPred.conversions : null;
              const over = r.saturation != null && r.toBe > r.saturation * 1.02; // 경계 근처 반올림 오차는 경고하지 않음
              const dim = highlight && highlight !== r.key;
              return (
                <tr
                  key={r.key}
                  onMouseEnter={() => onHighlight(r.key)}
                  onMouseLeave={() => onHighlight(null)}
                  className={`border-b border-line/70 align-middle transition-opacity ${dim ? "opacity-50" : ""}`}
                >
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ background: r.color }} aria-hidden />
                      <span className="font-medium text-ink">{r.label}</span>
                      {r.locked && (
                        <span className="whitespace-nowrap inline-flex items-center gap-0.5 rounded bg-canvas px-1.5 py-0.5 text-[12px] text-ink-soft" title="고정 예산 — AI 재분배 제외">
                          <i className="ti ti-lock text-[13px]" aria-hidden />
                          고정
                        </span>
                      )}
                    </div>
                    <p className={`mt-0.5 pl-[18px] text-[13px] ${CONF[r.confidence].cls}`}>
                      {CONF[r.confidence].label}
                      {r.extrapolated && <span className="text-warn"> · 관측 범위 밖</span>}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums tabular-nums text-ink-soft"><Amount text={man(r.asIs)} /></td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={0}
                        max={sliderMax}
                        step={step}
                        value={Math.min(sliderMax, Math.round(r.toBe / step) * step)}
                        disabled={r.locked}
                        onChange={(e) => onTune(r.key, Number(e.target.value))}
                        aria-label={`${r.label} 제안 예산`}
                        aria-valuetext={won(r.toBe)}
                        className="h-1.5 min-w-0 flex-1 cursor-pointer rounded accent-[#15181E] focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 focus-visible:ring-offset-4 disabled:cursor-not-allowed disabled:opacity-40"
                      />
                      <span className="w-[92px] flex-shrink-0 text-right tabular-nums text-[15px] font-semibold tabular-nums text-ink"><Amount text={man(r.toBe)} /></span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <BudgetDelta delta={r.toBe - r.asIs} step={step} />
                  </td>
                  <td className="px-3 py-3 text-right">
                    <p className="font-mono font-semibold tabular-nums text-ink"><Amount text={showRoas ? pct(roas) : cpa != null ? won(cpa) : "—"} /></p>
                    <p className="text-[13px] text-ink-muted">
                      현재 <span className="font-mono tabular-nums"><Amount text={showRoas ? pct(asIsRoas) : asIsCpa != null ? won(asIsCpa) : "—"} /></span>
                    </p>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums tabular-nums text-ink-soft" title="이 지점에서 예산을 1원 더 쓸 때 얻는 성과">
                    <Amount text={showRoas ? pct(r.marginalRoas) : r.marginalCpa != null ? won(r.marginalCpa) : "—"} />
                  </td>
                  <td className="py-3 pl-3 text-right">
                    {r.saturation != null ? (
                      <span className={`font-mono tabular-nums ${over ? "text-warn" : "text-ink-soft"}`} title={showRoas ? "이 예산을 넘으면 한계 ROAS가 100% 아래로 떨어져요" : "이 예산을 넘으면 한계 CPA가 기준을 넘어요"}>
                        {over && <i className="ti ti-alert-triangle mr-0.5 text-[13px]" aria-hidden />}
                        <Amount text={man(r.saturation)} />
                        {over && <span className="sr-only">(초과)</span>}
                      </span>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="text-[15px]">
              <td className="py-3 pr-3 font-semibold text-ink">합계</td>
              <td className="px-3 py-3 text-right tabular-nums tabular-nums text-ink-soft"><Amount text={man(asIs)} /></td>
              <td className="px-3 py-3 text-right tabular-nums font-semibold tabular-nums text-ink"><Amount text={man(toBe)} /></td>
              <td className="px-3 py-3" />
              <td className="px-3 py-3 text-right tabular-nums font-semibold tabular-nums text-ink">
                <Amount text={showRoas ? pct(toBe > 0 ? rev / toBe : null) : conv > 0 ? won(toBe / conv) : "—"} />
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
      {footer}
    </div>
  );
}
