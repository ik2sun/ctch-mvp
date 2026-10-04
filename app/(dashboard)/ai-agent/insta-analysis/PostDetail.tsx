"use client";

import { fmt } from "@/features/ai-report/calcMetrics";
import type { AccountMetrics, PostMetric } from "@/features/brand-analysis/postMetrics";
import { DOW_LABELS, FORMAT_LABELS } from "@/features/brand-analysis/postMetrics";
import type { Diagnosis, PostTag } from "@/features/brand-analysis/diagnosisTypes";
import { PostThumbnail } from "./PostThumbnail";
import { TierBadge } from "./PostTable";

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  const color = tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "text-ink";
  return (
    <div className="rounded-lg border border-line bg-canvas px-3 py-2">
      <p className="text-[13px] text-ink-muted">{label}</p>
      <p className={`font-display text-[17px] font-semibold ${color}`}>{value}</p>
      {sub && <p className="text-[13px] text-ink-muted">{sub}</p>}
    </div>
  );
}

function Tag({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-line py-1.5 text-[13px]">
      <span className="text-ink-muted">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  );
}

export function PostDetail({
  metric,
  index,
  account,
  tag,
  diagnosis,
}: {
  metric: PostMetric | null;
  index: number;
  account: AccountMetrics;
  tag: PostTag | null;
  diagnosis: Diagnosis | null;
}) {
  if (!metric) {
    return (
      <div className="rounded-card border border-dashed border-line bg-surface p-5 text-center text-[15px] text-ink-muted">
        왼쪽 표에서 게시물을 클릭하면 상세 인사이트가 표시돼요.
      </div>
    );
  }

  const { post } = metric;
  const kst = post.timestamp
    ? new Date(post.timestamp).toLocaleString("ko-KR", {
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Seoul",
      })
    : "—";
  const dow = metric.kstDow != null ? `${DOW_LABELS[metric.kstDow]}요일` : "";
  const adCandidate = diagnosis?.adCandidates.find((c) => c.id === post.id);
  const idxTone = metric.erIndex == null ? undefined : metric.erIndex >= 1.3 ? "good" : metric.erIndex <= 0.7 ? "bad" : undefined;

  return (
    <div className="space-y-3 rounded-card border border-line bg-surface p-4">
      <div className="flex gap-3">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-line">
          <PostThumbnail post={post} index={index} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="whitespace-nowrap rounded-full border border-line bg-canvas px-2 py-0.5 text-[13px] text-ink-soft">{FORMAT_LABELS[post.format]}</span>
            <TierBadge tier={metric.tier} erIndex={metric.erIndex} />
            {post.isSponsored && <span className="whitespace-nowrap rounded-full border border-warn/30 bg-warn/10 px-2 py-0.5 text-[13px] text-warn">협찬</span>}
          </div>
          <p className="mt-1.5 text-[13px] text-ink-muted">
            {dow} {kst}
          </p>
          {post.url && (
            <a href={post.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[13px] text-signal hover:underline">
              <i className="ti ti-external-link text-[15px]" aria-hidden /> 게시물 열기
            </a>
          )}
        </div>
      </div>

      {adCandidate && (
        <div className="rounded-lg border border-signal/30 bg-signal-soft px-3 py-2 text-[13px] text-signal">
          <i className="ti ti-ad-2 mr-1 text-[15px]" aria-hidden />
          <span className="font-semibold">광고 소재 추천</span> · {adCandidate.reason}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Stat label="ER" value={fmt(metric.er, "pct")} sub={`계정 중앙값 ${fmt(account.medianEr, "pct")}`} />
        <Stat label="중앙값 대비" value={metric.erIndex != null ? `${metric.erIndex.toFixed(2)}x` : "—"} tone={idxTone} />
        <Stat label="좋아요" value={post.likesHidden ? "비공개" : fmt(post.likes, "int")} />
        <Stat label="댓글" value={fmt(post.comments, "int")} sub={metric.commentRatio != null ? `좋아요 대비 ${fmt(metric.commentRatio, "pct")}` : undefined} />
        {post.videoViews != null && (
          <>
            <Stat label="조회수" value={fmt(post.videoViews, "int")} sub={metric.viewRate != null ? `팔로워 대비 ${fmt(metric.viewRate, "x")}` : undefined} />
            <Stat label="조회 대비 반응" value={fmt(metric.viewEngagement, "pct")} sub="본 사람 중 반응한 비율" />
          </>
        )}
      </div>

      {metric.isRecent && (
        <p className="rounded-lg border border-warn/20 bg-warn/5 px-3 py-2 text-[13px] text-warn">
          게시 48시간 미만이라 반응이 아직 쌓이는 중이에요. 중앙값 비교에서는 제외됐어요.
        </p>
      )}

      <div>
        <p className="mb-1 text-[13px] font-semibold text-ink">AI 태깅</p>
        {tag ? (
          <>
            <Tag label="콘텐츠 유형" value={tag.contentType} />
            <Tag label="훅" value={tag.hookType} />
            <Tag label="CTA" value={tag.ctaType} />
            <p className="mt-2 rounded-lg bg-canvas px-3 py-2 text-[13px] leading-relaxed text-ink-soft">{tag.insight}</p>
          </>
        ) : (
          <p className="text-[13px] text-ink-muted">AI 진단을 실행하면 유형·훅·CTA와 한 줄 인사이트가 표시돼요.</p>
        )}
      </div>

      <div>
        <p className="mb-1 text-[13px] font-semibold text-ink">
          캡션 <span className="font-normal text-ink-muted">{metric.captionLength}자 · 해시태그 {metric.hashtagCount}개 · CTA {metric.hasCta ? "있음" : "없음"}</span>
        </p>
        <p className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-canvas px-3 py-2 text-[13px] leading-relaxed text-ink-soft">
          {post.caption || "(캡션 없음)"}
        </p>
        {post.hashtags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {post.hashtags.map((h) => (
              <span key={h} className="whitespace-nowrap rounded-full border border-line px-2 py-0.5 text-[13px] text-ink-muted">
                {h}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
