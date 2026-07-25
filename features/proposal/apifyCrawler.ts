// 경쟁사 웹사이트 범용 크롤링 — apifyClient.ts(인스타그램 프로필 전용)와는 별도 actor.
// APIFY_API_TOKEN이 없는 환경(로컬/데모)에서는 목데이터로 자동 대체됩니다.

const ACTOR_ID = "apify/website-content-crawler".replace("/", "~");
const API_VERSION = "v2";

export type CrawledSite = {
  url: string;
  title: string;
  text: string; // 본문 텍스트(요약 프롬프트 입력용으로 길이 제한)
  isMock: boolean;
};

const MAX_TEXT_LENGTH = 6000;

function mockSite(url: string): CrawledSite {
  return {
    url,
    title: url.replace(/^https?:\/\//, "").split("/")[0],
    text: "샘플 데이터입니다. APIFY_API_TOKEN이 설정되면 실제 웹페이지 본문이 수집됩니다.",
    isMock: true,
  };
}

export async function crawlWebsite(url: string): Promise<CrawledSite> {
  const trimmed = url.trim();
  if (!trimmed) throw new Error("URL을 입력해 주세요.");

  const token = process.env.APIFY_API_TOKEN;
  if (!token) return mockSite(trimmed);

  const apiUrl = `https://api.apify.com/${API_VERSION}/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${token}`;
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      startUrls: [{ url: trimmed }],
      maxCrawlPages: 1,
      crawlerType: "cheerio",
    }),
  });

  if (!res.ok) {
    throw new Error(`Apify 웹 크롤링 실패 (${res.status})`);
  }

  const items = (await res.json()) as Record<string, unknown>[];
  const item = items?.[0];
  if (!item) throw new Error("페이지 내용을 가져오지 못했어요. URL을 확인해 주세요.");

  const text = String(item.text ?? "").slice(0, MAX_TEXT_LENGTH);
  return {
    url: trimmed,
    title: String(item.title ?? trimmed),
    text,
    isMock: false,
  };
}

// 개별 실패가 전체를 막지 않도록 각 URL을 독립적으로 처리
export async function crawlWebsites(urls: string[]): Promise<CrawledSite[]> {
  const results = await Promise.allSettled(urls.map((u) => crawlWebsite(u)));
  return results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
}
