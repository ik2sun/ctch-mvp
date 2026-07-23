"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useClients } from "@/features/clients/ClientContext";
import { listReports } from "@/features/ai-report/reportData";
import { TrendChart } from "@/features/ai-report/TrendChart";
import { MetricTrendGrid } from "@/features/ai-report/MetricTrendGrid";
import { ComparisonRows } from "@/features/ai-report/DeltaBadge";
import { fmt } from "@/features/ai-report/calcMetrics";
import type { DailyPoint, SmartInsights, Totals } from "@/features/ai-report/metaTypes";

type SummaryRes = {
  current: Totals;
  previous: Totals;
  lastMonth: Totals;
  daily: DailyPoint[];
  period: { since: string; until: string };
  error?: string;
};

type MediaStatus = {
  key: string;
  label: string;
  connected: boolean;
  status: "ok" | "expired" | "error" | "none";
  detail: string;
};

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
}

const PERIODS = [
  { key: "1d", label: "전일", since: () => daysAgo(1), until: () => daysAgo(1) },
  { key: "7d", label: "최근 7일", since: () => daysAgo(7), until: () => daysAgo(1) },
  { key: "30d", label: "최근 30일", since: () => daysAgo(30), until: () => daysAgo(1) },
];

export default function DashboardHome() {
  const { clients, selected } = useClients();

  const [periodKey, setPeriodKey] = useState("7d");
  const [summary, setSummary] = useState<SummaryRes | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [media, setMedia] = useState<MediaStatus[] | null>(null);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(false);

  const [reportCount, setReportCount] = useState(0);
  const [actionCount, setActionCount] = useState(0);

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
  const prev = summary?.previous;
  const mon = summary?.lastMonth;

  const metrics = cur
    ? [
        { label: "광고비", value: fmt(cur.cost, "won"), cur: cur.cost, prev: prev?.cost ?? 0, mon: mon?.cost ?? 0, inverse: true },
        { label: "전환수", value: fmt(cur.conversions, "int"), cur: cur.conversions, prev: prev?.conversions ?? 0, mon: mon?.conversions ?? 0 },
        { label: "전환매출", value: fmt(cur.revenue, "won"), cur: cur.revenue, prev: prev?.revenue ?? 0, mon: mon?.revenue ?? 0 },
        {
          label: "ROAS",
          value: fmt(cur.cost ? cur.revenue / cur.cost : null, "x"),
          cur: cur.cost ? cur.revenue / cur.cost : 0,
          prev: prev?.cost ? prev.revenue / prev.cost : 0,
          mon: mon?.cost ? mon.revenue / mon.cost : 0,
        },
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

      {/* 상단 카드 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-card border border-line bg-surface p-4">
          <p className="text-[12px] text-ink-muted">관리 광고주</p>
          <p className="mt-0.5 font-display text-[24px] font-semibold text-ink">{clients.length}</p>
        </div>

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
                  <ComparisonRows cur={m.cur} prev={m.prev} mon={m.mon} inverse={m.inverse} />
                </div>
              ))}
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
    </div>
  );
}
