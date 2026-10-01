"use client";

import { useMemo, useState } from "react";
import { fmt } from "@/features/ai-report/calcMetrics";
import type { PostMetric, PostTier } from "@/features/brand-analysis/postMetrics";
import { FORMAT_LABELS, TIER_LABELS } from "@/features/brand-analysis/postMetrics";
import type { PostTag } from "@/features/brand-analysis/diagnosisTypes";
import { PostThumbnail } from "./PostThumbnail";

type SortKey = "date" | "likes" | "comments" | "views" | "er" | "erIndex";

const TIER_STYLE: Record<PostTier, string> = {
  top: "bg-good/10 text-good border-good/30",
  mid: "bg-canvas text-ink-soft border-line",
  low: "bg-bad/10 text-bad border-bad/30",
  new: "bg-warn/10 text-warn border-warn/30",
  na: "bg-canvas text-ink-faint border-line",
};

export function TierBadge({ tier, erIndex }: { tier: PostTier; erIndex: number | null }) {
  return (
    <span className={`whitespace-nowrap inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[13px] font-medium ${TIER_STYLE[tier]}`}>
      {TIER_LABELS[tier]}
      {erIndex != null && tier !== "na" && <span className="opacity-80">{erIndex.toFixed(2)}x</span>}
    </span>
  );
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit", timeZone: "Asia/Seoul" }).replace(/\.\s?$/, "");
}

export function PostTable({
  posts,
  tags,
  selectedId,
  onSelect,
}: {
  posts: PostMetric[];
  tags: PostTag[] | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [desc, setDesc] = useState(true);
  const [filter, setFilter] = useState<"all" | "reel" | "image" | "carousel" | "top" | "low">("all");

  const tagMap = useMemo(() => new Map((tags ?? []).map((t) => [t.id, t])), [tags]);

  const rows = useMemo(() => {
    const filtered = posts.filter((m) => {
      if (filter === "all") return true;
      if (filter === "top" || filter === "low") return m.tier === filter;
      return m.post.format === filter;
    });
    const val = (m: PostMetric): number => {
      switch (sortKey) {
        case "date":
          return m.post.timestamp ? new Date(m.post.timestamp).getTime() : 0;
        case "likes":
          return m.post.likesHidden ? -1 : m.post.likes;
        case "comments":
          return m.post.comments;
        case "views":
          return m.post.videoViews ?? -1;
        case "er":
          return m.er ?? -1;
        case "erIndex":
          return m.erIndex ?? -1;
      }
    };
    return [...filtered].sort((a, b) => (desc ? val(b) - val(a) : val(a) - val(b)));
  }, [posts, sortKey, desc, filter]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setDesc((d) => !d);
    else {
      setSortKey(key);
      setDesc(true);
    }
  }

  const Th = ({ label, k, align = "right" }: { label: string; k?: SortKey; align?: "left" | "right" }) => (
    <th
      onClick={k ? () => toggleSort(k) : undefined}
      className={`whitespace-nowrap px-2 py-2 text-[13px] font-medium text-ink-muted ${align === "left" ? "text-left" : "text-right"} ${
        k ? "cursor-pointer select-none hover:text-ink" : ""
      }`}
    >
      {label}
      {k && sortKey === k && <i className={`ti ${desc ? "ti-chevron-down" : "ti-chevron-up"} ml-0.5 text-[13px]`} aria-hidden />}
    </th>
  );

  const filters: Array<{ key: typeof filter; label: string }> = [
    { key: "all", label: "전체" },
    { key: "top", label: "상위" },
    { key: "low", label: "하위" },
    { key: "reel", label: "릴스" },
    { key: "carousel", label: "캐러셀" },
    { key: "image", label: "이미지" },
  ];

  return (
    <div className="rounded-card border border-line bg-surface p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[15px] font-medium text-ink-soft">
          게시물별 성과 <span className="font-normal text-ink-muted">{rows.length}개</span>
        </p>
        <div className="flex flex-wrap gap-1">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full border px-2.5 py-1 text-[13px] transition ${
                filter === f.key ? "border-signal bg-signal-soft text-signal" : "border-line bg-surface text-ink-muted hover:text-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead>
            <tr className="border-b border-line">
              <Th label="게시물" align="left" />
              <Th label="날짜" k="date" />
              <Th label="포맷" />
              <Th label="유형" align="left" />
              <Th label="좋아요" k="likes" />
              <Th label="댓글" k="comments" />
              <Th label="조회수" k="views" />
              <Th label="ER" k="er" />
              <Th label="중앙값 대비" k="erIndex" />
            </tr>
          </thead>
          <tbody>
            {rows.map((m, i) => {
              const tag = tagMap.get(m.post.id);
              const selected = selectedId === m.post.id;
              return (
                <tr
                  key={m.post.id}
                  onClick={() => onSelect(m.post.id)}
                  className={`cursor-pointer border-b border-line transition ${selected ? "bg-signal-soft/60" : "hover:bg-canvas"}`}
                >
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md border border-line">
                        <PostThumbnail post={m.post} index={i} size="sm" />
                      </div>
                      <span className="line-clamp-1 max-w-[180px] text-ink-soft">{m.post.caption || "(캡션 없음)"}</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right text-ink-soft">{formatDate(m.post.timestamp)}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right text-ink-soft">{FORMAT_LABELS[m.post.format]}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-left text-ink-soft">{tag?.contentType ?? <span className="text-ink-faint">—</span>}</td>
                  <td className="px-2 py-1.5 text-right text-ink">{m.post.likesHidden ? <span className="text-ink-faint">비공개</span> : fmt(m.post.likes, "int")}</td>
                  <td className="px-2 py-1.5 text-right text-ink">{fmt(m.post.comments, "int")}</td>
                  <td className="px-2 py-1.5 text-right text-ink">{m.post.videoViews != null ? fmt(m.post.videoViews, "int") : <span className="text-ink-faint">—</span>}</td>
                  <td className="px-2 py-1.5 text-right font-medium text-ink">{fmt(m.er, "pct")}</td>
                  <td className="px-2 py-1.5 text-right">
                    <TierBadge tier={m.tier} erIndex={m.erIndex} />
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-[15px] text-ink-muted">
                  조건에 맞는 게시물이 없어요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
