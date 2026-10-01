"use client";

// 상관관계 분석 본문 — 상위 퍼널(영상·도달·트래픽·참여) 캠페인이 성과 캠페인·검색 수요를 움직였는지.
// 데이터(CorrDataRes)는 밖에서 받는다(페이지는 매체 API, 미리보기는 샘플).
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, Segmented } from "@/features/dashboard/ui";
import { MEDIA_COLORS } from "@/features/dashboard/analysis";
import {
  buildSeries,
  coMovement,
  dateRange,
  lagCorrelation,
  onOff,
  parseExternalCsv,
  regress,
  type DriverMetric,
  type LagResult,
  type Series,
  type Strength,
} from "./analysis";
import { Heatmap, LagChart, TimelineCharts, fmtValue } from "./charts";
import { DRIVER_ROLES, MEDIA_LABEL, ROLE_META, guessRole, type CorrDataRes, type Role } from "./types";

const STRENGTH: Record<Strength, { label: string; cls: string; icon: string }> = {
  strong: { label: "뚜렷함", cls: "border-good/25 bg-good/10 text-good", icon: "ti-circle-check" },
  moderate: { label: "있음", cls: "border-good/20 bg-good/5 text-good", icon: "ti-check" },
  weak: { label: "약함·참고", cls: "border-line bg-canvas text-ink-muted", icon: "ti-minus" },
  none: { label: "확인 안 됨", cls: "border-line bg-canvas text-ink-muted", icon: "ti-circle-dashed" },
};

// 받침에 따라 조사 고르기 — josa("영상 광고비", "이", "가") → "영상 광고비가"
function josa(word: string, withBatchim: string, without: string) {
  const ch = word.trim().slice(-1);
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return `${word}${without}`;
  return `${word}${code % 28 ? withBatchim : without}`;
}

function loadRoles(clientId: string): Record<string, Role> {
  try {
    return JSON.parse(localStorage.getItem(`ctch_corr_roles_${clientId}`) || "{}");
  } catch {
    return {};
  }
}
function saveRoles(clientId: string, v: Record<string, Role>) {
  try {
    localStorage.setItem(`ctch_corr_roles_${clientId}`, JSON.stringify(v));
  } catch {
    /* 저장 실패는 무시 — 이번 화면에서만 유지 */
  }
}

export function CorrelationView({ data, clientId }: { data: CorrDataRes; clientId: string }) {
  const dates = useMemo(() => dateRange(data.since, data.until), [data.since, data.until]);

  // 캠페인 역할 — 매체 목표로 추정, 사용자가 바꾼 값은 광고주별로 브라우저에 기억
  const [overrides, setOverrides] = useState<Record<string, Role>>({});
  useEffect(() => setOverrides(loadRoles(clientId)), [clientId]);
  const roles = useMemo(() => {
    const out: Record<string, Role> = {};
    for (const c of data.campaigns) out[c.id] = overrides[c.id] ?? guessRole(c.media, c.objective, c.name);
    return out;
  }, [data.campaigns, overrides]);
  const setRole = (id: string, role: Role) => {
    const next = { ...overrides, [id]: role };
    setOverrides(next);
    saveRoles(clientId, next);
  };

  const [metric, setMetric] = useState<DriverMetric>("cost");
  const [external, setExternal] = useState<Series[]>([]);
  const [extRole, setExtRole] = useState<Record<string, "driver" | "outcome">>({});
  const [extError, setExtError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const built = useMemo(() => buildSeries(data.campaigns, roles, dates, metric), [data.campaigns, roles, dates, metric]);
  const drivers = useMemo(() => [...built.drivers, ...external.filter((s) => (extRole[s.key] ?? "driver") === "driver")], [built.drivers, external, extRole]);
  const outcomes = useMemo(() => [...built.outcomes, ...external.filter((s) => extRole[s.key] === "outcome")], [built.outcomes, external, extRole]);

  const [outcomeKey, setOutcomeKey] = useState("perf_conv");
  const outcome = outcomes.find((o) => o.key === outcomeKey) ?? outcomes[0];
  const [driverKey, setDriverKey] = useState<string | null>(null);
  const driver = drivers.find((d) => d.key === driverKey) ?? drivers[0];
  const [highlight, setHighlight] = useState<string | null>(null);

  // 모든 원인 × 결과 시차 상관
  const cells = useMemo(() => {
    const m: Record<string, LagResult> = {};
    for (const d of drivers) for (const o of outcomes) m[`${d.key}|${o.key}`] = lagCorrelation(d, o, dates);
    return m;
  }, [drivers, outcomes, dates]);

  // 회귀 — 각 원인은 매트릭스에서 찾은 최적 시차·잔존(양의 관계일 때), 아니면 기본값
  const regression = useMemo(() => {
    if (!outcome) return null;
    const ds = drivers.filter((d) => !d.external || d.additive);
    const picks: Record<string, { lag: number; theta: number }> = {};
    for (const d of ds) {
      const c = cells[`${d.key}|${outcome.key}`];
      picks[d.key] = c && c.r != null && c.r > 0 ? { lag: c.lag, theta: c.theta } : { lag: 0, theta: 0.3 };
    }
    return regress(ds, outcome, dates, picks, metric === "cost" ? 10000 : 1000);
  }, [drivers, outcome, cells, dates, metric]);

  const onoffs = useMemo(() => {
    if (!outcome) return {};
    const m: Record<string, ReturnType<typeof onOff>> = {};
    for (const d of drivers) m[d.key] = onOff(d, outcome, dates, cells[`${d.key}|${outcome.key}`]?.lag ?? 0);
    return m;
  }, [drivers, outcome, dates, cells]);

  const coMove = useMemo(() => Object.fromEntries(built.drivers.map((d) => [d.key, coMovement(d, built.perfCost, dates)])), [built, dates]);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const text = await f.text();
    const { series, error } = parseExternalCsv(text, dates);
    setExtError(error ?? null);
    if (series.length) {
      setExternal(series);
      setExtRole(Object.fromEntries(series.map((s) => [s.key, "driver" as const])));
    }
  };

  const days = dates.length;
  const unitWord = metric === "cost" ? "1만 원" : "노출 1,000회";

  // 핵심 발견 — 규칙 기반 문장(원인 추정 금지, '함께 움직였다')
  const findings = useMemo(() => {
    if (!outcome) return [];
    const out: { tone: "good" | "warn" | "muted"; text: string }[] = [];
    for (const d of drivers) {
      const c = cells[`${d.key}|${outcome.key}`];
      const reg = regression?.contributions.find((x) => x.driver === d.key);
      if (!c || c.r == null) continue;
      const when = c.lag === 0 ? "같은 날" : `${c.lag}일 뒤`;
      if ((c.strength === "strong" || c.strength === "moderate") && c.r > 0) {
        out.push({
          tone: "good",
          text: `${josa(d.label, "이", "가")} 늘면 ${when} ${outcome.label}도 함께 늘었어요 (r=${c.r.toFixed(2)})${reg?.confirmed ? ` · ${unitWord}당 +${fmtValue(reg.perUnit, outcome.unit, outcome.noun)}` : ""}`,
        });
      } else if ((c.strength === "strong" || c.strength === "moderate") && c.r < 0) {
        out.push({ tone: "warn", text: `${josa(d.label, "이", "가")} 늘 때 ${when} ${josa(outcome.label, "은", "는")} 오히려 줄었어요 (r=${c.r.toFixed(2)}) — 예산 이동·잠식 여부를 확인해 보세요` });
      }
      const cm = coMove[d.key];
      if (cm != null && Math.abs(cm) >= 0.7) out.push({ tone: "muted", text: `${josa(d.label, "과", "와")} 성과 캠페인 광고비가 거의 같이 움직였어요(r=${cm.toFixed(2)}) — 두 효과를 따로 떼어 보기 어려워요` });
    }
    if (!out.some((x) => x.tone !== "muted") && drivers.length) out.push({ tone: "muted", text: `이 기간에는 상위 퍼널 캠페인과 ${outcome.label} 사이에 뚜렷한 관계가 보이지 않아요. 기간을 늘리거나 집행을 켰다 끈 구간이 있으면 더 잘 드러나요.` });
    return out.slice(0, 6);
  }, [drivers, outcome, cells, regression, coMove, unitWord]);

  const roleCount = (r: Role) => data.campaigns.filter((c) => roles[c.id] === r).length;
  const hasDriverCampaigns = DRIVER_ROLES.some((r) => roleCount(r) > 0);

  return (
    <div className="space-y-5">
      {/* 필터 한 줄 */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-ink-muted">결과 지표</span>
          <select
            value={outcome?.key ?? ""}
            onChange={(e) => setOutcomeKey(e.target.value)}
            className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-ink/40"
          >
            {outcomes.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
          <span className="ml-2 text-[13px] text-ink-muted">원인 기준</span>
          <Segmented
            value={metric}
            options={[
              { key: "cost", label: "광고비" },
              { key: "impressions", label: "노출" },
            ]}
            onChange={setMetric}
          />
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            title="첫 열 날짜 + 지표 열(GRP·SOV·검색량 등) CSV"
            className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[13px] text-ink-soft hover:border-ink/30 hover:text-ink"
          >
            <i className="ti ti-file-import text-[15px]" aria-hidden />
            외부 지표 추가 (GRP·SOV·검색량)
          </button>
        </div>
      </div>

      {(external.length > 0 || extError) && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[13px]">
          {extError && <span className="text-bad">{extError}</span>}
          {external.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 rounded-md bg-canvas px-2 py-1">
              <b className="font-medium text-ink">{s.label}</b>
              <Segmented
                value={extRole[s.key] ?? "driver"}
                options={[
                  { key: "driver", label: "원인" },
                  { key: "outcome", label: "결과" },
                ]}
                onChange={(v) => setExtRole((m) => ({ ...m, [s.key]: v }))}
              />
            </span>
          ))}
          {external.length > 0 && (
            <button type="button" onClick={() => setExternal([])} className="text-ink-muted underline underline-offset-2 hover:text-ink">
              외부 지표 지우기
            </button>
          )}
        </div>
      )}

      {days < 28 && <p className="rounded-lg border border-warn/25 bg-warn/5 px-3.5 py-2.5 text-[13px] text-warn">기간이 {days}일이에요. 시차 효과를 보려면 60일 이상을 권해요.</p>}

      {!outcome ? (
        <EmptyState text="성과(전환·검색) 캠페인이 없어 결과 지표를 만들 수 없어요. 아래 캠페인 분류에서 전환·검색 캠페인을 지정해 주세요." />
      ) : !drivers.length ? (
        <EmptyState
          text={
            hasDriverCampaigns
              ? "상위 퍼널 캠페인의 집행일이 5일 미만이에요. 기간을 늘려 주세요."
              : "영상·도달·트래픽·참여 캠페인이 없어요. 아래 캠페인 분류에서 역할을 지정하거나 외부 지표(GRP 등)를 추가해 주세요."
          }
        />
      ) : (
        <>
          {/* 핵심 발견 + 원인별 요약 */}
          <Card title={`상위 퍼널 → ${outcome.label}`} sub={`${data.since} ~ ${data.until} · ${days}일 · 요일·추세를 걷어낸 뒤 0~14일 시차와 잔존 효과를 함께 시험해요`}>
            <ul className="mb-4 space-y-1.5">
              {findings.map((f, i) => (
                <li
                  key={i}
                  className={`flex items-start gap-2 rounded-lg px-3 py-2 text-[15px] leading-relaxed ${f.tone === "good" ? "bg-good/5 text-ink" : f.tone === "warn" ? "bg-warn/5 text-ink" : "bg-canvas text-ink-soft"}`}
                >
                  <i className={`ti mt-[3px] text-[15px] ${f.tone === "good" ? "ti-trending-up text-good" : f.tone === "warn" ? "ti-alert-triangle text-warn" : "ti-info-circle text-ink-muted"}`} aria-hidden />
                  {f.text}
                </li>
              ))}
            </ul>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {drivers.map((d) => {
                const c = cells[`${d.key}|${outcome.key}`];
                const reg = regression?.contributions.find((x) => x.driver === d.key);
                const oo = onoffs[d.key];
                const st = STRENGTH[c?.strength ?? "none"];
                const neg = c?.r != null && c.r < 0 && (c.strength === "strong" || c.strength === "moderate");
                const isSel = driver?.key === d.key;
                return (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => setDriverKey(d.key)}
                    onMouseEnter={() => setHighlight(d.key)}
                    onMouseLeave={() => setHighlight(null)}
                    aria-pressed={isSel}
                    className={`rounded-lg border p-3.5 text-left transition ${isSel ? "border-ink bg-surface shadow-[0_1px_3px_rgba(21,24,30,0.08)]" : "border-line hover:border-ink/30"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-[15px] font-semibold text-ink">
                        {d.color ? <span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.color }} aria-hidden /> : <i className="ti ti-file-import text-[13px]" aria-hidden />}
                        {d.label}
                      </span>
                      <span className={`inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[12px] font-medium ${neg ? "border-warn/25 bg-warn/10 text-warn" : st.cls}`}>
                        <i className={`ti ${neg ? "ti-arrow-down-right" : st.icon} text-[12px]`} aria-hidden />
                        {neg ? "반대로 움직임" : st.label}
                      </span>
                    </div>
                    <p className="mt-2.5 font-mono text-[24px] font-bold leading-none tabular-nums text-ink">
                      {c?.r == null ? "—" : `${c.r > 0 ? "+" : "−"}${Math.abs(c.r).toFixed(2)}`}
                      <span className="ml-1.5 font-sans text-[13px] font-medium text-ink-muted">{c?.r == null ? "" : c.lag === 0 ? "당일 상관" : `${c.lag}일 뒤 상관`}</span>
                    </p>
                    <dl className="mt-3 space-y-1 text-[13px]">
                      {reg && (
                        <div className="flex justify-between gap-2">
                          <dt className="text-ink-muted">{unitWord}당</dt>
                          <dd className={reg.confirmed ? "font-mono font-semibold tabular-nums text-good" : "text-ink-muted"}>
                            {reg.confirmed ? `+${fmtValue(reg.perUnit, outcome.unit, outcome.noun)}` : "효과 확인 안 됨"}
                          </dd>
                        </div>
                      )}
                      {reg?.confirmed && (
                        <div className="flex justify-between gap-2">
                          <dt className="text-ink-muted">90% 구간</dt>
                          <dd className="font-mono tabular-nums text-ink-soft">
                            {fmtValue(Math.max(0, reg.perUnitLo), outcome.unit, outcome.noun)} ~ {fmtValue(reg.perUnitHi, outcome.unit, outcome.noun)}
                          </dd>
                        </div>
                      )}
                      {reg?.confirmed && metric === "cost" && (outcome.key === "perf_rev" || outcome.key === "perf_conv") && (
                        <div className="flex justify-between gap-2">
                          <dt className="text-ink-muted">{outcome.key === "perf_rev" ? "간접 ROAS" : "간접 CPA"}</dt>
                          <dd className="font-mono font-semibold tabular-nums text-ink">
                            {outcome.key === "perf_rev" ? `${Math.round((reg.perUnit / 10000) * 100).toLocaleString("ko-KR")}%` : `${Math.round(10000 / reg.perUnit).toLocaleString("ko-KR")}원`}
                          </dd>
                        </div>
                      )}
                      {oo && (
                        <div className="flex justify-between gap-2">
                          <dt className="text-ink-muted">집행일 vs 미집행일</dt>
                          <dd className={`font-mono tabular-nums ${oo.p < 0.05 ? "font-semibold text-ink" : "text-ink-muted"}`}>
                            {oo.diffPct == null ? "—" : `${oo.diffPct >= 0 ? "+" : "−"}${Math.abs(Math.round(oo.diffPct * 100))}%`}
                            <span className="ml-1 font-sans text-[12px] text-ink-muted">
                              {oo.onDays}/{oo.offDays}일
                            </span>
                          </dd>
                        </div>
                      )}
                    </dl>
                  </button>
                );
              })}
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.5fr_1fr]">
            <Card title="일별 추이" sub="위 원인과 아래 결과는 같은 날짜 축 — 막대가 늘어난 뒤 선이 따라 오르는지 보세요">
              <TimelineCharts dates={dates} drivers={drivers} outcome={outcome} highlight={highlight} />
            </Card>
            {driver && cells[`${driver.key}|${outcome.key}`] && (
              <Card title={`시차별 상관 · ${driver.label}`} sub="원인이 늘고 며칠 뒤에 결과가 따라오는지 — 진한 막대가 가장 강한 시차예요">
                <LagChart result={cells[`${driver.key}|${outcome.key}`]} color={driver.color ?? "#3B4048"} />
                <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
                  잔존 효과 θ={cells[`${driver.key}|${outcome.key}`].theta} (광고 효과가 하루에 {Math.round((1 - cells[`${driver.key}|${outcome.key}`].theta) * 100)}%씩 사라지는 모양) · 유효 표본{" "}
                  {Math.round(cells[`${driver.key}|${outcome.key}`].nEff)}일. 회색 선 밖이면 우연으로 보기 어려운 수준이에요.
                </p>
              </Card>
            )}
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.5fr_1fr]">
            <Card title="상관 매트릭스" sub="원인 × 결과 · 칸 = 가장 강한 시차의 상관(요일·추세 제거) · * = 유의 · 칸을 누르면 위 차트가 바뀌어요">
              <Heatmap
                drivers={drivers}
                outcomes={outcomes}
                cells={cells}
                selected={{ driver: driver?.key ?? "", outcome: outcome.key }}
                onSelect={(d, o) => {
                  setDriverKey(d);
                  setOutcomeKey(o);
                }}
              />
              <p className="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-ink-muted">
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-4 rounded-sm" style={{ background: "rgba(79,70,229,0.6)" }} aria-hidden />+ 함께 늘어남
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-4 rounded-sm" style={{ background: "rgba(180,105,14,0.6)" }} aria-hidden />− 반대로 움직임
                </span>
                <span>진할수록 강함</span>
              </p>
            </Card>

            <Card title="기여도 추정" sub={`원인을 모두 함께 넣은 회귀 · ${outcome.label} 중 상위 퍼널 몫`}>
              {regression ? (
                <div>
                  <ContributionBar regression={regression} drivers={drivers} unit={outcome.unit} noun={outcome.noun} />
                  <p className="mt-3 text-[12px] leading-relaxed text-ink-muted">
                    설명력 R² {Math.round(regression.r2 * 100)}% (요일·추세만 {Math.round(regression.r2Base * 100)}%) · {regression.n}일. 90% 구간이 0을 넘는 원인만 &lsquo;확인됨&rsquo;으로 봐요.
                  </p>
                </div>
              ) : (
                <p className="py-8 text-center text-[15px] text-ink-muted">{outcome.additive ? "회귀에 쓸 날짜가 부족해요." : "ROAS·CPA 같은 비율 지표는 기여도를 나누지 않고 상관만 봐요."}</p>
              )}
            </Card>
          </div>
        </>
      )}

      {/* 캠페인 분류 */}
      <Card title="캠페인 분류" sub="매체의 캠페인 목표로 자동 분류했어요 · 바꾸면 바로 다시 계산되고 이 브라우저에 기억돼요">
        <div className="mb-3 flex flex-wrap gap-1.5 text-[12px]">
          {(Object.keys(ROLE_META) as Role[]).map((r) => (
            <span key={r} className="flex items-center gap-1 rounded-md bg-canvas px-2 py-0.5 text-ink-soft">
              {ROLE_META[r].kind === "driver" && <span className="h-2 w-2 rounded-sm" style={{ background: ROLE_META[r].color }} aria-hidden />}
              {ROLE_META[r].label} {roleCount(r)}
              <span className="text-ink-muted">{ROLE_META[r].kind === "driver" ? "원인" : ROLE_META[r].kind === "outcome" ? "결과" : ""}</span>
            </span>
          ))}
        </div>
        <CampaignTable data={data} roles={roles} onRole={setRole} />
      </Card>

      <details className="group rounded-card border border-line bg-surface px-5 py-3.5 text-[13px] text-ink-soft">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-ink">
          <i className="ti ti-help-circle text-[15px]" aria-hidden />
          어떻게 계산하나요 · 읽을 때 주의할 점
          <i className="ti ti-chevron-down text-[13px] transition group-open:rotate-180" aria-hidden />
        </summary>
        <ul className="mt-2.5 list-disc space-y-1 pl-5 leading-relaxed">
          <li>원인 = 영상·도달·트래픽·참여 캠페인의 일별 광고비(또는 노출). 결과 = 전환·검색 캠페인의 전환·매출·ROAS·CPA와 검색광고 클릭(수요 신호). 상위 퍼널 캠페인이 스스로 잡은 전환은 결과에 넣지 않아요.</li>
          <li>두 지표 모두에서 요일 효과와 선형 추세를 먼저 걷어내요. 둘 다 시즌에 함께 오르기만 해도 상관이 높게 나오는 착시를 줄이기 위해서예요.</li>
          <li>광고 효과는 며칠 남으므로 잔존 효과(θ 0·0.3·0.5·0.7)와 시차(0~14일)를 모두 시험해 가장 강한 조합을 보여줘요. 일별 값끼리 이어져 있는 만큼 유효 표본을 줄이고, 여러 조합을 시험한 만큼 보수적으로 유의성을 판단해요.</li>
          <li>기여도는 모든 원인을 함께 넣은 회귀(요일·추세 통제, 릿지)로 추정해요. &lsquo;{unitWord}당&rsquo;은 잔존 효과까지 합친 값이에요. 원인과 성과 캠페인 예산을 늘 같이 늘리고 줄였다면 효과를 분리하기 어려워요(핵심 발견에 표시).</li>
          <li>상관은 인과가 아니에요. 확실히 보려면 지역·기간을 나눈 홀드아웃(켰다 끄기) 테스트가 필요해요. 집행일 vs 미집행일 비교는 그 근사치예요.</li>
          <li>네이버 SA는 일별을 캠페인 하나씩만 조회할 수 있어 광고비 상위 15개 + 브랜드검색 캠페인만 써요. 매체마다 전환 집계 기준이 달라요.</li>
          <li>외부 지표 CSV: 첫 열 날짜(2026-09-01·2026.09.01·20260901), 나머지 열은 숫자(GRP·SOV·검색량 등). 비어 있는 날은 직전 값으로 채워 주간 데이터도 쓸 수 있어요.</li>
        </ul>
      </details>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-card border border-line bg-surface px-6 py-14 text-center text-[15px] leading-relaxed text-ink-muted">{text}</div>;
}

function ContributionBar({ regression, drivers, unit, noun }: { regression: NonNullable<ReturnType<typeof regress>>; drivers: Series[]; unit: Series["unit"]; noun?: string }) {
  const items = regression.contributions.map((c) => ({ c, d: drivers.find((x) => x.key === c.driver)! })).filter((x) => x.d);
  const pos = items.filter((x) => x.c.confirmed).reduce((s, x) => s + Math.max(0, x.c.share), 0);
  return (
    <div>
      <div className="flex h-8 w-full gap-[2px] overflow-hidden rounded-[4px] bg-canvas">
        {items
          .filter((x) => x.c.confirmed && x.c.share > 0)
          .map((x) => (
            <div
              key={x.c.driver}
              className="flex items-center justify-center text-[12px] font-medium text-white"
              style={{ width: `${Math.min(100, x.c.share * 100)}%`, background: x.d.color ?? "#3B4048" }}
              title={`${x.d.label} ${Math.round(x.c.share * 100)}%`}
            >
              {x.c.share >= 0.08 && <span className="[text-shadow:0_0_3px_rgba(0,0,0,0.35)]">{Math.round(x.c.share * 100)}%</span>}
            </div>
          ))}
        <div className="flex flex-1 items-center justify-center text-[12px] text-ink-muted">그 외 {Math.max(0, Math.round((1 - pos) * 100))}%</div>
      </div>
      <ul className="mt-3 space-y-1.5 text-[13px]">
        {items.map(({ c, d }) => (
          <li key={c.driver} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-ink-soft">
              {d.color ? <span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.color }} aria-hidden /> : <i className="ti ti-file-import text-[13px]" aria-hidden />}
              {d.label}
            </span>
            <span className={c.confirmed ? "font-mono tabular-nums text-ink" : "text-ink-muted"}>
              {c.confirmed ? `${fmtValue(c.total, unit, noun)} (${Math.round(c.share * 100)}%)` : "확인 안 됨"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CampaignTable({ data, roles, onRole }: { data: CorrDataRes; roles: Record<string, Role>; onRole: (id: string, r: Role) => void }) {
  const [showAll, setShowAll] = useState(false);
  const rows = useMemo(
    () =>
      data.campaigns
        .map((c) => ({ c, cost: c.daily.reduce((s, d) => s + d.cost, 0), imps: c.daily.reduce((s, d) => s + d.impressions, 0), days: c.daily.filter((d) => d.cost > 0).length }))
        .sort((a, b) => b.cost - a.cost),
    [data.campaigns],
  );
  const list = showAll ? rows : rows.slice(0, 15);
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[12px] text-ink-muted">
              <th className="py-2 pr-2 font-medium">매체</th>
              <th className="py-2 pr-2 font-medium">캠페인</th>
              <th className="py-2 pr-2 font-medium">매체 목표</th>
              <th className="py-2 pr-2 text-right font-medium">광고비</th>
              <th className="py-2 pr-2 text-right font-medium">집행일</th>
              <th className="py-2 font-medium">역할</th>
            </tr>
          </thead>
          <tbody>
            {list.map(({ c, cost, days }) => (
              <tr key={c.id} className="border-b border-line/60">
                <td className="py-1.5 pr-2">
                  <span className="flex items-center gap-1.5 text-ink-soft">
                    <span className="h-2 w-2 rounded-full" style={{ background: MEDIA_COLORS[c.media] }} aria-hidden />
                    {MEDIA_LABEL[c.media] ?? c.media}
                  </span>
                </td>
                <td className="max-w-[300px] truncate py-1.5 pr-2 text-ink" title={c.name}>
                  {c.name}
                </td>
                <td className="py-1.5 pr-2 font-mono text-[12px] text-ink-muted">{c.objective ?? "—"}</td>
                <td className="py-1.5 pr-2 text-right font-mono tabular-nums text-ink-soft">{fmtValue(cost, "won")}</td>
                <td className="py-1.5 pr-2 text-right font-mono tabular-nums text-ink-muted">{days}</td>
                <td className="py-1.5">
                  <select
                    value={roles[c.id]}
                    onChange={(e) => onRole(c.id, e.target.value as Role)}
                    aria-label={`${c.name} 역할`}
                    className="rounded-md border border-line bg-surface px-2 py-1 text-[13px] text-ink outline-none focus:border-ink/40"
                  >
                    {(Object.keys(ROLE_META) as Role[]).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_META[r].label}
                        {ROLE_META[r].kind === "driver" ? " (원인)" : ROLE_META[r].kind === "outcome" ? " (결과)" : ""}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 15 && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-2 text-[13px] text-ink-muted underline underline-offset-2 hover:text-ink">
          {showAll ? "접기" : `캠페인 ${rows.length - 15}개 더 보기`}
        </button>
      )}
    </div>
  );
}
