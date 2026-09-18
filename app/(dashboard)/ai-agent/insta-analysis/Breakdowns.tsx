"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmt } from "@/features/ai-report/calcMetrics";
import type { AccountMetrics, Bucket } from "@/features/brand-analysis/postMetrics";
import { DOW_LABELS, SLOT_COUNT, slotLabel } from "@/features/brand-analysis/postMetrics";
import type { PostTag } from "@/features/brand-analysis/diagnosisTypes";

const FORMAT_COLORS: Record<string, string> = { 릴스: "#ec4899", 캐러셀: "#8b5cf6", 이미지: "#3b82f6" };
const TYPE_COLORS = ["#4F46E5", "#ec4899", "#f97316", "#10b981", "#0ea5e9", "#8b5cf6", "#f59e0b", "#94a3b8"];

const TOOLTIP_STYLE = { borderRadius: 10, border: "1px solid #E6E6E2", fontSize: 12, fontFamily: "Pretendard, sans-serif" };

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-line bg-surface p-5">
      <div className="mb-3">
        <p className="text-[13px] font-medium text-ink-soft">{title}</p>
        {sub && <p className="text-[11px] text-ink-muted">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

// ── 포맷별: 게시 비중 vs 반응 비중 + 평균 ER ──────────────
export function FormatBreakdown({ metrics }: { metrics: AccountMetrics }) {
  const total = metrics.postsAnalyzed || 1;
  const data = metrics.formats.map((f) => ({
    name: f.label,
    게시비중: +((f.count / total) * 100).toFixed(1),
    반응비중: +(f.engagementShare * 100).toFixed(1),
    avgEr: f.avgEr,
    avgViewRate: f.avgViewRate,
    count: f.count,
  }));

  return (
    <Card title="포맷별 성과" sub="게시 비중보다 반응 비중이 크면 그 포맷이 효율적이에요">
      <div className="h-[180px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} barGap={4}>
            <CartesianGrid stroke="#E6E6E2" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#767C86" }} tickLine={false} axisLine={{ stroke: "#E6E6E2" }} />
            <YAxis tick={{ fontSize: 11, fill: "#A7ACB4" }} tickLine={false} axisLine={false} unit="%" />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => `${v}%`} />
            <Bar dataKey="게시비중" fill="#D5D7DC" radius={[4, 4, 0, 0]} />
            <Bar dataKey="반응비중" radius={[4, 4, 0, 0]}>
              {data.map((d) => (
                <Cell key={d.name} fill={FORMAT_COLORS[d.name] ?? "#4F46E5"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="mt-2 w-full text-[12px]">
        <thead>
          <tr className="text-ink-muted">
            <th className="py-1 text-left font-medium">포맷</th>
            <th className="py-1 text-right font-medium">게시</th>
            <th className="py-1 text-right font-medium">평균 ER</th>
            <th className="py-1 text-right font-medium">평균 확산율</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.name} className="border-t border-line">
              <td className="py-1.5">
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: FORMAT_COLORS[d.name] }} />
                {d.name}
              </td>
              <td className="py-1.5 text-right text-ink-soft">{d.count}</td>
              <td className="py-1.5 text-right font-medium text-ink">{fmt(d.avgEr, "pct")}</td>
              <td className="py-1.5 text-right text-ink-soft">{d.avgViewRate != null ? fmt(d.avgViewRate, "x") : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// ── 콘텐츠 유형별 (AI 태깅 결과 × ER) ──────────────
export function ContentTypeBreakdown({ metrics, tags }: { metrics: AccountMetrics; tags: PostTag[] | null }) {
  if (!tags || tags.length === 0) {
    return (
      <Card title="콘텐츠 유형별 성과" sub="AI 진단을 실행하면 게시물 유형별 ER이 표시돼요">
        <div className="flex h-[180px] items-center justify-center text-[13px] text-ink-muted">AI 진단 대기 중</div>
      </Card>
    );
  }
  const tagMap = new Map(tags.map((t) => [t.id, t]));
  const groups = new Map<string, { ers: number[]; count: number }>();
  for (const m of metrics.posts) {
    const tag = tagMap.get(m.post.id);
    if (!tag) continue;
    const g = groups.get(tag.contentType) ?? { ers: [], count: 0 };
    g.count += 1;
    if (m.er != null) g.ers.push(m.er);
    groups.set(tag.contentType, g);
  }
  const data = [...groups.entries()]
    .map(([name, g]) => ({
      name,
      count: g.count,
      avgEr: g.ers.length ? g.ers.reduce((s, v) => s + v, 0) / g.ers.length : 0,
    }))
    .sort((a, b) => b.avgEr - a.avgEr);

  return (
    <Card title="콘텐츠 유형별 성과" sub="AI가 태깅한 유형 기준 평균 ER. 점선은 계정 중앙값">
      <div className="h-[180px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, bottom: 0, left: 8 }}>
            <CartesianGrid stroke="#E6E6E2" horizontal={false} />
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" width={86} tick={{ fontSize: 11, fill: "#3B4048" }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v, _n, item) => [`${fmt(Number(v), "pct")} · ${item?.payload?.count}개`, "평균 ER"]}
            />
            <Bar dataKey="avgEr" radius={[0, 4, 4, 0]} barSize={14}>
              {data.map((d, i) => (
                <Cell key={d.name} fill={TYPE_COLORS[i % TYPE_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-[11px] text-ink-muted">계정 중앙값 ER {fmt(metrics.medianEr, "pct")}</p>
    </Card>
  );
}

// ── 게시 시간 히트맵 (KST, 요일 × 4시간 구간) ──────────────
export function TimeHeatmap({ metrics }: { metrics: AccountMetrics }) {
  const max = Math.max(...metrics.heatmap.map((c) => c.avgEr ?? 0), 0.0001);
  return (
    <Card title="게시 시간대별 반응" sub="KST 기준 요일 × 시간대 평균 ER. 진할수록 반응이 좋아요">
      <div className="overflow-x-auto">
        <div className="grid min-w-[360px] gap-1" style={{ gridTemplateColumns: `36px repeat(${SLOT_COUNT}, 1fr)` }}>
          <div />
          {Array.from({ length: SLOT_COUNT }).map((_, s) => (
            <div key={s} className="text-center text-[10px] text-ink-muted">
              {slotLabel(s).replace("시", "")}
            </div>
          ))}
          {DOW_LABELS.map((d, dow) => (
            <div key={d} className="contents">
              <div className="flex items-center text-[11px] text-ink-muted">{d}</div>
              {Array.from({ length: SLOT_COUNT }).map((_, slot) => {
                const cell = metrics.heatmap.find((c) => c.dow === dow && c.slot === slot);
                const intensity = cell?.avgEr != null ? Math.max(0.12, cell.avgEr / max) : 0;
                const isBest = metrics.bestSlot && metrics.bestSlot.dow === dow && metrics.bestSlot.slot === slot;
                return (
                  <div
                    key={slot}
                    title={
                      cell?.count
                        ? `${d}요일 ${slotLabel(slot)} · ${cell.count}개 · 평균 ER ${fmt(cell.avgEr, "pct")}`
                        : `${d}요일 ${slotLabel(slot)} · 게시 없음`
                    }
                    className={`flex h-7 items-center justify-center rounded text-[10px] ${isBest ? "ring-2 ring-signal" : ""}`}
                    style={{
                      background: cell?.count ? `rgba(79, 70, 229, ${intensity})` : "#F0F0EE",
                      color: intensity > 0.55 ? "#fff" : "#767C86",
                    }}
                  >
                    {cell?.count || ""}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-2 text-[11px] text-ink-muted">
        {metrics.bestSlot
          ? `최고 성과 시간대: ${DOW_LABELS[metrics.bestSlot.dow]}요일 ${slotLabel(metrics.bestSlot.slot)} (평균 ER ${fmt(metrics.bestSlot.avgEr, "pct")}, 2개 이상 게시 기준)`
          : "같은 시간대에 2개 이상 게시된 구간이 없어 최고 시간대를 판단하기 어려워요."}
      </p>
    </Card>
  );
}

// ── 캡션 구조별 성과 ──────────────
function BucketTable({ title, buckets, median }: { title: string; buckets: Bucket[]; median: number | null }) {
  return (
    <div>
      <p className="mb-1 text-[12px] font-medium text-ink">{title}</p>
      <table className="w-full text-[12px]">
        <tbody>
          {buckets.map((b) => {
            const idx = b.avgEr != null && median ? b.avgEr / median : null;
            const tone = idx == null ? "text-ink-muted" : idx >= 1.15 ? "text-good" : idx <= 0.85 ? "text-bad" : "text-ink-soft";
            return (
              <tr key={b.label} className="border-t border-line">
                <td className="py-1.5 text-ink-soft">{b.label}</td>
                <td className="py-1.5 text-right text-ink-muted">{b.count}개</td>
                <td className="py-1.5 text-right font-medium text-ink">{fmt(b.avgEr, "pct")}</td>
                <td className={`w-12 py-1.5 text-right ${tone}`}>{idx != null ? `${idx.toFixed(2)}x` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function StructureBreakdown({ metrics }: { metrics: AccountMetrics }) {
  return (
    <Card title="캡션 구조별 성과" sub="마지막 열은 계정 중앙값 대비 배수">
      <div className="grid gap-4 sm:grid-cols-2">
        <BucketTable title="캡션 길이" buckets={metrics.captionBuckets} median={metrics.medianEr} />
        <BucketTable title="해시태그 개수" buckets={metrics.hashtagBuckets} median={metrics.medianEr} />
        <BucketTable title="CTA 포함 여부" buckets={metrics.ctaSplit} median={metrics.medianEr} />
        <BucketTable title="멘션 / 협업 태그" buckets={metrics.mentionSplit} median={metrics.medianEr} />
      </div>
    </Card>
  );
}

// ── 해시태그별 성과 ──────────────
export function HashtagBreakdown({ metrics }: { metrics: AccountMetrics }) {
  if (metrics.hashtagPerformance.length === 0) {
    return (
      <Card title="해시태그별 성과" sub="2회 이상 사용된 태그만 집계">
        <div className="flex h-[120px] items-center justify-center text-[13px] text-ink-muted">반복 사용된 해시태그가 없어요</div>
      </Card>
    );
  }
  return (
    <Card title="해시태그별 성과" sub="2회 이상 사용된 태그의 평균 ER. 상위 12개">
      <div className="flex flex-wrap gap-2">
        {metrics.hashtagPerformance.map((h) => {
          const idx = h.erIndex;
          const tone =
            idx == null
              ? "border-line bg-canvas text-ink-soft"
              : idx >= 1.15
                ? "border-good/30 bg-good/10 text-good"
                : idx <= 0.85
                  ? "border-bad/30 bg-bad/10 text-bad"
                  : "border-line bg-canvas text-ink-soft";
          return (
            <span key={h.tag} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] ${tone}`}>
              {h.tag}
              <span className="text-[11px] opacity-80">
                {h.count}회 · {idx != null ? `${idx.toFixed(2)}x` : fmt(h.avgEr, "pct")}
              </span>
            </span>
          );
        })}
      </div>
    </Card>
  );
}
