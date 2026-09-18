// 인스타그램 프로필 수집 — Apify actor 호출 로직을 별도 분리
// APIFY_API_TOKEN이 없는 환경(로컬/데모)에서는 목데이터로 자동 대체됩니다.

const ACTOR_ID = "apify/instagram-profile-scraper".replace("/", "~");
const API_VERSION = "v2";
const MAX_POSTS = 50;

export type PostFormat = "reel" | "image" | "carousel";

export type InstagramPost = {
  id: string;
  shortCode: string;
  url: string;
  thumbnail: string;
  likes: number;
  likesHidden: boolean; // 좋아요 비공개 계정은 Apify가 -1로 내려줌
  comments: number;
  caption: string;
  hashtags: string[];
  mentions: string[];
  altText: string;
  mediaType?: string;
  format: PostFormat;
  timestamp: string | null; // ISO 문자열
  videoViews: number | null; // 릴스/동영상 조회수
  videoDuration: number | null; // 초
  isSponsored: boolean;
};

export type InstagramProfile = {
  username: string;
  fullName: string;
  profilePicUrl: string;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  avgEngagementRate: number; // 0~1 비율
  posts: InstagramPost[];
  isMock: boolean;
};

// "@계정명" 또는 인스타그램 URL 모두 허용
export function parseInstagramInput(input: string): string {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  if (urlMatch) return urlMatch[1];
  return trimmed.replace(/^@/, "");
}

function num(v: unknown): number {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function extractHashtags(caption: string, extraTags: unknown[] = []): string[] {
  const tagSet = new Set<string>();

  const matches = String(caption ?? "").match(/#[\w가-힣]+/g) ?? [];
  for (const tag of matches) tagSet.add(tag.toLowerCase());

  for (const raw of extraTags) {
    const tag = String(raw ?? "").trim().replace(/^#/, "");
    if (tag) tagSet.add(`#${tag.toLowerCase()}`);
  }

  return [...tagSet].slice(0, 30);
}

function extractMentions(caption: string, extra: unknown[] = []): string[] {
  const set = new Set<string>();
  const matches = String(caption ?? "").match(/@[A-Za-z0-9._]+/g) ?? [];
  for (const m of matches) set.add(m.toLowerCase());
  for (const raw of extra) {
    const m = String(raw ?? "").trim().replace(/^@/, "");
    if (m) set.add(`@${m.toLowerCase()}`);
  }
  return [...set].slice(0, 20);
}

function normalizeCaption(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map((entry) => String(entry ?? "")).join(" ").trim();
  return "";
}

// Apify 필드: type(Image/Video/Sidecar), productType(clips=릴스, feed)
function detectFormat(p: Record<string, unknown>): PostFormat {
  const type = String(p.type ?? p.mediaType ?? "").toLowerCase();
  const productType = String(p.productType ?? "").toLowerCase();
  if (productType === "clips" || type === "video" || type === "reel") return "reel";
  if (type === "sidecar" || type === "carousel" || type === "carousel_album") return "carousel";
  if (Array.isArray(p.childPosts) && p.childPosts.length > 1) return "carousel";
  return "image";
}

function toIso(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "number") {
    // 초 단위 epoch도 방어
    const ms = v < 1e12 ? v * 1000 : v;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// 결정적 의사난수 — 목데이터가 매번 같은 모양으로 나오도록
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function mockProfile(username: string): InstagramProfile {
  const rand = seeded(username.length * 7 + 13);
  const followersCount = 12500;
  const now = Date.now();
  const themes = [
    "신제품 런칭 소식! 오늘부터 온라인 스토어에서 만나보세요. 프로필 링크 확인 #신제품 #런칭 #브랜드",
    "이번 주말 이벤트 🎁 댓글로 친구 태그하면 추첨을 통해 선물을 드려요 #이벤트 #선물 #참여",
    "고객님이 보내주신 착용샷 💛 여러분의 일상에 함께해서 기뻐요 #후기 #데일리룩 #ootd",
    "브랜드가 지켜온 원칙 세 가지. 우리가 만드는 이유에 대해 이야기합니다 #브랜드스토리 #가치",
    "촬영 현장 비하인드 🎬 팀원들의 진지한 모습 #비하인드 #메이킹",
    "@influencer_kim 님과 함께한 콜라보 콘텐츠 ✨ #콜라보 #협업 #추천",
    "알아두면 쓸모있는 관리 팁 5가지, 저장해두고 보세요 #꿀팁 #정보 #저장",
    "이 컬러 어떠세요? 여름 시즌 한정 컬러 공개 #여름 #한정판 #컬러",
  ];
  const posts: InstagramPost[] = Array.from({ length: 24 }).map((_, i) => {
    const caption = themes[i % themes.length];
    const format: PostFormat = i % 3 === 0 ? "reel" : i % 4 === 1 ? "carousel" : "image";
    const daysAgo = i * 2.4 + rand() * 1.5;
    const ts = new Date(now - daysAgo * 86400000);
    ts.setUTCHours(Math.floor(rand() * 24), 0, 0, 0);
    const base = format === "reel" ? 620 : format === "carousel" ? 470 : 380;
    const boost = i % 5 === 2 ? 2.4 : i % 7 === 3 ? 0.45 : 1;
    const likes = Math.round(base * boost * (0.7 + rand() * 0.6));
    const comments = Math.round(likes * (0.02 + rand() * 0.06));
    return {
      id: `mock-${i}`,
      shortCode: `mock${i}`,
      url: "",
      thumbnail: "",
      likes,
      likesHidden: false,
      comments,
      caption,
      hashtags: extractHashtags(caption),
      mentions: extractMentions(caption),
      altText: `인스타그램 게시물 ${i + 1} 시각적 콘텐츠 설명`,
      mediaType: format === "reel" ? "Video" : format === "carousel" ? "Sidecar" : "Image",
      format,
      timestamp: ts.toISOString(),
      videoViews: format === "reel" ? Math.round(likes * (18 + rand() * 20)) : null,
      videoDuration: format === "reel" ? Math.round(12 + rand() * 40) : null,
      isSponsored: i === 5,
    };
  });
  return {
    username,
    fullName: username,
    profilePicUrl: "",
    followersCount,
    followingCount: 340,
    postsCount: 128,
    avgEngagementRate: posts.reduce((s, p) => s + (p.likes + p.comments) / followersCount, 0) / posts.length,
    posts,
    isMock: true,
  };
}

// Apify actor 응답 필드는 버전에 따라 이름이 조금씩 달라 방어적으로 매핑
function normalizeApifyItem(item: Record<string, unknown>, fallbackUsername: string): InstagramProfile {
  const username = (item.username as string) ?? fallbackUsername;
  const followersCount = num(item.followersCount);
  const followingCount = num(item.followsCount ?? item.followingCount);
  const postsCount = num(item.postsCount);
  const rawPosts = (item.latestPosts ?? item.posts ?? []) as Record<string, unknown>[];

  const posts: InstagramPost[] = rawPosts.slice(0, MAX_POSTS).map((p, i) => {
    const caption = normalizeCaption(p.caption ?? p.text ?? p.description ?? p.summary ?? "");
    const hashtags = extractHashtags(caption, Array.isArray(p.hashtags) ? p.hashtags : []);
    const mentions = extractMentions(caption, Array.isArray(p.mentions) ? p.mentions : []);
    const altText = normalizeCaption(p.alt ?? p.altText ?? p.imageDescription ?? p.accessibilityCaption ?? "");
    const rawLikes = numOrNull(p.likesCount ?? p.likes);
    const likesHidden = rawLikes == null || rawLikes < 0;
    const shortCode = String(p.shortCode ?? p.code ?? "");
    const url = (p.url as string) ?? (shortCode ? `https://www.instagram.com/p/${shortCode}/` : "");

    return {
      id: String(p.id ?? shortCode ?? i),
      shortCode,
      url,
      thumbnail: (p.displayUrl as string) ?? (p.thumbnailUrl as string) ?? (p.imageUrl as string) ?? "",
      likes: likesHidden ? 0 : (rawLikes as number),
      likesHidden,
      comments: num(p.commentsCount ?? p.comments),
      caption,
      hashtags,
      mentions,
      altText: altText || caption || `Instagram post ${i + 1}`,
      mediaType: String(p.type ?? p.mediaType ?? "Image"),
      format: detectFormat(p),
      timestamp: toIso(p.timestamp ?? p.takenAt ?? p.takenAtTimestamp),
      videoViews: numOrNull(p.videoViewCount ?? p.videoPlayCount ?? p.viewCount),
      videoDuration: numOrNull(p.videoDuration),
      isSponsored: Boolean(p.isSponsored),
    };
  });

  const visible = posts.filter((p) => !p.likesHidden);
  const avgEngagementRate =
    followersCount && visible.length
      ? visible.reduce((s, p) => s + (p.likes + p.comments) / followersCount, 0) / visible.length
      : 0;

  return {
    username,
    fullName: (item.fullName as string) ?? username,
    profilePicUrl: (item.profilePicUrl as string) ?? "",
    followersCount,
    followingCount,
    postsCount,
    avgEngagementRate,
    posts,
    isMock: false,
  };
}

export async function fetchInstagramProfile(input: string): Promise<InstagramProfile> {
  const username = parseInstagramInput(input);
  if (!username) throw new Error("인스타그램 계정을 입력해 주세요.");

  const token = process.env.APIFY_API_TOKEN;
  if (!token) return mockProfile(username);

  const url = `https://api.apify.com/${API_VERSION}/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${token}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usernames: [username], resultsLimit: MAX_POSTS }),
  });

  if (!res.ok) {
    throw new Error(`Apify 호출 실패 (${res.status})`);
  }

  const items = (await res.json()) as Record<string, unknown>[];
  const item = items?.[0];
  if (!item) throw new Error("해당 계정 데이터를 찾을 수 없어요. 계정명을 확인해 주세요.");

  return normalizeApifyItem(item, username);
}
