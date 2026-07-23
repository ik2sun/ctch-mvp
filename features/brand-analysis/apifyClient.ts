// 인스타그램 프로필 수집 — Apify actor 호출 로직을 별도 분리
// APIFY_API_TOKEN이 없는 환경(로컬/데모)에서는 목데이터로 자동 대체됩니다.

const ACTOR_ID = "apify/instagram-profile-scraper".replace("/", "~");
const API_VERSION = "v2";

export type InstagramPost = {
  id: string;
  thumbnail: string;
  likes: number;
  comments: number;
  caption: string;
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

function mockProfile(username: string): InstagramProfile {
  // 썸네일은 비워두고 화면에서 인스타그램 느낌의 그라데이션 박스로 대체 표시
  const posts: InstagramPost[] = Array.from({ length: 8 }).map((_, i) => ({
    id: `mock-${i}`,
    thumbnail: "",
    likes: 420 + i * 63,
    comments: 14 + i * 4,
    caption: "샘플 게시물 캡션입니다. 실제 데이터가 아니에요.",
  }));
  const followersCount = 12500;
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

  const posts: InstagramPost[] = rawPosts.slice(0, 12).map((p, i) => ({
    id: String(p.id ?? p.shortCode ?? i),
    thumbnail: (p.displayUrl as string) ?? (p.thumbnailUrl as string) ?? (p.imageUrl as string) ?? "",
    likes: num(p.likesCount ?? p.likes),
    comments: num(p.commentsCount ?? p.comments),
    caption: String(p.caption ?? ""),
  }));

  const avgEngagementRate =
    followersCount && posts.length
      ? posts.reduce((s, p) => s + (p.likes + p.comments) / followersCount, 0) / posts.length
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
    body: JSON.stringify({ usernames: [username] }),
  });

  if (!res.ok) {
    throw new Error(`Apify 호출 실패 (${res.status})`);
  }

  const items = (await res.json()) as Record<string, unknown>[];
  const item = items?.[0];
  if (!item) throw new Error("해당 계정 데이터를 찾을 수 없어요. 계정명을 확인해 주세요.");

  return normalizeApifyItem(item, username);
}
