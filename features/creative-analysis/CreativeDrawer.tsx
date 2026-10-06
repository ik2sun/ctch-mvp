"use client";

// 소재 상세 — 원본 에셋(다이내믹은 전체 이미지), 소재명 해석, 지표(그룹 평균 대비), 실제 타겟·캠페인 세팅, 문구, 같은 테마 소재
import { useEffect, useState } from "react";
import { fmt } from "@/features/ai-report/calcMetrics";
import { GRADE_META, OPT_LABEL, type Enriched } from "./analyze";
import { GradeBadge, Thumb } from "./CreativeGallery";
import type { CreativeAsset } from "./types";

const assetCache = new Map<string, CreativeAsset[]>();

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  if (value == null || value === "" || (Array.isArray(value) && !value.length)) return null;
  return (
    <>
      <dt className="text-ink-muted">{label}</dt>
      <dd className={`min-w-0 break-words text-ink ${mono ? "font-mono text-[12px]" : ""}`}>{value}</dd>
    </>
  );
}

function Compare({ label, value, avg, kind, higherBetter = true }: { label: string; value: number | null; avg: number | null; kind: "x" | "pct" | "won"; higherBetter?: boolean }) {
  const ratio = value != null && avg ? value / avg : null;
  const good = ratio == null ? null : higherBetter ? ratio >= 1.1 : ratio <= 0.9;
  const bad = ratio == null ? null : higherBetter ? ratio <= 0.9 : ratio >= 1.1;
  return (
    <div className="rounded-lg bg-canvas px-3 py-2">
      <p className="text-[12px] text-ink-muted">{label}</p>
      <p className="text-[16px] font-semibold tabular-nums text-ink">{fmt(value, kind)}</p>
      <p className={`text-[12px] tabular-nums ${good ? "text-good" : bad ? "text-bad" : "text-ink-faint"}`}>
        평균 {fmt(avg, kind)}
        {ratio != null && ` · ${ratio >= 1 ? "+" : "−"}${Math.abs((ratio - 1) * 100).toFixed(0)}%`}
      </p>
    </div>
  );
}

export function CreativeDrawer({
  row,
  clientId,
  assetUrl = "/api/creative-analysis/meta/asset",
  avg,
  peers,
  onClose,
  onOpen,
}: {
  row: Enriched;
  clientId: string;
  assetUrl?: string;
  avg: { roas: number | null; cpa: number | null; ctr: number | null; cvr: number | null; cpm: number | null; hookRate: number | null };
  peers: Enriched[];
  onClose: () => void;
  onOpen: (r: Enriched) => void;
}) {
  const [assets, setAssets] = useState<CreativeAsset[] | null>(assetCache.get(row.id) ?? null);
  const [active, setActive] = useState(0);
  const [assetErr, setAssetErr] = useState<string | null>(null);
  const [showBody, setShowBody] = useState(false);

  useEffect(() => {
    setActive(0);
    setShowBody(false);
    const hit = assetCache.get(row.id);
    if (hit) {
      setAssets(hit);
      return;
    }
    setAssets(null);
    setAssetErr(null);
    let alive = true;
    fetch(`${assetUrl}?clientId=${clientId}&adId=${row.id}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "원본 조회 실패");
        assetCache.set(row.id, j.assets);
        if (alive) setAssets(j.assets);
      })
      .catch((e) => alive && setAssetErr(e instanceof Error ? e.message : "원본 조회 실패"));
    return () => {
      alive = false;
    };
  }, [row.id, clientId, assetUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const p = row.parsed;
  const cur = assets?.[active];
  const sales = row.group === "sales";
  const s = row.adset;
  const t = row.target;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/30" onClick={onClose} role="dialog" aria-modal="true" aria-label="소재 상세">
      <div className="flex h-full w-full max-w-[640px] flex-col overflow-y-auto bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface/95 px-5 py-3 backdrop-blur">
          <GradeBadge grade={row.grade} />
          <p className="min-w-0 flex-1 truncate font-mono text-[13px] text-ink" title={row.name}>
            {row.name}
          </p>
          {row.previewUrl && (
            <a href={row.previewUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-[13px] text-ink-soft hover:border-signal hover:text-signal">
              <i className="ti ti-external-link text-[15px]" aria-hidden />
              메타 미리보기
            </a>
          )}
          {row.landingUrl && (
            <a href={row.landingUrl} target="_blank" rel="noreferrer noopener" title={row.landingUrl} className="flex items-center gap-1 whitespace-nowrap rounded-lg border border-line px-2.5 py-1 text-[13px] text-ink-soft hover:border-signal hover:text-signal">
              <i className="ti ti-world text-[15px]" aria-hidden />
              랜딩 열기
            </a>
          )}
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-canvas" aria-label="닫기">
            <i className="ti ti-x text-[17px]" aria-hidden />
          </button>
        </div>

        <div className="space-y-5 p-5">
          {/* 에셋 */}
          <div>
            <div className="relative flex items-center justify-center overflow-hidden rounded-card bg-canvas" style={{ minHeight: 280 }}>
              {cur ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cur.url} alt={row.name} referrerPolicy="no-referrer" className="max-h-[520px] w-auto object-contain" />
              ) : (
                <Thumb row={row} fit="contain" className="max-h-[520px] w-full" />
              )}
              {cur?.kind === "video" && (
                <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-ink/70 px-2 py-0.5 text-[12px] text-white">
                  <i className="ti ti-player-play text-[13px]" aria-hidden />
                  영상{cur.lengthSec ? ` ${Math.round(cur.lengthSec)}초` : ""}
                </span>
              )}
              {cur?.width && (
                <span className="absolute bottom-3 right-3 rounded bg-ink/60 px-1.5 py-0.5 text-[12px] tabular-nums text-white">
                  {cur.width}×{cur.height}
                </span>
              )}
            </div>
            {assets == null && !assetErr && <p className="mt-2 text-[12px] text-ink-muted">원본 이미지 불러오는 중…</p>}
            {assetErr && <p className="mt-2 text-[12px] text-ink-muted">원본을 못 불러와 썸네일을 보여 드려요 ({assetErr})</p>}
            {assets && assets.length > 1 && (
              <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
                {assets.map((a, i) => (
                  <button
                    key={a.url}
                    type="button"
                    onClick={() => setActive(i)}
                    className={`relative h-16 w-16 flex-shrink-0 overflow-hidden rounded border-2 ${i === active ? "border-signal" : "border-transparent"}`}
                    aria-label={`에셋 ${i + 1}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.url} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" loading="lazy" />
                    {a.kind === "video" && <i className="ti ti-player-play absolute bottom-0.5 right-0.5 text-[12px] text-white drop-shadow" aria-hidden />}
                  </button>
                ))}
              </div>
            )}
            {assets && assets.length > 1 && <p className="mt-1 text-[12px] text-ink-muted">다이내믹 소재 — 에셋 {assets.length}개를 메타가 조합해 노출해요. 성과는 에셋 합산이에요.</p>}
          </div>

          {/* 지표 */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {sales ? (
              <>
                <Compare label="ROAS" value={row.roas} avg={avg.roas} kind="x" />
                <Compare label="CPA" value={row.cpa} avg={avg.cpa} kind="won" higherBetter={false} />
                <Compare label="CTR(링크)" value={row.ctr} avg={avg.ctr} kind="pct" />
                <Compare label="CVR" value={row.cvr} avg={avg.cvr} kind="pct" />
              </>
            ) : (
              <>
                <Compare label="CTR(링크)" value={row.ctr} avg={avg.ctr} kind="pct" />
                <Compare label="CPM" value={row.cpm} avg={avg.cpm} kind="won" higherBetter={false} />
                <Compare label="3초 조회율" value={row.hookRate} avg={avg.hookRate} kind="pct" />
                <Compare label="ThruPlay/3초" value={row.holdRate} avg={null} kind="pct" />
              </>
            )}
          </div>
          <p className="-mt-3 text-[12px] tabular-nums text-ink-muted">
            광고비 {fmt(row.cost, "won")} · 노출 {fmt(row.impressions, "int")} · 빈도 {row.frequency.toFixed(2)} · 링크 클릭 {fmt(row.linkClicks, "int")} · 구매 {fmt(row.conversions, "int")} · 매출 {fmt(row.revenue, "won")}
            {row.hookRate != null && sales && ` · 3초 조회율 ${fmt(row.hookRate, "pct")}`}
            {!row.judged && " · 노출이 적어 판단 보류"}
          </p>

          {/* 소재명 해석 */}
          <section>
            <h4 className="mb-2 text-[15px] font-semibold text-ink">소재명 해석</h4>
            <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-1.5 rounded-lg border border-line px-3.5 py-3 text-[13px]">
              <Row label="제작일" value={p.launchDate ? `${p.launchDate}${row.ageDays != null ? ` (집행 ${row.ageDays}일째)` : ""}` : null} />
              {p.ruleSet && <Row label="적용 규칙" value={`${p.ruleSet} 세트${p.outOfRule ? " · 규칙 밖 이름" : ""}`} />}
              {(p.fields ?? []).filter((f) => f.kind === "text").map((f) => (
                <Row key={f.name} label={f.name} value={f.values.join(", ") || null} />
              ))}
              {!p.ruleSet && <Row label="세부 콘텐츠" value={p.detail} />}
              <Row label="소재 번호" value={p.serial} />
              <Row label="해석 못한 조각" value={(p.ruleSet ? p.unknown : p.unknown.filter((u) => !/^[a-z][a-z0-9.]*$/.test(u))).join(", ") || null} mono />
            </dl>
          </section>

          {/* 타겟·캠페인 세팅 */}
          <section>
            <h4 className="mb-2 text-[15px] font-semibold text-ink">타겟·세팅</h4>
            <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-1.5 rounded-lg border border-line px-3.5 py-3 text-[13px]">
              <Row label="캠페인" value={`${row.campaignName}${row.campaign?.objective ? ` · ${row.campaign.objective.replace("OUTCOME_", "")}` : ""}`} />
              <Row label="광고세트" value={row.adsetName} mono />
              {t && <Row label="타겟" value={`${t.gender === "전체" ? "남녀" : t.gender} · ${t.age} · ${t.audienceType}`} />}
              {s && <Row label="포함 타겟" value={s.customIncluded.join(", ")} />}
              {s && <Row label="제외 타겟" value={s.customExcluded.join(", ")} />}
              {s && <Row label="관심사" value={s.interests.join(", ")} />}
              {s && <Row label="Advantage+" value={s.advantageAudience ? "타겟 확장 켜짐" : null} />}
              {s && <Row label="최적화" value={s.optimizationGoal ? (OPT_LABEL[s.optimizationGoal] ?? s.optimizationGoal) : null} />}
              {s && <Row label="지면" value={s.placements === "auto" ? "자동(Advantage+ 지면)" : `수동 · ${s.platforms.join(", ")}`} />}
              {s && <Row label="예산" value={s.dailyBudget ? `일 ${fmt(s.dailyBudget, "won")}` : s.lifetimeBudget ? `총 ${fmt(s.lifetimeBudget, "won")}` : "캠페인 예산(CBO)"} />}
              {s && <Row label="학습 상태" value={s.learning === "FAIL" ? "학습 제한" : s.learning === "LEARNING" ? "학습 중" : s.learning === "SUCCESS" ? "학습 완료" : null} />}
            </dl>
          </section>

          {/* 문구 */}
          {(row.title || row.body) && (
            <section>
              <h4 className="mb-2 text-[15px] font-semibold text-ink">광고 문구</h4>
              <div className="rounded-lg bg-canvas px-3.5 py-3 text-[13px] leading-relaxed text-ink-soft">
                {row.title && <p className="mb-1 font-medium text-ink">{row.title}</p>}
                {row.body && <p className={`whitespace-pre-wrap ${showBody ? "" : "line-clamp-5"}`}>{row.body}</p>}
                {row.body && row.body.split("\n").length > 5 && (
                  <button type="button" onClick={() => setShowBody((v) => !v)} className="mt-1 text-[12px] text-signal hover:underline">
                    {showBody ? "접기" : "전체 보기"}
                  </button>
                )}
              </div>
            </section>
          )}

          {/* 같은 테마 소재 */}
          {peers.length > 0 && (
            <section>
              <h4 className="mb-2 text-[15px] font-semibold text-ink">
                같은 {p.type === "파트너십" ? "인플루언서·테마" : "테마"} 소재 <span className="font-normal text-ink-muted">{peers.length}개</span>
              </h4>
              <div className="grid grid-cols-4 gap-2">
                {peers.slice(0, 8).map((o) => (
                  <button key={o.id} type="button" onClick={() => onOpen(o)} className="overflow-hidden rounded-lg border border-line text-left hover:border-ink-faint">
                    <Thumb row={o} fit="contain" className="aspect-[4/5] w-full" />
                    <div className="px-1.5 py-1">
                      <p className={`text-[12px] font-semibold ${GRADE_META[o.grade].cls.split(" ").find((c) => c.startsWith("text-"))}`}>{GRADE_META[o.grade].label}</p>
                      <p className="text-[12px] tabular-nums text-ink">{o.group === "sales" ? fmt(o.roas, "x") : fmt(o.ctr, "pct")}</p>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
