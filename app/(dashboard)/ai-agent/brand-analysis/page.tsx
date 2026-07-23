"use client";

import { useState } from "react";
import { fmt } from "@/features/ai-report/calcMetrics";
import type { InstagramPost, InstagramProfile } from "@/features/brand-analysis/apifyClient";

type Diagnosis = {
  toneAndManner: string;
  contentPattern: string;
  engagementLevel: string;
  suggestions: string[];
};

function DiagCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-line bg-canvas p-4">
      <p className="mb-1.5 text-[13px] font-semibold text-ink">{title}</p>
      <div className="text-[13px] leading-relaxed text-ink-soft">{children}</div>
    </div>
  );
}

// 실제 썸네일이 없거나 로드 실패 시 인스타그램 느낌의 그라데이션 박스로 대체
const THUMB_GRADIENTS = [
  "linear-gradient(135deg, #ec4899, #f472b6)", // 핑크
  "linear-gradient(135deg, #8b5cf6, #a78bfa)", // 퍼플
  "linear-gradient(135deg, #f97316, #fb923c)", // 오렌지
  "linear-gradient(135deg, #3b82f6, #60a5fa)", // 블루
];

function PostThumbnail({ post, index }: { post: InstagramPost; index: number }) {
  const [failed, setFailed] = useState(false);

  if (!post.thumbnail || failed) {
    return (
      <div
        className="flex h-full w-full items-center justify-center"
        style={{ background: THUMB_GRADIENTS[index % THUMB_GRADIENTS.length] }}
      >
        <i className="ti ti-brand-instagram text-[28px] text-white/80" aria-hidden />
      </div>
    );
  }

  return (
    <img
      src={post.thumbnail}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover"
    />
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

  const cards = profile
    ? [
        { label: "팔로워 수", value: fmt(profile.followersCount, "int") },
        { label: "팔로잉", value: fmt(profile.followingCount, "int") },
        { label: "게시물 수", value: fmt(profile.postsCount, "int") },
        { label: "평균 인게이지먼트율", value: fmt(profile.avgEngagementRate, "pct") },
      ]
    : [];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
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

      {profile && (
        <>
          {/* 지표 카드 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {cards.map((c) => (
              <div key={c.label} className="rounded-card border border-line bg-surface p-4">
                <p className="text-[12px] text-ink-muted">{c.label}</p>
                <p className="mt-0.5 font-display text-[22px] font-semibold text-ink">{c.value}</p>
              </div>
            ))}
          </div>
          {profile.isMock && (
            <p className="text-[11px] text-warn">
              샘플 데이터예요. 서버에 APIFY_API_TOKEN을 설정하면 실제 인스타그램 데이터로 표시돼요.
            </p>
          )}

          {/* 최근 게시물 */}
          <div className="rounded-card border border-line bg-surface p-5">
            <p className="mb-3 text-[13px] font-medium text-ink-soft">
              최근 게시물 <span className="font-normal text-ink-muted">{profile.posts.length}개</span>
            </p>
            {profile.posts.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-ink-muted">게시물 데이터가 없어요.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {profile.posts.map((p, i) => (
                  <div key={p.id} className="group relative aspect-square overflow-hidden rounded-lg border border-line">
                    <PostThumbnail post={p} index={i} />
                    <div className="absolute inset-0 flex items-center justify-center gap-4 bg-black/55 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                      <span className="flex items-center gap-1 text-[14px] font-semibold text-white">
                        <i className="ti ti-heart-filled text-[16px]" aria-hidden /> {fmt(p.likes, "int")}
                      </span>
                      <span className="flex items-center gap-1 text-[14px] font-semibold text-white">
                        <i className="ti ti-message-circle-filled text-[16px]" aria-hidden /> {fmt(p.comments, "int")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AI 진단 */}
          <div className="rounded-card border border-line bg-surface p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[13px] font-medium text-ink-soft">AI 진단 리포트</span>
              <button onClick={runDiagnosis} disabled={aiLoading} className="btn-signal h-9 px-3 text-[13px]">
                <i className={`ti ${aiLoading ? "ti-loader-2 animate-spin" : "ti-sparkles"} text-[15px]`} aria-hidden />
                {aiLoading ? "진단 중…" : diagnosis ? "다시 진단" : "AI 진단 실행"}
              </button>
            </div>

            {aiError && (
              <p className="rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2.5 text-[13px] text-bad">{aiError}</p>
            )}

            {!diagnosis && !aiError && (
              <p className="py-6 text-center text-[13px] text-ink-muted">
                &quot;AI 진단 실행&quot;을 누르면 브랜드 톤앤매너·콘텐츠 패턴·인게이지먼트 수준·개선 제안을 분석해요.
              </p>
            )}

            {diagnosis && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <DiagCard title="브랜드 톤앤매너">{diagnosis.toneAndManner}</DiagCard>
                <DiagCard title="콘텐츠 패턴">{diagnosis.contentPattern}</DiagCard>
                <DiagCard title="인게이지먼트 수준">{diagnosis.engagementLevel}</DiagCard>
                <DiagCard title="개선 제안">
                  <ul className="list-inside list-disc space-y-1">
                    {diagnosis.suggestions.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </DiagCard>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
