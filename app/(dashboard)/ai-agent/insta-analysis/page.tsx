"use client";

import { useMemo, useState } from "react";
import { fmt } from "@/features/ai-report/calcMetrics";
import type { InstagramProfile } from "@/features/brand-analysis/apifyClient";
import { computeAccountMetrics, DOW_LABELS, slotLabel } from "@/features/brand-analysis/postMetrics";
import type { Diagnosis } from "@/features/brand-analysis/diagnosisTypes";
import { ContentTypeBreakdown, FormatBreakdown, HashtagBreakdown, StructureBreakdown, TimeHeatmap } from "./Breakdowns";
import { PostTable } from "./PostTable";
import { PostDetail } from "./PostDetail";

function KpiCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" | "warn" }) {
  const color = tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-ink";
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <p className="text-[12px] text-ink-muted">{label}</p>
      <p className={`mt-0.5 font-display text-[22px] font-semibold ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-ink-muted">{sub}</p>}
    </div>
  );
}

export default function BrandAnalysisPage() {
  const [input, setInput] = useState("");
  const [profile, setProfile] = useState<InstagramProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const metrics = useMemo(() => (profile ? computeAccountMetrics(profile) : null), [profile]);
  const selected = useMemo(() => {
    if (!metrics || !selectedId) return null;
    const idx = metrics.posts.findIndex((m) => m.post.id === selectedId);
    return idx >= 0 ? { metric: metrics.posts[idx], index: idx } : null;
  }, [metrics, selectedId]);
  const selectedTag = useMemo(
    () => (diagnosis && selectedId ? (diagnosis.posts.find((t) => t.id === selectedId) ?? null) : null),
    [diagnosis, selectedId],
  );

  async function runAnalyze() {
    if (!input.trim()) {
      setError("인스타그램 URL 또는 @계정명을 입력해 주세요.");
      return;
    }
    setLoading(true);
    setError(null);
    setProfile(null);
    setDiagnosis(null);
    setAiError(null);
    setSelectedId(null);
    try {
      const res = await fetch("/api/brand-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "분석에 실패했어요.");
      setProfile(json as InstagramProfile);
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했어요.");
    } finally {
      setLoading(false);
    }
  }

  async function runDiagnosis() {
    if (!profile) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch("/api/brand-analysis/ai-diagnosis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "AI 진단에 실패했어요.");
      setDiagnosis(json as Diagnosis);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "오류가 발생했어요.");
    } finally {
      setAiLoading(false);
    }
  }

  // 릴스 반응 비중 - 게시 비중: 양수면 릴스가 효율적
  const reelLift =
    metrics && metrics.reelShare != null && metrics.reelEngagementShare != null ? metrics.reelEngagementShare - metrics.reelShare : null;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* 계정 입력 */}
      <div className="rounded-card border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2">
          <i className="ti ti-brand-instagram text-[18px] text-signal" aria-hidden />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runAnalyze()}
            placeholder="인스타그램 URL 또는 @계정명 (예: @nike)"
            className="field h-10 min-w-[240px] flex-1"
          />
          <button onClick={runAnalyze} disabled={loading} className="btn-signal h-10">
            <i className={`ti ${loading ? "ti-loader-2 animate-spin" : "ti-search"} text-[16px]`} aria-hidden />
            {loading ? "분석 중…" : "분석 시작"}
          </button>
        </div>
        {error && (
          <p className="mt-3 rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2.5 text-[13px] text-bad">{error}</p>
        )}
      </div>

      {profile && metrics && (
        <>
          {/* 계정 KPI */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <KpiCard label="팔로워" value={fmt(profile.followersCount, "int")} sub={`게시물 ${fmt(profile.postsCount, "int")}개`} />
            <KpiCard label="중앙값 ER" value={fmt(metrics.medianEr, "pct")} sub={`평균 ${fmt(metrics.avgEr, "pct")} · ${metrics.comparable}개 기준`} />
            <KpiCard
              label="릴스 확산율"
              value={metrics.avgReelViewRate != null ? fmt(metrics.avgReelViewRate, "x") : "—"}
              sub="조회수 ÷ 팔로워"
            />
            <KpiCard
              label="릴스 효율"
              value={reelLift != null ? `${reelLift >= 0 ? "+" : ""}${(reelLift * 100).toFixed(0)}%p` : "—"}
              sub={
                metrics.reelShare != null
                  ? `게시 ${(metrics.reelShare * 100).toFixed(0)}% → 반응 ${((metrics.reelEngagementShare ?? 0) * 100).toFixed(0)}%`
                  : "릴스 없음"
              }
              tone={reelLift == null ? undefined : reelLift >= 0.1 ? "good" : reelLift <= -0.1 ? "bad" : undefined}
            />
            <KpiCard
              label="주간 게시 수"
              value={metrics.postsPerWeek != null ? metrics.postsPerWeek.toFixed(1) : "—"}
              sub={metrics.avgGapDays != null ? `평균 ${metrics.avgGapDays.toFixed(1)}일 간격` : undefined}
            />
            <KpiCard
              label="상위 20% 반응 점유"
              value={metrics.topShare != null ? fmt(metrics.topShare, "x") : "—"}
              sub="높을수록 소수 게시물 의존"
              tone={metrics.topShare != null && metrics.topShare >= 0.5 ? "warn" : undefined}
            />
          </div>
          {profile.isMock && (
            <p className="text-[11px] text-warn">
              샘플 데이터예요. 서버에 APIFY_API_TOKEN을 설정하면 실제 인스타그램 데이터로 표시돼요.
            </p>
          )}

          {/* AI 퍼포먼스 진단 */}
          <div className="rounded-card border border-line bg-surface p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <span className="text-[13px] font-medium text-ink-soft">AI 퍼포먼스 진단</span>
                <p className="text-[11px] text-ink-muted">게시물별 유형·훅·CTA 태깅과 상위/하위 패턴, 광고 소재 후보를 뽑아요</p>
              </div>
              <button onClick={runDiagnosis} disabled={aiLoading} className="btn-signal h-9 px-3 text-[13px]">
                <i className={`ti ${aiLoading ? "ti-loader-2 animate-spin" : "ti-sparkles"} text-[15px]`} aria-hidden />
                {aiLoading ? "진단 중…" : diagnosis ? "다시 진단" : "AI 진단 실행"}
              </button>
            </div>

            {aiError && (
              <p className="mb-3 rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2.5 text-[13px] text-bad">{aiError}</p>
            )}

            {diagnosis ? (
              <div className="space-y-3">
                <p className="text-[13px] leading-relaxed text-ink">{diagnosis.summary}</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-good/20 bg-good/5 p-3.5">
                    <p className="mb-1 text-[12px] font-semibold text-good">
                      <i className="ti ti-trending-up mr-1" aria-hidden />
                      잘 되는 게시물의 공통점
                    </p>
                    <p className="text-[13px] leading-relaxed text-ink-soft">{diagnosis.winningPattern}</p>
                  </div>
                  <div className="rounded-lg border border-bad/20 bg-bad/5 p-3.5">
                    <p className="mb-1 text-[12px] font-semibold text-bad">
                      <i className="ti ti-trending-down mr-1" aria-hidden />
                      안 되는 게시물의 공통점
                    </p>
                    <p className="text-[13px] leading-relaxed text-ink-soft">{diagnosis.losingPattern}</p>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-line bg-canvas p-3.5">
                    <p className="mb-1.5 text-[12px] font-semibold text-ink">실행 제안</p>
                    <ol className="space-y-1.5 text-[13px] leading-relaxed text-ink-soft">
                      {diagnosis.suggestions.map((s, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-signal/15 text-[11px] font-semibold text-signal">
                            {i + 1}
                          </span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div className="rounded-lg border border-line bg-canvas p-3.5">
                    <p className="mb-1.5 text-[12px] font-semibold text-ink">
                      <i className="ti ti-ad-2 mr-1 text-signal" aria-hidden />
                      광고 소재 후보
                    </p>
                    {diagnosis.adCandidates.length === 0 ? (
                      <p className="text-[12px] text-ink-muted">상위 등급 게시물 중 소재화 추천이 없어요.</p>
                    ) : (
                      <ul className="space-y-1.5 text-[13px] text-ink-soft">
                        {diagnosis.adCandidates.map((c) => {
                          const m = metrics.posts.find((p) => p.post.id === c.id);
                          return (
                            <li key={c.id}>
                              <button onClick={() => setSelectedId(c.id)} className="text-left hover:text-signal">
                                <span className="font-medium text-ink">
                                  {m ? `${m.erIndex?.toFixed(2) ?? "—"}x` : c.id}
                                </span>{" "}
                                · {c.reason}
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
              <div className="rounded-lg border border-dashed border-line bg-canvas p-4 text-[13px] text-ink-muted">
                아래 지표는 이미 계산됐어요. AI 진단을 실행하면 게시물마다 콘텐츠 유형·훅·CTA를 태깅하고, 상위·하위 게시물의 공통점과 실행 제안을 정리해요.
                {metrics.bestSlot && (
                  <span className="mt-1 block">
                    참고로 현재 데이터에서 반응이 가장 좋은 시간대는 {DOW_LABELS[metrics.bestSlot.dow]}요일 {slotLabel(metrics.bestSlot.slot)}예요.
                  </span>
                )}
              </div>
            )}
          </div>

          {/* 분해 분석 */}
          <div className="grid gap-4 lg:grid-cols-2">
            <FormatBreakdown metrics={metrics} />
            <ContentTypeBreakdown metrics={metrics} tags={diagnosis?.posts ?? null} />
            <TimeHeatmap metrics={metrics} />
            <StructureBreakdown metrics={metrics} />
          </div>
          <HashtagBreakdown metrics={metrics} />

          {/* 게시물 테이블 + 상세 */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <PostTable posts={metrics.posts} tags={diagnosis?.posts ?? null} selectedId={selectedId} onSelect={setSelectedId} />
            <div className="lg:sticky lg:top-4 lg:self-start">
              <PostDetail
                metric={selected?.metric ?? null}
                index={selected?.index ?? 0}
                account={metrics}
                tag={selectedTag}
                diagnosis={diagnosis}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
