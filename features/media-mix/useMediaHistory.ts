"use client";

// 미디어믹스 학습 데이터 — 대시보드와 같은 요약 API(메타·네이버 SA·GFA·카카오)를 학습 기간으로 불러온다.
// 같은 광고주+기간은 대시보드와 같은 세션 캐시 키를 써서 화면을 오가도 다시 호출하지 않는다.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DailyPoint, Totals } from "@/features/ai-report/metaTypes";
import { getSessionCache, setSessionCache } from "@/features/dashboard/sessionCache";
import { MEDIA_COLORS } from "@/features/dashboard/analysis";
import type { MediaInput } from "./model";

export const MIX_MEDIA = [
  { key: "meta", label: "메타", cachePrefix: "ctch_dash", url: () => "/api/meta-summary" },
  { key: "naver", label: "네이버 SA", cachePrefix: "ctch_naver_summary", url: (id: string, s: string, u: string) => `/api/naver-ad/summary?clientId=${id}&since=${s}&until=${u}` },
  { key: "gfa", label: "GFA", cachePrefix: "ctch_gfa_summary", url: (id: string, s: string, u: string) => `/api/gfa/summary?clientId=${id}&since=${s}&until=${u}` },
  { key: "kakao", label: "카카오모먼트", cachePrefix: "ctch_kakao_summary", url: (id: string, s: string, u: string) => `/api/kakao-moment/summary?clientId=${id}&since=${s}&until=${u}` },
] as const;
export type MixMediaKey = (typeof MIX_MEDIA)[number]["key"];

type SummaryRes = { current: Totals; daily: DailyPoint[]; dailyApprox?: boolean; error?: string; code?: string };

export type MediaLoadState = { status: "idle" | "loading" | "ok" | "error" | "skip"; note?: string };

type MediaStatus = { key: string; label: string; connected: boolean; status: string; detail: string };

export function useMediaHistory(clientId: string | null | undefined, since: string, until: string) {
  const [connected, setConnected] = useState<Record<string, MediaStatus> | null>(null);
  const [data, setData] = useState<Record<string, SummaryRes>>({});
  const [state, setState] = useState<Record<string, MediaLoadState>>({});
  const seq = useRef(0);

  // 연동 상태 — 연동 안 된 매체는 부르지 않는다
  useEffect(() => {
    setConnected(null);
    setData({});
    setState({});
    if (!clientId) return;
    const my = ++seq.current;
    (async () => {
      try {
        const res = await fetch("/api/media-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId }),
        });
        const json = await res.json();
        if (my !== seq.current) return;
        const map: Record<string, MediaStatus> = {};
        for (const m of (json.media ?? []) as MediaStatus[]) map[m.key] = m;
        setConnected(map);
      } catch {
        if (my === seq.current) setConnected({});
      }
    })();
  }, [clientId]);

  const loadOne = useCallback(
    async (key: MixMediaKey, force: boolean, my: number) => {
      if (!clientId) return;
      const def = MIX_MEDIA.find((m) => m.key === key)!;
      const cacheKey = `${def.cachePrefix}_${clientId}_${since}_${until}`;
      if (!force) {
        const cached = getSessionCache<SummaryRes>(cacheKey);
        if (cached) {
          setData((d) => ({ ...d, [key]: cached }));
          setState((s) => ({ ...s, [key]: { status: "ok" } }));
          return;
        }
      }
      setState((s) => ({ ...s, [key]: { status: "loading", note: key === "kakao" ? "카카오는 기간이 길면 30초 이상 걸려요" : undefined } }));
      const call = async () => {
        const url = def.url(clientId, since, until);
        const res =
          key === "meta"
            ? await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, since, until }) })
            : await fetch(url);
        const json = (await res.json().catch(() => ({}))) as SummaryRes;
        return { ok: res.ok, json };
      };
      try {
        let r = await call();
        if (!r.ok && r.json.code === "RATE_LIMITED") {
          await new Promise((ok) => setTimeout(ok, 6000));
          r = await call();
        }
        if (my !== seq.current) return;
        if (!r.ok) throw new Error(r.json.error || "불러오기 실패");
        setData((d) => ({ ...d, [key]: r.json }));
        setState((s) => ({ ...s, [key]: { status: "ok" } }));
        setSessionCache(cacheKey, r.json);
      } catch (e) {
        if (my !== seq.current) return;
        setState((s) => ({ ...s, [key]: { status: "error", note: e instanceof Error ? e.message : "오류" } }));
      }
    },
    [clientId, since, until],
  );

  const loadAll = useCallback(
    (force = false) => {
      if (!clientId || !connected) return;
      const my = ++seq.current;
      setData({});
      for (const m of MIX_MEDIA) {
        const st = connected[m.key];
        if (!st?.connected) {
          setState((s) => ({ ...s, [m.key]: { status: "skip", note: st ? `연동 필요 — ${st.detail}` : "연동 필요" } }));
          continue;
        }
        loadOne(m.key, force, my);
      }
    },
    [clientId, connected, loadOne],
  );

  useEffect(() => {
    loadAll(false);
  }, [loadAll]);

  const days = Math.max(1, Math.round((new Date(until).getTime() - new Date(since).getTime()) / 86400000) + 1);
  const inputs: MediaInput[] = useMemo(
    () =>
      MIX_MEDIA.filter((m) => data[m.key]?.current).map((m) => ({
        key: m.key,
        label: m.label,
        color: MEDIA_COLORS[m.key],
        totals: data[m.key].current,
        daily: data[m.key].daily ?? [],
        days,
        dailyApprox: data[m.key].dailyApprox,
      })),
    [data, days],
  );

  const loading = connected == null || Object.values(state).some((s) => s.status === "loading");
  return { inputs, state, loading, reload: () => loadAll(true), statusReady: connected != null };
}
