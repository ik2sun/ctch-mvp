// 인스타그램 게시물 퍼포먼스 지표 계산 — 서버(AI 진단)와 클라이언트(화면) 양쪽에서 사용하는 순수 함수
import type { InstagramPost, InstagramProfile, PostFormat } from "./apifyClient";

export type PostTier = "top" | "mid" | "low" | "new" | "na";

export type PostMetric = {
  post: InstagramPost;
  er: number | null; // (좋아요+댓글)/팔로워
  erIndex: number | null; // 계정 중앙값 대비 배수
  tier: PostTier;
  viewRate: number | null; // 조회수/팔로워 (릴스 확산율)
  viewEngagement: number | null; // (좋아요+댓글)/조회수
  commentRatio: number | null; // 댓글/좋아요
  ageHours: number | null;
  isRecent: boolean; // 48시간 미만 — 반응이 쌓이는 중이라 비교에서 제외
  kstDow: number | null; // 0=일 … 6=토
  kstHour: number | null;
  captionLength: number;
  hashtagCount: number;
  hasCta: boolean;
  hasMention: boolean;
};

export type Bucket = { label: string; count: number; avgEr: number | null; engagementShare: number };

export type FormatBreakdown = Bucket & {
  format: PostFormat;
  avgViewRate: number | null;
};

export type HeatCell = { dow: number; slot: number; count: number; avgEr: number | null };

export type HashtagPerf = { tag: string; count: number; avgEr: number | null; erIndex: number | null };

export type AccountMetrics = {
  followers: number;
  postsAnalyzed: number;
  comparable: number; // 중앙값 계산에 쓰인 게시물 수
  medianEr: number | null;
  avgEr: number | null;
  avgReelViewRate: number | null;
  reelShare: number | null; // 게시물 수 비중
  reelEngagementShare: number | null; // 반응 비중
  postsPerWeek: number | null;
  avgGapDays: number | null;
  topShare: number | null; // 상위 20% 게시물이 가져가는 반응 비중
  bestSlot: { dow: number; slot: number; avgEr: number } | null;
  formats: FormatBreakdown[];
  heatmap: HeatCell[];
  captionBuckets: Bucket[];
  hashtagBuckets: Bucket[];
  ctaSplit: Bucket[];
  mentionSplit: Bucket[];
  hashtagPerformance: HashtagPerf[];
  posts: PostMetric[];
};

export const RECENT_HOURS = 48;
export const SLOT_HOURS = 4; // 4시간 단위 6구간
export const SLOT_COUNT = 24 / SLOT_HOURS;
export const DOW_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
export const FORMAT_LABELS: Record<PostFormat, string> = { reel: "릴스", image: "이미지", carousel: "캐러셀" };
export const TIER_LABELS: Record<PostTier, string> = {
  top: "상위",
  mid: "평균",
  low: "하위",
  new: "집계중",
  na: "비공개",
};

const CTA_PATTERN =
  /링크|프로필|댓글|참여|이벤트|응모|구매|주문|신청|예약|DM|디엠|스토어|저장|공유|태그해|친구|문의|자세히|확인해|클릭|shop|link in bio|swipe|save|share|tag a friend|comment/i;

export function slotLabel(slot: number): string {
  const start = slot * SLOT_HOURS;
  return `${String(start).padStart(2, "0")}-${String(start + SLOT_HOURS).padStart(2, "0")}시`;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function safeDiv(a: number, b: number): number | null {
  return b > 0 ? a / b : null;
}

function engagementOf(p: InstagramPost): number {
  return (p.likesHidden ? 0 : p.likes) + p.comments;
}

function bucketOf(label: string, items: PostMetric[], totalEngagement: number): Bucket {
  const ers = items.map((m) => m.er).filter((v): v is number => v != null);
  const eng = items.reduce((s, m) => s + engagementOf(m.post), 0);
  return {
    label,
    count: items.length,
    avgEr: mean(ers),
    engagementShare: totalEngagement > 0 ? eng / totalEngagement : 0,
  };
}

export function computeAccountMetrics(profile: InstagramProfile, now: number = Date.now()): AccountMetrics {
  const followers = profile.followersCount;
  const posts = profile.posts ?? [];

  const base: PostMetric[] = posts.map((post) => {
    const ts = post.timestamp ? new Date(post.timestamp).getTime() : NaN;
    const hasTs = !isNaN(ts);
    const ageHours = hasTs ? (now - ts) / 3600000 : null;
    const kst = hasTs ? new Date(ts + 9 * 3600000) : null;
    const engagement = engagementOf(post);
    const er = post.likesHidden ? null : safeDiv(engagement, followers);
    const views = post.videoViews;
    return {
      post,
      er,
      erIndex: null,
      tier: "na",
      viewRate: views != null ? safeDiv(views, followers) : null,
      viewEngagement: views != null && views > 0 && !post.likesHidden ? engagement / views : null,
      commentRatio: post.likesHidden ? null : safeDiv(post.comments, post.likes),
      ageHours,
      isRecent: ageHours != null && ageHours < RECENT_HOURS,
      kstDow: kst ? kst.getUTCDay() : null,
      kstHour: kst ? kst.getUTCHours() : null,
      captionLength: post.caption.length,
      hashtagCount: post.hashtags.length,
      hasCta: CTA_PATTERN.test(post.caption),
      hasMention: post.mentions.length > 0,
    };
  });

  // 중앙값: 48시간 지난 게시물 기준. 전부 최근 게시물이면 전체로 대체
  let comparable = base.filter((m) => m.er != null && !m.isRecent);
  if (!comparable.length) comparable = base.filter((m) => m.er != null);
  const medianEr = median(comparable.map((m) => m.er as number));

  const metrics: PostMetric[] = base.map((m) => {
    if (m.er == null) return { ...m, tier: "na" };
    const erIndex = medianEr && medianEr > 0 ? m.er / medianEr : null;
    let tier: PostTier = "mid";
    if (m.isRecent) tier = "new";
    else if (erIndex != null && erIndex >= 1.3) tier = "top";
    else if (erIndex != null && erIndex <= 0.7) tier = "low";
    return { ...m, erIndex, tier };
  });

  const withEr = metrics.filter((m) => m.er != null);
  const totalEngagement = metrics.reduce((s, m) => s + engagementOf(m.post), 0);

  // 포맷별 분해
  const formats: FormatBreakdown[] = (["reel", "carousel", "image"] as PostFormat[])
    .map((format) => {
      const items = metrics.filter((m) => m.post.format === format);
      const viewRates = items.map((m) => m.viewRate).filter((v): v is number => v != null);
      return { ...bucketOf(FORMAT_LABELS[format], items, totalEngagement), format, avgViewRate: mean(viewRates) };
    })
    .filter((f) => f.count > 0);

  const reels = metrics.filter((m) => m.post.format === "reel");
  const reelBucket = formats.find((f) => f.format === "reel");

  // 요일 × 시간대 히트맵 (KST)
  const heatmap: HeatCell[] = [];
  for (let dow = 0; dow < 7; dow++) {
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      const items = withEr.filter(
        (m) => m.kstDow === dow && m.kstHour != null && Math.floor(m.kstHour / SLOT_HOURS) === slot,
      );
      heatmap.push({ dow, slot, count: items.length, avgEr: mean(items.map((m) => m.er as number)) });
    }
  }
  const bestCell = heatmap
    .filter((c) => c.count >= 2 && c.avgEr != null)
    .sort((a, b) => (b.avgEr as number) - (a.avgEr as number))[0];

  // 게시 주기
  const times = metrics
    .map((m) => (m.post.timestamp ? new Date(m.post.timestamp).getTime() : NaN))
    .filter((t) => !isNaN(t))
    .sort((a, b) => a - b);
  let postsPerWeek: number | null = null;
  let avgGapDays: number | null = null;
  if (times.length >= 2) {
    const spanDays = (times[times.length - 1] - times[0]) / 86400000;
    avgGapDays = spanDays / (times.length - 1);
    postsPerWeek = spanDays > 0 ? (times.length / spanDays) * 7 : null;
  }

  // 상위 20% 게시물 반응 점유율
  let topShare: number | null = null;
  if (withEr.length >= 5 && totalEngagement > 0) {
    const sorted = [...withEr].sort((a, b) => engagementOf(b.post) - engagementOf(a.post));
    const n = Math.max(1, Math.round(sorted.length * 0.2));
    topShare = sorted.slice(0, n).reduce((s, m) => s + engagementOf(m.post), 0) / totalEngagement;
  }

  // 캡션 구조
  const captionBuckets: Bucket[] = [
    bucketOf("짧음 (80자 미만)", metrics.filter((m) => m.captionLength < 80), totalEngagement),
    bucketOf("보통 (80~300자)", metrics.filter((m) => m.captionLength >= 80 && m.captionLength < 300), totalEngagement),
    bucketOf("김 (300자 이상)", metrics.filter((m) => m.captionLength >= 300), totalEngagement),
  ].filter((b) => b.count > 0);

  const hashtagBuckets: Bucket[] = [
    bucketOf("0개", metrics.filter((m) => m.hashtagCount === 0), totalEngagement),
    bucketOf("1~5개", metrics.filter((m) => m.hashtagCount >= 1 && m.hashtagCount <= 5), totalEngagement),
    bucketOf("6~10개", metrics.filter((m) => m.hashtagCount >= 6 && m.hashtagCount <= 10), totalEngagement),
    bucketOf("11개 이상", metrics.filter((m) => m.hashtagCount >= 11), totalEngagement),
  ].filter((b) => b.count > 0);

  const ctaSplit: Bucket[] = [
    bucketOf("CTA 있음", metrics.filter((m) => m.hasCta), totalEngagement),
    bucketOf("CTA 없음", metrics.filter((m) => !m.hasCta), totalEngagement),
  ].filter((b) => b.count > 0);

  const mentionSplit: Bucket[] = [
    bucketOf("멘션/협업 있음", metrics.filter((m) => m.hasMention), totalEngagement),
    bucketOf("멘션 없음", metrics.filter((m) => !m.hasMention), totalEngagement),
  ].filter((b) => b.count > 0);

  // 해시태그별 성과 (2회 이상 사용된 태그만)
  const tagMap = new Map<string, number[]>();
  for (const m of withEr) {
    for (const tag of m.post.hashtags) {
      const arr = tagMap.get(tag) ?? [];
      arr.push(m.er as number);
      tagMap.set(tag, arr);
    }
  }
  const hashtagPerformance: HashtagPerf[] = [...tagMap.entries()]
    .filter(([, ers]) => ers.length >= 2)
    .map(([tag, ers]) => {
      const avgEr = mean(ers);
      return { tag, count: ers.length, avgEr, erIndex: avgEr != null && medianEr ? avgEr / medianEr : null };
    })
    .sort((a, b) => (b.avgEr ?? 0) - (a.avgEr ?? 0))
    .slice(0, 12);

  return {
    followers,
    postsAnalyzed: metrics.length,
    comparable: comparable.length,
    medianEr,
    avgEr: mean(withEr.map((m) => m.er as number)),
    avgReelViewRate: reelBucket?.avgViewRate ?? null,
    reelShare: metrics.length ? reels.length / metrics.length : null,
    reelEngagementShare: reelBucket ? reelBucket.engagementShare : null,
    postsPerWeek,
    avgGapDays,
    topShare,
    bestSlot: bestCell ? { dow: bestCell.dow, slot: bestCell.slot, avgEr: bestCell.avgEr as number } : null,
    formats,
    heatmap,
    captionBuckets,
    hashtagBuckets,
    ctaSplit,
    mentionSplit,
    hashtagPerformance,
    posts: metrics,
  };
}
