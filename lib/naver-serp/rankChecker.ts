// 네이버 검색결과 페이지에서 파워링크(검색광고) 영역을 직접 파싱해 사이트별 순위를 확인한다.
// 네이버 검색광고 공식 API는 실제 SERP 노출 순위를 제공하지 않기 때문에, 검색결과 HTML을
// 서버에서 직접 요청해 광고 영역만 추출하는 방식을 쓴다. 페이지마다 삽입되는 onclick 핸들러의
// `a=pwl(_nop)?.tit&...&d="+(urlencode|encodeURIComponent)("<광고주 도메인>")` 패턴이 광고 순서·
// 랜딩 도메인을 가장 안정적으로 담고 있어 이를 기준으로 파싱한다(2026-08 기준 구조).

export type Device = "pc" | "mobile";

export type PowerLinkAd = {
  rank: number;
  domain: string;
  title: string;
  landingUrl: string;
  description: string;
  business?: string; // 업체명(모바일 SERP에만 별도 표기됨). PC는 title에 업체명이 섞여 있어 없음.
};

export type RankCheckResult = {
  device: Device;
  keyword: string;
  ads: PowerLinkAd[];
  matchedRank: number | null;
  checkedAt: string;
};

const UA: Record<Device, string> = {
  pc: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  mobile:
    "Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
};

const SEARCH_URL: Record<Device, string> = {
  pc: "https://search.naver.com/search.naver",
  mobile: "https://m.search.naver.com/search.naver",
};

// PC/모바일 페이지의 파워링크 onclick 핸들러 표기가 다르다.
const TIT_ACTION: Record<Device, string> = { pc: "pwl_nop.tit", mobile: "pwl.tit" };
const ENCODE_FN: Record<Device, string> = { pc: "urlencode", mobile: "encodeURIComponent" };
const TITLE_SPAN_CLASS: Record<Device, string> = { pc: "lnk_tit", mobile: "tit" };
// 광고 설명(광고문구)은 <a class="...">텍스트</a> 하나로 노출된다. PC/모바일 클래스명이 다르다.
const DESC_LINK_CLASS: Record<Device, string> = { pc: "link_desc", mobile: "desc" };
// 업체명은 모바일 SERP에서만 <span class="site">로 별도 표기된다. PC는 title에 섞여 있다.
const SITE_SPAN_CLASS: Record<Device, string> = { pc: "", mobile: "site" };

const MAX_ADS = 10;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 네이버에 짧은 간격으로 요청이 몰리면 차단/캡차 페이지로 응답할 수 있다.
// 이 프로세스에서 나가는 모든 SERP 요청을 하나의 대기열로 묶어 최소 간격을 둔다.
const MIN_REQUEST_INTERVAL_MS = 1500;
let queue: Promise<void> = Promise.resolve();
let lastRequestAt = 0;

function scheduleSlot(): Promise<void> {
  const slot = queue.then(async () => {
    const wait = lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
  });
  queue = slot.catch(() => undefined);
  return slot;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'");
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

export function normalizeDomain(input: string): string {
  try {
    const u = new URL(input.startsWith("http") ? input : `http://${input}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return input.trim().toLowerCase().replace(/^www\./, "");
  }
}

// m.xxx.com 같은 모바일 서브도메인도 같은 사이트로 취급한다.
export function domainMatches(adDomain: string, targetDomain: string): boolean {
  const strip = (d: string) => d.replace(/^m\./, "");
  const a = strip(adDomain);
  const t = strip(targetDomain);
  return a === t || a.endsWith(`.${t}`) || t.endsWith(`.${a}`);
}

function parsePowerLinkAds(html: string, device: Device): PowerLinkAd[] {
  const titAction = TIT_ACTION[device];
  const encodeFn = ENCODE_FN[device];
  const titleSpanClass = TITLE_SPAN_CLASS[device];
  const descLinkClass = DESC_LINK_CLASS[device];
  const siteSpanClass = SITE_SPAN_CLASS[device];
  const escapedAction = titAction.replace(/\./g, "\\.");
  // r=<순위>는 광고 순번 그 자체라 하드코딩하지 않고 캡처해서 그대로 rank로 쓴다.
  const pattern = new RegExp(
    `a=${escapedAction}&r=(\\d+)&i=[^&]+&d="\\+${encodeFn}\\("([^"]+)"\\)`,
    "g",
  );

  const ads: PowerLinkAd[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) && ads.length < MAX_ADS) {
    const rank = Number(match[1]);
    const landingUrl = match[2];
    // 제목/설명 <span·a>는 매칭 지점(온클릭 속성) 이후 긴 추적용 href·파비콘 블록을 지나야 나오므로 넉넉히 잡는다.
    const windowHtml = html.slice(match.index, match.index + 3500);

    const spanRe = new RegExp(`<span class="${titleSpanClass}">([\\s\\S]*?)<\\/span>`, "g");
    const titleParts: string[] = [];
    let sm: RegExpExecArray | null;
    while ((sm = spanRe.exec(windowHtml)) && titleParts.length < 3) {
      titleParts.push(stripTags(sm[1]));
    }

    const descRe = new RegExp(`<a[^>]*class="${descLinkClass}"[^>]*>([\\s\\S]*?)<\\/a>`);
    const dm = descRe.exec(windowHtml);
    const description = dm ? stripTags(dm[1]) : "";

    let business: string | undefined;
    if (siteSpanClass) {
      const siteRe = new RegExp(`<span class="${siteSpanClass}">([\\s\\S]*?)<\\/span>`);
      const bm = siteRe.exec(windowHtml);
      business = bm ? stripTags(bm[1]) : undefined;
    }

    ads.push({
      rank,
      domain: normalizeDomain(landingUrl),
      title: titleParts.join(" ").trim(),
      landingUrl,
      description,
      business,
    });
  }
  return ads;
}

async function fetchSerpHtml(device: Device, keyword: string): Promise<string> {
  await scheduleSlot();
  const url = `${SEARCH_URL[device]}?query=${encodeURIComponent(keyword)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA[device],
      "Accept-Language": "ko-KR,ko;q=0.9",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`네이버 검색 페이지를 불러오지 못했어요. (${res.status})`);
  }
  return res.text();
}

export async function checkPowerLinkRank(
  keyword: string,
  targetDomain: string,
  device: Device,
): Promise<RankCheckResult> {
  let html: string;
  try {
    html = await fetchSerpHtml(device, keyword);
  } catch {
    // 일시적인 차단/타임아웃일 수 있어 잠깐 대기 후 1회 재시도
    await sleep(3000);
    html = await fetchSerpHtml(device, keyword);
  }

  const ads = parsePowerLinkAds(html, device);
  const target = normalizeDomain(targetDomain);
  const matched = ads.find((a) => domainMatches(a.domain, target));

  return {
    device,
    keyword,
    ads,
    matchedRank: matched?.rank ?? null,
    checkedAt: new Date().toISOString(),
  };
}
