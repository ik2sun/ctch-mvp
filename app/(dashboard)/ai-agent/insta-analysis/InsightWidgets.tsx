"use client";

// 인스타 분석 고도화 위젯 — 원라인 지침(TL;DR) · 카테고리 벤치마크 게이지 · 시각 요소 비교 · 넥스트 베스트 액션.
// 차트 규칙(ctch-dataviz): 강조 1색(signal) + 기준 회색, 숫자는 글자로도 표기, 표본이 적으면 판단하지 않는다.
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { InstagramProfile } from "@/features/brand-analysis/apifyClient";
import type { PostMetric } from "@/features/brand-analysis/postMetrics";
import type { PostTag } from "@/features/brand-analysis/diagnosisTypes";
import { CATEGORIES, type VisualTag } from "@/features/brand-analysis/visualTypes";
import { MIN_N, type Action, type Benchmark, type Comparison } from "@/features/brand-analysis/insights";
import type { CreativeIdeas } from "@/features/brand-analysis/creativeIdeas";

const pct = (v: number | null | undefined, d = 2) => (v == null ? "—" : `${(v * 100).toFixed(d)}%`);
const shadow = "shadow-[0_1px_3px_rgba(16,24,40,0.06),0_6px_16px_rgba(16,24,40,0.06)]";

// ── ① 원라인 마스터 인사이트 ─────────────────────────────
export function TldrCard({ headline, source, actions, status }: { headline: string | null; source: "ai" | "rule"; actions: Action[]; status: { visual: boolean; diagnosis: boolean } }) {
  const rest = actions.slice(source === "rule" ? 1 : 0);
  return (
    <section className={`overflow-hidden rounded-card bg-surface ${shadow}`}>
      <div className="border-l-4 border-signal px-5 py-3.5">
        <p className="flex items-center gap-2 text-[12px] font-semibold text-signal">
          <span aria-hidden>✦</span> 이번 주 액션 · {source === "ai" ? "AI 총평" : "데이터 요약(규칙 기반)"}
          {(!status.visual || !status.diagnosis) && <span className="font-normal text-ink-muted">— 우측 상단 ‘전체 AI 분석 실행’으로 구도·콘텐츠 유형까지 반영돼요</span>}
        </p>
        <p className="mt-1 text-[18px] font-semibold leading-snug text-ink">
          {headline ?? "아직 뚜렷한 차이를 말할 만큼 표본이 모이지 않았어요. 게시물이 더 쌓이면 다시 분석해 보세요."}
        </p>
        {source === "rule" && actions[0] && <p className="mt-1 text-[12px] text-ink-muted">근거 · {actions[0].basis}</p>}
        {rest.length > 0 && (
          <ul className="mt-2.5 grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
            {rest.map((a, i) => (
              <li key={i} className="rounded-lg bg-canvas px-3 py-2">
                <p className="text-[14px] leading-relaxed text-ink">{a.text}</p>
                <p className="mt-0.5 text-[11px] text-ink-muted">근거 · {a.basis}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ── ③ 동일 카테고리 벤치마크 ─────────────────────────────
export function BenchmarkCard({ myEr, bench, category, onCategory, saving }: { myEr: number | null; bench: Benchmark; category: string | null; onCategory: (c: string | null) => void; saving: boolean }) {
  const top = bench.topPercent;
  const pos = top != null ? 100 - top : null; // 왼쪽 하위 → 오른쪽 상위
  const ready = !!category && bench.n >= 2 && top != null;
  return (
    <div className="rounded-card border border-line bg-surface px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] text-ink-muted">동일 카테고리 대비 참여율 위치</p>
        <select
          value={category ?? ""}
          onChange={(e) => onCategory(e.target.value || null)}
          disabled={saving}
          className="h-6 rounded border border-line bg-surface px-1.5 text-[11px] text-ink-soft outline-none focus:border-signal"
          aria-label="카테고리"
        >
          <option value="">카테고리</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-1.5 flex items-baseline justify-between gap-3">
        <p className="font-display text-[22px] font-semibold text-ink">{ready ? `상위 ${top}%` : "—"}</p>
        <p className="text-right text-[12px] text-ink-muted">
          {ready ? `${category} ${bench.n}개 계정 중 · 중앙값 ${pct(bench.medianEr)} vs 내 ${pct(myEr)}` : !category ? "카테고리를 고르면 팀이 분석한 같은 카테고리 계정과 비교해요" : `비교할 ${category} 계정이 ${bench.n}개 — 경쟁사를 분석해 같은 카테고리로 지정하세요`}
        </p>
      </div>
      <div className={`relative mt-2 h-3 rounded-full ${ready ? "bg-gradient-to-r from-[#EEF0F3] via-[#E3E6EB] to-[#D3D7DE]" : "bg-canvas"}`} role="img" aria-label={ready ? `상위 ${top}%` : "비교 불가"}>
        {ready &&
          bench.peers.map((p) => {
            const below = bench.peers.filter((q) => q.er < p.er).length;
            return <span key={p.username} title={`@${p.username} ${pct(p.er)}`} className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 rounded bg-ink-faint" style={{ left: `${(below / Math.max(1, bench.peers.length - 1)) * 100}%` }} />;
          })}
        {ready && <span className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-signal shadow" style={{ left: `${pos}%` }} />}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-ink-muted">
        <span>하위</span>
        {ready && <span>팔로워 규모가 크게 다르면 비교가 기울 수 있어요</span>}
        <span>상위</span>
      </div>
    </div>
  );
}

// ── ② 시각 요소 AI 분석 ─────────────────────────────
function ComparisonWidget({ c }: { c: Comparison }) {
  const max = Math.max(0.0001, ...c.groups.map((g) => g.value ?? 0));
  const fmt = (v: number | null) => (v == null ? "—" : c.metric === "erIndex" ? `${v.toFixed(2)}x` : pct(v, 0));
  return (
    <div className="rounded-card border border-line bg-surface p-3.5">
      <p className="text-[14px] font-semibold text-ink">{c.title}</p>
      <p className="mt-0.5 text-[12px] text-ink-muted">{c.metricLabel.replace(/\(.*\)$/, "").trim()} 중앙값{c.metric === "erIndex" ? " (1.00x = 평소)" : ""}</p>
      {c.groups.length === 0 ? (
        <p className="mt-4 text-[13px] text-ink-muted">해당 게시물이 없어요.</p>
      ) : (
        <ul className="mt-2.5 space-y-2">
          {c.groups.map((g) => {
            const best = c.winner?.best.label === g.label;
            return (
              <li key={g.label}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]">
                  <span className={best ? "font-semibold text-ink" : "text-ink-soft"}>
                    {g.label} <span className="text-ink-muted">· {g.n}개</span>
                    {g.n < MIN_N && <span className="ml-1 text-[11px] text-warn">표본 적음</span>}
                  </span>
                  <span className={`tabular-nums ${best ? "font-semibold text-ink" : "text-ink-soft"}`}>{fmt(g.value)}</span>
                </div>
                <div className="h-2 rounded bg-canvas">
                  <div className={`h-2 rounded ${best ? "bg-signal" : "bg-[#C9CDD4]"}`} style={{ width: `${((g.value ?? 0) / max) * 100}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
        {c.winner ? (
          <>
            ‘<b className="text-ink">{c.winner.best.label}</b>’ 게시물이 ‘{c.winner.worst.label}’보다 <b className="text-ink">{c.winner.ratio.toFixed(1)}배</b>
          </>
        ) : (
          "뚜렷한 차이 없음(또는 표본 부족)"
        )}
      </p>
      {c.note && <p className="mt-1 text-[11px] text-ink-muted">{c.note}</p>}
    </div>
  );
}

export function VisualSection({ comparisons, analyzed, skipped, busy, isMock, byComments }: { comparisons: Comparison[]; analyzed: number; skipped: number; busy: boolean; isMock: boolean; byComments?: boolean }) {
  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[16px] font-semibold text-ink">크리에이티브 시각 분석</h3>
        <p className="text-[12px] text-ink-muted">{analyzed ? `이미지 ${analyzed}개 분석${skipped ? ` · 만료 ${skipped}개 제외` : ""}` : busy ? "이미지 분석 중… (30초~1분)" : "분석 전"}</p>
      </div>
      <p className="mt-0.5 text-[12px] text-ink-muted">게시물 이미지(릴스는 첫 화면)를 AI가 보고 사람·구도·톤·카피를 분류해 성과를 비교해요</p>
      {byComments && comparisons.length > 0 && <p className="mt-1 text-[12px] font-medium text-warn">좋아요를 숨긴 게시물이 많아 참여율 대신 댓글 수(계정 중앙값 대비)로 비교해요</p>}
      {comparisons.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-line bg-canvas px-3 py-3 text-[13px] text-ink-muted">
          {isMock ? "샘플 데이터는 이미지 분석을 할 수 없어요." : busy ? "게시물 이미지를 받아 분류하고 있어요…" : "우측 상단 ‘전체 AI 분석 실행’(또는 ▾ → 이미지 분석만)을 누르면 사람 얼굴 유무, 제품 단독 vs 착용 컷, 톤, 카피 유무, 릴스 첫 화면 훅 텍스트별 성과를 비교해요. 인스타 이미지 주소는 며칠 뒤 만료되니 분석 직후에 실행하세요."}
        </p>
      ) : (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {comparisons.map((c) => (
            <ComparisonWidget key={c.key} c={c} />
          ))}
        </div>
      )}
    </section>
  );
}

// ── ④ 넥스트 베스트 액션 ─────────────────────────────
export const SHORTFORM_PREFILL_KEY = "ctch_shortform_prefill";

function CopyRow({ label, text }: { label: string; text: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-ink-muted">{label}</span>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(text).then(() => {
              setDone(true);
              setTimeout(() => setDone(false), 1200);
            });
          }}
          className="text-[11px] text-signal hover:underline"
        >
          {done ? "복사됨" : "복사"}
        </button>
      </div>
      <p className="mt-0.5 whitespace-pre-line text-[13px] leading-relaxed text-ink">{text}</p>
    </div>
  );
}

export function NextBestAction({ profile, metric, tag, visual, isTop }: { profile: InstagramProfile; metric: PostMetric | null; tag: PostTag | null; visual: VisualTag | null; isTop?: boolean }) {
  const router = useRouter();
  const [ideas, setIdeas] = useState<Record<string, CreativeIdeas>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!metric) return null;
  const id = metric.post.id;
  const cur = ideas[id];
  const top = isTop ?? metric.tier === "top";

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/brand-analysis/creative-ideas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: profile.username, postId: id, profile }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "소재 추천에 실패했어요.");
      setIdeas((s) => ({ ...s, [id]: j as CreativeIdeas }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했어요.");
    } finally {
      setLoading(false);
    }
  };

  const toShortform = () => {
    const notes = [
      `참고 게시물: ${metric.post.url}`,
      metric.erIndex != null ? `이 게시물 반응: 계정 평소의 ${metric.erIndex.toFixed(1)}배` : "",
      visual ? `구도: ${visual.subject} · 사람 ${visual.people} · ${visual.tone} 톤${visual.overlayText ? ` · 첫 화면 문구 "${visual.overlayText}"` : ""}` : "",
      tag ? `훅 유형: ${tag.hookType} · ${tag.insight}` : "",
      cur ? `AI 제안 훅: ${cur.shortform.hook}\n장면: ${cur.shortform.scenes.map((s) => `${s.seconds} ${s.visual} / "${s.text}"`).join(" → ")}` : "",
      `원문 캡션: ${metric.post.caption.slice(0, 300)}`,
    ].filter(Boolean);
    try {
      sessionStorage.setItem(
        SHORTFORM_PREFILL_KEY,
        JSON.stringify({ title: cur?.shortform.title ?? `@${profile.username} 상위 게시물 재해석`, brief: { brand: profile.fullName || profile.username, cta: cur?.shortform.cta ?? "", notes: notes.join("\n") } }),
      );
    } catch {
      /* 무시 */
    }
    router.push("/ai-agent/creative");
  };

  return (
    <div className={`rounded-card border bg-surface p-4 ${top ? "border-signal/40" : "border-line"}`}>
      <p className="text-[14px] font-semibold text-ink">넥스트 베스트 액션</p>
      <p className="mt-0.5 text-[12px] text-ink-muted">{top ? "반응 상위 게시물이에요. 같은 구도로 다음 소재를 만들어 보세요." : "이 게시물을 바탕으로 소재를 만들 수 있어요(상위 게시물일수록 효과적)."}</p>
      <div className="mt-3 grid gap-2">
        <button type="button" onClick={load} disabled={loading} className="btn-signal h-10 text-[14px]">
          {loading ? "소재 추천 만드는 중… (20~40초)" : cur ? "AI 소재 다시 추천" : "AI 소재 추천 — 숏폼 스크립트 + 광고 카피"}
        </button>
        <button type="button" onClick={toShortform} className="btn-ghost h-10 text-[14px]">
          이 구도로 숏폼 만들기 → 소재 생성
        </button>
      </div>
      {error && <p className="mt-2 text-[13px] text-bad">{error}</p>}
      {cur && (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <p className="text-[13px] leading-relaxed text-ink-soft">
            <b className="text-ink">잘 된 이유</b> · {cur.why}
          </p>
          <div>
            <p className="mb-1.5 text-[12px] font-semibold text-ink-soft">내일 찍을 숏폼 — {cur.shortform.title}</p>
            <ol className="space-y-1.5 text-[13px]">
              <li className="rounded-lg bg-signal-soft px-3 py-2 text-ink">
                <b>훅</b> {cur.shortform.hook}
              </li>
              {cur.shortform.scenes.map((s, i) => (
                <li key={i} className="rounded-lg bg-canvas px-3 py-2 text-ink-soft">
                  <span className="tabular-nums text-ink-muted">{s.seconds}</span> {s.visual}
                  <span className="block text-ink">“{s.text}”</span>
                </li>
              ))}
              <li className="rounded-lg bg-canvas px-3 py-2 text-ink">
                <b>CTA</b> {cur.shortform.cta}
              </li>
            </ol>
          </div>
          <div className="space-y-1.5">
            <p className="text-[12px] font-semibold text-ink-soft">광고 카피</p>
            <CopyRow label="메타 · 기본 문구" text={cur.metaAd.primaryText} />
            <CopyRow label="메타 · 헤드라인 / 버튼" text={`${cur.metaAd.headline} / ${cur.metaAd.cta}`} />
            <CopyRow label="GFA·비즈보드 · 제목 / 설명" text={`${cur.displayAd.title}\n${cur.displayAd.description}`} />
          </div>
          {cur.shotList.length > 0 && (
            <div>
              <p className="mb-1 text-[12px] font-semibold text-ink-soft">촬영 체크리스트</p>
              <ul className="list-disc space-y-0.5 pl-4 text-[13px] text-ink-soft">
                {cur.shotList.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
