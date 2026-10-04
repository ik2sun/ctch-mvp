"use client";

// 인스타 분석 리포트 본문(2026-10-04 2단 개편) — 상단 바(계정 + 전체 AI 분석 실행 마스터 버튼·▾ 메뉴) → 원라인 액션(TL;DR)
// → 2단: 좌 '데이터 요약·지표'(KPI 3×2 · 카테고리 벤치마크 · 포맷 · 시간대) / 우 'AI 진단·시각 분석' → 유형·구조·해시태그 → 게시물 표·상세(+넥스트 베스트 액션).
// 실행 버튼은 상단 마스터 버튼 하나로 모았다(섹션별 버튼 없음).
// 새 분석이든 히스토리에서 연 저장 리포트든 같은 화면. AI 진단 결과는 서버가 히스토리에 함께 저장한다.
import { useEffect, useMemo, useRef, useState } from "react";
import { fmt } from "@/features/ai-report/calcMetrics";
import type { InstagramProfile } from "@/features/brand-analysis/apifyClient";
import { computeAccountMetrics, DOW_LABELS, slotLabel } from "@/features/brand-analysis/postMetrics";
import type { Diagnosis } from "@/features/brand-analysis/diagnosisTypes";
import type { VisualResult } from "@/features/brand-analysis/visualTypes";
import { benchmark, buildActions, postScores, visualComparisons } from "@/features/brand-analysis/insights";
import { BenchmarkCard, NextBestAction, TldrCard, VisualSection } from "./InsightWidgets";
import { ContentTypeBreakdown, FormatBreakdown, HashtagBreakdown, StructureBreakdown, TimeHeatmap } from "./Breakdowns";
import { PostTable } from "./PostTable";
import { PostDetail } from "./PostDetail";

function KpiCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" | "warn" }) {
  const color = tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-ink";
  return (
    <div className="rounded-card border border-line bg-surface px-3.5 py-3">
      <p className="text-[12px] text-ink-muted">{label}</p>
      <p className={`mt-0.5 font-display text-[21px] font-semibold leading-tight ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-[12px] text-ink-muted" title={sub}>{sub}</p>}
    </div>
  );
}

function StatusDot({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] ${on ? "bg-good/10 text-good" : "bg-canvas text-ink-muted"}`}>
      <span aria-hidden>{on ? "✓" : "·"}</span>
      {label}
    </span>
  );
}

const SHADOW = "shadow-[0_1px_3px_rgba(16,24,40,0.06),0_6px_16px_rgba(16,24,40,0.06)]";

export type Peer = { username: string; median_er: number | null; category?: string | null };

export function InstaReport({
  profile,
  initialDiagnosis,
  initialVisual,
  category,
  onCategory,
  peers,
  onDiagnosed,
  header,
}: {
  profile: InstagramProfile;
  initialDiagnosis: Diagnosis | null;
  initialVisual: VisualResult | null;
  category: string | null;
  onCategory: (c: string | null) => Promise<void>;
  peers: Peer[];
  onDiagnosed?: () => void;
  header: {
    avatarSrc: string | null;
    analyzedAt: string;
    isBrand: boolean;
    onBack: () => void;
    onReanalyze: () => void;
    reanalyzing: boolean;
    onMakeBrand?: () => void;
    avatar: React.ReactNode;
  };
}) {
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(initialDiagnosis);
  const [visual, setVisual] = useState<VisualResult | null>(initialVisual);
  const [visualLoading, setVisualLoading] = useState(false);
  const [visualError, setVisualError] = useState<string | null>(null);
  const [runAll, setRunAll] = useState<string | null>(null);
  const [catSaving, setCatSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const metrics = useMemo(() => computeAccountMetrics(profile), [profile]);
  const selected = useMemo(() => {
    if (!selectedId) return null;
    const idx = metrics.posts.findIndex((m) => m.post.id === selectedId);
    return idx >= 0 ? { metric: metrics.posts[idx], index: idx } : null;
  }, [metrics, selectedId]);
  const selectedTag = useMemo(
    () => (diagnosis && selectedId ? (diagnosis.posts.find((t) => t.id === selectedId) ?? null) : null),
    [diagnosis, selectedId],
  );

  async function runDiagnosis(v: VisualResult | null = visual) {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch("/api/brand-analysis/ai-diagnosis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, visual: v }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "AI 진단에 실패했어요.");
      setDiagnosis(json as Diagnosis);
      onDiagnosed?.();
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "오류가 발생했어요.");
    } finally {
      setAiLoading(false);
    }
  }

  async function runVisual(): Promise<VisualResult | null> {
    setVisualLoading(true);
    setVisualError(null);
    try {
      const res = await fetch("/api/brand-analysis/visual", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "이미지 분석에 실패했어요.");
      setVisual(json as VisualResult);
      onDiagnosed?.();
      return json as VisualResult;
    } catch (e) {
      setVisualError(e instanceof Error ? e.message : "오류가 발생했어요.");
      return null;
    } finally {
      setVisualLoading(false);
    }
  }

  // 이미지 분석 → (그 결과를 넣어) AI 진단 순서로 — 진단이 시각 태그까지 근거로 쓰게
  async function runEverything() {
    let v = visual;
    if (!v && !profile.isMock) {
      setRunAll("이미지 분석 중… (1/2)");
      v = await runVisual();
    }
    if (!diagnosis || v !== visual) {
      setRunAll("AI 진단 중… (2/2)");
      await runDiagnosis(v);
    }
    setRunAll(null);
  }

  const comparisons = useMemo(() => visualComparisons(metrics, visual), [metrics, visual]);
  const actions = useMemo(() => buildActions(metrics, diagnosis?.posts ?? null, visual), [metrics, diagnosis, visual]);
  const bench = useMemo(
    () => benchmark(metrics.medianEr, category ? peers.filter((p) => p.category === category && p.username !== profile.username.toLowerCase()) : []),
    [metrics.medianEr, peers, category, profile.username],
  );
  const headline = diagnosis?.headline ?? actions[0]?.text ?? null;
  const scores = useMemo(() => postScores(metrics), [metrics]);
  const selectedVisual = useMemo(() => (visual && selectedId ? (visual.posts.find((v) => v.id === selectedId) ?? null) : null), [visual, selectedId]);

  // 마스터 버튼 ▾ 메뉴
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => menuRef.current && !menuRef.current.contains(e.target as Node) && setMenu(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const anyBusy = !!runAll || aiLoading || visualLoading || header.reanalyzing;
  const masterLabel = runAll ?? (visualLoading ? "이미지 분석 중…" : aiLoading ? "AI 진단 중…" : visual && diagnosis ? "AI 분석 다시 실행" : "전체 AI 분석 실행");

  // 릴스 반응 비중 - 게시 비중: 양수면 릴스가 효율적
  const reelLift =
    metrics && metrics.reelShare != null && metrics.reelEngagementShare != null ? metrics.reelEngagementShare - metrics.reelShare : null;

  const kpis = (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
      <KpiCard label="팔로워" value={fmt(profile.followersCount, "int")} sub={`게시물 ${fmt(profile.postsCount, "int")}개`} />
      <KpiCard
        label="중앙값 ER"
        value={fmt(metrics.medianEr, "pct")}
        sub={bench.medianEr != null && bench.n >= 2 ? `${category} 중앙값 ${fmt(bench.medianEr, "pct")}` : `평균 ${fmt(metrics.avgEr, "pct")} · ${metrics.comparable}개 기준`}
      />
      <KpiCard label="릴스 확산율" value={metrics.avgReelViewRate != null ? fmt(metrics.avgReelViewRate, "x") : "—"} sub="조회수 ÷ 팔로워" />
      <KpiCard
        label="릴스 효율"
        value={reelLift != null ? `${reelLift >= 0 ? "+" : ""}${(reelLift * 100).toFixed(0)}%p` : "—"}
        sub={metrics.reelShare != null ? `게시 ${(metrics.reelShare * 100).toFixed(0)}% → 반응 ${((metrics.reelEngagementShare ?? 0) * 100).toFixed(0)}%` : "릴스 없음"}
        tone={reelLift == null ? undefined : reelLift >= 0.1 ? "good" : reelLift <= -0.1 ? "bad" : undefined}
      />
      <KpiCard label="주간 게시 수" value={metrics.postsPerWeek != null ? metrics.postsPerWeek.toFixed(1) : "—"} sub={metrics.avgGapDays != null ? `평균 ${metrics.avgGapDays.toFixed(1)}일 간격` : undefined} />
      <KpiCard
        label="비교 기준"
        value={scores.mode === "er" ? "참여율" : "댓글 수"}
        sub={scores.mode === "er" ? `분석 ${metrics.postsAnalyzed}개 중 ${scores.score.size}개` : `좋아요 비공개 ${metrics.posts.filter((m) => m.post.likesHidden).length}/${metrics.postsAnalyzed}개`}
        tone={scores.mode === "comments" ? "warn" : undefined}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* 상단 바 — 계정 + 마스터 버튼 */}
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-card bg-surface px-4 py-3 ${SHADOW}`}>
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={header.onBack} className="whitespace-nowrap rounded-lg border border-line px-2.5 py-1.5 text-[13px] text-ink-soft hover:border-ink-faint hover:text-ink">
            ← 히스토리
          </button>
          {header.avatar}
          <div className="min-w-0">
            <p className="truncate text-[16px] font-semibold text-ink">
              @{profile.username}
              {header.isBrand && <span className="ml-2 rounded-full bg-[#FFF3EF] px-2 py-0.5 text-[11px] font-semibold text-[#C2410C]">내 브랜드</span>}
            </p>
            <p className="truncate text-[12px] text-ink-muted">
              {profile.fullName} · {new Date(header.analyzedAt).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })} 수집
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusDot on={!!visual} label="이미지 분석" />
          <StatusDot on={!!diagnosis} label="AI 진단" />
          <div ref={menuRef} className="relative inline-flex">
            <button type="button" onClick={runEverything} disabled={anyBusy} className="btn-signal h-9 rounded-r-none px-4 text-[14px]">
              {masterLabel}
            </button>
            <button type="button" onClick={() => setMenu((v) => !v)} disabled={anyBusy} aria-haspopup="menu" aria-expanded={menu} className="btn-signal h-9 rounded-l-none border-l border-white/30 px-2 text-[14px]" title="실행 항목 고르기">
              ▾
            </button>
            {menu && (
              <div role="menu" className="absolute right-0 top-[40px] z-30 w-[230px] overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-[0_12px_32px_rgba(16,24,40,0.14)]">
                {[
                  { label: "이미지 분석만", hint: "사람·구도·톤·카피 태깅", run: () => runVisual(), off: profile.isMock },
                  { label: "AI 진단만", hint: "유형·훅·CTA·실행 제안", run: () => runDiagnosis() },
                  { label: "게시물 새로 수집", hint: "Apify로 다시 분석(진단은 초기화)", run: header.onReanalyze },
                  ...(header.onMakeBrand && !header.isBrand ? [{ label: "내 브랜드로 지정", hint: "검색창 🔥 버튼으로 바로 분석", run: header.onMakeBrand }] : []),
                ].map((it) => (
                  <button
                    key={it.label}
                    type="button"
                    role="menuitem"
                    disabled={"off" in it && it.off}
                    onClick={() => {
                      setMenu(false);
                      it.run();
                    }}
                    className="block w-full px-3.5 py-2 text-left hover:bg-canvas disabled:opacity-40"
                  >
                    <span className="block text-[14px] text-ink">{it.label}</span>
                    <span className="block text-[12px] text-ink-muted">{it.hint}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {(aiError || visualError) && <p className="rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2 text-[14px] text-bad">{aiError ?? visualError}</p>}
      {profile.isMock && <p className="text-[13px] text-warn">샘플 데이터예요. 서버에 APIFY_API_TOKEN을 설정하면 실제 인스타그램 데이터로 표시돼요.</p>}

      <TldrCard headline={headline} source={diagnosis?.headline ? "ai" : "rule"} actions={actions} status={{ visual: !!visual || profile.isMock, diagnosis: !!diagnosis }} />

      {/* 2단 — 좌: 데이터 요약·지표 / 우: AI 진단·시각 분석 */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-4">
          <p className="text-[13px] font-semibold text-ink-soft">데이터 요약·지표</p>
          {kpis}
          <BenchmarkCard
            myEr={metrics.medianEr}
            bench={bench}
            category={category}
            saving={catSaving}
            onCategory={async (c) => {
              setCatSaving(true);
              await onCategory(c);
              setCatSaving(false);
            }}
          />
          <FormatBreakdown metrics={metrics} />
          <TimeHeatmap metrics={metrics} />
        </div>

        <div className="space-y-4">
          <p className="text-[13px] font-semibold text-ink-soft">AI 진단·시각 분석</p>
          {/* AI 퍼포먼스 진단 */}
          <div className="rounded-card border border-line bg-surface p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-[16px] font-semibold text-ink">AI 퍼포먼스 진단</h3>
              <p className="text-[12px] text-ink-muted">{aiLoading ? "진단 중… (30~60초)" : diagnosis ? "게시물별 유형·훅·CTA 태깅 완료" : "분석 전"}</p>
            </div>
            {diagnosis ? (
              <div className="mt-2.5 space-y-2.5">
                <p className="text-[14px] leading-relaxed text-ink">{diagnosis.summary}</p>
                <div className="grid gap-2.5 md:grid-cols-2">
                  <div className="rounded-lg border border-good/20 bg-good/5 px-3 py-2.5">
                    <p className="mb-0.5 text-[12px] font-semibold text-good">↗ 잘 되는 게시물의 공통점</p>
                    <p className="text-[14px] leading-relaxed text-ink-soft">{diagnosis.winningPattern}</p>
                  </div>
                  <div className="rounded-lg border border-bad/20 bg-bad/5 px-3 py-2.5">
                    <p className="mb-0.5 text-[12px] font-semibold text-bad">↘ 안 되는 게시물의 공통점</p>
                    <p className="text-[14px] leading-relaxed text-ink-soft">{diagnosis.losingPattern}</p>
                  </div>
                  <div className="rounded-lg border border-line bg-canvas px-3 py-2.5">
                    <p className="mb-1 text-[12px] font-semibold text-ink">실행 제안</p>
                    <ol className="space-y-1 text-[14px] leading-relaxed text-ink-soft">
                      {diagnosis.suggestions.map((t, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-signal/15 text-[12px] font-semibold text-signal">{i + 1}</span>
                          <span>{t}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div className="rounded-lg border border-line bg-canvas px-3 py-2.5">
                    <p className="mb-1 text-[12px] font-semibold text-ink">광고 소재 후보</p>
                    {diagnosis.adCandidates.length === 0 ? (
                      <p className="text-[13px] text-ink-muted">상위 등급 게시물 중 소재화 추천이 없어요.</p>
                    ) : (
                      <ul className="space-y-1 text-[14px] text-ink-soft">
                        {diagnosis.adCandidates.map((c) => {
                          const v = scores.score.get(c.id);
                          return (
                            <li key={c.id}>
                              <button onClick={() => setSelectedId(c.id)} className="text-left hover:text-signal">
                                <span className="font-medium text-ink">{v != null ? `${v.toFixed(2)}x` : "게시물"}</span> · {c.reason}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-2.5 rounded-lg border border-dashed border-line bg-canvas px-3 py-3 text-[13px] text-ink-muted">
                우측 상단 ‘전체 AI 분석 실행’을 누르면 게시물마다 콘텐츠 유형·훅·CTA를 태깅하고, 상위·하위 게시물의 공통점과 실행 제안·광고 소재 후보를 정리해요.
                {metrics.bestSlot && ` 지금 데이터에서 반응이 가장 좋은 시간대는 ${DOW_LABELS[metrics.bestSlot.dow]}요일 ${slotLabel(metrics.bestSlot.slot)}예요.`}
              </p>
            )}
          </div>
          <VisualSection comparisons={comparisons} analyzed={visual?.analyzed ?? 0} skipped={visual?.skipped ?? 0} busy={visualLoading} isMock={profile.isMock} byComments={scores.mode === "comments"} />
        </div>
      </div>

      {/* 유형·구조·해시태그 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ContentTypeBreakdown metrics={metrics} tags={diagnosis?.posts ?? null} />
        <StructureBreakdown metrics={metrics} />
      </div>
      <HashtagBreakdown metrics={metrics} />

      {/* 게시물 테이블 + 상세 */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <PostTable posts={metrics.posts} tags={diagnosis?.posts ?? null} selectedId={selectedId} onSelect={setSelectedId} />
        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <PostDetail metric={selected?.metric ?? null} index={selected?.index ?? 0} account={metrics} tag={selectedTag} diagnosis={diagnosis} />
          <NextBestAction profile={profile} metric={selected?.metric ?? null} tag={selectedTag} visual={selectedVisual} isTop={selectedId ? (scores.score.get(selectedId) ?? 0) >= 1.3 : false} />
        </div>
      </div>
    </div>
  );
}
