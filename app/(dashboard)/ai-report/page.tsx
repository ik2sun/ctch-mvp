"use client";

import { useCallback, useEffect, useState } from "react";
import { fmt } from "@/features/ai-report/calcMetrics";
import { ReportRenderer } from "@/features/ai-report/ReportRenderer";
import { TreeTable } from "@/features/ai-report/TreeTable";
import { TrendChart } from "@/features/ai-report/TrendChart";
import { MetricTrendGrid } from "@/features/ai-report/MetricTrendGrid";
import { ComparisonRows } from "@/features/ai-report/DeltaBadge";
import {
  derive,
  metaRowsToSummary,
  TAG_META,
  type MetaHierarchy,
  type SmartInsights,
} from "@/features/ai-report/metaTypes";
import { useClients } from "@/features/clients/ClientContext";
import { saveReport } from "@/features/ai-report/reportData";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

type TabKey = "campaign" | "adset" | "ad" | "ai";

const TABS: { key: TabKey; label: string; icon: string; color: string }[] = [
  { key: "campaign", label: "캠페인", icon: "ti-speakerphone", color: "#2a78d6" },
  { key: "adset", label: "광고세트", icon: "ti-layout-grid", color: "#eb6834" },
  { key: "ad", label: "광고소재", icon: "ti-photo", color: "#1baf7a" },
  { key: "ai", label: "AI 분석", icon: "ti-sparkles", color: "#4a3aa7" },
];

export default function AiReportPage() {
  const { selected } = useClients();

  const [since, setSince] = useState(daysAgo(7));
  const [until, setUntil] = useState(daysAgo(1));
  const [data, setData] = useState<MetaHierarchy | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [smart, setSmart] = useState<SmartInsights | null>(null);
  const [smartLoading, setSmartLoading] = useState(false);
  const [smartError, setSmartError] = useState<string | null>(null);

  const [context, setContext] = useState("");
  const [goal, setGoal] = useState("");
  const [report, setReport] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TabKey>("campaign");

  const canFetch = !!selected?.meta_account_id;

  const fetchData = useCallback(
    async (s: string, u: string) => {
      if (!selected?.id) return;
      setLoading(true);
      setLoadError(null);
      setSmart(null);
      setReport("");
      try {
        const res = await fetch("/api/meta-insights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ since: s, until: u, clientId: selected.id }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "불러오기 실패");
        setData(json as MetaHierarchy);
        setTitle(`${selected.name} 메타 ${s}~${u}`);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "오류가 발생했어요.");
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [selected],
  );

  // 진입 시 최근 7일 자동 로드
  useEffect(() => {
    if (canFetch) fetchData(since, until);
    else setData(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, canFetch]);

  async function runSmart() {
    if (!data) return;
    setSmartLoading(true);
    setSmartError(null);
    try {
      const res = await fetch("/api/meta-smart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaigns: data.campaigns,
          adsets: data.adsets,
          ads: data.ads,
          daily: data.daily,
          period: data.period,
          clientName: data.clientName,
          context,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "분석 실패");
      setSmart(json as SmartInsights);
    } catch (e) {
      setSmartError(e instanceof Error ? e.message : "오류가 발생했어요.");
    } finally {
      setSmartLoading(false);
    }
  }

  async function runReport() {
    if (!data) return;
    setReportLoading(true);
    setReportError(null);
    try {
      const res = await fetch("/api/meta-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaigns: data.campaigns,
          adsets: data.adsets,
          ads: data.ads,
          period: data.period,
          clientName: data.clientName,
          goal,
          context,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "리포트 생성 실패");
      setReport(json.report);
    } catch (e) {
      setReportError(e instanceof Error ? e.message : "오류가 발생했어요.");
    } finally {
      setReportLoading(false);
    }
  }

  async function handleSave() {
    if (!selected || !data) return;
    setSaving(true);
    setSaveMsg(null);
    const summary = metaRowsToSummary(data.campaigns);
    const body = [
      smart?.trendSummary ? `[트렌드]\n${smart.trendSummary}` : "",
      smart?.bottleneck
        ? `[병목]\n${smart.bottleneck.path.join(" > ")}\n${smart.bottleneck.explanation}\n액션: ${smart.bottleneck.action}`
        : "",
      report,
    ]
      .filter(Boolean)
      .join("\n\n");
    const { error } = await saveReport({
      clientId: selected.id,
      title: title.trim() || "메타 최적화 리포트",
      reportDate: data.period?.until ?? null,
      sheetName: "메타 API",
      summary,
      aiComment: body || null,
    });
    setSaving(false);
    setSaveMsg(error ? "저장에 실패했어요." : "저장했어요. 파일 분석 메뉴의 목록에서 볼 수 있어요.");
  }

  const summary = data ? metaRowsToSummary(data.campaigns) : null;
  const prevTotals = data?.compare?.previous;
  const monTotals = data?.compare?.lastMonth;
  const prevDerived = prevTotals ? derive(prevTotals) : null;
  const monDerived = monTotals ? derive(monTotals) : null;

  const cards = summary
    ? [
        { label: "광고비", value: fmt(summary.totals.cost, "won"), cur: summary.totals.cost, prev: prevTotals?.cost ?? 0, mon: monTotals?.cost ?? 0, inverse: true },
        { label: "노출수", value: fmt(summary.totals.impressions, "int"), cur: summary.totals.impressions, prev: prevTotals?.impressions ?? 0, mon: monTotals?.impressions ?? 0 },
        { label: "클릭수", value: fmt(summary.totals.clicks, "int"), cur: summary.totals.clicks, prev: prevTotals?.clicks ?? 0, mon: monTotals?.clicks ?? 0 },
        { label: "전환수", value: fmt(summary.totals.conversions, "int"), cur: summary.totals.conversions, prev: prevTotals?.conversions ?? 0, mon: monTotals?.conversions ?? 0 },
        { label: "CTR", value: fmt(summary.derived.ctr, "pct"), cur: summary.derived.ctr ?? 0, prev: prevDerived?.ctr ?? 0, mon: monDerived?.ctr ?? 0 },
        { label: "CPA", value: fmt(summary.derived.cpa, "won"), cur: summary.derived.cpa ?? 0, prev: prevDerived?.cpa ?? 0, mon: monDerived?.cpa ?? 0, inverse: true },
        { label: "전환매출", value: fmt(summary.totals.revenue, "won"), cur: summary.totals.revenue, prev: prevTotals?.revenue ?? 0, mon: monTotals?.revenue ?? 0 },
        { label: "ROAS", value: fmt(summary.derived.roas, "x"), cur: summary.derived.roas ?? 0, prev: prevDerived?.roas ?? 0, mon: monDerived?.roas ?? 0 },
      ]
    : [];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* 조회 컨트롤 */}
      <div className="rounded-card border border-line bg-surface p-4">
        {!selected ? (
          <p className="text-[13px] text-ink-muted">먼저 상단에서 광고주를 선택해 주세요.</p>
        ) : !selected.meta_account_id ? (
          <p className="rounded-lg bg-warn/10 px-3.5 py-2.5 text-[13px] text-warn">
            {selected.name}에 메타 광고계정 ID가 없어요. 광고주 관리에서 등록해 주세요.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <i className="ti ti-brand-meta text-[18px] text-signal" aria-hidden />
            <span className="mr-1 text-[13px] font-medium text-ink-soft">{selected.name}</span>
            <input type="date" value={since} onChange={(e) => setSince(e.target.value)} className="field h-9 w-auto text-[13px]" />
            <span className="text-ink-faint">~</span>
            <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="field h-9 w-auto text-[13px]" />
            {[
              { label: "7일", s: daysAgo(7) },
              { label: "14일", s: daysAgo(14) },
              { label: "30일", s: daysAgo(30) },
            ].map((p) => (
              <button
                key={p.label}
                onClick={() => {
                  setSince(p.s);
                  setUntil(daysAgo(1));
                  fetchData(p.s, daysAgo(1));
                }}
                className="rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-ink-soft transition hover:border-signal hover:text-signal"
              >
                {p.label}
              </button>
            ))}
            <button onClick={() => fetchData(since, until)} disabled={loading} className="btn-signal h-9 px-3 text-[13px]">
              <i className={`ti ${loading ? "ti-loader-2 animate-spin" : "ti-refresh"} text-[15px]`} aria-hidden />
              {loading ? "불러오는 중…" : "새로고침"}
            </button>
          </div>
        )}
        {loadError && (
          <p className="mt-3 rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2.5 text-[13px] text-bad">{loadError}</p>
        )}
      </div>

      {data && summary && (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {cards.map((c) => (
              <div key={c.label} className="rounded-card border border-line bg-surface p-3.5">
                <p className="text-[12px] text-ink-muted">{c.label}</p>
                <p className="mt-0.5 font-display text-[19px] font-semibold text-ink">{c.value}</p>
                {data.compare && <ComparisonRows cur={c.cur} prev={c.prev} mon={c.mon} inverse={c.inverse} />}
              </div>
            ))}
          </div>

          {/* 트렌드 차트 */}
          <div className="rounded-card border border-line bg-surface p-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[13px] font-medium text-ink-soft">예산 소진 대비 ROAS 트렌드</span>
              <span className="font-mono text-[11px] text-ink-muted">
                {data.period?.since} ~ {data.period?.until}
              </span>
            </div>
            <TrendChart daily={data.daily} />
          </div>

          {/* 지표별 추이 (컬러 그래프) */}
          <div className="rounded-card border border-line bg-surface p-5">
            <p className="mb-3 text-[13px] font-medium text-ink-soft">지표별 추이</p>
            <MetricTrendGrid daily={data.daily} />
          </div>

          {/* 단위 선택 탭 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {TABS.map((t) => {
              const active = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`rounded-card border bg-surface p-4 text-left transition ${
                    active ? "border-signal bg-signal-soft" : "border-line hover:border-ink-faint"
                  }`}
                >
                  <i
                    className={`ti ${t.icon} text-[20px]`}
                    style={{ color: active ? undefined : t.color }}
                    aria-hidden
                  />
                  <p className={`mt-2 text-[13px] font-medium ${active ? "text-signal" : "text-ink"}`}>{t.label}</p>
                  {t.key !== "ai" && (
                    <p className="mt-0.5 text-[11px] text-ink-muted">
                      {t.key === "campaign" ? data.campaigns.length : t.key === "adset" ? data.adsets.length : data.ads.length}개
                    </p>
                  )}
                </button>
              );
            })}
          </div>

          {activeTab !== "ai" ? (
            /* 계층형 트리 테이블 */
            <div className="rounded-card border border-line bg-surface p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[13px] font-medium text-ink-soft">
                  {TABS.find((t) => t.key === activeTab)?.label} 데이터{" "}
                  <span className="font-normal text-ink-muted">
                    캠페인 {data.campaigns.length} · 세트 {data.adsets.length} · 소재 {data.ads.length}
                  </span>
                </span>
                {activeTab === "campaign" && (
                  <span className="text-[11px] text-ink-muted">[+]를 눌러 하위로 펼쳐보세요</span>
                )}
              </div>
              <TreeTable data={data} statuses={smart?.statuses ?? []} view={activeTab} />
              <p className="mt-2 text-[11px] text-ink-muted">
                빈도 3회 이상 + CTR 1% 미만은 <span className="text-warn">주황색</span>으로 표시돼요 (피로도 신호).
                {activeTab === "campaign" && " 캠페인 행의 미니 그래프는 일별 추세입니다."}
              </p>
            </div>
          ) : (
            <>
              {/* AI 진단 */}
              <div className="rounded-card border border-line bg-surface p-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[13px] font-medium text-ink-soft">AI 스마트 진단</span>
                  <button onClick={runSmart} disabled={smartLoading} className="btn-signal h-9 px-3 text-[13px]">
                    <i className={`ti ${smartLoading ? "ti-loader-2 animate-spin" : "ti-sparkles"} text-[15px]`} aria-hidden />
                    {smartLoading ? "진단 중…" : smart ? "다시 진단" : "AI 진단 실행"}
                  </button>
                </div>

                <textarea
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  rows={2}
                  placeholder="마케터 컨텍스트 (선택) — 예: 신제품 런칭으로 A캠페인에 예산 집중 중. 주말 B소재 효율 하락 의심."
                  className="mb-3 w-full resize-y rounded-lg border border-line bg-canvas p-3 text-[13px] outline-none focus:border-signal focus:ring-4 focus:ring-signal/10"
                />

                {smartError && (
                  <p className="rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2.5 text-[13px] text-bad">{smartError}</p>
                )}

                {smart && (
                  <div className="space-y-3">
                    {smart.trendSummary && (
                      <p className="rounded-lg bg-canvas px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-soft">
                        {smart.trendSummary}
                      </p>
                    )}

                    {smart.statuses?.length > 0 && (
                      <div className="space-y-1.5">
                        {smart.statuses.map((s, i) => {
                          const t = TAG_META[s.tag];
                          return (
                            <div key={`${s.id}-${i}`} className="flex items-start gap-2.5 rounded-lg border border-line px-3 py-2">
                              <span className={`mt-0.5 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${t?.cls ?? ""}`}>
                                {t?.emoji} {t?.label}
                              </span>
                              <div className="min-w-0">
                                <div className="truncate text-[13px] font-medium text-ink">{s.name}</div>
                                <div className="text-[12px] text-ink-muted">{s.reason}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {smart.bottleneck && (
                      <div className="rounded-lg border border-bad/20 bg-bad/5 p-3.5">
                        <p className="mb-1 text-[12px] font-medium text-bad">예산 누수 경로</p>
                        <p className="mb-1.5 font-mono text-[12px] text-ink">
                          {smart.bottleneck.path?.join("  ➔  ")}
                        </p>
                        <p className="text-[13px] leading-relaxed text-ink-soft">{smart.bottleneck.explanation}</p>
                        <p className="mt-1.5 text-[13px] font-medium text-ink">→ {smart.bottleneck.action}</p>
                      </div>
                    )}

                    {smart.mermaid && (
                      <ReportRenderer markdown={"```mermaid\n" + smart.mermaid + "\n```"} />
                    )}
                  </div>
                )}
              </div>

              {/* 심층 리포트 */}
              <div className="rounded-card border border-line bg-surface p-5">
                <div className="mb-3 flex flex-wrap items-end gap-3">
                  <div className="min-w-[240px] flex-1">
                    <label className="mb-1.5 block text-[12px] text-ink-muted">타겟 지표 (선택)</label>
                    <input
                      value={goal}
                      onChange={(e) => setGoal(e.target.value)}
                      placeholder="예: CPA 20,000원 이하 유지하며 ROAS 500% 달성"
                      className="field h-10 text-[14px]"
                    />
                  </div>
                  <button onClick={runReport} disabled={reportLoading} className="btn-signal h-10">
                    <i className={`ti ${reportLoading ? "ti-loader-2 animate-spin" : "ti-file-text"} text-[16px]`} aria-hidden />
                    {reportLoading ? "작성 중… (30초)" : "심층 최적화 리포트"}
                  </button>
                </div>
                {reportError && (
                  <p className="rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2.5 text-[13px] text-bad">{reportError}</p>
                )}
              </div>

              {report && (
                <div className="rounded-card border border-signal/15 bg-surface p-6">
                  <ReportRenderer markdown={report} />
                </div>
              )}
            </>
          )}

          {/* 저장 */}
          <div className="rounded-card border border-line bg-surface p-5">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[220px] flex-1">
                <label className="mb-1.5 block text-[12px] text-ink-muted">리포트 이름</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} className="field h-10 text-[14px]" />
              </div>
              <button onClick={handleSave} disabled={saving} className="btn-signal h-10">
                {saving ? "저장 중…" : "이 리포트 저장"}
              </button>
            </div>
            {saveMsg && <p className="mt-2 text-[13px] text-signal">{saveMsg}</p>}
          </div>
        </>
      )}
    </div>
  );
}
