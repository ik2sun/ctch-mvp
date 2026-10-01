"use client";

export type AiPlan = { issues: string[]; urgentActions: string[]; nextWeekActions: string[] };

// AI 액션 플랜 — 본문 15px·행간 1.6·넉넉한 안쪽 여백. 즉시 조치가 없으면 빈 칸 대신 상단 상태 줄 + 2단.
function PlanGroup({ title, icon, tone, items, empty }: { title: string; icon: string; tone: "ink" | "bad" | "signal"; items: string[]; empty: string }) {
  const head = tone === "bad" ? "text-bad" : tone === "signal" ? "text-signal" : "text-[#1A1A1A]";
  const box = tone === "bad" ? "border border-bad/25 bg-bad/[0.04]" : "bg-canvas";
  return (
    <div>
      <p className={`mb-3 flex items-center gap-1.5 text-[16px] font-semibold ${head}`}>
        <i className={`ti ${icon} text-[17px]`} aria-hidden />
        {title}
        <span className="text-[15px] font-medium text-ink-muted">{items.length}</span>
      </p>
      {items.length ? (
        <ol className="space-y-2.5">
          {items.map((t, i) => (
            <li key={i} className={`flex gap-3 rounded-lg px-5 py-4 text-[16px] leading-[1.6] text-[#1A1A1A] ${box}`}>
              <span className="mt-[1px] flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-surface text-[13px] font-semibold text-ink-muted ring-1 ring-line">{i + 1}</span>
              <span>{t}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-lg bg-canvas px-5 py-4 text-[15px] leading-[1.6] text-ink-muted">{empty}</p>
      )}
    </div>
  );
}

export function AiPlanView({ plan }: { plan: AiPlan }) {
  const urgent = plan.urgentActions;
  return (
    <div className="space-y-5">
      {urgent.length === 0 && (
        <p className="flex items-center gap-2 rounded-lg border border-good/25 bg-good/[0.06] px-5 py-3.5 text-[16px] leading-[1.6] text-[#1A1A1A]">
          <i className="ti ti-circle-check text-[18px] text-good" aria-hidden />
          <span>
            <b className="font-semibold text-good">즉시 조치가 필요한 항목이 없어요.</b> ROAS 급락·CPA 급등 같은 위험 신호가 보이지 않아요.
          </span>
        </p>
      )}
      <div className={`grid grid-cols-1 gap-6 ${urgent.length ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
        <PlanGroup title="주요 이슈" icon="ti-list-search" tone="ink" items={plan.issues} empty="특이 이슈가 없어요." />
        {urgent.length > 0 && <PlanGroup title="즉시 조치" icon="ti-alert-triangle" tone="bad" items={urgent} empty="" />}
        <PlanGroup title="다음 주 추천" icon="ti-target-arrow" tone="signal" items={plan.nextWeekActions} empty="추천 액션이 없어요." />
      </div>
    </div>
  );
}
