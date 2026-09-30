"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useClients } from "@/features/clients/ClientContext";
import { SegmentedControl } from "@/features/creative/SegmentedControl";
import {
  competitorCoMentions,
  engineStats,
  globalStats,
  topDomains,
  typeDistribution,
  unmentionedQueries,
} from "@/features/geo-citation/analyze";
import { AnswerMatrix } from "@/features/geo-citation/AnswerMatrix";
import { SourceTypeBars, TrendPair } from "@/features/geo-citation/GeoCharts";
import {
  getSettings,
  listAnswers,
  listAnswerStats,
  listPrompts,
  listRuns,
  type AnswerLite,
} from "@/features/geo-citation/geoData";
import { PromptPanel } from "@/features/geo-citation/PromptPanel";
import { SettingsPanel, type EngineStatus } from "@/features/geo-citation/SettingsPanel";
import { INTERVAL_OPTIONS, inAutoPeriod, type GeoAnswer, type GeoEngine, type GeoPrompt, type GeoRun, type GeoSettings } from "@/features/geo-citation/types";
import { EngineName, ErrorBox, KpiCard, Section, pctText } from "@/features/geo-citation/ui";

type Tab = "dashboard" | "prompts" | "settings";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function GeoCitationPage() {
  const { selected } = useClients();
  const clientId = selected?.id ?? null;

  const [tab, setTab] = useState<Tab>("dashboard");
  const [settings, setSettings] = useState<GeoSettings | null>(null);
  const [prompts, setPrompts] = useState<GeoPrompt[]>([]);
  const [runs, setRuns] = useState<GeoRun[]>([]);
  const [stats, setStats] = useState<AnswerLite[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<GeoAnswer[]>([]);
  const [engineStatus, setEngineStatus] = useState<EngineStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const execRef = useRef(false);

  const run = runs.find((r) => r.id === runId) ?? null;

  const loadBase = useCallback(async () => {
    if (!clientId) return;
    const [s, p, r] = await Promise.all([getSettings(clientId), listPrompts(clientId), listRuns(clientId)]);
    setSettings(s);
    setPrompts(p);
    setRuns(r);
    setStats(await listAnswerStats(r.map((x) => x.id)));
    setRunId((cur) => (cur && r.some((x) => x.id === cur) ? cur : r[0]?.id ?? null));
    return { s, p, r };
  }, [clientId]);

  const loadAnswers = useCallback(async (id: string | null) => {
    setAnswers(id ? await listAnswers([id]) : []);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setNotice(null);
    setRunId(null);
    loadBase().finally(() => setLoading(false));
  }, [loadBase]);

  useEffect(() => {
    loadAnswers(runId);
  }, [runId, loadAnswers]);

  useEffect(() => {
    fetch("/api/geo-citation/engines")
      .then((r) => r.json())
      .then((j) => setEngineStatus(j.engines ?? []))
      .catch(() => {});
  }, []);

  // 설정이 없으면 설정 탭부터
  useEffect(() => {
    if (!loading && clientId && !settings) setTab("settings");
  }, [loading, clientId, settings]);

  // 실행 중에는 5초마다 진행 상황 갱신
  useEffect(() => {
    if (!executing || !runId) return;
    const t = setInterval(async () => {
      await loadAnswers(runId);
      if (clientId) setRuns(await listRuns(clientId));
    }, 5000);
    return () => clearInterval(t);
  }, [executing, runId, clientId, loadAnswers]);

  async function execute(id: string) {
    if (execRef.current) return;
    execRef.current = true;
    setExecuting(true);
    setError(null);
    try {
      for (let i = 0; i < 20; i++) {
        const res = await fetch(`/api/geo-citation/runs/${id}/execute`, { method: "POST" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "측정 중 오류가 발생했어요.");
        if (json.finished) break;
      }
    } catch (e) {
      setError(`${e instanceof Error ? e.message : "오류"} — 목록의 '이어서 실행'으로 남은 질의를 계속할 수 있어요.`);
    } finally {
      execRef.current = false;
      setExecuting(false);
      await loadBase();
      await loadAnswers(id);
    }
  }

  async function startRun() {
    if (!clientId) return;
    setError(null);
    setNotice(null);
    const res = await fetch("/api/geo-citation/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return setError(json.error || "측정을 시작하지 못했어요.");
    if (json.skipped?.length) setNotice(`API 키가 없어 건너뛴 엔진: ${json.skipped.join(", ")}`);
    setTab("dashboard");
    await loadBase();
    setRunId(json.runId);
    execute(json.runId);
  }

  const activePrompts = prompts.filter((p) => p.active).length;
  const readyEngines = (settings?.engines ?? []).filter((e) => engineStatus.find((s) => s.engine === e)?.ready).length;
  const mode = settings?.measure_mode ?? (settings?.auto_weekly ? "auto" : "manual");
  const measureOff = mode === "off";
  const modeLabel = !settings
    ? null
    : mode === "off"
      ? "측정 꺼짐"
      : mode === "manual"
        ? "수동 측정"
        : `자동 ${INTERVAL_OPTIONS.find((o) => o.days === settings.interval_days)?.label ?? "매주"}${settings.auto_end ? ` · ${settings.auto_end}까지` : ""}${inAutoPeriod(settings) ? "" : " (기간 밖)"}`;

  const view = useMemo(() => {
    if (!run) return null;
    const engines: GeoEngine[] = [...run.engines, ...(answers.some((a) => a.engine === "naver" && a.status === "done") ? (["naver"] as const) : [])];
    return {
      engines,
      g: globalStats(answers),
      perEngine: engines.map((e) => engineStats(answers, e)),
      domains: topDomains(answers.filter((a) => a.engine !== "naver")),
      types: typeDistribution(answers),
      comps: competitorCoMentions(answers, run.settings_snapshot.competitors ?? []),
      missing: unmentionedQueries(answers),
      queries: new Set(answers.filter((a) => a.engine !== "naver").map((a) => a.query)).size,
    };
  }, [run, answers]);

  if (!clientId) {
    return <p className="mx-auto max-w-6xl rounded-card border border-line bg-surface p-8 text-center text-[13px] text-ink-muted">광고주를 먼저 선택해 주세요.</p>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface p-4">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-ink">
            <i className="ti ti-quote mr-1.5 text-signal" aria-hidden />
            {selected?.name} · AI 인용 추적
          </p>
          <p className="mt-0.5 text-[11px] text-ink-muted">
            비브랜드 질문 {activePrompts}개 × 엔진 {readyEngines}종을 웹 검색 켠 API로 새 세션마다 묻고, 답변 원문·인용 URL에서 자사 언급·인용을 집계해요
            {modeLabel && <> · {modeLabel}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SegmentedControl
            value={tab}
            onChange={setTab}
            options={[
              { id: "dashboard", label: "대시보드", icon: "chart-line" },
              { id: "prompts", label: "질문 세트", icon: "list-search", hint: String(activePrompts) },
              { id: "settings", label: "설정", icon: "settings" },
            ]}
          />
          <button
            onClick={startRun}
            disabled={executing || !settings || activePrompts === 0 || measureOff}
            title={measureOff ? "설정에서 '측정 안 함'으로 되어 있어요" : undefined}
            className="btn-signal h-9 px-3 text-[13px]"
          >
            <i className={`ti ${executing ? "ti-loader-2 animate-spin" : measureOff ? "ti-player-pause" : "ti-player-play"} text-[15px]`} aria-hidden />
            {executing ? "측정 중…" : measureOff ? "측정 꺼짐" : "지금 측정"}
          </button>
        </div>
      </div>

      {error && <ErrorBox>{error}</ErrorBox>}
      {notice && <p className="rounded-lg border border-warn/30 bg-warn/5 px-3.5 py-2.5 text-[13px] text-ink">{notice}</p>}
      {loading && <p className="text-center text-[12px] text-ink-muted">불러오는 중…</p>}

      {!loading && tab === "settings" && (
        <SettingsPanel
          clientId={clientId}
          settings={settings}
          engineStatus={engineStatus}
          onSaved={async () => {
            await loadBase();
            if (prompts.length === 0) setTab("prompts");
          }}
        />
      )}

      {!loading && tab === "prompts" && <PromptPanel clientId={clientId} prompts={prompts} settings={settings} onChanged={loadBase} />}

      {!loading && tab === "dashboard" && (
        <>
          {runs.length === 0 ? (
            <div className="rounded-card border border-line bg-surface p-8 text-center">
              <p className="text-[14px] font-medium text-ink">아직 측정 기록이 없어요</p>
              <ol className="mx-auto mt-3 max-w-md space-y-1 text-left text-[12px] text-ink-soft">
                <li className={settings ? "text-good" : ""}>1. 설정 — 자사 도메인·브랜드 표기·경쟁사 {settings && "✓"}</li>
                <li className={activePrompts ? "text-good" : ""}>2. 질문 세트 — 비브랜드 질문 10~20개 (여정 4단계 분산) {activePrompts > 0 && `✓ ${activePrompts}개`}</li>
                <li>3. 지금 측정 — 질문 20개 × 엔진 3종이면 5~10분 걸려요</li>
              </ol>
            </div>
          ) : (
            <>
              {/* 회차 선택 */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-surface px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12px] text-ink-muted">측정 회차</span>
                  <select value={runId ?? ""} onChange={(e) => setRunId(e.target.value)} className="field h-8 text-[12px]">
                    {runs.map((r) => (
                      <option key={r.id} value={r.id}>
                        {fmtDate(r.started_at)} · {r.trigger === "cron" ? "자동" : "수동"} · {r.status === "running" ? `진행 ${r.completed}/${r.total}` : r.status === "failed" ? "실패" : `${r.total}건`}
                      </option>
                    ))}
                  </select>
                  {run?.status === "running" && (
                    <span className="flex items-center gap-2 text-[12px] text-ink-soft">
                      <span className="h-1.5 w-32 overflow-hidden rounded-full bg-canvas">
                        <span className="block h-full bg-signal transition-all" style={{ width: `${run.total ? (run.completed / run.total) * 100 : 0}%` }} />
                      </span>
                      {run.completed}/{run.total}
                      {!executing && (
                        <button onClick={() => execute(run.id)} className="btn-ghost h-7 px-2 text-[12px]">
                          이어서 실행
                        </button>
                      )}
                    </span>
                  )}
                </div>
                {run && run.status !== "running" && (
                  <a href={`/api/geo-citation/export?runId=${run.id}`} className="btn-ghost h-8 px-3 text-[12px]">
                    <i className="ti ti-file-spreadsheet text-[15px] text-good" aria-hidden />
                    별첨 엑셀 · 8시트
                  </a>
                )}
              </div>

              {run && view && (
                <>
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                    <KpiCard label="AI 언급 점유율" value={pctText(view.g.mentionRate, 1)} sub={`글로벌 엔진 응답 ${view.g.answered}건 기준`} />
                    <KpiCard label="자사 도메인 인용률" value={pctText(view.g.ownCiteRate, 1)} sub="자사 URL이 1건 이상 인용된 응답" />
                    <KpiCard label="자사 인용 비중" value={pctText(view.g.ownCitationShare, 1)} sub={`전체 인용 URL ${view.g.citationTotal}건 중`} />
                    <KpiCard label="전 엔진 미언급 질문" value={`${view.missing.length}/${view.queries}`} sub="어느 엔진에서도 안 나온 질문" tone={view.missing.length > 0 ? "warn" : "good"} />
                    <KpiCard label="API 비용" value={`$${Number(run.cost_usd).toFixed(2)}`} sub="Claude만 산출 · 나머지는 토큰 기록" />
                  </div>

                  <Section title="엔진별 결과" desc="엔진마다 따로 집계해요. 네이버(수동 입력)는 글로벌 엔진 합계에 넣지 않아요">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px] text-[12px]">
                        <thead className="text-ink-muted">
                          <tr className="border-b border-line">
                            <th className="py-2 text-left font-medium">엔진</th>
                            <th className="py-2 text-right font-medium">응답</th>
                            <th className="py-2 text-right font-medium">언급률</th>
                            <th className="py-2 text-right font-medium">자사 최선 등장</th>
                            <th className="py-2 text-right font-medium">자사 인용률</th>
                            <th className="py-2 text-right font-medium">평균 자사 인용 순위</th>
                            <th className="py-2 text-right font-medium">인용 없는 응답</th>
                            <th className="py-2 text-right font-medium">오류</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {view.perEngine.map((s) => (
                            <tr key={s.engine} className={s.engine === "naver" ? "bg-canvas/60" : ""}>
                              <td className="py-2">
                                <EngineName engine={s.engine} className="font-medium text-ink" />
                              </td>
                              <td className="py-2 text-right font-mono">{s.answered}</td>
                              <td className="py-2 text-right font-mono">{pctText(s.answered ? s.mentioned / s.answered : null)}</td>
                              <td className="py-2 text-right font-mono">{s.firstMention}</td>
                              <td className="py-2 text-right font-mono">{pctText(s.answered ? s.ownCited / s.answered : null)}</td>
                              <td className="py-2 text-right font-mono">{s.avgOwnCiteRank?.toFixed(1) ?? "-"}</td>
                              <td className="py-2 text-right font-mono text-ink-muted">{s.noCitations}</td>
                              <td className={`py-2 text-right font-mono ${s.errors ? "text-bad" : "text-ink-muted"}`}>{s.errors}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {view.perEngine.some((s) => s.errors > 0) && (
                      <p className="mt-2 text-[11px] text-bad">
                        오류: {[...new Set(answers.filter((a) => a.status === "error").map((a) => a.error))].slice(0, 3).join(" / ")}
                      </p>
                    )}
                  </Section>

                  <Section title="회차별 추이" desc="같은 질문 세트로 반복 측정한 결과예요. 한 회차의 변동은 경향으로만 보세요">
                    <TrendPair runs={runs} stats={stats} />
                  </Section>

                  <Section title="질문 × 엔진 매트릭스" desc="네이버 칸은 직접 검색한 결과를 붙여 넣는 곳이에요">
                    <AnswerMatrix
                      run={run}
                      answers={answers}
                      prompts={prompts}
                      onChanged={async () => {
                        await loadAnswers(run.id);
                        setStats(await listAnswerStats(runs.map((x) => x.id)));
                      }}
                    />
                  </Section>

                  <div className="grid gap-5 lg:grid-cols-5">
                    <div className="lg:col-span-3">
                      <Section title="인용 도메인 상위 20" desc="글로벌 엔진 합계 · 자사는 강조 표시">
                        <table className="w-full text-[12px]">
                          <thead className="text-ink-muted">
                            <tr className="border-b border-line">
                              <th className="py-1.5 text-left font-medium">도메인</th>
                              <th className="py-1.5 text-left font-medium">유형</th>
                              <th className="py-1.5 text-right font-medium">인용</th>
                              <th className="py-1.5 text-right font-medium">응답</th>
                              {run.engines.map((e) => (
                                <th key={e} className="py-1.5 text-right font-medium">
                                  <EngineName engine={e} className="justify-end" />
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-line">
                            {view.domains.map((d) => (
                              <tr key={d.domain} className={d.own ? "bg-signal/5" : ""}>
                                <td className={`max-w-[200px] truncate py-1.5 ${d.own ? "font-semibold text-signal" : "text-ink"}`}>{d.domain}</td>
                                <td className="py-1.5 text-ink-muted">{d.type}</td>
                                <td className="py-1.5 text-right font-mono">{d.count}</td>
                                <td className="py-1.5 text-right font-mono text-ink-muted">{d.answers}</td>
                                {run.engines.map((e) => (
                                  <td key={e} className="py-1.5 text-right font-mono text-ink-soft">
                                    {d.engines[e] ?? "·"}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {view.domains.length === 0 && <p className="py-4 text-center text-[12px] text-ink-muted">인용된 도메인이 없어요.</p>}
                      </Section>
                    </div>
                    <div className="space-y-5 lg:col-span-2">
                      <Section title="인용 출처 유형" desc="도메인 규칙 기반 자동 분류 · 글로벌 엔진">
                        <SourceTypeBars rows={view.types} />
                      </Section>
                      <Section title="경쟁사 동시 호명">
                        {view.comps.length === 0 ? (
                          <p className="text-[12px] text-ink-muted">설정에 경쟁사를 등록하면 집계돼요.</p>
                        ) : (
                          <table className="w-full text-[12px]">
                            <thead className="text-ink-muted">
                              <tr className="border-b border-line">
                                <th className="py-1.5 text-left font-medium">경쟁사</th>
                                <th className="py-1.5 text-right font-medium">호명</th>
                                <th className="py-1.5 text-right font-medium">자사와 함께</th>
                                <th className="py-1.5 text-right font-medium">자사 없이</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-line">
                              {view.comps.map((c) => (
                                <tr key={c.name}>
                                  <td className="py-1.5 text-ink">{c.name}</td>
                                  <td className="py-1.5 text-right font-mono">{c.mentioned}</td>
                                  <td className="py-1.5 text-right font-mono text-ink-soft">{c.together}</td>
                                  <td className={`py-1.5 text-right font-mono ${c.aloneWithoutUs > 0 ? "font-semibold text-bad" : "text-ink-muted"}`}>{c.aloneWithoutUs}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </Section>
                    </div>
                  </div>

                  {view.missing.length > 0 && (
                    <Section title="전 엔진 미언급 질문" desc="어느 글로벌 엔진에서도 자사가 나오지 않은 질문과 그 자리를 차지한 브랜드·출처 — 콘텐츠·외부 채널 보강 후보">
                      <ul className="divide-y divide-line">
                        {view.missing.map((m) => (
                          <li key={m.query} className="py-2 text-[12px]">
                            <span className="text-ink">{m.query}</span>
                            <span className="ml-2 rounded bg-canvas px-1.5 py-px text-[10px] text-ink-soft">{m.stage}</span>
                            <span className="mt-0.5 block text-[11px] text-ink-muted">
                              {m.competitors.length > 0 && <>호명 경쟁사 {m.competitors.join(", ")} · </>}
                              상위 인용 {m.topDomains.join(", ") || "없음"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </Section>
                  )}

                  <details className="rounded-card border border-line bg-surface px-5 py-3 text-[12px] text-ink-soft">
                    <summary className="cursor-pointer font-medium">측정 한계 — 보고 전에 꼭 읽어 주세요</summary>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      <li>웹 검색을 켠 API 응답이에요. 사람이 쓰는 ChatGPT·Gemini·Claude 화면과 같지 않아요(개인화·로그인·UI 전용 기능 없음). 경향·추이 지표로 봐 주세요.</li>
                      <li>같은 질문도 호출마다 답이 달라져요. 한 회차로 인과를 판단하지 말고 반복 측정 추이를 보세요.</li>
                      <li>언급 판정은 브랜드 표기 문자열 매칭이에요. 제품명 단독 등장은 놓치고, 실재하지 않는 제품명(환각)은 잘못 잡힐 수 있어요 — 매트릭스에서 원문 대조 후 보정하세요.</li>
                      <li>&lsquo;언급 순서&rsquo;는 추적 브랜드(자사+등록 경쟁사) 사이의 등장 순서예요. 실제 추천 순위와 다를 수 있어요.</li>
                      <li>인용은 답변 문장에 연결된 출처만 셌어요. 검색만 하고 쓰지 않은 결과는 따로 보관해요.</li>
                      <li>네이버 AI 브리핑은 공식 API가 없어 수동 입력이며 글로벌 합계에 넣지 않아요.</li>
                    </ul>
                  </details>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
