"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useClients } from "@/features/clients/ClientContext";
import { listReports } from "@/features/ai-report/reportData";
import { getSessionCache, setSessionCache } from "@/features/dashboard/sessionCache";
import type { DailyPoint, Totals } from "@/features/ai-report/metaTypes";
import { MEDIA_COLORS, buildInsights, combinedDaily, efficiency, sumTotals, type Insight, type MediaSeries } from "@/features/dashboard/analysis";
import { KpiStrip } from "@/features/dashboard/KpiStrip";
import { MediaEfficiencyTable } from "@/features/dashboard/MediaEfficiencyTable";
import { InsightPanel } from "@/features/dashboard/InsightPanel";
import { Card, MediaChip, Segmented } from "@/features/dashboard/ui";
import { AiPlanView, type AiPlan, type BudgetMove } from "@/features/dashboard/AiPlanView";
import { TrendShareCard } from "@/features/dashboard/TrendShareCard";
import { MediaDrilldown, fetchChannelInsights } from "@/features/dashboard/MediaDrilldown";
import { RebalanceDialog } from "@/features/dashboard/RebalanceDialog";
import type { MetaHierarchy, MetaRow } from "@/features/ai-report/metaTypes";

type Period = { since: string; until: string };

type SummaryRes = {
  current: Totals;
  previous: Totals;
  lastMonth?: Totals; // 전월 동기 — 대시보드는 그 비교를 고를 때만 받음
  lastYear?: Totals; // 전년 동기 — year=1로 요청했을 때만
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


const MEDIA_LIST = [
  { key: "meta", label: "메타", connected: true },
  { key: "naver", label: "네이버 SA", connected: false },
  { key: "gfa", label: "GFA", connected: false },
  { key: "kakao", label: "카카오모먼트", connected: false },
  { key: "google_ads", label: "구글 Ads", connected: false },
] as const;
type MediaKey = (typeof MEDIA_LIST)[number]["key"];
// 대시보드 조회가 아직 없는 매체 — media-status가 ok여도 필터를 막는다(지금은 없음)
const NOT_READY: ReadonlySet<MediaKey> = new Set<MediaKey>();

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
}
function shortDate(s: string) {
  const d = new Date(`${s}T00:00:00`);
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

const PERIODS = [
  { key: "1d", label: "전일", since: () => daysAgo(1), until: () => daysAgo(1) },
  { key: "7d", label: "최근 7일", since: () => daysAgo(7), until: () => daysAgo(1) },
  { key: "30d", label: "최근 30일", since: () => daysAgo(30), until: () => daysAgo(1) },
];

type CompareBase = "prev" | "month" | "year";
const COMPARE_LABEL: Record<CompareBase, string> = { prev: "직전 기간", month: "전월 동기", year: "전년 동기" };

export default function DashboardHome() {
  const { selected } = useClients();
  const router = useRouter();
  const [rebalance, setRebalance] = useState<(BudgetMove & { fromKey: string; toKey: string }) | null>(null);
  const [creativeBusy, setCreativeBusy] = useState<string | null>(null);

  const [periodKey, setPeriodKey] = useState("7d");
  const [compareBase, setCompareBase] = useState<CompareBase>("prev");
  // 전년 동기는 선택했을 때만 받는다(카카오는 요청 제한 때문에 조회 1회가 5초씩 늘어남)
  const yearRef = useRef(false);
  yearRef.current = compareBase === "year";
  // 전월 동기도 고를 때만 받는다(카카오 5초·네이버 대기열 1건 절약). 캐시 키에 _nm — 미디어믹스와 같은 키를 쓰므로 섞이지 않게
  const monthRef = useRef(false);
  monthRef.current = compareBase === "month";
  const [highlight, setHighlight] = useState<string | null>(null);
  const [summary, setSummary] = useState<SummaryRes | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [media, setMedia] = useState<MediaStatus[] | null>(null);
  const [mediaLoading, setMediaLoading] = useState(false);

  const [mediaFilter, setMediaFilter] = useState<Record<MediaKey, boolean>>({
    meta: true,
    naver: true,
    gfa: true,
    kakao: true,
    google_ads: true,
  });

  const [reportCount, setReportCount] = useState(0);

  const [naverSummary, setNaverSummary] = useState<NaverSummaryRes | null>(null);
  const [naverLoading, setNaverLoading] = useState(false);
  const [naverError, setNaverError] = useState<string | null>(null);

  const [kakaoSummary, setKakaoSummary] = useState<NaverSummaryRes | null>(null);
  const [kakaoLoading, setKakaoLoading] = useState(false);
  const [kakaoError, setKakaoError] = useState<string | null>(null);

  const [gfaSummary, setGfaSummary] = useState<NaverSummaryRes | null>(null);
  const [gfaLoading, setGfaLoading] = useState(false);
  const [gfaError, setGfaError] = useState<string | null>(null);

  const [gadsSummary, setGadsSummary] = useState<NaverSummaryRes | null>(null);
  const [gadsLoading, setGadsLoading] = useState(false);
  const [gadsError, setGadsError] = useState<string | null>(null);

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
      const withYear = yearRef.current;
      const withMonth = monthRef.current;
      const key = `ctch_dash2_${selected.id}_${since}_${until}${withYear ? "_y" : ""}${withMonth ? "" : "_nm"}`; // v2: addToCart

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
          body: JSON.stringify({ clientId: selected.id, since, until, withYear, withMonth }),
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
      const withYear = yearRef.current;
      const withMonth = monthRef.current;
      const cacheKey = `ctch_naver_summary_${selected.id}_${since}_${until}${withYear ? "_y" : ""}${withMonth ? "" : "_nm"}`;

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
        const res = await fetch(`/api/naver-ad/summary?clientId=${selected.id}&since=${since}&until=${until}${withYear ? "&year=1" : ""}${withMonth ? "" : "&month=0"}`);
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

  // 카카오모먼트 — 네이버와 같은 방식(연동 여부 기준 로드, 5분 캐시, 요청 제한 시 6초 뒤 1회 재시도).
  // 카카오 보고서는 광고계정당 5초에 1회만 허용돼 요약 1회에 10~15초 걸린다.
  const loadKakao = useCallback(
    async (pk: string, force = false, isAutoRetry = false) => {
      if (!selected?.id) {
        setKakaoSummary(null);
        return;
      }
      const p = PERIODS.find((x) => x.key === pk) ?? PERIODS[1];
      const since = p.since();
      const until = p.until();
      const withYear = yearRef.current;
      const withMonth = monthRef.current;
      const cacheKey = `ctch_kakao_summary_${selected.id}_${since}_${until}${withYear ? "_y" : ""}${withMonth ? "" : "_nm"}`;
      if (!force) {
        const cached = getSessionCache<NaverSummaryRes>(cacheKey);
        if (cached) {
          setKakaoSummary(cached);
          setKakaoError(null);
          return;
        }
      }
      setKakaoLoading(true);
      if (!isAutoRetry) setKakaoError(null);
      try {
        const res = await fetch(`/api/kakao-moment/summary?clientId=${selected.id}&since=${since}&until=${until}${withYear ? "&year=1" : ""}${withMonth ? "" : "&month=0"}`);
        const json = await res.json();
        if (!res.ok) {
          if (json.code === "RATE_LIMITED" && !isAutoRetry) {
            setKakaoError(json.error || "잠시 후 다시 시도해주세요.");
            setTimeout(() => loadKakao(pk, force, true), 6000);
            return;
          }
          throw new Error(json.error || "불러오기 실패");
        }
        setKakaoSummary(json);
        setKakaoError(null);
        setSessionCache(cacheKey, json);
      } catch (e) {
        setKakaoError(e instanceof Error ? e.message : "오류가 발생했어요.");
        setKakaoSummary(null);
      } finally {
        setKakaoLoading(false);
      }
    },
    [selected],
  );
  const kakaoConnected = media?.find((m) => m.key === "kakao")?.connected ?? false;

  // GFA — 카카오와 같은 방식(연동 여부 기준 로드, 5분 캐시, 요청 제한 시 5초 뒤 1회 재시도)
  const loadGfa = useCallback(
    async (pk: string, force = false, isAutoRetry = false) => {
      if (!selected?.id) {
        setGfaSummary(null);
        return;
      }
      const p = PERIODS.find((x) => x.key === pk) ?? PERIODS[1];
      const since = p.since();
      const until = p.until();
      const withYear = yearRef.current;
      const withMonth = monthRef.current;
      const cacheKey = `ctch_gfa_summary_${selected.id}_${since}_${until}${withYear ? "_y" : ""}${withMonth ? "" : "_nm"}`;
      if (!force) {
        const cached = getSessionCache<NaverSummaryRes>(cacheKey);
        if (cached) {
          setGfaSummary(cached);
          setGfaError(null);
          return;
        }
      }
      setGfaLoading(true);
      if (!isAutoRetry) setGfaError(null);
      try {
        const res = await fetch(`/api/gfa/summary?clientId=${selected.id}&since=${since}&until=${until}${withYear ? "&year=1" : ""}${withMonth ? "" : "&month=0"}`);
        const json = await res.json();
        if (!res.ok) {
          if (json.code === "RATE_LIMITED" && !isAutoRetry) {
            setGfaError(json.error || "잠시 후 다시 시도해주세요.");
            setTimeout(() => loadGfa(pk, force, true), 5000);
            return;
          }
          throw new Error(json.error || "불러오기 실패");
        }
        setGfaSummary(json);
        setGfaError(null);
        setSessionCache(cacheKey, json);
      } catch (e) {
        setGfaError(e instanceof Error ? e.message : "오류가 발생했어요.");
        setGfaSummary(null);
      } finally {
        setGfaLoading(false);
      }
    },
    [selected],
  );
  const gfaConnected = media?.find((m) => m.key === "gfa")?.connected ?? false;
  useEffect(() => {
    setGfaSummary(null);
    setGfaError(null);
    if (gfaConnected && selected?.id) loadGfa(periodKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gfaConnected, selected?.id]);
  // 구글 Ads — GFA와 같은 방식(Explorer 등급 하루 2,880건이라 세션 캐시 + 서버 캐시 10분)
  const loadGads = useCallback(
    async (pk: string, force = false, isAutoRetry = false) => {
      if (!selected?.id) {
        setGadsSummary(null);
        return;
      }
      const p = PERIODS.find((x) => x.key === pk) ?? PERIODS[1];
      const since = p.since();
      const until = p.until();
      const withYear = yearRef.current;
      const withMonth = monthRef.current;
      const cacheKey = `ctch_gads_summary_${selected.id}_${since}_${until}${withYear ? "_y" : ""}${withMonth ? "" : "_nm"}`;
      if (!force) {
        const cached = getSessionCache<NaverSummaryRes>(cacheKey);
        if (cached) {
          setGadsSummary(cached);
          setGadsError(null);
          return;
        }
      }
      setGadsLoading(true);
      if (!isAutoRetry) setGadsError(null);
      try {
        const res = await fetch(`/api/google-ads/summary?clientId=${selected.id}&since=${since}&until=${until}${withYear ? "&year=1" : ""}${withMonth ? "" : "&month=0"}`);
        const json = await res.json();
        if (!res.ok) {
          if (json.code === "RATE_LIMITED" && !isAutoRetry) {
            setGadsError(json.error || "잠시 후 다시 시도해주세요.");
            setTimeout(() => loadGads(pk, force, true), 5000);
            return;
          }
          throw new Error(json.error || "불러오기 실패");
        }
        setGadsSummary(json);
        setGadsError(null);
        setSessionCache(cacheKey, json);
      } catch (e) {
        setGadsError(e instanceof Error ? e.message : "오류가 발생했어요.");
        setGadsSummary(null);
      } finally {
        setGadsLoading(false);
      }
    },
    [selected],
  );
  const gadsConnected = media?.find((m) => m.key === "google_ads")?.connected ?? false;
  useEffect(() => {
    setGadsSummary(null);
    setGadsError(null);
    if (gadsConnected && selected?.id) loadGads(periodKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gadsConnected, selected?.id]);
  useEffect(() => {
    setKakaoSummary(null);
    setKakaoError(null);
    if (kakaoConnected && selected?.id) loadKakao(periodKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kakaoConnected, selected?.id]);

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
  const mediaReqSeq = useRef(0);
  const loadMediaStatus = useCallback(async () => {
    if (!selected?.id) {
      setMedia(null);
      return;
    }
    const seq = ++mediaReqSeq.current; // 광고주 전환 시 이전 광고주 응답 무시
    setMediaLoading(true);
    try {
      const res = await fetch("/api/media-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: selected.id }),
      });
      const json = await res.json();
      if (seq !== mediaReqSeq.current) return;
      setMedia(res.ok ? (json.media as MediaStatus[]) : null);
    } finally {
      if (seq === mediaReqSeq.current) setMediaLoading(false);
    }
  }, [selected]);

  useEffect(() => {
    loadMediaStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  // 광고주가 바뀌어 연동 상태가 새로 오면 — 연동된 매체는 켜고, 안 된(또는 준비 중인) 매체는 끈다.
  useEffect(() => {
    if (!media) return;
    setMediaFilter((f) => {
      const next = { ...f };
      for (const m of MEDIA_LIST) {
        if (m.key === "meta") continue;
        next[m.key] = !NOT_READY.has(m.key) && !!media.find((s) => s.key === m.key)?.connected;
      }
      return next;
    });
  }, [media]);

  const period = PERIODS.find((x) => x.key === periodKey) ?? PERIODS[1];
  const periodText = periodKey === "1d" ? shortDate(period.since()) : `${shortDate(period.since())} ~ ${shortDate(period.until())}`;
  const compareShort = COMPARE_LABEL[compareBase];
  const compareLabel = `${compareShort} 대비`;
  const anyLoading = loading || naverLoading || kakaoLoading || gfaLoading || gadsLoading;

  // 연동 + 조회 완료된 매체 시리즈(필터 무관) — 매체 색은 MEDIA_COLORS에 고정
  const available = useMemo(() => {
    const list: { key: MediaKey; label: string; res: NaverSummaryRes }[] = [];
    if (summary) list.push({ key: "meta", label: "메타", res: summary });
    if (naverConnected && naverSummary) list.push({ key: "naver", label: "네이버 SA", res: naverSummary });
    if (gfaConnected && gfaSummary) list.push({ key: "gfa", label: "GFA", res: gfaSummary });
    if (kakaoConnected && kakaoSummary) list.push({ key: "kakao", label: "카카오모먼트", res: kakaoSummary });
    if (gadsConnected && gadsSummary) list.push({ key: "google_ads", label: "구글 Ads", res: gadsSummary });
    return list;
  }, [summary, naverConnected, naverSummary, gfaConnected, gfaSummary, kakaoConnected, kakaoSummary, gadsConnected, gadsSummary]);

  const series: MediaSeries[] = useMemo(
    () =>
      available
        .filter((a) => mediaFilter[a.key])
        .map((a) => ({
          key: a.key,
          label: a.label,
          color: MEDIA_COLORS[a.key],
          current: a.res.current,
          previous: (compareBase === "prev" ? a.res.previous : compareBase === "month" ? a.res.lastMonth : a.res.lastYear) ?? null,
          daily: a.res.daily ?? [],
          dailyApprox: a.res.dailyApprox,
        })),
    [available, mediaFilter, compareBase],
  );

  const { rows: effRows, total, totalPrev } = useMemo(() => efficiency(series), [series]);
  const insights = useMemo(() => buildInsights(effRows, total, totalPrev, compareLabel), [effRows, total, totalPrev, compareLabel]);
  const daily = useMemo(() => combinedDaily(series), [series]);
  const hasData = series.length > 0;

  // 표에 "데이터 없음" 사유와 함께 보여줄 매체
  const inactive = MEDIA_LIST.filter((m) => !series.some((s) => s.key === m.key)).map((m) => {
    const st = media?.find((s) => s.key === m.key);
    const isLoading = (m.key === "meta" && loading) || (m.key === "naver" && naverLoading) || (m.key === "gfa" && gfaLoading) || (m.key === "kakao" && kakaoLoading) || (m.key === "google_ads" && gadsLoading);
    const err = m.key === "meta" ? error : m.key === "naver" ? naverError : m.key === "gfa" ? gfaError : m.key === "kakao" ? kakaoError : m.key === "google_ads" ? gadsError : null;
    const note = NOT_READY.has(m.key)
      ? "조회 기능 준비 중"
      : available.some((a) => a.key === m.key)
        ? "필터에서 제외됨"
        : isLoading
          ? m.key === "kakao"
            ? "불러오는 중… (카카오는 10~15초 걸려요)"
            : "불러오는 중…"
          : err
            ? err
            : m.key === "meta"
              ? selected?.meta_account_id
                ? "데이터 없음"
                : "연동 필요 — 광고주 관리에서 메타 광고계정 ID 등록"
              : st && !st.connected
                ? `연동 필요 — ${st.detail}`
                : "데이터 없음";
    return { key: m.key, label: m.label, note };
  });

  // AI 액션 플랜 — 같은 광고주+기간+매체 조합은 30분 캐시. 매체별 비교 기간 수치도 함께 보낸다.
  const loadAiPlan = useCallback(
    async (force = false) => {
      if (!selected?.id) {
        setAiPlan(null);
        return;
      }
      if (series.length === 0) {
        setAiPlan(null);
        setAiError(null);
        return;
      }
      if (aiInFlight.current) return;

      const since = period.since();
      const until = period.until();
      const mediaKeys = series.map((s) => s.key).sort().join(",");
      const cacheKey = `ctch_dash_ai2_${selected.id}_${since}_${until}_${mediaKeys}`;

      if (!force) {
        const cached = getSessionCache<AiPlan>(cacheKey, 30 * 60 * 1000);
        if (cached) {
          setAiPlan(cached);
          setAiError(null);
          return;
        }
      }

      const picked = available.filter((a) => mediaFilter[a.key]);
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
            channels: picked.map((a) => ({ label: a.label, ...a.res.current })),
            channelCompare: picked.map((a) => ({ label: a.label, previous: a.res.previous, ...(a.res.lastMonth ? { lastMonth: a.res.lastMonth } : {}) })),
            combined: sumTotals(picked.map((a) => a.res.current)),
            compare: {
              previous: sumTotals(picked.map((a) => a.res.previous)),
              ...(picked.every((a) => a.res.lastMonth) ? { lastMonth: sumTotals(picked.map((a) => a.res.lastMonth!)) } : {}),
            },
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
    [selected, periodKey, series.map((s) => s.key).join(","), total.cost],
  );

  useEffect(() => {
    if (!selected?.id) {
      setAiPlan(null);
      return;
    }
    if (anyLoading) return;
    loadAiPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, periodKey, anyLoading, media, series.length]);

  // 전년 동기로 바꾸면 전년 수치가 없는 매체만 다시 불러온다(다른 캐시 키)
  useEffect(() => {
    if (!selected?.id) return;
    const lacks = (r: SummaryRes | null) => !!r && (compareBase === "year" ? !r.lastYear : compareBase === "month" ? !r.lastMonth : false);
    if (lacks(summary)) load(periodKey);
    if (lacks(naverSummary)) loadNaver(periodKey);
    if (lacks(kakaoSummary)) loadKakao(periodKey);
    if (lacks(gfaSummary)) loadGfa(periodKey);
    if (lacks(gadsSummary)) loadGads(periodKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareBase]);

  const changePeriod = (k: string) => {
    setPeriodKey(k);
    load(k);
    loadNaver(k);
    loadKakao(k);
    loadGfa(k);
    loadGads(k);
  };
  const refreshAll = () => {
    load(periodKey, true);
    loadNaver(periodKey, true);
    loadKakao(periodKey, true);
    loadGfa(periodKey, true);
    loadGads(periodKey, true);
  };

  // AI 예산 이동 제안 → 매체 키로(라벨 일치). 시리즈에 없는 매체면 버린다.
  const keyOfLabel = (label: string) => series.find((x) => x.label === label || label.includes(x.label) || x.label.includes(label))?.key ?? null;
  const moves = (aiPlan?.budgetMoves ?? [])
    .map((m) => ({ ...m, fromKey: keyOfLabel(m.from) ?? "", toKey: keyOfLabel(m.to) ?? "" }))
    .filter((m) => m.fromKey && m.toKey && m.fromKey !== m.toKey);
  const periodDays = Math.max(1, Math.round((Date.parse(period.until()) - Date.parse(period.since())) / 86400000) + 1);

  // 🎨 숏폼 만들기 — 그 매체의 ROAS 1위 소재(전환 있는 것) 정보를 소재 생성 > 숏폼 폼에 채워 넘긴다(sessionStorage → /ai-agent/creative)
  const toShortform = (mediaKey: string, ad: MetaRow | null, data: MetaHierarchy | null, why?: string) => {
    const s = series.find((x) => x.key === mediaKey);
    const roas = (r: { cost: number; revenue: number }) => (r.cost > 0 ? `${Math.round((r.revenue / r.cost) * 100)}%` : "—");
    const others = (data?.ads ?? []).filter((a) => a.cost > 0 && a.conversions > 0 && a.id !== ad?.id).sort((a, b) => b.revenue / b.cost - a.revenue / a.cost).slice(0, 2);
    const notes = [
      `${s?.label ?? mediaKey} 성과 기반 숏폼 — 기간 ${period.since()} ~ ${period.until()}${why ? ` · ${why}` : ""}`,
      ad ? `성과 1위 소재: "${ad.name}" (광고비 ₩${Math.round(ad.cost).toLocaleString("ko-KR")}, 전환 ${ad.conversions.toFixed(0)}, ROAS ${roas(ad)})${ad.campaignName ? ` · 캠페인 ${ad.campaignName}` : ""}` : "",
      others.length ? `참고 소재: ${others.map((o) => `"${o.name}" ROAS ${roas(o)}`).join(", ")}` : "",
      "소재 이름에서 드러나는 훅·모델·콘텐츠 유형을 살려 같은 구도로 기획해 주세요.",
    ].filter(Boolean);
    try {
      sessionStorage.setItem("ctch_shortform_prefill", JSON.stringify({ title: `${selected?.name ?? ""} ${s?.label ?? ""} 성과 소재 재해석`.trim(), brief: { brand: selected?.name ?? "", notes: notes.join("\n") } }));
    } catch {
      /* 무시 */
    }
    router.push("/ai-agent/creative");
  };
  const onCreative = async (it: Insight) => {
    if (!selected?.id || !it.mediaKey) return;
    setCreativeBusy(it.id);
    try {
      const data = await fetchChannelInsights(it.mediaKey, selected.id, period.since(), period.until());
      const best = [...(data.ads ?? [])].filter((a) => a.cost > 0 && a.conversions > 0).sort((a, b) => b.revenue / b.cost - a.revenue / a.cost)[0] ?? null;
      toShortform(it.mediaKey, best, data, it.title);
    } catch {
      toShortform(it.mediaKey, null, null, it.title); // 소재 조회가 안 돼도 매체 성과만으로 넘긴다
    } finally {
      setCreativeBusy(null);
    }
  };

  const connectedOk = media ? media.filter((m) => m.status === "ok").length : 0;
  const problems = media?.filter((m) => m.status === "expired" || m.status === "error") ?? [];

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6">
      {/* 헤더 — 광고주·기간·새로고침 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[15px] text-ink-muted">
            {new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" })}
          </p>
          <h2 className="mt-1 text-[26px] font-bold tracking-tight text-[#1A1A1A]">
            {selected ? `${selected.name} 성과` : "광고주를 선택해 주세요"}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] tabular-nums text-ink-muted">{periodText}</span>
          <Segmented value={periodKey} options={PERIODS.map((p) => ({ key: p.key, label: p.label }))} onChange={changePeriod} />
          <button
            type="button"
            onClick={refreshAll}
            disabled={anyLoading}
            title="새로 불러오기"
            className="flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-line bg-surface text-ink-soft transition hover:border-signal hover:text-signal disabled:opacity-50"
          >
            <i className={`ti ${anyLoading ? "ti-loader-2 animate-spin" : "ti-refresh"} text-[15px]`} aria-hidden />
            <span className="sr-only">새로고침</span>
          </button>
        </div>
      </div>

      {/* 필터 한 줄 — 아래 모든 카드에 같이 적용 */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-line bg-surface px-5 py-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {MEDIA_LIST.map((m) => {
            const notReady = NOT_READY.has(m.key);
            const needsSetup = notReady || (m.key !== "meta" && !!selected && !!media && !media.find((s) => s.key === m.key)?.connected);
            const on = mediaFilter[m.key] && !needsSetup;
            return (
              <MediaChip
                key={m.key}
                label={m.label}
                color={MEDIA_COLORS[m.key]}
                on={on}
                disabled={needsSetup}
                note={needsSetup ? (notReady ? "준비 중" : "연동 필요") : undefined}
                title={notReady ? "조회 기능 준비 중" : needsSetup ? "광고주 관리에서 연동이 필요해요" : undefined}
                onClick={() => setMediaFilter((f) => ({ ...f, [m.key]: !f[m.key] }))}
              />
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[15px] text-ink-muted">비교 기준</span>
          <Segmented
            value={compareBase}
            options={(["prev", "month", "year"] as CompareBase[]).map((k) => ({ key: k, label: COMPARE_LABEL[k] }))}
            onChange={setCompareBase}
          />
        </div>
      </div>

      {problems.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2.5 text-[13px] text-bad">
          <i className="ti ti-plug-connected-x text-[15px]" aria-hidden />
          연동 문제: {problems.map((p) => p.label).join(", ")} —
          <Link href="/clients" className="underline underline-offset-2">
            광고주 관리에서 확인
          </Link>
        </p>
      )}

      {!selected ? (
        <div className="rounded-card border border-line bg-surface py-16 text-center text-[15px] text-ink-muted">광고주를 선택하면 매체별 성과가 표시돼요.</div>
      ) : (
        <>
          <KpiStrip total={hasData ? total : null} totalPrev={hasData ? totalPrev : null} daily={daily} compareLabel={compareShort} loading={anyLoading} />

          {/* AI 액션 플랜 — 최상단(KPI 바로 아래) */}
          <Card
            title="AI 액션 플랜"
            sub={`매체별 수치와 ${compareLabel} 변화로 정리한 이번 주 할 일`}
            right={
              <button
                type="button"
                onClick={() => loadAiPlan(true)}
                disabled={aiLoading || !hasData}
                className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[14px] text-ink-soft transition hover:border-signal hover:text-signal disabled:opacity-50"
              >
                <i className={`ti ${aiLoading ? "ti-loader-2 animate-spin" : "ti-sparkles"} text-[15px]`} aria-hidden />
                다시 분석
              </button>
            }
          >
            {!hasData ? (
              <p className="py-6 text-center text-[15px] text-ink-muted">{anyLoading ? "매체 데이터를 불러오는 중…" : "분석할 매체 데이터가 없어요."}</p>
            ) : aiError ? (
              <p className="rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2.5 text-[15px] text-bad">{aiError}</p>
            ) : aiLoading && !aiPlan ? (
              <p className="py-6 text-center text-[15px] text-ink-muted">AI가 분석 중이에요…</p>
            ) : aiPlan ? (
              <AiPlanView plan={aiPlan} moves={moves} onRebalance={selected?.id ? setRebalance : undefined} />
            ) : (
              <p className="py-6 text-center text-[15px] text-ink-muted">데이터가 모이면 자동으로 분석해요.</p>
            )}
          </Card>

          <Card
            title="매체별 효율"
            sub={`${periodText} · 증감은 ${compareLabel} · 열 제목을 누르면 정렬 · 행을 누르면 캠페인·소재 상세`}
            right={hasData ? <span className="text-[12px] text-ink-muted">{series.length}개 매체 합산 · 매체별 전환 기준이 달라 합계 매출은 중복될 수 있어요</span> : null}
          >
            {hasData ? (
              <MediaEfficiencyTable
                rows={effRows}
                total={total}
                totalPrev={totalPrev}
                inactive={inactive}
                highlight={highlight}
                onHighlight={setHighlight}
                renderDetail={
                  selected?.id
                    ? (key) => (
                        <MediaDrilldown
                          channel={key}
                          label={series.find((x) => x.key === key)?.label ?? key}
                          clientId={selected.id}
                          since={period.since()}
                          until={period.until()}
                          onShortform={(ad, data) => toShortform(key, ad, data)}
                        />
                      )
                    : undefined
                }
              />
            ) : (
              <p className="py-10 text-center text-[15px] text-ink-muted">{anyLoading ? "매체 데이터를 불러오는 중…" : "표시할 매체 데이터가 없어요. 매체 필터와 연동 상태를 확인해 주세요."}</p>
            )}
          </Card>

          <Card title="추이 × 예산 비중" sub={series.some((s) => s.dailyApprox) ? "네이버 SA 일별 값은 상위 캠페인 기준 근사치예요 · 날짜를 누르면 그날의 예산 비중과 매출 기여" : "날짜를 누르면 그날의 예산 비중과 매출 기여를 보여줘요"}>
            {hasData ? <TrendShareCard series={series} rows={effRows} highlight={highlight} onHighlight={setHighlight} /> : <p className="py-8 text-center text-[15px] text-ink-muted">{anyLoading ? "불러오는 중…" : "표시할 데이터가 없어요."}</p>}
          </Card>

          <Card title="AI 인사이트 보드" sub={`데이터에서 확인된 신호와 해야 할 일 · ${compareLabel}`}>
            <InsightPanel insights={insights} colors={MEDIA_COLORS} onHighlight={setHighlight} columns onCreative={onCreative} creativeBusy={creativeBusy} />
          </Card>

          {/* 연동 상태 · 바로가기 */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3 text-[13px]">
            <details className="group min-w-0 flex-1">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-ink-soft">
                <i className="ti ti-plug-connected text-[15px]" aria-hidden />
                연동 상태 {mediaLoading ? "확인 중…" : media ? `${connectedOk}/${media.length} 정상` : "—"}
                <i className="ti ti-chevron-down text-[13px] transition group-open:rotate-180" aria-hidden />
              </summary>
              {media && (
                <ul className="mt-2.5 space-y-1.5">
                  {media.map((m) => (
                    <li key={m.key} className="flex items-start gap-2">
                      <i
                        className={`ti mt-[1px] text-[15px] ${
                          m.status === "ok" ? "ti-circle-check text-good" : m.status === "none" ? "ti-circle-dashed text-ink-faint" : "ti-alert-circle text-bad"
                        }`}
                        aria-hidden
                      />
                      <span className="w-20 flex-shrink-0 font-medium text-ink">{m.label}</span>
                      <span className="text-ink-muted">{m.detail}</span>
                    </li>
                  ))}
                </ul>
              )}
            </details>
            <div className="flex items-center gap-3 text-ink-muted">
              <Link href="/report-analysis" className="hover:text-signal">
                저장된 리포트 {reportCount}
              </Link>
              <span className="text-line">|</span>
              <Link href="/clients" className="hover:text-signal">
                광고주 관리 →
              </Link>
            </div>
          </div>
        </>
      )}

      {rebalance && selected?.id && (
        <RebalanceDialog
          clientId={selected.id}
          clientName={selected.name}
          media={series.map((x) => ({ key: x.key, label: x.label, color: x.color, cost: x.current.cost }))}
          days={periodDays}
          fromKey={rebalance.fromKey}
          toKey={rebalance.toKey}
          percent={rebalance.percent}
          reason={rebalance.reason}
          onClose={() => setRebalance(null)}
        />
      )}
    </div>
  );
}
