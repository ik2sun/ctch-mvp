"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ReportRenderer } from "@/features/ai-report/ReportRenderer";
import { TreeTable } from "@/features/ai-report/TreeTable";
import {
  metaRowsToSummary,
  TAG_META,
  type MetaHierarchy,
  type SmartInsights,
} from "@/features/ai-report/metaTypes";
import { useClients } from "@/features/clients/ClientContext";
import { saveReport } from "@/features/ai-report/reportData";
import { ReportConfigPanel } from "@/features/ai-report/components/ReportConfigPanel";
import type { ReportConfig } from "@/features/ai-report/reportConfig";
import { getSessionCache, setSessionCache } from "@/features/dashboard/sessionCache";
import { MEDIA_COLORS, buildInsights, efficiency, rowsToSeries, type MediaSeries } from "@/features/dashboard/analysis";
import { KpiStrip } from "@/features/dashboard/KpiStrip";
import { BudgetShareChart } from "@/features/dashboard/BudgetShareChart";
import { DailyRoasChart, DailySpendChart } from "@/features/dashboard/DailyMediaCharts";
import { InsightPanel } from "@/features/dashboard/InsightPanel";
import { Card, MediaChip, Segmented } from "@/features/dashboard/ui";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

type TabKey = "campaign" | "adset" | "ad" | "ai";

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "campaign", label: "캠페인", icon: "ti-speakerphone" },
  { key: "adset", label: "광고세트", icon: "ti-layout-grid" },
  { key: "ad", label: "광고소재", icon: "ti-photo" },
  { key: "ai", label: "AI 분석", icon: "ti-sparkles" },
];

const PRESETS = [
  { key: "7", label: "7일", days: 7 },
  { key: "14", label: "14일", days: 14 },
  { key: "30", label: "30일", days: 30 },
] as const;

function shortDate(s?: string) {
  if (!s) return "";
  const d = new Date(`${s}T00:00:00`);
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

type Channel = "meta" | "naver" | "kakao" | "gfa" | "google_ads";

const CHANNELS: { key: Channel; label: string; icon: string; sheetName: string; channelLabel: string }[] = [
  { key: "meta", label: "메타", icon: "ti-brand-meta", sheetName: "메타 API", channelLabel: "메타(Meta)" },
  { key: "naver", label: "네이버 SA", icon: "ti-search", sheetName: "네이버 SA API", channelLabel: "네이버 SA" },
  { key: "kakao", label: "카카오모먼트", icon: "ti-message-circle", sheetName: "카카오모먼트 API", channelLabel: "카카오모먼트" },
  { key: "gfa", label: "GFA", icon: "ti-layout-board", sheetName: "GFA API", channelLabel: "네이버 GFA" },
  { key: "google_ads", label: "구글 Ads", icon: "ti-brand-google", sheetName: "구글 Ads API", channelLabel: "구글 Ads" },
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

  // 광고주별 리포트 설정 — AI 진단/리포트 호출 시 system prompt로 주입된다
  const [reportConfig, setReportConfig] = useState<ReportConfig | null>(null);
  const handleConfigChange = useCallback((c: ReportConfig) => setReportConfig(c), []);

  const [activeTab, setActiveTab] = useState<TabKey>("campaign");
  const [compareBase, setCompareBase] = useState<"prev" | "month">("prev");
  const [highlight, setHighlight] = useState<string | null>(null);
  const [channel, setChannel] = useState<Channel>("meta");
  const channelDef = CHANNELS.find((c) => c.key === channel) ?? CHANNELS[0];

  const canFetch = channel === "meta" ? !!selected?.meta_account_id : !!selected?.id;

  // 네이버 SA는 같은 기간+광고주 조회를 5분간 캐시하고, "새로고침" 클릭(force)일 때만
  // 강제로 다시 불러온다. 429(요청 과다)를 만나면 5초 뒤 자동으로 한 번 더 시도한다.
  const fetchData = useCallback(
    async (s: string, u: string, ch: Channel, force = false, isAutoRetry = false) => {
      if (!selected?.id) return;

      const chLabel = CHANNELS.find((c) => c.key === ch)?.label ?? ch;
      const cacheKey = ch !== "meta" ? `ctch_${ch}_insights_${selected.id}_${s}_${u}` : null;
      if (cacheKey && !force) {
        const cached = getSessionCache<MetaHierarchy>(cacheKey);
        if (cached) {
          setData(cached);
          setTitle(`${selected.name} ${chLabel} ${s}~${u}`);
          setLoadError(null);
          setSmart(null);
          setReport("");
          return;
        }
      }

      setLoading(true);
      if (!isAutoRetry) setLoadError(null);
      setSmart(null);
      setReport("");
      try {
        let json: MetaHierarchy;
        if (ch === "meta") {
          const res = await fetch("/api/meta-insights", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ since: s, until: u, clientId: selected.id }),
          });
          json = await res.json();
          if (!res.ok) throw new Error((json as unknown as { error?: string }).error || "불러오기 실패");
          setTitle(`${selected.name} 메타 ${s}~${u}`);
        } else {
          const endpoint =
            ch === "naver" ? "/api/naver-ad/insights" : ch === "gfa" ? "/api/gfa/insights" : ch === "google_ads" ? "/api/google-ads/insights" : "/api/kakao-moment/insights";
          const res = await fetch(`${endpoint}?clientId=${selected.id}&since=${s}&until=${u}`);
          json = await res.json();
          if (!res.ok) {
            const errJson = json as unknown as { error?: string; code?: string };
            if (errJson.code === "RATE_LIMITED" && !isAutoRetry) {
              setLoadError(errJson.error || "잠시 후 다시 시도해주세요.");
              setTimeout(() => fetchData(s, u, ch, force, true), ch === "kakao" ? 6000 : 5000);
              return;
            }
            throw new Error(errJson.error || "불러오기 실패");
          }
          setTitle(`${selected.name} ${chLabel} ${s}~${u}`);
          if (cacheKey) setSessionCache(cacheKey, json);
        }
        setData(json);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "오류가 발생했어요.");
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [selected],
  );

  // 진입/채널 전환 시 최근 7일 자동 로드
  useEffect(() => {
    if (canFetch) fetchData(since, until, channel);
    else setData(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, canFetch, channel]);

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
          channel: channelDef.channelLabel,
          reportConfig,
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
          channel: channelDef.channelLabel,
          reportConfig,
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
      title: title.trim() || `${channelDef.label} 최적화 리포트`,
      reportDate: data.period?.until ?? null,
      sheetName: channelDef.sheetName,
      summary,
      aiComment: body || null,
    });
    setSaving(false);
    setSaveMsg(error ? "저장에 실패했어요." : "저장했어요. 파일 분석 메뉴의 목록에서 볼 수 있어요.");
  }

  const summary = data ? metaRowsToSummary(data.campaigns) : null;
  const chColor = MEDIA_COLORS[channel];
  const compareShort = compareBase === "prev" ? "직전 기간" : "전월 동기간";
  const compareLabel = `${compareShort} 대비`;
  const preset = PRESETS.find((p) => since === daysAgo(p.days) && until === daysAgo(1))?.key ?? null;
  const periodText = data?.period ? `${shortDate(data.period.since)} ~ ${shortDate(data.period.until)}` : "";

  // 매체 단위 시리즈(비교 기간 포함) + 캠페인 단위 시리즈(상위 8 + 기타)
  const view = useMemo(() => {
    if (!data || !summary) return null;
    const t = summary.totals;
    const channelSeries: MediaSeries = {
      key: channel,
      label: channelDef.label,
      color: chColor,
      current: { impressions: t.impressions, clicks: t.clicks, cost: t.cost, conversions: t.conversions, revenue: t.revenue, reach: 0, frequency: 0 },
      previous: (compareBase === "prev" ? data.compare?.previous : data.compare?.lastMonth) ?? null,
      daily: data.daily ?? [],
    };
    const ch = efficiency([channelSeries]);
    const camp = efficiency(rowsToSeries(data.campaigns));
    const seen = new Set<string>();
    const insights = [
      ...buildInsights(ch.rows, ch.total, ch.totalPrev, compareLabel),
      ...buildInsights(camp.rows, camp.total, null, compareLabel, "캠페인"),
    ]
      .filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 6);
    return { channelSeries, ch, camp, insights };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, compareBase, channel]);

  const pickPreset = (days: number) => {
    const s = daysAgo(days);
    setSince(s);
    setUntil(daysAgo(1));
    fetchData(s, daysAgo(1), channel);
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6">
      {/* 헤더 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[15px] text-ink-muted">실시간 리포트 · 매체 API</p>
          <h2 className="mt-1 text-[26px] font-bold tracking-tight text-[#1A1A1A]">
            {selected ? `${selected.name} · ${channelDef.label}` : "광고주를 선택해 주세요"}
          </h2>
        </div>
        {selected && canFetch && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={since}
              onChange={(e) => setSince(e.target.value)}
              className="field h-[34px] w-auto px-2.5 text-[15px]"
              aria-label="시작일"
            />
            <span className="text-ink-faint">~</span>
            <input
              type="date"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              className="field h-[34px] w-auto px-2.5 text-[15px]"
              aria-label="종료일"
            />
            <Segmented value={preset} options={PRESETS.map((p) => ({ key: p.key, label: p.label }))} onChange={(k) => pickPreset(PRESETS.find((p) => p.key === k)!.days)} />
            <button
              type="button"
              onClick={() => fetchData(since, until, channel, true)}
              disabled={loading}
              title="이 기간으로 불러오기"
              className="flex h-[34px] items-center gap-1 rounded-lg border border-line bg-surface px-3 text-[15px] text-ink-soft transition hover:border-signal hover:text-signal disabled:opacity-50"
            >
              <i className={`ti ${loading ? "ti-loader-2 animate-spin" : "ti-refresh"} text-[15px]`} aria-hidden />
              {loading ? "불러오는 중" : "조회"}
            </button>
          </div>
        )}
      </div>

      {/* 필터 한 줄 — 매체·비교 기준 */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-line bg-surface px-5 py-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {CHANNELS.map((c) => {
            const disabled = c.key === "meta" && !!selected && !selected.meta_account_id;
            return (
              <MediaChip
                key={c.key}
                label={c.label}
                color={MEDIA_COLORS[c.key]}
                on={channel === c.key}
                disabled={disabled}
                note={disabled ? "연동 필요" : undefined}
                title={disabled ? "광고주 관리에서 메타 광고계정 ID를 등록하세요" : undefined}
                onClick={() => setChannel(c.key)}
              />
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[15px] text-ink-muted">비교 기준</span>
          <Segmented
            value={compareBase}
            options={[
              { key: "prev", label: "직전 기간" },
              { key: "month", label: "전월 동기간" },
            ]}
            onChange={setCompareBase}
          />
        </div>
      </div>

      {!selected ? (
        <div className="rounded-card border border-line bg-surface py-16 text-center text-[15px] text-ink-muted">먼저 상단에서 광고주를 선택해 주세요.</div>
      ) : channel === "meta" && !selected.meta_account_id ? (
        <p className="rounded-lg bg-warn/10 px-3.5 py-2.5 text-[15px] text-warn">
          {selected.name}에 메타 광고계정 ID가 없어요. 광고주 관리에서 등록해 주세요.
        </p>
      ) : null}

      {loadError && <p className="rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2.5 text-[15px] text-bad">{loadError}</p>}
      {loading && !data && channel === "kakao" && <p className="text-[13px] text-ink-muted">카카오모먼트 보고서를 불러오는 중… (요청 제한 때문에 10~15초 걸려요)</p>}

      {/* 광고주별 리포트 설정 */}
      {selected && <ReportConfigPanel key={selected.id} clientId={selected.id} clientName={selected.name} onChange={handleConfigChange} />}

      {data && summary && view && (
        <>
          <KpiStrip
            total={view.channelSeries.current}
            totalPrev={data.compare ? view.channelSeries.previous : null}
            daily={data.daily ?? []}
            compareLabel={data.compare ? compareShort : undefined}
            loading={loading}
            secondary
          />

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card title="캠페인 예산 비중 vs 매출 기여" sub={`광고비 상위 8개 캠페인 · ${periodText}`}>
              <BudgetShareChart rows={view.camp.rows} highlight={highlight} onHighlight={setHighlight} noun="캠페인" />
            </Card>
            <Card title="인사이트" sub={data.compare ? `데이터에서 확인된 신호 · ${compareLabel}` : "데이터에서 확인된 신호"}>
              <InsightPanel insights={view.insights} colors={{ [channel]: chColor }} onHighlight={setHighlight} />
            </Card>
          </div>

          <Card title="일별 추이" sub={periodText}>
            {(data.daily?.length ?? 0) > 1 ? (
              <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
                <div>
                  <p className="mb-3 text-[15px] font-semibold text-[#1A1A1A]">광고비</p>
                  <DailySpendChart series={[view.channelSeries]} highlight={null} />
                </div>
                <div>
                  <p className="mb-3 text-[15px] font-semibold text-[#1A1A1A]">ROAS</p>
                  <DailyRoasChart series={[view.channelSeries]} highlight={null} />
                </div>
              </div>
            ) : (
              <p className="py-8 text-center text-[15px] text-ink-muted">일별 데이터가 2일 이상일 때 추이를 보여 드려요.</p>
            )}
          </Card>

          {/* 단위 선택 탭 */}
          <div className="flex flex-wrap items-center gap-1 rounded-card border border-line bg-surface p-1">
            {TABS.map((t) => {
              const active = activeTab === t.key;
              const count = t.key === "campaign" ? data.campaigns.length : t.key === "adset" ? data.adsets.length : t.key === "ad" ? data.ads.length : null;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActiveTab(t.key)}
                  aria-pressed={active}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[15px] transition ${
                    active ? "bg-signal-soft font-medium text-signal" : "text-ink-soft hover:bg-canvas"
                  }`}
                >
                  <i className={`ti ${t.icon} text-[16px]`} aria-hidden />
                  {t.label}
                  {count != null && <span className={`text-[12px] tabular-nums ${active ? "text-signal/70" : "text-ink-faint"}`}>{count}</span>}
                </button>
              );
            })}
          </div>

          {activeTab !== "ai" ? (
            <Card
              title={`${TABS.find((t) => t.key === activeTab)?.label} 데이터`}
              sub={`캠페인 ${data.campaigns.length} · 세트 ${data.adsets.length} · 소재 ${data.ads.length}${activeTab === "campaign" ? " · [+]를 눌러 하위로 펼쳐보세요" : ""}`}
            >
              <TreeTable data={data} statuses={smart?.statuses ?? []} view={activeTab} />
              {channel === "meta" ? (
                <p className="mt-2 text-[12px] text-ink-muted">
                  빈도 3회 이상 + CTR 1% 미만은 <span className="text-warn">주황색</span>으로 표시돼요 (피로도 신호).
                  {activeTab === "campaign" && " 캠페인 행의 미니 그래프는 일별 추세입니다."}
                </p>
              ) : (
                data.scopeNote && <p className="mt-2 text-[12px] text-ink-muted">{data.scopeNote}</p>
              )}
            </Card>
          ) : (
            <>
              {/* AI 진단 */}
              <Card
                title="AI 스마트 진단"
                sub="캠페인·세트·소재 상태 태그와 예산 누수 경로"
                right={
                  <button onClick={runSmart} disabled={smartLoading} className="btn-signal h-9 px-3 text-[15px]">
                    <i className={`ti ${smartLoading ? "ti-loader-2 animate-spin" : "ti-sparkles"} text-[16px]`} aria-hidden />
                    {smartLoading ? "진단 중…" : smart ? "다시 진단" : "AI 진단 실행"}
                  </button>
                }
              >
                <textarea
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  rows={2}
                  placeholder="마케터 컨텍스트 (선택) — 예: 신제품 런칭으로 A캠페인에 예산 집중 중. 주말 B소재 효율 하락 의심."
                  className="mb-3 w-full resize-y rounded-lg border border-line bg-canvas p-3 text-[15px] outline-none focus:border-signal focus:ring-4 focus:ring-signal/10"
                />

                {smartError && <p className="rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2.5 text-[15px] text-bad">{smartError}</p>}

                {smart && (
                  <div className="space-y-3">
                    {smart.trendSummary && <p className="rounded-lg bg-canvas px-3.5 py-2.5 text-[15px] leading-relaxed text-ink-soft">{smart.trendSummary}</p>}

                    {smart.statuses?.length > 0 && (
                      <div className="space-y-1.5">
                        {smart.statuses.map((s, i) => {
                          const t = TAG_META[s.tag];
                          return (
                            <div key={`${s.id}-${i}`} className="flex items-start gap-2.5 rounded-lg border border-line px-3 py-2">
                              <span className={`mt-0.5 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[12px] font-medium ${t?.cls ?? ""}`}>
                                {t?.emoji} {t?.label}
                              </span>
                              <div className="min-w-0">
                                <div className="truncate text-[15px] font-medium text-ink">{s.name}</div>
                                <div className="text-[13px] text-ink-muted">{s.reason}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {smart.bottleneck && (
                      <div className="rounded-lg border border-bad/20 bg-bad/5 p-3.5">
                        <p className="mb-1 flex items-center gap-1 text-[13px] font-medium text-bad">
                          <i className="ti ti-alert-triangle text-[15px]" aria-hidden />
                          예산 누수 경로
                        </p>
                        <p className="mb-1.5 font-mono text-[13px] text-ink">{smart.bottleneck.path?.join("  ➔  ")}</p>
                        <p className="text-[15px] leading-relaxed text-ink-soft">{smart.bottleneck.explanation}</p>
                        <p className="mt-1.5 text-[15px] font-medium text-ink">→ {smart.bottleneck.action}</p>
                      </div>
                    )}

                    {smart.mermaid && <ReportRenderer markdown={"```mermaid\n" + smart.mermaid + "\n```"} />}
                  </div>
                )}
              </Card>

              {/* 심층 리포트 */}
              <Card title="심층 최적화 리포트" sub="목표 지표를 넣으면 그 기준으로 진단해요 (약 30초)">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[240px] flex-1">
                    <label className="mb-1.5 block text-[13px] text-ink-muted">타겟 지표 (선택)</label>
                    <input
                      value={goal}
                      onChange={(e) => setGoal(e.target.value)}
                      placeholder="예: CPA 20,000원 이하 유지하며 ROAS 500% 달성"
                      className="field h-10 text-[15px]"
                    />
                  </div>
                  <button onClick={runReport} disabled={reportLoading} className="btn-signal h-10">
                    <i className={`ti ${reportLoading ? "ti-loader-2 animate-spin" : "ti-file-text"} text-[17px]`} aria-hidden />
                    {reportLoading ? "작성 중… (30초)" : "리포트 작성"}
                  </button>
                </div>
                {reportError && <p className="mt-3 rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2.5 text-[15px] text-bad">{reportError}</p>}
              </Card>

              {report && (
                <div className="rounded-card border border-signal/15 bg-surface p-6">
                  <ReportRenderer markdown={report} />
                </div>
              )}
            </>
          )}

          {/* 저장 */}
          <div className="flex flex-wrap items-end gap-3 rounded-card border border-line bg-surface px-5 py-4">
            <div className="min-w-[220px] flex-1">
              <label className="mb-1.5 block text-[13px] text-ink-muted">리포트 이름</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="field h-10 text-[15px]" />
            </div>
            <button onClick={handleSave} disabled={saving} className="btn-signal h-10">
              <i className="ti ti-device-floppy text-[17px]" aria-hidden />
              {saving ? "저장 중…" : "이 리포트 저장"}
            </button>
            {saveMsg && <p className="w-full text-[15px] text-signal">{saveMsg}</p>}
          </div>
        </>
      )}
    </div>
  );
}
