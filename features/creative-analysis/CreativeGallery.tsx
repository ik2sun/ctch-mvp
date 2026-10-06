"use client";

// 소재 갤러리 — 실제 썸네일 + 등급(같은 목표 그룹 안 순위) + 소재명 파싱 태그 칩(긴 이름 대신) + A/B 위너 👑 + 목표에 맞는 지표
import { useMemo, useState } from "react";
import { fmt } from "@/features/ai-report/calcMetrics";
import { GRADE_META, type Enriched, type Grade } from "./analyze";
import type { NamingDict } from "./naming";
import { ParsedTags } from "./NamingInsights";
import { themeOf } from "./groups";
import { STATUS_META, type Decision } from "./decision";

const FORMAT_BADGE: Record<string, { label: string; icon: string } | undefined> = {
  video: { label: "영상", icon: "ti-player-play" },
  dynamic: { label: "다이내믹", icon: "ti-stack-2" },
  carousel: { label: "캐러셀", icon: "ti-carousel-horizontal" },
};

export function Thumb({ row, className = "", fit = "cover" }: { row: Enriched; className?: string; fit?: "cover" | "contain" }) {
  const [failed, setFailed] = useState(false);
  if (!row.thumbnailUrl || failed) {
    return (
      <div className={`flex items-center justify-center bg-canvas text-ink-faint ${className}`}>
        <i className="ti ti-photo-off text-[22px]" aria-hidden />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={row.thumbnailUrl}
      alt={row.name}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`bg-canvas ${fit === "contain" ? "object-contain" : "object-cover"} ${className}`}
    />
  );
}

export function NameChips({ row, max = 4 }: { row: Enriched; max?: number }) {
  const p = row.parsed;
  const chips = [p.mapValue ?? null, ...(p.fields ?? []).filter((f) => f.kind === "text").flatMap((f) => f.values)].filter((x): x is string => !!x);
  return (
    <div className="flex flex-wrap gap-1">
      {[...new Set(chips)].slice(0, max).map((c) => (
        <span key={c} className="max-w-[140px] truncate rounded bg-canvas px-1.5 py-0.5 text-[12px] text-ink-soft">
          {c}
        </span>
      ))}
    </div>
  );
}

export function GradeBadge({ grade }: { grade: Grade }) {
  const g = GRADE_META[grade];
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[12px] font-semibold ${g.cls}`}>
      <i className={`ti ${g.icon} text-[13px]`} aria-hidden />
      {g.label}
    </span>
  );
}

const wonShort = (v: number | null) => (v == null ? "—" : v >= 1e8 ? `${(v / 1e8).toFixed(1)}억` : v >= 1e5 ? `${Math.round(v / 1e4).toLocaleString("ko-KR")}만` : v >= 1e4 ? `${(v / 1e4).toFixed(1)}만` : Math.round(v).toLocaleString("ko-KR"));

function Metric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[13px] text-ink-muted">{label}</p>
      <p className={`whitespace-nowrap text-[16px] tabular-nums ${strong ? "font-bold text-[#1A1A1A]" : "font-semibold text-ink-soft"}`}>{value}</p>
    </div>
  );
}

function CreativeCard({ row, onOpen, dict, winner, decision }: { row: Enriched; onOpen: (r: Enriched) => void; dict: NamingDict; winner: boolean; decision?: Decision }) {
  const fb = FORMAT_BADGE[row.format];
  const sales = row.group === "sales";
  return (
    <button
      type="button"
      onClick={() => onOpen(row)}
      className={`group flex flex-col overflow-hidden rounded-card border bg-surface text-left transition hover:shadow-[0_4px_16px_rgba(21,24,30,0.06)] ${winner ? "border-[#E8B500]/60 hover:border-[#E8B500]" : "border-line hover:border-ink-faint"}`}
    >
      {/* 원본 비율 그대로 전부 보이게(contain) — 남는 칸은 캔버스색 */}
      <Thumb row={row} fit="contain" className="aspect-[4/5] w-full" />
      <div className="flex flex-1 flex-col gap-2.5 p-3.5">
        {/* 등급·포맷은 이미지 밖(정보 영역)에 — 이미지 속 카피를 가리지 않게 */}
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1">
            {decision ? (
              <span className={`inline-flex items-center gap-0.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-semibold ${STATUS_META[decision.status].chip}`} title={decision.reason}>
                {STATUS_META[decision.status].icon} {STATUS_META[decision.status].label}
              </span>
            ) : (
              <GradeBadge grade={row.grade} />
            )}
            {winner && (
              <span className="inline-flex items-center gap-0.5 whitespace-nowrap rounded-full bg-[#FFF7D6] px-2 py-0.5 text-[12px] font-semibold text-[#8A6100]" title="같은 A/B 묶음(번호만 다른 소재) 중 1위">
                👑 위너
              </span>
            )}
          </span>
          {fb && (
            <span className="inline-flex items-center gap-0.5 text-[12px] font-medium text-ink-muted">
              <i className={`ti ${fb.icon} text-[12px]`} aria-hidden />
              {fb.label}
            </span>
          )}
        </div>
        <ParsedTags row={row} dict={dict} />
        <div className="mt-auto grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line/70 pt-3">
          <Metric label="광고비" value={wonShort(row.cost)} />
          {sales ? (
            <>
              <Metric label="ROAS" value={fmt(row.roas, "x")} strong />
              <Metric label="CPA" value={wonShort(row.cpa)} />
              <Metric label="CTR" value={fmt(row.ctr, "pct")} />
            </>
          ) : (
            <>
              <Metric label="CTR" value={fmt(row.ctr, "pct")} strong />
              <Metric label="CPM" value={wonShort(row.cpm)} />
              <Metric label={row.hookRate != null ? "3초 조회" : "도달"} value={row.hookRate != null ? fmt(row.hookRate, "pct") : fmt(row.reach, "int")} />
            </>
          )}
        </div>
      </div>
    </button>
  );
}

type SortKey = "cost" | "score" | "revenue" | "ctr" | "cpa" | "newest";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "cost", label: "광고비 많은 순" },
  { key: "score", label: "효율 높은 순" },
  { key: "revenue", label: "매출 많은 순" },
  { key: "ctr", label: "CTR 높은 순" },
  { key: "cpa", label: "CPA 낮은 순" },
  { key: "newest", label: "최신 소재 순" },
];

export function CreativeGallery({
  rows,
  onOpen,
  dict,
  winnerIds,
  theme,
  onClearTheme,
  decisions,
}: {
  rows: Enriched[];
  onOpen: (r: Enriched) => void;
  dict: NamingDict;
  winnerIds: Set<string>;
  theme?: { keys: string[]; label: string; match?: (r: Enriched) => boolean } | null; // 성과 맵에서 고른 테마(들) — 조합 모드면 match로 판별
  onClearTheme?: () => void;
  decisions?: Map<string, Decision>; // 판정 엔진 결과 — 있으면 등급 대신 상태 칩
}) {
  const [sort, setSort] = useState<SortKey>("cost");
  const [grade, setGrade] = useState<Grade | "all" | "winner">("all");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(28);

  const list = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const f = rows.filter(
      (r) =>
        (!theme || (theme.match ? theme.match(r) : theme.keys.includes(themeOf(r).key))) &&
        (grade === "all" || (grade === "winner" ? winnerIds.has(r.id) : r.grade === grade)) &&
        (!qq || r.name.toLowerCase().includes(qq) || r.adsetName.toLowerCase().includes(qq) || (r.parsed.fields ?? []).some((f) => f.values.some((v) => v.toLowerCase().includes(qq)))),
    );
    const v = (r: Enriched): number =>
      sort === "cost" ? r.cost : sort === "score" ? (r.judged ? (r.score ?? -1) : -2) : sort === "revenue" ? r.revenue : sort === "ctr" ? (r.judged ? (r.ctr ?? -1) : -2) : sort === "cpa" ? -(r.cpa ?? Number.MAX_VALUE) : -(r.ageDays ?? 9999);
    return f.sort((a, b) => v(b) - v(a));
  }, [rows, sort, grade, q, winnerIds, theme]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows) m[r.grade] = (m[r.grade] ?? 0) + 1;
    return m;
  }, [rows]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {theme && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#F45B35]/50 bg-[#FFF3EF] px-3 py-1.5 text-[13px] font-semibold text-[#C2410C]">
            성과 맵: {theme.label} · {list.length}개
            {onClearTheme && (
              <button type="button" onClick={onClearTheme} aria-label="테마 필터 해제" className="ml-0.5 text-[#C2410C]/70 hover:text-[#C2410C]">
                ✕
              </button>
            )}
          </span>
        )}
        <div className="flex flex-wrap gap-1">
          {(["all", "winner", "top", "good", "mid", "low", "hold"] as const).filter((g) => g !== "winner" || winnerIds.size > 0).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGrade(g)}
              aria-pressed={grade === g}
              className={`rounded-full border px-3 py-1.5 text-[13px] transition ${
                grade === g ? "border-ink/15 bg-surface font-medium text-ink shadow-[0_1px_2px_rgba(21,24,30,0.06)]" : "border-line bg-canvas text-ink-muted hover:text-ink"
              }`}
            >
              {g === "all" ? "전체" : g === "winner" ? "👑 A/B 위너" : GRADE_META[g].label}{" "}
              <span className="tabular-nums text-ink-faint">{g === "all" ? rows.length : g === "winner" ? rows.filter((r) => winnerIds.has(r.id)).length : (counts[g] ?? 0)}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <i className="ti ti-search pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[15px] text-ink-faint" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="소재명·테마·인플루언서" className="field h-9 w-56 pl-7 text-[15px]" />
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="field h-9 w-auto text-[15px]">
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {list.length === 0 ? (
        <p className="py-10 text-center text-[15px] text-ink-muted">조건에 맞는 소재가 없어요.</p>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-4">
            {list.slice(0, limit).map((r) => (
              <CreativeCard key={r.id} row={r} onOpen={onOpen} dict={dict} winner={winnerIds.has(r.id)} decision={decisions?.get(r.id)} />
            ))}
          </div>
          {list.length > limit && (
            <button type="button" onClick={() => setLimit((l) => l + 28)} className="mx-auto mt-4 flex items-center gap-1 rounded-lg border border-line px-4 py-2 text-[13px] text-ink-soft hover:border-ink-faint">
              더 보기 <span className="text-ink-faint">({list.length - limit}개 남음)</span>
            </button>
          )}
        </>
      )}
    </div>
  );
}
