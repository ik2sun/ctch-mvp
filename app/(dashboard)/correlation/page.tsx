"use client";

// 상관관계 분석 — 영상·도달·트래픽·참여 캠페인이 성과 캠페인·검색 수요에 준 영향(시차 상관·기여도)
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useClients } from "@/features/clients/ClientContext";
import { Segmented } from "@/features/dashboard/ui";
import { getSessionCache, setSessionCache } from "@/features/dashboard/sessionCache";
import { CorrelationView } from "@/features/correlation/CorrelationView";
import type { CorrDataRes } from "@/features/correlation/types";

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const PERIODS = [
  { key: "60", label: "60일", days: 60 },
  { key: "90", label: "90일", days: 90 },
  { key: "120", label: "120일", days: 120 },
];

export default function CorrelationPage() {
  const { selected } = useClients();
  const [periodKey, setPeriodKey] = useState("90");
  const days = PERIODS.find((p) => p.key === periodKey)?.days ?? 90;
  const since = daysAgo(days);
  const until = daysAgo(1);

  const [data, setData] = useState<CorrDataRes | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(
    async (force = false) => {
      if (!selected?.id) return;
      const key = `ctch_corr_${selected.id}_${since}_${until}`;
      if (!force) {
        const cached = getSessionCache<CorrDataRes>(key, 30 * 60 * 1000);
        if (cached) {
          setData(cached);
          setError(null);
          return;
        }
      }
      const my = ++seq.current;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/correlation/data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: selected.id, since, until }),
        });
        const json = await res.json().catch(() => ({ error: "서버 응답을 읽지 못했어요. 로그인이 만료됐다면 새로고침해 주세요." }));
        if (my !== seq.current) return;
        if (!res.ok) throw new Error(json.error || "불러오기 실패");
        setData(json);
        setSessionCache(key, json);
      } catch (e) {
        if (my === seq.current) {
          setError(e instanceof Error ? e.message : "오류가 발생했어요.");
          setData(null);
        }
      } finally {
        if (my === seq.current) setLoading(false);
      }
    },
    [selected?.id, since, until],
  );

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const failed = data?.media.filter((m) => m.error) ?? [];

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[13px] text-ink-muted">Cross-funnel Correlation</p>
          <h2 className="mt-0.5 text-[22px] font-semibold tracking-tight text-ink">{selected ? `${selected.name} 상관관계 분석` : "광고주를 선택해 주세요"}</h2>
          <p className="mt-1 text-[13px] text-ink-muted">영상·도달·트래픽 캠페인이 며칠 뒤 전환·매출·검색 수요를 얼마나 움직였는지 봐요</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[13px] tabular-nums text-ink-muted">
            {since} ~ {until}
          </span>
          <Segmented value={periodKey} options={PERIODS.map((p) => ({ key: p.key, label: p.label }))} onChange={setPeriodKey} />
          <button
            type="button"
            onClick={() => load(true)}
            disabled={loading || !selected}
            title="새로 불러오기"
            className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-line bg-surface text-ink-soft hover:border-signal hover:text-signal disabled:opacity-50"
          >
            <i className={`ti ${loading ? "ti-loader-2 animate-spin" : "ti-refresh"} text-[15px]`} aria-hidden />
            <span className="sr-only">새로고침</span>
          </button>
        </div>
      </div>

      {data && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px]">
          {data.media.map((m) => (
            <span key={m.key} className="flex items-center gap-1" title={m.error ?? m.note}>
              <i className={`ti text-[15px] ${m.ok ? "ti-circle-check text-good" : m.error ? "ti-alert-circle text-bad" : "ti-circle-dashed text-ink-muted"}`} aria-hidden />
              <span className="text-ink-soft">{m.label}</span>
              <span className="text-ink-muted">{m.ok ? `캠페인 ${m.campaigns}개${m.note ? ` · ${m.note}` : ""}` : m.error ? "조회 실패" : m.note}</span>
            </span>
          ))}
        </div>
      )}
      {failed.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2.5 text-[13px] text-bad">
          <i className="ti ti-plug-connected-x text-[15px]" aria-hidden />
          {failed.map((m) => `${m.label}: ${m.error}`).join(" · ")} — 이 매체는 빼고 분석했어요.
          <Link href="/clients" className="underline underline-offset-2">
            광고주 관리
          </Link>
        </p>
      )}

      {!selected ? (
        <div className="rounded-card border border-line bg-surface py-16 text-center text-[15px] text-ink-muted">광고주를 선택하면 연동된 매체의 캠페인으로 분석해요.</div>
      ) : error ? (
        <div className="rounded-card border border-bad/20 bg-bad/5 py-10 text-center text-[15px] text-bad">{error}</div>
      ) : !data ? (
        <div className="rounded-card border border-line bg-surface py-16 text-center text-[15px] text-ink-muted">
          {loading ? `매체별 캠페인 일별 데이터를 모으는 중… (${days}일, 카카오·네이버가 있으면 30초 이상 걸릴 수 있어요)` : "데이터가 없어요."}
        </div>
      ) : data.campaigns.length === 0 ? (
        <div className="rounded-card border border-line bg-surface py-16 text-center text-[15px] text-ink-muted">이 기간에 집행한 캠페인이 없어요.</div>
      ) : (
        <CorrelationView data={data} clientId={selected.id} />
      )}
    </div>
  );
}
