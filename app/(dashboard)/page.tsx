"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useClients } from "@/features/clients/ClientContext";
import { listReports } from "@/features/ai-report/reportData";
import { TrendChart } from "@/features/ai-report/TrendChart";
import { MetricTrendGrid } from "@/features/ai-report/MetricTrendGrid";
import { PeriodComparison, type Compare } from "@/features/ai-report/PeriodComparison";
import { KeyMetricsBarChart } from "@/features/ai-report/KeyMetricsBarChart";
import { MediaBreakdownTable, type MediaRow } from "@/features/ai-report/MediaBreakdownTable";
import { fmt } from "@/features/ai-report/calcMetrics";
import { getSessionCache, setSessionCache } from "@/features/dashboard/sessionCache";
import type { DailyPoint, Totals } from "@/features/ai-report/metaTypes";

type Period = { since: string; until: string };

type SummaryRes = {
  current: Totals;
  previous: Totals;
  lastMonth: Totals;
  daily: DailyPoint[];
  period: Period;
  prevPeriod?: Period;
  error?: string;
};

type NaverSummaryRes = SummaryRes & { campaignCount?: number; dailyApprox?: boolean };

type MediaStatus = {
  key: string;
  label: string;
  connected: boolean;
  status: "ok" | "expired" | "error" | "none";
  detail: string;
};

type AiPlan = { issues: string[]; urgentActions: string[]; nextWeekActions: string[] };

const MEDIA_LIST = [
  { key: "meta", label: "메타", connected: true },
  { key: "naver", label: "네이버 SA", connected: false },
  { key: "gfa", label: "GFA", connected: false },
] as const;
type MediaKey = (typeof MEDIA_LIST)[number]["key"];

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
}

// 주 단위 비교(7/14일)는 달력상 완료된 주(월~일) 기준으로 정렬
function weekAlignedRange(days: number): { since: string; until: string } {
  const today = new Date();
  const dow = today.getDay(); // 0=일 ... 6=토
  const diffToMonday = (dow + 6) % 7;
  const thisMonday = new Date(today);
  thisMonday.setDate(today.getDate() - diffToMonday);
  const until = new Date(thisMonday);
  until.setDate(thisMonday.getDate() - 1); // 가장 최근에 완료된 일요일
  const since = new Date(until);
  since.setDate(until.getDate() - (days - 1));
  return { since: iso(since), until: iso(until) };
}

function compareRange(days: number): { since: string; until: string } {
  if (days === 7 || days === 14) return weekAlignedRange(days);
  return { since: daysAgo(days), until: daysAgo(1) };
}

const PERIODS = [
  { key: "1d", label: "전일", since: () => daysAgo(1), until: () => daysAgo(1) },
  { key: "7d", label: "최근 7일", since: () => daysAgo(7), until: () => daysAgo(1) },
  { key: "30d", label: "최근 30일", since: () => daysAgo(30), until: () => daysAgo(1) },
];

export default function DashboardHome() {
  const { selected } = useClients();

  const [periodKey, setPeriodKey] = useState("7d");
  const [summary, setSummary] = useState<SummaryRes | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [media, setMedia] = useState<MediaStatus[] | null>(null);
  const [mediaLoading, setMediaLoading] = useState(false);

  const [mediaFilter, setMediaFilter] = useState<Record<MediaKey, boolean>>({
    meta: true,
    naver: false,
    gfa: false,
  });

  const [reportCount, setReportCount] = useState(0);

  const [naverSummary, setNaverSummary] = useState<NaverSummaryRes | null>(null);
  const [naverLoading, setNaverLoading] = useState(false);
  const [naverError, setNaverError] = useState<string | null>(null);

  const [compareWindow, setCompareWindow] = useState(7);
  const [compareData, setCompareData] = useState<Compare | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);

  const [aiPlan, setAiPlan] = useState<AiPlan | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const aiInFlight = useRef(false);

  // 성과 요약 (세션 캐시 — 메타 호출 한도 절약)
  const load = useCallback(
    async (pk: string, force = false) => {
      if (!selected?.id || !selected.meta_account_id) {
        setSummary(null);
        return;
      }
      const p = PERIODS.find((x) => x.key === pk) ?? PERIODS[1];
      const since = p.since();
      const until = p.until();
      const key = `ctch_dash_${selected.id}_${since}_${until}`;

      if (!force) {
        const cached = getSessionCache<SummaryRes>(key);
        if (cached) {
          setSummary(cached);
          setError(null);
          return;
        }
      }

      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/meta-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: selected.id, since, until }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "불러오기 실패");
        setSummary(json);
        setSessionCache(key, json);
      } catch (e) {
        setError(e instanceof Error ? e.message : "오류가 발생했어요.");
        setSummary(null);
      } finally {
        setLoading(false);
      }
    },
    [selected],
  );

  useEffect(() => {
    load(periodKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  // 기간 비교 (전주 대비 / 전월 대비) — 롤링 윈도우: 최근 N일 vs 그 직전 N일
  const loadCompare = useCallback(
    async (
      days: number,
      setData: (d: Compare | null) => void,
      setBusy: (b: boolean) => void,
    ) => {
      if (!selected?.id || !selected.meta_account_id) {
        setData(null);
        return;
      }
      const { since, until } = compareRange(days);
      const key = `ctch_cmp3_${selected.id}_${days}_${since}_${until}`;

      const cached = getSessionCache<Compare>(key);
      if (cached) {
        setData(cached);
        return;
      }

      setBusy(true);
      try {
        const res = await fetch("/api/meta-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: selected.id, since, until }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "불러오기 실패");
        const compare: Compare = {
          current: json.current,
          previous: json.previous,
          period: json.period,
          prevPeriod: json.prevPeriod,
        };
        setData(compare);
        setSessionCache(key, compare);
      } catch {
        setData(null);
      } finally {
        setBusy(false);
      }
    },
    [selected],
  );

  useEffect(() => {
    loadCompare(compareWindow, setCompareData, setCompareLoading);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, compareWindow]);

  // 네이버 SA — 체크박스가 아니라 실제 연동 여부를 기준으로 로드한다.
  // (표에서 "체크 해제된 연동 매체"도 흐리게나마 실데이터를 보여줘야 하므로)
  // 같은 기간+광고주는 5분간 캐시하고, "새로고침" 클릭(force)일 때만 강제로 다시 불러온다.
  // 429(요청 과다)를 만나면 5초 뒤 자동으로 한 번 더 시도한다.
  const loadNaver = useCallback(
    async (pk: string, force = false, isAutoRetry = false) => {
      if (!selected?.id) {
        setNaverSummary(null);
        return;
      }
      const p = PERIODS.find((x) => x.key === pk) ?? PERIODS[1];
      const since = p.since();
      const until = p.until();
      const cacheKey = `ctch_naver_summary_${selected.id}_${since}_${until}`;

      if (!force) {
        const cached = getSessionCache<NaverSummaryRes>(cacheKey);
        if (cached) {
          setNaverSummary(cached);
          setNaverError(null);
          return;
        }
      }

      setNaverLoading(true);
      if (!isAutoRetry) setNaverError(null);
      try {
        const res = await fetch(`/api/naver-ad/summary?clientId=${selected.id}&since=${since}&until=${until}`);
        const json = await res.json();
        if (!res.ok) {
          if (json.code === "RATE_LIMITED" && !isAutoRetry) {
            setNaverError(json.error || "잠시 후 다시 시도해주세요.");
            setTimeout(() => loadNaver(pk, force, true), 5000);
            return;
          }
          throw new Error(json.error || "불러오기 실패");
        }
        setNaverSummary(json);
        setNaverError(null);
        setSessionCache(cacheKey, json);
      } catch (e) {
        setNaverError(e instanceof Error ? e.message : "오류가 발생했어요.");
        setNaverSummary(null);
      } finally {
        setNaverLoading(false);
      }
    },
    [selected],
  );

  const naverConnected = media?.find((m) => m.key === "naver")?.connected ?? false;

  useEffect(() => {
    setNaverSummary(null);
    setNaverError(null);
    if (naverConnected && selected?.id) loadNaver(periodKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [naverConnected, selected?.id]);

  // 저장된 리포트 수
  useEffect(() => {
    (async () => {
      if (!selected?.id) {
        setReportCount(0);
        return;
      }
      const rows = await listReports(selected.id);
      setReportCount(rows.length);
    })();
  }, [selected?.id]);

  // 매체 필터 체크박스를 연동 상태로 게이팅하려면 표를 그리기 전에도 상태를 알아야 해서
  // selected가 바뀔 때마다 미리 조회한다.
  const loadMediaStatus = useCallback(async () => {
    if (!selected?.id) {
      setMedia(null);
      return;
    }
    setMediaLoading(true);
    try {
      const res = await fetch("/api/media-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: selected.id }),
      });
      const json = await res.json();
      setMedia(res.ok ? (json.media as MediaStatus[]) : null);
    } finally {
      setMediaLoading(false);
    }
  }, [selected]);

  useEffect(() => {
    loadMediaStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  // 연동 안 된 매체가 켜져 있으면 자동으로 꺼서 빈 데이터 조회 시도를 막는다.
  useEffect(() => {
    if (!media) return;
    setMediaFilter((f) => {
      const next = { ...f };
      for (const m of MEDIA_LIST) {
        if (m.key === "meta") continue;
        if (!media.find((s) => s.key === m.key)?.connected) next[m.key] = false;
      }
      return next;
    });
  }, [media]);

  const connectedCount = media
    ? media.filter((m) => m.status === "ok").length
    : selected
      ? [selected.meta_account_id, selected.naver_customer_id, selected.google_customer_id].filter(Boolean).length
      : 0;

  const cur = summary?.current;

  // 매체별 상세 표 행 — GFA/카카오는 실제 조회 API가 없어 항상 미연동으로 고정한다
  // (GFA는 키가 저장돼 있어도 "기타 사항" 패널에서만 그 사실을 보여주고, 이 표에서는
  // 실데이터를 보여줄 수 없다는 뜻에서 항상 미연동 취급한다). 카카오는 체크박스가
  // 없으므로 checked를 항상 false로 고정해 행이 늘 흐리게 표시된다.
  const mediaRows: MediaRow[] = [
    { key: "meta", label: "메타", checked: mediaFilter.meta, connected: !!cur, totals: cur ?? null },
    {
      key: "naver",
      label: "네이버 SA",
      checked: mediaFilter.naver,
      connected: naverConnected && !!naverSummary,
      totals: naverSummary?.current ?? null,
    },
    { key: "gfa", label: "GFA", checked: mediaFilter.gfa, connected: false, totals: null },
    { key: "kakao", label: "카카오모먼트", checked: false, connected: false, totals: null },
  ];

  const contributingRows = mediaRows.filter((r) => r.checked && r.connected && r.totals);
  const combinedTotals = contributingRows.reduce(
    (a, r) => ({
      impressions: a.impressions + r.totals!.impressions,
      clicks: a.clicks + r.totals!.clicks,
      cost: a.cost + r.totals!.cost,
      conversions: a.conversions + r.totals!.conversions,
      revenue: a.revenue + r.totals!.revenue,
      reach: 0,
      frequency: 0,
    }),
    { impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0, reach: 0, frequency: 0 } as Totals,
  );

  // 선택(체크)되고 실제 연동된 매체만 합산 — 없으면 카드에 "—"를 보여준다.
  const metrics = [
    { label: "광고비", value: fmt(contributingRows.length ? combinedTotals.cost : null, "won") },
    { label: "전환수", value: fmt(contributingRows.length ? combinedTotals.conversions : null, "int") },
    { label: "전환매출", value: fmt(contributingRows.length ? combinedTotals.revenue : null, "won") },
    {
      label: "ROAS",
      value: fmt(contributingRows.length && combinedTotals.cost ? combinedTotals.revenue / combinedTotals.cost : null, "x"),
    },
  ];

  // 그래프/기간비교 섹션은 지금처럼 메타 데이터 기준을 유지 — 안내 문구도 그대로 재사용
  const metaNotice = !selected
    ? "광고주를 선택하면 실제 수치가 표시돼요."
    : !selected.meta_account_id
      ? `${selected.name}에 메타 광고계정 ID가 없어요. 광고주 관리에서 등록해 주세요.`
      : error
        ? error
        : null;

  // AI 액션 플랜 — 같은 광고주+기간+매체 조합은 30분 캐시, "새로고침" 성 데이터 재조회
  // 완료(loading/naverLoading이 모두 끝난 시점) 후 자동으로 호출한다.
  const loadAiPlan = useCallback(
    async (force = false) => {
      if (!selected?.id) {
        setAiPlan(null);
        return;
      }
      if (contributingRows.length === 0) {
        setAiPlan(null);
        setAiError(null);
        return;
      }
      if (aiInFlight.current) return;

      const p = PERIODS.find((x) => x.key === periodKey) ?? PERIODS[1];
      const since = p.since();
      const until = p.until();
      const mediaKeys = contributingRows.map((r) => r.key).sort().join(",");
      const cacheKey = `ctch_dash_ai_${selected.id}_${since}_${until}_${mediaKeys}`;

      if (!force) {
        const cached = getSessionCache<AiPlan>(cacheKey, 30 * 60 * 1000);
        if (cached) {
          setAiPlan(cached);
          setAiError(null);
          return;
        }
      }

      aiInFlight.current = true;
      setAiLoading(true);
      setAiError(null);
      try {
        const res = await fetch("/api/dashboard-smart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientName: selected.name,
            period: { since, until },
            channels: contributingRows.map((r) => ({ label: r.label, ...r.totals! })),
            combined: combinedTotals,
            compare: summary ? { previous: summary.previous, lastMonth: summary.lastMonth } : null,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "AI 분석 실패");
        setAiPlan(json);
        setSessionCache(cacheKey, json);
      } catch (e) {
        setAiError(e instanceof Error ? e.message : "AI 분석 중 오류가 발생했어요.");
      } finally {
        setAiLoading(false);
        aiInFlight.current = false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, periodKey, contributingRows.map((r) => r.key).join(","), combinedTotals.cost, summary],
  );

  useEffect(() => {
    if (!selected?.id) {
      setAiPlan(null);
      return;
    }
    if (loading || naverLoading) return;
    loadAiPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, periodKey, loading, naverLoading, media]);

  const aiActionCount = aiPlan ? aiPlan.issues.length + aiPlan.urgentActions.length + aiPlan.nextWeekActions.length : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <p className="text-[13px] text-ink-muted">
          {new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" })}
        </p>
        <h2 className="mt-1 font-display text-[23px] font-semibold text-ink">
          {selected ? `${selected.name} 현황` : "광고주를 선택해 주세요"}
          <span className="ml-1.5 inline-block h-2 w-2 translate-y-[-2px] rounded-full bg-signal" />
        </h2>
      </div>

      {/* 매체 필터 */}
      <div className="flex flex-wrap items-center gap-4 rounded-card border border-line bg-surface p-3.5">
        <span className="text-[12px] font-medium text-ink-muted">매체 필터</span>
        {MEDIA_LIST.map((m) => {
          const needsSetup = m.key !== "meta" && !!selected && !!media && !media.find((s) => s.key === m.key)?.connected;
          return (
            <label
              key={m.key}
              className={`flex items-center gap-1.5 text-[13px] ${needsSetup ? "text-ink-faint" : "cursor-pointer text-ink-soft"}`}
            >
              <input
                type="checkbox"
                checked={mediaFilter[m.key]}
                disabled={needsSetup}
                onChange={(e) => setMediaFilter((f) => ({ ...f, [m.key]: e.target.checked }))}
                className="h-4 w-4 accent-signal disabled:opacity-40"
              />
              {m.label}
              {needsSetup && <span className="text-[11px] text-warn">연동 필요</span>}
            </label>
          );
        })}
      </div>

      {/* 요약 카드 4개 — 체크 + 연동된 매체만 합산 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-card border border-line bg-surface p-3.5">
            <p className="text-[12px] text-ink-muted">{m.label}</p>
            <p className="mt-0.5 font-display text-[20px] font-semibold text-ink">{m.value}</p>
          </div>
        ))}
      </div>

      {/* 상단 카드 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-card border border-line bg-surface p-4">
          <p className="text-[12px] text-ink-muted">연동 매체</p>
          <p className="mt-0.5 font-display text-[24px] font-semibold text-ink">{connectedCount}</p>
        </div>

        <Link href="/ai-report" className="rounded-card border border-line bg-surface p-4 transition hover:border-ink-faint">
          <p className="text-[12px] text-ink-muted">AI 액션 플랜</p>
          <p className="mt-0.5 font-display text-[24px] font-semibold text-ink">
            {aiActionCount}
            {aiActionCount === 0 && <span className="ml-1.5 text-[11px] font-normal text-ink-faint">분석 대기</span>}
          </p>
        </Link>

        <Link href="/report-analysis" className="rounded-card border border-line bg-surface p-4 transition hover:border-ink-faint">
          <p className="text-[12px] text-ink-muted">저장된 리포트</p>
          <p className="mt-0.5 font-display text-[24px] font-semibold text-ink">{reportCount}</p>
        </Link>
      </div>

      {/* 전체 리포트 현황 — 매체별 상세 표, 항상 표시 */}
      <div className="rounded-card border border-line bg-surface p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[14px] font-semibold text-ink">전체 리포트 현황</span>
          <div className="flex items-center gap-1.5">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => {
                  setPeriodKey(p.key);
                  load(p.key);
                  loadNaver(p.key);
                }}
                className={`rounded-lg border px-2.5 py-1.5 text-[12px] transition ${
                  periodKey === p.key
                    ? "border-signal bg-signal-soft font-medium text-signal"
                    : "border-line text-ink-soft hover:border-ink-faint"
                }`}
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={() => {
                load(periodKey, true);
                loadNaver(periodKey, true);
              }}
              disabled={loading || naverLoading}
              className="rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-ink-soft transition hover:border-signal hover:text-signal"
            >
              <i className={`ti ${loading || naverLoading ? "ti-loader-2 animate-spin" : "ti-refresh"} text-[13px]`} aria-hidden />
            </button>
          </div>
        </div>

        {!selected ? (
          <p className="py-8 text-center text-[13px] text-ink-muted">광고주를 선택하면 매체별 현황이 표시돼요.</p>
        ) : (
          <>
            {naverError && (
              <p className="mb-3 rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2.5 text-[13px] text-bad">{naverError}</p>
            )}
            <MediaBreakdownTable rows={mediaRows} />
          </>
        )}
      </div>

      {/* 기간 비교 */}
      <div className="rounded-card border border-line bg-surface p-5">
        <span className="mb-4 block text-[14px] font-semibold text-ink">기간 비교</span>
        {metaNotice && (
          <p
            className={`mb-4 rounded-lg px-3.5 py-2.5 text-[13px] ${
              error ? "border border-bad/20 bg-bad/5 text-bad" : "bg-warn/10 text-warn"
            }`}
          >
            {metaNotice}
          </p>
        )}
        <PeriodComparison
          window={compareWindow}
          onWindowChange={setCompareWindow}
          data={compareData}
          loading={compareLoading}
        />
      </div>

      {/* 그래프 */}
      <div className="rounded-card border border-line bg-surface p-5">
        <span className="mb-4 block text-[14px] font-semibold text-ink">그래프</span>
        {metaNotice && (
          <p
            className={`mb-4 rounded-lg px-3.5 py-2.5 text-[13px] ${
              error ? "border border-bad/20 bg-bad/5 text-bad" : "bg-warn/10 text-warn"
            }`}
          >
            {metaNotice}
          </p>
        )}

        <div className="mb-5">
          <p className="mb-1 text-[12px] text-ink-muted">주요 지표 — 노출 · 클릭 · 전환 · 비용</p>
          <KeyMetricsBarChart totals={cur ?? null} />
        </div>

        {(summary?.daily.length ?? 0) > 1 ? (
          <div className="space-y-4">
            <div>
              <p className="mb-1 text-[12px] text-ink-muted">
                광고비 대비 ROAS 추이 · {summary!.period.since} ~ {summary!.period.until}
              </p>
              <TrendChart daily={summary!.daily} />
            </div>
            <div>
              <p className="mb-1 text-[12px] text-ink-muted">지표별 추이</p>
              <MetricTrendGrid daily={summary!.daily} />
            </div>
          </div>
        ) : (
          <p className="py-6 text-center text-[13px] text-ink-muted">
            {loading ? "불러오는 중…" : "표시할 그래프가 없어요. 최근 7일 이상 데이터가 있는 광고주를 선택해 보세요."}
          </p>
        )}
      </div>

      {/* AI 액션 플랜 */}
      <div className="rounded-card border border-line bg-surface p-5">
        <div className="mb-4 flex items-center gap-2">
          <span className="text-[14px] font-semibold text-ink">AI 액션 플랜</span>
          {aiLoading && <i className="ti ti-loader-2 animate-spin text-[13px] text-ink-muted" aria-hidden />}
        </div>

        {!selected ? (
          <p className="py-8 text-center text-[13px] text-ink-muted">광고주를 선택하면 AI가 자동으로 분석해요.</p>
        ) : contributingRows.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-ink-muted">
            체크 + 연동된 매체 데이터가 없어서 분석할 수 없어요.
          </p>
        ) : aiError ? (
          <p className="rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2.5 text-[13px] text-bad">{aiError}</p>
        ) : aiLoading && !aiPlan ? (
          <p className="py-8 text-center text-[13px] text-ink-muted">AI가 분석 중이에요…</p>
        ) : aiPlan ? (
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-[12px] font-medium text-ink-soft">이번 주 주요 이슈</p>
              {aiPlan.issues.length ? (
                <ul className="space-y-1.5">
                  {aiPlan.issues.map((t, i) => (
                    <li key={i} className="rounded-lg bg-canvas px-3 py-2 text-[13px] text-ink-soft">{t}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-ink-muted">특이 이슈가 없어요.</p>
              )}
            </div>
            <div>
              <p className="mb-2 text-[12px] font-medium text-bad">즉시 조치 필요</p>
              {aiPlan.urgentActions.length ? (
                <ul className="space-y-1.5">
                  {aiPlan.urgentActions.map((t, i) => (
                    <li key={i} className="rounded-lg border border-bad/20 bg-bad/5 px-3 py-2 text-[13px] text-ink-soft">{t}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-ink-muted">즉시 조치가 필요한 항목은 없어요.</p>
              )}
            </div>
            <div>
              <p className="mb-2 text-[12px] font-medium text-signal">다음 주 추천 액션</p>
              {aiPlan.nextWeekActions.length ? (
                <ul className="space-y-1.5">
                  {aiPlan.nextWeekActions.map((t, i) => (
                    <li key={i} className="rounded-lg bg-signal-soft px-3 py-2 text-[13px] text-ink-soft">{t}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-ink-muted">추천 액션이 없어요.</p>
              )}
            </div>
          </div>
        ) : (
          <p className="py-8 text-center text-[13px] text-ink-muted">데이터가 없어요.</p>
        )}
      </div>

      {/* 기타 사항 — 매체별 연동 상태 */}
      <div className="rounded-card border border-line bg-surface p-5">
        <span className="mb-4 block text-[14px] font-semibold text-ink">기타 사항</span>
        {mediaLoading ? (
          <p className="text-[13px] text-ink-muted">연동 상태 확인 중…</p>
        ) : !selected ? (
          <p className="text-[13px] text-ink-muted">광고주를 선택하면 매체별 연동 상태를 확인할 수 있어요.</p>
        ) : !media ? (
          <p className="text-[13px] text-ink-muted">연동 상태를 불러오지 못했어요.</p>
        ) : (
          <div className="space-y-2">
            {media.map((m) => (
              <div key={m.key} className="flex items-center gap-2.5">
                <span
                  className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${
                    m.status === "ok"
                      ? "bg-good"
                      : m.status === "expired" || m.status === "error"
                        ? "bg-bad"
                        : "bg-ink-faint"
                  }`}
                  aria-hidden
                />
                <span className="w-20 text-[13px] font-medium text-ink">{m.label}</span>
                <span className="text-[12px] text-ink-muted">{m.detail}</span>
                {m.status === "ok" && <span className="text-[11px] text-good">실시간 연동 중</span>}
                {m.status === "expired" && <span className="text-[11px] text-bad">토큰 만료</span>}
              </div>
            ))}
            <Link href="/clients" className="mt-1 inline-block text-[12px] text-signal hover:underline">
              광고주 관리에서 계정 수정 →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
