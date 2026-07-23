"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useClients } from "@/features/clients/ClientContext";
import { listReports } from "@/features/ai-report/reportData";
import { TrendChart } from "@/features/ai-report/TrendChart";
import { MetricTrendGrid } from "@/features/ai-report/MetricTrendGrid";
import { PeriodComparison, type Compare } from "@/features/ai-report/PeriodComparison";
import { KeyMetricsBarChart } from "@/features/ai-report/KeyMetricsBarChart";
import { fmt } from "@/features/ai-report/calcMetrics";
import type { DailyPoint, SmartInsights, Totals } from "@/features/ai-report/metaTypes";

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

type MediaStatus = {
  key: string;
  label: string;
  connected: boolean;
  status: "ok" | "expired" | "error" | "none";
  detail: string;
};

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
  const [mediaOpen, setMediaOpen] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(false);

  const [mediaFilter, setMediaFilter] = useState<Record<MediaKey, boolean>>({
    meta: true,
    naver: false,
    gfa: false,
  });

  const [reportCount, setReportCount] = useState(0);
  const [actionCount, setActionCount] = useState(0);

  const [compareWindow, setCompareWindow] = useState(7);
  const [compareData, setCompareData] = useState<Compare | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);

  const period = PERIODS.find((p) => p.key === periodKey) ?? PERIODS[1];

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

      if (!force && typeof window !== "undefined") {
        const cached = sessionStorage.getItem(key);
        if (cached) {
          try {
            setSummary(JSON.parse(cached));
            setError(null);
            return;
          } catch {
            sessionStorage.removeItem(key);
          }
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
        try {
          sessionStorage.setItem(key, JSON.stringify(json));
        } catch {
          /* ignore */
        }
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

      if (typeof window !== "undefined") {
        const cached = sessionStorage.getItem(key);
        if (cached) {
          try {
            setData(JSON.parse(cached));
            return;
          } catch {
            sessionStorage.removeItem(key);
          }
        }
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
        try {
          sessionStorage.setItem(key, JSON.stringify(compare));
        } catch {
          /* ignore */
        }
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

  // 저장 리포트 수 + AI 액션 플랜 수
  useEffect(() => {
    (async () => {
      if (!selected?.id) {
        setReportCount(0);
        setActionCount(0);
        return;
      }
      const rows = await listReports(selected.id);
      setReportCount(rows.length);
      try {
        const raw = sessionStorage.getItem(`ctch_smart_${selected.id}`);
        if (raw) {
          const s = JSON.parse(raw) as SmartInsights;
          setActionCount((s.statuses?.length ?? 0) + (s.bottleneck ? 1 : 0));
        } else setActionCount(0);
      } catch {
        setActionCount(0);
      }
    })();
  }, [selected?.id]);

  async function checkMedia() {
    setMediaOpen((v) => !v);
    if (media || !selected?.id) return;
    setMediaLoading(true);
    try {
      const res = await fetch("/api/meta-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: selected.id }),
      });
      const json = await res.json();
      if (res.ok) setMedia(json.media as MediaStatus[]);
    } finally {
      setMediaLoading(false);
    }
  }

  const connectedCount = media
    ? media.filter((m) => m.status === "ok").length
    : selected
      ? [selected.meta_account_id, selected.naver_customer_id, selected.google_customer_id].filter(Boolean).length
      : 0;

  const cur = summary?.current;

  const metrics = cur
    ? [
        { label: "광고비", value: fmt(cur.cost, "won") },
        { label: "전환수", value: fmt(cur.conversions, "int") },
        { label: "전환매출", value: fmt(cur.revenue, "won") },
        { label: "ROAS", value: fmt(cur.cost ? cur.revenue / cur.cost : null, "x") },
      ]
    : [];

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
        {MEDIA_LIST.map((m) => (
          <label key={m.key} className="flex cursor-pointer items-center gap-1.5 text-[13px] text-ink-soft">
            <input
              type="checkbox"
              checked={mediaFilter[m.key]}
              onChange={(e) => setMediaFilter((f) => ({ ...f, [m.key]: e.target.checked }))}
              className="h-4 w-4 accent-signal"
            />
            {m.label}
          </label>
        ))}
      </div>

      {/* 상단 카드 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <button
          onClick={checkMedia}
          className={`rounded-card border bg-surface p-4 text-left transition ${
            mediaOpen ? "border-signal" : "border-line hover:border-ink-faint"
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-[12px] text-ink-muted">연동 매체</p>
            <i className={`ti ti-chevron-down text-[13px] text-ink-muted transition-transform ${mediaOpen ? "rotate-180" : ""}`} aria-hidden />
          </div>
          <p className="mt-0.5 font-display text-[24px] font-semibold text-ink">{connectedCount}</p>
        </button>

        <Link href="/ai-report" className="rounded-card border border-line bg-surface p-4 transition hover:border-ink-faint">
          <p className="text-[12px] text-ink-muted">AI 액션 플랜</p>
          <p className="mt-0.5 font-display text-[24px] font-semibold text-ink">
            {actionCount}
            {actionCount === 0 && <span className="ml-1.5 text-[11px] font-normal text-ink-faint">진단 필요</span>}
          </p>
        </Link>

        <Link href="/report-analysis" className="rounded-card border border-line bg-surface p-4 transition hover:border-ink-faint">
          <p className="text-[12px] text-ink-muted">저장된 리포트</p>
          <p className="mt-0.5 font-display text-[24px] font-semibold text-ink">{reportCount}</p>
        </Link>
      </div>

      {/* 매체 연동 상태 */}
      {mediaOpen && (
        <div className="rounded-card border border-line bg-surface p-4">
          {mediaLoading ? (
            <p className="text-[13px] text-ink-muted">연동 상태 확인 중…</p>
          ) : !media ? (
            <p className="text-[13px] text-ink-muted">광고주를 선택하면 상태를 확인할 수 있어요.</p>
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
                  <span className="w-16 text-[13px] font-medium text-ink">{m.label}</span>
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
      )}

      {!mediaFilter.meta && !mediaFilter.naver && !mediaFilter.gfa && (
        <p className="rounded-card border border-dashed border-line bg-surface py-8 text-center text-[13px] text-ink-muted">
          매체 필터에서 하나 이상 선택하면 데이터가 표시돼요.
        </p>
      )}

      {mediaFilter.naver && (
        <div className="rounded-card border border-dashed border-line bg-surface p-5 text-center">
          <p className="text-[13px] font-medium text-ink">네이버 SA</p>
          <p className="mt-1 text-[12px] text-ink-muted">연동 준비 중이에요. 곧 만나보실 수 있어요.</p>
        </div>
      )}

      {mediaFilter.gfa && (
        <div className="rounded-card border border-dashed border-line bg-surface p-5 text-center">
          <p className="text-[13px] font-medium text-ink">GFA</p>
          <p className="mt-1 text-[12px] text-ink-muted">연동 준비 중이에요. 곧 만나보실 수 있어요.</p>
        </div>
      )}

      {mediaFilter.meta && (
      <>
      {/* 전체 리포트 현황 */}
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
              onClick={() => load(periodKey, true)}
              disabled={loading}
              className="rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-ink-soft transition hover:border-signal hover:text-signal"
            >
              <i className={`ti ${loading ? "ti-loader-2 animate-spin" : "ti-refresh"} text-[13px]`} aria-hidden />
            </button>
          </div>
        </div>

        {!selected ? (
          <p className="py-8 text-center text-[13px] text-ink-muted">광고주를 선택하면 현황이 표시돼요.</p>
        ) : !selected.meta_account_id ? (
          <p className="rounded-lg bg-warn/10 px-3.5 py-2.5 text-[13px] text-warn">
            {selected.name}에 메타 광고계정 ID가 없어요.{" "}
            <Link href="/clients" className="underline">광고주 관리에서 등록</Link>
          </p>
        ) : error ? (
          <p className="rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2.5 text-[13px] text-bad">{error}</p>
        ) : loading && !summary ? (
          <p className="py-8 text-center text-[13px] text-ink-muted">불러오는 중…</p>
        ) : summary && cur ? (
          <>
            {/* 지표 + 비교 */}
            <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {metrics.map((m) => (
                <div key={m.label} className="rounded-lg bg-canvas p-3.5">
                  <p className="text-[12px] text-ink-muted">{m.label}</p>
                  <p className="mt-0.5 font-display text-[20px] font-semibold text-ink">{m.value}</p>
                </div>
              ))}
            </div>

            {/* 주요 지표 막대그래프 */}
            <div className="mb-5">
              <p className="mb-1 text-[12px] text-ink-muted">주요 지표 — 노출 · 클릭 · 전환 · 비용</p>
              <KeyMetricsBarChart totals={cur} />
            </div>

            {/* 그래프 */}
            {summary.daily.length > 1 ? (
              <div className="space-y-4">
                <div>
                  <p className="mb-1 text-[12px] text-ink-muted">
                    광고비 대비 ROAS 추이 · {summary.period.since} ~ {summary.period.until}
                  </p>
                  <TrendChart daily={summary.daily} />
                </div>
                <div>
                  <p className="mb-1 text-[12px] text-ink-muted">지표별 추이</p>
                  <MetricTrendGrid daily={summary.daily} />
                </div>
              </div>
            ) : (
              <p className="py-6 text-center text-[13px] text-ink-muted">
                선택한 기간이 짧아 그래프를 그릴 수 없어요. 최근 7일 이상을 선택해 보세요.
              </p>
            )}
          </>
        ) : (
          <p className="py-8 text-center text-[13px] text-ink-muted">데이터가 없어요.</p>
        )}
      </div>

      {/* 기간 비교 */}
      <div className="rounded-card border border-line bg-surface p-5">
        <span className="mb-4 block text-[14px] font-semibold text-ink">기간 비교</span>
        {!selected ? (
          <p className="py-8 text-center text-[13px] text-ink-muted">광고주를 선택하면 비교가 표시돼요.</p>
        ) : !selected.meta_account_id ? (
          <p className="rounded-lg bg-warn/10 px-3.5 py-2.5 text-[13px] text-warn">
            {selected.name}에 메타 광고계정 ID가 없어요.{" "}
            <Link href="/clients" className="underline">광고주 관리에서 등록</Link>
          </p>
        ) : (
          <PeriodComparison
            window={compareWindow}
            onWindowChange={setCompareWindow}
            data={compareData}
            loading={compareLoading}
          />
        )}
      </div>
      </>
      )}
    </div>
  );
}
