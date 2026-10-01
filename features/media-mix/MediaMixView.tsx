"use client";

// 미디어믹스 최적화 본문 — 좌측 조건 설정 / 우측 시뮬레이션 보드(Uplift·AS-IS vs TO-BE·반응 곡선) / 하단 상세 믹스안·동기화
// 학습 데이터(models)는 밖에서 받는다(페이지는 매체 API, 미리보기는 샘플).
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Card } from "@/features/dashboard/ui";
import { MixTable } from "./MixTable";
import { SyncDialog } from "./SyncDialog";
import { Amount, MixBars, ResponseCurves, RollingNumber, count, man, pct, won } from "./parts";
import { MAX_X, MIN_X, OBJECTIVES, evaluate, maxBudgetForTarget, optimize, type MediaModel, type Objective, type PlanInput } from "./model";

function daysLeftInMonth() {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return last - d.getDate() + 1;
}
const roundTo = (v: number, unit: number) => Math.max(unit, Math.round(v / unit) * unit);
const parseNum = (s: string) => Number(s.replace(/[^\d.]/g, "")) || 0;

export function MediaMixView({
  models,
  clientId,
  clientName,
  dataControls,
  notes,
}: {
  models: MediaModel[];
  clientId: string | null;
  clientName: string;
  dataControls?: ReactNode; // 학습 기간·새로고침
  notes?: ReactNode; // 매체 로딩 상태
}) {
  const monthDays = daysLeftInMonth();
  const PERIODS = [
    { key: "month", label: `이번 달 남은 ${monthDays}일`, days: monthDays },
    { key: "30", label: "30일", days: 30 },
    { key: "14", label: "14일", days: 14 },
    { key: "7", label: "7일", days: 7 },
  ];
  const [periodKey, setPeriodKey] = useState("month");
  const periodDays = PERIODS.find((p) => p.key === periodKey)?.days ?? 30;

  // 현재 페이스(학습 기간 평균 일 광고비 × 집행 일수)
  const pace = useMemo(() => models.reduce((s, m) => s + m.avgDailyCost, 0) * periodDays, [models, periodDays]);
  const [budgetText, setBudgetText] = useState("");
  const totalBudget = budgetText ? parseNum(budgetText) : roundTo(pace, 100000);

  const [objective, setObjective] = useState<Objective>("revenue");
  const [targetRoasText, setTargetRoasText] = useState("");
  const [targetCpaText, setTargetCpaText] = useState("");
  const targetRoas = parseNum(targetRoasText) > 0 ? parseNum(targetRoasText) / 100 : null;
  const targetCpa = parseNum(targetCpaText) > 0 ? parseNum(targetCpaText) : null;

  const [locks, setLocks] = useState<Record<string, number>>({});
  const [tuned, setTuned] = useState<Record<string, number> | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);

  // 매체 구성이 바뀌면(광고주 전환·재조회) 잠금 정리
  const modelKeys = models.map((m) => m.key).join(",");
  useEffect(() => {
    setLocks((l) => Object.fromEntries(Object.entries(l).filter(([k]) => models.some((m) => m.key === k))));
    setTuned(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelKeys]);

  const input: PlanInput = useMemo(
    () => ({ models, totalBudget, periodDays, objective, targetRoas, targetCpa, locks }),
    [models, totalBudget, periodDays, objective, targetRoas, targetCpa, locks],
  );
  const aiPlan = useMemo(() => (models.length ? optimize(input) : null), [input, models.length]);
  // 조건이 바뀌면 수동 조정은 버리고 AI 제안으로 돌아간다
  useEffect(() => setTuned(null), [aiPlan]);
  const plan = useMemo(() => (aiPlan && tuned ? evaluate(input, tuned, aiPlan) : aiPlan), [aiPlan, tuned, input]);
  const maxBudget = useMemo(() => (models.length ? maxBudgetForTarget(input) : null), [input, models.length]);

  const step = useMemo(() => roundTo(totalBudget / 400, 10000), [totalBudget]);
  const free = Math.max(0, totalBudget - (plan?.lockedTotal ?? 0));

  // 슬라이더 — 한 매체를 움직이면 잠기지 않은 나머지가 비율대로 흡수해 합계를 지킨다
  const tune = useCallback(
    (key: string, value: number) => {
      if (!plan) return;
      const cur: Record<string, number> = Object.fromEntries(plan.rows.map((r) => [r.key, r.toBe]));
      const others = plan.rows.filter((r) => !r.locked && r.key !== key);
      const pool = others.reduce((s, r) => s + cur[r.key], 0);
      let diff = value - cur[key];
      if (!others.length) return;
      if (diff > pool) diff = pool;
      cur[key] += diff;
      if (pool > 0) for (const r of others) cur[r.key] = Math.max(0, cur[r.key] - (diff * cur[r.key]) / pool);
      else for (const r of others) cur[r.key] = Math.max(0, cur[r.key] - diff / others.length);
      setTuned(cur);
    },
    [plan],
  );

  const isRev = objective === "revenue";
  const metricOf = (p: { revenue: number; conversions: number; cost: number }) =>
    objective === "revenue" ? p.revenue : objective === "conversions" ? p.conversions : p.conversions > 0 ? p.cost / p.conversions : 0;
  const upliftValue = plan ? (objective === "cpa" ? metricOf(plan.asIs) - metricOf(plan.toBe) : metricOf(plan.toBe) - metricOf(plan.asIs)) : 0;
  const asIsRoas = plan && plan.asIs.cost > 0 ? plan.asIs.revenue / plan.asIs.cost : null;
  const toBeRoas = plan && plan.toBe.cost > 0 ? plan.toBe.revenue / plan.toBe.cost : null;
  const asIsCpa = plan && plan.asIs.conversions > 0 ? plan.asIs.cost / plan.asIs.conversions : null;
  const toBeCpa = plan && plan.toBe.conversions > 0 ? plan.toBe.cost / plan.toBe.conversions : null;
  const unspent = plan ? Math.max(0, totalBudget - plan.toBe.cost) : 0;

  const targetCheck =
    objective === "revenue" && targetRoas && toBeRoas != null
      ? { ok: toBeRoas >= targetRoas, text: `목표 ROAS ${pct(targetRoas)} ${toBeRoas >= targetRoas ? "달성" : "미달"} 예상 (${pct(toBeRoas)})` }
      : objective !== "revenue" && targetCpa && toBeCpa != null
        ? { ok: toBeCpa <= targetCpa, text: `목표 CPA ${won(targetCpa)} ${toBeCpa <= targetCpa ? "달성" : "미달"} 예상 (${won(toBeCpa)})` }
        : null;

  const lowConf = plan?.rows.filter((r) => r.confidence === "low").map((r) => r.label) ?? [];
  const extrap = plan?.rows.filter((r) => r.extrapolated).map((r) => r.label) ?? [];

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[300px_1fr]">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;600;700&display=swap" precedence="default" />

      {/* ── 1. 조건 설정 ───────────────────────── */}
      <aside className="space-y-4 rounded-card border border-line bg-surface p-6 lg:sticky lg:top-4">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">조건 설정</h3>
          <p className="mt-0.5 text-[13px] text-ink-muted">바꾸면 바로 다시 계산돼요</p>
        </div>

        <Field label="총예산" hint={`현재 페이스 ${man(pace)}`}>
          <div className="flex items-center rounded-lg border border-line bg-surface focus-within:border-ink/40">
            <input
              inputMode="numeric"
              value={budgetText || totalBudget.toLocaleString("ko-KR")}
              onChange={(e) => setBudgetText(parseNum(e.target.value).toLocaleString("ko-KR"))}
              className="min-w-0 flex-1 bg-transparent px-3 py-2 text-right tabular-nums text-[16px] font-semibold tabular-nums text-ink outline-none"
              aria-label="총예산(원)"
            />
            <span className="pr-3 text-[13px] text-ink-muted">원</span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {[
              { l: "현재 페이스", v: pace },
              { l: "−20%", v: pace * 0.8 },
              { l: "+20%", v: pace * 1.2 },
              { l: "+50%", v: pace * 1.5 },
            ].map((q) => (
              <button
                key={q.l}
                type="button"
                onClick={() => setBudgetText(roundTo(q.v, 100000).toLocaleString("ko-KR"))}
                className="whitespace-nowrap rounded-md border border-line px-2 py-0.5 text-[13px] text-ink-soft hover:border-ink/30 hover:text-ink"
              >
                {q.l}
              </button>
            ))}
          </div>
        </Field>

        <Field label="집행 기간">
          <div className="grid grid-cols-2 gap-1">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                type="button"
                aria-pressed={periodKey === p.key}
                onClick={() => setPeriodKey(p.key)}
                className={`rounded-md border px-2 py-1.5 text-[13px] ${periodKey === p.key ? "border-ink bg-ink font-medium text-white" : "border-line text-ink-soft hover:border-ink/30"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="최적화 목표">
          <div className="space-y-1.5" role="radiogroup">
            {OBJECTIVES.map((o) => (
              <button
                key={o.key}
                type="button"
                role="radio"
                aria-checked={objective === o.key}
                onClick={() => setObjective(o.key)}
                className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left transition ${objective === o.key ? "border-ink bg-canvas" : "border-line hover:border-ink/30"}`}
              >
                <span className={`mt-[3px] flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full border ${objective === o.key ? "border-ink" : "border-ink-faint"}`}>
                  {objective === o.key && <span className="h-1.5 w-1.5 rounded-full bg-ink" />}
                </span>
                <span>
                  <span className="block text-[15px] font-medium text-ink">{o.label}</span>
                  <span className="block text-[13px] leading-snug text-ink-muted">{o.desc}</span>
                </span>
              </button>
            ))}
          </div>
        </Field>

        <Field label={isRev ? "목표 ROAS (선택)" : objective === "cpa" ? "목표 CPA" : "목표 CPA (선택)"} hint={objective === "cpa" && !targetCpa ? "비우면 현재 평균 CPA의 1.2배" : undefined}>
          <div className="flex items-center rounded-lg border border-line focus-within:border-ink/40">
            <input
              inputMode="numeric"
              placeholder={isRev ? "300" : "20,000"}
              value={isRev ? targetRoasText : targetCpaText}
              onChange={(e) => {
                const v = e.target.value ? parseNum(e.target.value).toLocaleString("ko-KR") : "";
                if (isRev) setTargetRoasText(v);
                else setTargetCpaText(v);
              }}
              className="min-w-0 flex-1 bg-transparent px-3 py-2 text-right tabular-nums text-[15px] tabular-nums text-ink outline-none placeholder:text-ink-faint"
              aria-label={isRev ? "목표 ROAS(%)" : "목표 CPA(원)"}
            />
            <span className="pr-3 text-[13px] text-ink-muted">{isRev ? "%" : "원"}</span>
          </div>
        </Field>

        <Field label="매체 제어" hint="잠근 매체는 입력한 예산으로 고정하고, 나머지 매체 안에서만 재분배해요">
          {models.length ? (
            <ul className="space-y-1.5">
              {models.map((m) => {
                const locked = locks[m.key] != null;
                const row = plan?.rows.find((r) => r.key === m.key);
                return (
                  <li key={m.key} className={`rounded-lg border px-2.5 py-2 ${locked ? "border-ink/25 bg-canvas" : "border-line"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-[15px] text-ink">
                        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: m.color }} aria-hidden />
                        {m.label}
                      </span>
                      <button
                        type="button"
                        aria-pressed={locked}
                        onClick={() =>
                          setLocks((l) => {
                            const n = { ...l };
                            if (locked) delete n[m.key];
                            else n[m.key] = roundTo(row?.toBe ?? m.avgDailyCost * periodDays, 10000);
                            return n;
                          })
                        }
                        className={`whitespace-nowrap flex items-center gap-1 rounded-md px-2 py-0.5 text-[13px] ${locked ? "bg-ink text-white" : "border border-line text-ink-muted hover:text-ink"}`}
                      >
                        <i className={`ti ${locked ? "ti-lock" : "ti-lock-open"} text-[13px]`} aria-hidden />
                        {locked ? "고정" : "자동"}
                      </button>
                    </div>
                    {locked && (
                      <div className="mt-1.5 flex items-center rounded-md border border-line bg-surface">
                        <input
                          inputMode="numeric"
                          value={locks[m.key].toLocaleString("ko-KR")}
                          onChange={(e) => setLocks((l) => ({ ...l, [m.key]: parseNum(e.target.value) }))}
                          className="min-w-0 flex-1 bg-transparent px-2 py-1 text-right tabular-nums text-[15px] tabular-nums text-ink outline-none"
                          aria-label={`${m.label} 고정 예산(원)`}
                        />
                        <span className="pr-2 text-[13px] text-ink-muted">원</span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[13px] text-ink-muted">학습할 매체 데이터가 없어요.</p>
          )}
          {plan?.overLocked && <p className="mt-1.5 text-[13px] text-bad">고정 예산 합계가 총예산보다 커요.</p>}
        </Field>

        {dataControls && <div className="border-t border-line pt-4">{dataControls}</div>}
      </aside>

      <div className="min-w-0 space-y-5">
        {notes}
        {!plan ? (
          <div className="rounded-card border border-line bg-surface py-20 text-center text-[15px] text-ink-muted">학습할 매체 데이터가 모이면 최적 배분을 계산해요.</div>
        ) : (
          <>
            {/* ── 2. 시뮬레이션 보드 ───────────────────── */}
            <section className="rounded-card border border-line bg-surface p-6">
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1.1fr]">
                <div>
                  <p className="text-[13px] font-medium text-ink-muted">
                    AI 제안 적용 시, {objective === "cpa" ? "같은 예산 조건에서 예상 CPA" : `동일 예산으로 예상 ${isRev ? "매출" : "전환"}`}
                  </p>
                  <p className={`mt-1 font-mono text-[40px] font-bold leading-none tracking-tight ${upliftValue > 0 ? "text-ink" : "text-ink-muted"}`}>
                    <RollingNumber
                      value={upliftValue}
                      unitClass="ml-1 font-sans text-[0.55em] font-semibold"
                      format={(v) => (objective === "revenue" ? man(v, true) : objective === "conversions" ? count(v, true) : `${v > 0 ? "−" : v < 0 ? "+" : ""}${Math.round(Math.abs(v)).toLocaleString("ko-KR")}원`)}
                    />
                    {upliftValue > 0 && (
                      <span className="ml-2 align-middle text-[26px]" aria-hidden>
                        📈
                      </span>
                    )}
                  </p>
                  <p className="mt-2 text-[13px] text-ink-soft">
                    {upliftValue > 0
                      ? objective === "cpa"
                        ? `전환당 비용이 ${won(asIsCpa ?? 0)} → ${won(toBeCpa ?? 0)}로 낮아질 것으로 예상돼요`
                        : `현재 비중대로 ${man(totalBudget)}을 쓸 때보다 ${isRev ? "매출" : "전환"}이 ${pct(metricOf(plan.asIs) > 0 ? upliftValue / metricOf(plan.asIs) : null)} 늘어요`
                      : "현재 비중이 이미 최적에 가까워요"}
                  </p>
                  {objective === "cpa" && unspent > step && (
                    <p className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-good/10 px-2 py-1 text-[13px] font-medium text-good">
                      <i className="ti ti-piggy-bank text-[15px]" aria-hidden />
                      한계 CPA {won(plan.cpaThreshold ?? 0)}를 넘는 {man(unspent)}은 쓰지 않기를 권해요
                    </p>
                  )}
                  {targetCheck && (
                    <p className={`mt-2 flex items-center gap-1 text-[13px] font-medium ${targetCheck.ok ? "text-good" : "text-warn"}`}>
                      <i className={`ti ${targetCheck.ok ? "ti-circle-check" : "ti-alert-triangle"} text-[15px]`} aria-hidden />
                      {targetCheck.text}
                    </p>
                  )}
                  {maxBudget != null && (
                    <p className="mt-1 text-[13px] text-ink-muted">
                      목표를 지키며 쓸 수 있는 최대 예산 약 <b className="font-mono font-semibold text-ink"><Amount text={man(maxBudget)} /></b>
                    </p>
                  )}

                  <dl className="mt-5 grid grid-cols-2 gap-2">
                    {[
                      { k: "예상 매출", a: man(plan.asIs.revenue), b: plan.toBe.revenue, f: (v: number) => man(v), up: plan.toBe.revenue >= plan.asIs.revenue },
                      { k: "예상 ROAS", a: pct(asIsRoas), b: toBeRoas ?? 0, f: (v: number) => pct(v), up: (toBeRoas ?? 0) >= (asIsRoas ?? 0) },
                      { k: "예상 전환", a: count(plan.asIs.conversions), b: plan.toBe.conversions, f: (v: number) => count(v), up: plan.toBe.conversions >= plan.asIs.conversions },
                      { k: "예상 CPA", a: asIsCpa != null ? won(asIsCpa) : "—", b: toBeCpa ?? 0, f: (v: number) => (v ? won(v) : "—"), up: (toBeCpa ?? 0) <= (asIsCpa ?? 0) },
                    ].map((x) => (
                      <div key={x.k} className="rounded-lg bg-canvas px-3 py-2.5">
                        <dt className="text-[13px] text-ink-muted">{x.k}</dt>
                        <dd className="mt-0.5 font-mono text-[17px] font-bold tabular-nums text-ink">
                          <RollingNumber value={x.b} format={x.f} unitClass="ml-0.5 font-sans text-[0.75em] font-semibold" />
                        </dd>
                        <dd className="text-[13px] text-ink-muted">
                          현재 비중{" "}
                          <span className="font-mono tabular-nums">
                            <Amount text={x.a} />
                          </span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>

                <div className="min-w-0">
                  <p className="mb-3 text-[13px] font-medium text-ink-soft">예산 비중 · 현재 vs AI 제안</p>
                  <MixBars rows={plan.rows} highlight={highlight} onHighlight={setHighlight} />
                  <p className="mb-1 mt-6 text-[13px] font-medium text-ink-soft">반응 곡선 · 예산을 늘릴수록 {isRev ? "매출" : "전환"}이 얼마나 느나</p>
                  <p className="mb-2 text-[13px] text-ink-muted">빈 점 = 현재 비중, 채운 점 = 제안. 곡선이 눕는 구간이 효율 한계(체감 수익)예요</p>
                  <ResponseCurves models={models} rows={plan.rows} objective={objective} periodDays={periodDays} highlight={highlight} />
                </div>
              </div>
              {(lowConf.length > 0 || extrap.length > 0) && (
                <p className="mt-4 flex items-start gap-1.5 rounded-lg border border-warn/25 bg-warn/5 px-3 py-2 text-[13px] text-warn">
                  <i className="ti ti-info-circle mt-[1px] text-[15px]" aria-hidden />
                  <span>
                    {lowConf.length > 0 && `${lowConf.join("·")}는 학습 데이터가 적거나 일별 변동이 작아 예측 신뢰가 낮아요. `}
                    {extrap.length > 0 && `${extrap.join("·")}는 지금까지 써 본 적 없는 규모(평균의 ${MAX_X}배 초과)라 실제와 차이가 클 수 있어요.`}
                  </span>
                </p>
              )}
            </section>

            {/* ── 3. 상세 믹스안 · 실행 ───────────────────── */}
            <Card title="상세 믹스안" sub={`${periodDays}일 기준 · 슬라이더로 조정하면 나머지 자동 매체가 비율대로 맞춰지고 예측이 바로 바뀌어요`}>
              <MixTable
                rows={plan.rows}
                objective={objective}
                sliderMax={free}
                step={step}
                tuned={!!tuned}
                highlight={highlight}
                onHighlight={setHighlight}
                onTune={tune}
                footer={
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {tuned && (
                        <button type="button" onClick={() => setTuned(null)} className="flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-line px-3 py-2 text-[13px] text-ink-soft hover:border-ink/30 hover:text-ink">
                          <i className="ti ti-arrow-back-up text-[15px]" aria-hidden />
                          AI 제안으로 되돌리기
                        </button>
                      )}
                      <p className="text-[13px] text-ink-muted">일 예산으로 나누면 {plan.rows.map((r) => `${r.label} ${won(roundTo(r.toBe / periodDays, 100))}`).join(" · ")}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSyncOpen(true)}
                      disabled={!clientId || plan.toBe.cost <= 0}
                      className="flex items-center gap-1.5 rounded-lg bg-ink px-5 py-2.5 text-[15px] font-semibold text-white shadow-[0_1px_2px_rgba(21,24,30,0.2)] transition hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <i className="ti ti-refresh-dot text-[16px]" aria-hidden />
                      이대로 예산 동기화하기
                    </button>
                  </div>
                }
              />
            </Card>

            <details className="group rounded-card border border-line bg-surface px-5 py-3.5 text-[13px] text-ink-soft">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-ink">
                <i className="ti ti-help-circle text-[15px]" aria-hidden />
                어떻게 계산하나요
                <i className="ti ti-chevron-down text-[13px] transition group-open:rotate-180" aria-hidden />
              </summary>
              <ul className="mt-2.5 list-disc space-y-1 pl-5 leading-relaxed">
                <li>매체 API에서 받은 학습 기간 일별 광고비·매출·전환으로 매체마다 반응 곡선(성과 = a × 광고비<sup>b</sup>)을 맞춰요. b가 1보다 작을수록 예산을 늘렸을 때 효율이 빨리 떨어져요.</li>
                <li>데이터가 적거나 일별 광고비 변동이 작으면 기울기를 믿기 어려워 업계 평균값(b=0.65) 쪽으로 당겨요 — 표의 &lsquo;신뢰&rsquo;가 그 정도예요.</li>
                <li>잠그지 않은 예산을 600조각으로 나눠, 매번 한 조각 더 썼을 때 성과가 가장 큰 매체에 줘요(한계 효율 균등화). 매체별로 평균의 {MIN_X}~{MAX_X}배 안에서 먼저 배분하고, 넘는 부분은 &lsquo;관측 범위 밖&rsquo;으로 표시해요.</li>
                <li>&lsquo;현재 비중&rsquo;은 같은 총예산을 학습 기간의 매체 광고비 비율대로 쓴다고 보고 같은 곡선으로 예측한 값이에요. 그래서 Uplift는 예산 규모가 아니라 배분만의 효과예요.</li>
                <li>효율 한계점: 매출 목표는 한계 ROAS가 100% 아래로 떨어지는 예산, 전환·CPA 목표는 한계 CPA가 기준을 넘는 예산이에요.</li>
                <li>매체마다 전환 집계 기준(기여 기간·전환 유형)이 달라 매체 간 비교에는 오차가 있어요. 시즌·프로모션·소재 교체 효과는 반영하지 않아요.</li>
              </ul>
            </details>
          </>
        )}
      </div>

      {syncOpen && plan && clientId && (
        <SyncDialog
          clientId={clientId}
          clientName={clientName}
          targets={Object.fromEntries(plan.rows.map((r) => [r.key, roundTo(r.toBe / periodDays, 100)]))}
          context={{
            objective,
            totalBudget,
            periodDays,
            targetRoas,
            targetCpa,
            locks,
            tuned: !!tuned,
            predicted: { asIs: plan.asIs, toBe: plan.toBe },
            budgets: Object.fromEntries(plan.rows.map((r) => [r.key, { asIs: Math.round(r.asIs), toBe: Math.round(r.toBe) }])),
          }}
          onClose={() => setSyncOpen(false)}
        />
      )}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-medium text-ink-soft">{label}</p>
      {children}
      {hint && <p className="mt-1 text-[13px] leading-snug text-ink-muted">{hint}</p>}
    </div>
  );
}
