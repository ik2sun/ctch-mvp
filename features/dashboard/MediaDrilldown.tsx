"use client";

// 매체 효율 표 드릴다운 — 행을 펼치면 그 매체의 캠페인·소재(광고) 상위 10개를 보여준다.
// 데이터는 실시간 리포트와 같은 insights API(MetaHierarchy 모양), 세션 캐시 키도 실시간 리포트와 공유(메타는 별도 키).
import { useEffect, useState } from "react";
import Link from "next/link";
import type { MetaHierarchy, MetaRow } from "@/features/ai-report/metaTypes";
import { getSessionCache, setSessionCache } from "./sessionCache";

const won = (v: number) => `₩${Math.round(v).toLocaleString("ko-KR")}`;

export async function fetchChannelInsights(channel: string, clientId: string, since: string, until: string): Promise<MetaHierarchy> {
  const key = channel === "meta" ? `ctch_dash_meta_insights_${clientId}_${since}_${until}` : `ctch_${channel}_insights_${clientId}_${since}_${until}`;
  const cached = getSessionCache<MetaHierarchy>(key);
  if (cached) return cached;
  let res: Response;
  if (channel === "meta") {
    res = await fetch("/api/meta-insights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ since, until, clientId }) });
  } else {
    const ep = channel === "naver" ? "/api/naver-ad/insights" : channel === "gfa" ? "/api/gfa/insights" : channel === "kakao" ? "/api/kakao-moment/insights" : "/api/google-ads/insights";
    res = await fetch(`${ep}?clientId=${clientId}&since=${since}&until=${until}`);
  }
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "불러오지 못했어요.");
  setSessionCache(key, json);
  return json as MetaHierarchy;
}

function RowsTable({ rows, showParent }: { rows: MetaRow[]; showParent: boolean }) {
  const top = [...rows].sort((a, b) => b.cost - a.cost).slice(0, 10);
  if (!top.length) return <p className="py-4 text-center text-[14px] text-ink-muted">데이터가 없어요.</p>;
  const roasAll = rows.reduce((s, r) => s + r.revenue, 0) / Math.max(1, rows.reduce((s, r) => s + r.cost, 0));
  return (
    <table className="w-full text-[14px] tabular-nums">
      <thead>
        <tr className="border-b border-line text-left text-[12px] text-ink-muted">
          <th className="py-2 pr-3 font-medium">이름</th>
          <th className="px-2 py-2 text-right font-medium">광고비</th>
          <th className="px-2 py-2 text-right font-medium">클릭</th>
          <th className="px-2 py-2 text-right font-medium">전환</th>
          <th className="px-2 py-2 text-right font-medium">CPA</th>
          <th className="py-2 pl-2 text-right font-medium">ROAS</th>
        </tr>
      </thead>
      <tbody>
        {top.map((r) => {
          const roas = r.cost > 0 ? r.revenue / r.cost : null;
          const tone = roas == null || !roasAll ? "" : roas >= roasAll * 1.2 ? "text-good" : roas <= roasAll * 0.8 ? "text-bad" : "";
          return (
            <tr key={r.id} className="border-b border-line/60 last:border-0">
              <td className="max-w-[420px] py-2 pr-3">
                <p className="truncate text-ink" title={r.name}>{r.name}</p>
                {showParent && r.campaignName && <p className="truncate text-[12px] text-ink-muted">{r.campaignName}</p>}
              </td>
              <td className="px-2 py-2 text-right text-ink">{won(r.cost)}</td>
              <td className="px-2 py-2 text-right text-ink-soft">{Math.round(r.clicks).toLocaleString("ko-KR")}</td>
              <td className="px-2 py-2 text-right text-ink-soft">{r.conversions ? r.conversions.toFixed(r.conversions % 1 ? 1 : 0) : "—"}</td>
              <td className="px-2 py-2 text-right text-ink-soft">{r.conversions ? won(r.cost / r.conversions) : "—"}</td>
              <td className={`py-2 pl-2 text-right font-semibold ${tone || "text-ink"}`}>{roas != null ? `${Math.round(roas * 100)}%` : "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function MediaDrilldown({ channel, label, clientId, since, until, onShortform }: { channel: string; label: string; clientId: string; since: string; until: string; onShortform?: (topAd: MetaRow | null, data: MetaHierarchy) => void }) {
  const [data, setData] = useState<MetaHierarchy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"campaigns" | "ads">("campaigns");

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    fetchChannelInsights(channel, clientId, since, until)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "불러오지 못했어요."));
    return () => {
      alive = false;
    };
  }, [channel, clientId, since, until]);

  if (error) return <p className="text-[14px] text-bad">{label} 상세를 불러오지 못했어요 — {error}</p>;
  if (!data) return <p className="py-3 text-center text-[14px] text-ink-muted">{label} 캠페인·소재를 불러오는 중…{channel === "kakao" ? " (카카오는 10~15초)" : ""}</p>;
  const ads = data.ads ?? [];
  const bestAd = [...ads].filter((a) => a.cost > 0 && a.conversions > 0).sort((a, b) => b.revenue / b.cost - a.revenue / a.cost)[0] ?? null;

  return (
    <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-line bg-surface p-0.5">
          {(["campaigns", "ads"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} className={`rounded-md px-3 py-1 text-[13px] ${tab === t ? "bg-canvas font-medium text-ink" : "text-ink-muted hover:text-ink"}`}>
              {t === "campaigns" ? `캠페인 ${data.campaigns.length}` : `소재 ${ads.length}`}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-[13px]">
          {onShortform && bestAd && (
            <button type="button" onClick={() => onShortform(bestAd, data)} className="rounded-full border border-line bg-surface px-3 py-1 text-ink-soft hover:border-signal hover:text-signal">
              🎨 ROAS 1위 소재로 숏폼 만들기
            </button>
          )}
          <Link href="/ai-report" className="text-signal hover:underline">
            실시간 리포트에서 전체 보기 →
          </Link>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface px-3">
        <RowsTable rows={tab === "campaigns" ? data.campaigns : ads} showParent={tab === "ads"} />
      </div>
      <p className="text-[12px] text-ink-muted">광고비 상위 10개 · ROAS 색은 이 매체 평균 대비 ±20%{data.scopeNote ? ` · ${data.scopeNote}` : ""}</p>
    </div>
  );
}
