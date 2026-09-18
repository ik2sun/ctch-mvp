// 서버 전용 — 제품 상세/브랜드 페이지 URL에서 숏폼에 쓸 사진 후보를 수집하고 자동 선별한다.
// 외부 파서 의존 없이 정규식으로 처리하고, 후보는 실제로 내려받아 헤더에서 크기를 읽어 판정한다.
// (og:image만 믿으면 로고가 섞이고, HTML의 width 속성은 실제 해상도와 다른 경우가 많다.)

import http from "node:http";
import https from "node:https";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const HTML_TIMEOUT_MS = 15_000;
const IMG_TIMEOUT_MS = 12_000;
const MAX_HTML_BYTES = 4 * 1024 * 1024;
const MAX_IMG_BYTES = 12 * 1024 * 1024;
const MAX_PROBE = 40;        // 실제로 내려받아 크기를 확인할 후보 수
const CONCURRENCY = 8;

export type ImageCandidate = {
  url: string;
  width: number;
  height: number;
  bytes: number;
  type: string;            // image/jpeg 등
  score: number;
  origin: "og" | "jsonld" | "img" | "source" | "css" | "link" | "json";
  recommended: boolean;    // 자동 선별 결과
  note: string;            // 선별 이유·제외 사유(한국어)
};

export type CollectResult = {
  pageUrl: string;
  pageTitle: string;
  candidates: ImageCandidate[];
  skipped: number;         // 크기 미달·중복 등으로 제외된 수
  message: string;
};

// ---------- SSRF 방지 ----------
function assertPublicHost(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("http/https 주소만 넣을 수 있어요.");
  const host = url.hostname.toLowerCase();
  const isPrivate =
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    !host.includes(".") ||
    /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) ||
    host === "::1" ||
    host.startsWith("[");
  if (isPrivate) throw new Error("내부망·로컬 주소에서는 가져올 수 없어요.");
}

export function normalizeUrl(input: string): URL {
  let raw = input.trim();
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  const url = new URL(raw);
  assertPublicHost(url);
  url.hash = "";
  return url;
}

// ---------- 저수준 요청 ----------
function request(url: URL, opts: { accept: string; maxBytes: number; timeout: number }) {
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(
      url,
      {
        method: "GET",
        headers: {
          "User-Agent": UA,
          Accept: opts.accept,
          "Accept-Language": "ko,en;q=0.8",
          Referer: `${url.protocol}//${url.host}/`,
          Connection: "close",
        },
        ...(url.protocol === "https:" ? { rejectUnauthorized: false as const } : {}),
      },
      (res) => {
        const chunks: Buffer[] = [];
        let total = 0;
        res.on("data", (c: Buffer) => {
          total += c.length;
          if (total > opts.maxBytes) {
            req.destroy();
            return;
          }
          chunks.push(c);
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
        res.on("error", reject);
      },
    );
    req.setTimeout(opts.timeout, () => req.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })));
    req.on("error", reject);
    req.end();
  });
}

async function follow(
  start: URL,
  opts: { accept: string; maxBytes: number; timeout: number },
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer; finalUrl: URL }> {
  let current = start;
  for (let hop = 0; hop < 5; hop++) {
    assertPublicHost(current);
    const r = await request(current, opts);
    const loc = r.headers.location;
    if (r.status >= 300 && r.status < 400 && loc) {
      current = new URL(Array.isArray(loc) ? loc[0] : loc, current);
      continue;
    }
    return { ...r, finalUrl: current };
  }
  throw new Error("리다이렉트가 너무 많아요.");
}

function describeError(e: unknown, host: string): Error {
  const code = (e as { code?: string })?.code ?? "";
  const msg = e instanceof Error ? e.message : String(e);
  if (code === "ETIMEDOUT" || /timeout/i.test(msg)) return new Error(`${host} 응답이 15초를 넘어 중단했어요.`);
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return new Error(`${host} 도메인을 찾을 수 없어요. 주소를 확인해 주세요.`);
  if (code === "ECONNREFUSED" || code === "ECONNRESET") return new Error(`${host} 서버가 연결을 거부했어요. 크롤러 차단일 수 있어요.`);
  return new Error(`${host} 요청 실패: ${msg}`);
}

// ---------- 이미지 헤더에서 실제 크기 읽기 ----------
export function imageSize(b: Buffer): { width: number; height: number; type: string } | null {
  if (b.length < 16) return null;
  // PNG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), type: "image/png" };
  }
  // GIF
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
    return { width: b.readUInt16LE(6), height: b.readUInt16LE(8), type: "image/gif" };
  }
  // WebP (RIFF....WEBP)
  if (b.slice(0, 4).toString("ascii") === "RIFF" && b.slice(8, 12).toString("ascii") === "WEBP") {
    const fmt = b.slice(12, 16).toString("ascii");
    if (fmt === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff, type: "image/webp" };
    if (fmt === "VP8L") {
      const n = b.readUInt32LE(21);
      return { width: (n & 0x3fff) + 1, height: ((n >> 14) & 0x3fff) + 1, type: "image/webp" };
    }
    if (fmt === "VP8X") {
      const w = 1 + (b[24] | (b[25] << 8) | (b[26] << 16));
      const h = 1 + (b[27] | (b[28] << 8) | (b[29] << 16));
      return { width: w, height: h, type: "image/webp" };
    }
  }
  // JPEG — SOFn 마커 탐색
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length - 9) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5), type: "image/jpeg" };
      }
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  // AVIF/HEIC — ispe 박스에서 크기를 찾는다
  const ispe = b.indexOf("ispe");
  if (ispe > 0 && ispe + 12 < b.length) {
    return { width: b.readUInt32BE(ispe + 8), height: b.readUInt32BE(ispe + 12), type: "image/avif" };
  }
  return null;
}

// ---------- HTML → 이미지 후보 URL ----------
const BAD_URL = /logo|icon|favicon|sprite|blank|dummy|placeholder|loading|spinner|btn[-_.]|button|arrow|bullet|bg[-_.]?pattern|watermark|badge|pixel|1x1|banner[-_.]?top|gnb|footer|header[-_.]|sns[-_.]|share|cart|search|menu|paynow|card[-_.]?benefit|delivery|refund|notice|guide|size[-_.]?chart|kakao|naver[-_.]?pay|toss/i;
const BAD_EXT = /\.(svg|ico|gif)(\?|$)/i;

function absolute(src: string, base: URL): string | null {
  const s = src.trim().replace(/&amp;/g, "&");
  if (!s || s.startsWith("data:") || s.startsWith("blob:") || s.startsWith("javascript:")) return null;
  try {
    const u = new URL(s, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

function fromSrcset(value: string, base: URL): string[] {
  return value
    .split(",")
    .map((part) => absolute(part.trim().split(/\s+/)[0] ?? "", base))
    .filter((x): x is string => Boolean(x));
}

/** 같은 이미지의 리사이즈 변형을 한 묶음으로 보기 위한 키 (경로의 숫자·크기 토큰 제거) */
function familyKey(u: string): string {
  try {
    const url = new URL(u);
    const file = url.pathname
      .split("/")
      .pop()!
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[-_]?\d{2,4}x\d{2,4}/gi, "")
      .replace(/[-_](thumb|small|medium|large|big|org|origin|detail|list|main|s|m|l|xl)\b/gi, "")
      .replace(/[-_]\d+$/g, "");
    return `${url.host}${url.pathname.replace(/[^/]+$/, "")}${file}`;
  } catch {
    return u;
  }
}

type Raw = { url: string; origin: ImageCandidate["origin"]; order: number };

function extractCandidates(html: string, base: URL): { raws: Raw[]; title: string } {
  const raws: Raw[] = [];
  const seen = new Set<string>();
  let order = 0;
  const push = (src: string | null, origin: ImageCandidate["origin"]) => {
    if (!src || seen.has(src)) return;
    seen.add(src);
    raws.push({ url: src, origin, order: order++ });
  };

  // og:image / twitter:image — 대표 이미지라 우선순위가 높다
  for (const m of html.matchAll(/<meta[^>]+(?:property|name)=["'](og:image(?::secure_url)?|twitter:image(?::src)?)["'][^>]*>/gi)) {
    const content = m[0].match(/content=["']([^"']+)["']/i)?.[1];
    push(absolute(content ?? "", base), "og");
  }
  // JSON-LD의 image 필드
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const im of m[1].matchAll(/"image"\s*:\s*(\[[^\]]*\]|"[^"]+")/gi)) {
      for (const u of im[1].matchAll(/"(https?:\/\/[^"]+)"/g)) push(absolute(u[1], base), "jsonld");
    }
  }
  // <link rel="preload" as="image">
  for (const m of html.matchAll(/<link[^>]+as=["']image["'][^>]*>/gi)) {
    push(absolute(m[0].match(/href=["']([^"']+)["']/i)?.[1] ?? "", base), "link");
  }
  // <source srcset>
  for (const m of html.matchAll(/<source[^>]+srcset=["']([^"']+)["'][^>]*>/gi)) {
    for (const u of fromSrcset(m[1], base)) push(u, "source");
  }
  // <img> — src / data-src 계열 / srcset (레이지 로딩 속성이 제각각이라 넓게 받는다)
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const srcset = tag.match(/\bsrcset=["']([^"']+)["']/i)?.[1];
    if (srcset) for (const u of fromSrcset(srcset, base)) push(u, "img");
    for (const attr of ["data-original", "data-lazy-src", "data-src", "data-echo", "src"]) {
      const v = tag.match(new RegExp(`\\b${attr}=["']([^"']+)["']`, "i"))?.[1];
      if (v) push(absolute(v, base), "img");
    }
  }
  // style="background-image:url(...)"
  for (const m of html.matchAll(/background-image\s*:\s*url\((["']?)([^"')]+)\1\)/gi)) {
    push(absolute(m[2], base), "css");
  }
  // 폴백 — 요즘 커머스는 이미지를 <img> 대신 스크립트 안의 JSON(__NEXT_DATA__ 등)으로 넘긴다.
  // JS를 실행하지 않고 쓰려면 문서 전체에서 이미지 URL 패턴을 직접 긁어야 한다 (\/ · \u002F 이스케이프 복원).
  const usable = () => raws.filter((r) => !BAD_EXT.test(r.url) && !BAD_URL.test(r.url)).length;
  if (usable() < 8) {
    const flat = html.replace(/\\u002F/gi, "/").replace(/\\\//g, "/");
    for (const m of flat.matchAll(/https?:\/\/[^"'\s<>\\)]+?\.(?:jpe?g|png|webp|avif)(?:\?[^"'\s<>\\)]*)?/gi)) {
      push(absolute(m[0], base), "json");
    }
  }

  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return { raws, title };
}

// ---------- 점수 ----------
function scoreOf(c: { width: number; height: number; origin: ImageCandidate["origin"]; order: number; url: string }, keywords: string[]) {
  const { width: w, height: h } = c;
  const ratio = h / w;
  let score = 0;
  const notes: string[] = [];

  // 해상도 — 세로 1920 기준으로 확대해도 버티는 크기를 선호
  const short = Math.min(w, h);
  if (short >= 1000) score += 40;
  else if (short >= 800) score += 34;
  else if (short >= 600) score += 26;
  else if (short >= 450) score += 16;
  else score += 6;
  // 1080×1920으로 확대되므로 짧은 변이 작으면 화질이 눈에 띄게 떨어진다
  if (short < 700) notes.push("확대 시 화질 저하");

  // 비율 — 9:16 화면이라 세로·정방형이 유리, 가로로 긴 배너는 감점
  if (ratio >= 1.1 && ratio <= 2.0) {
    score += 26;
    notes.push("세로형");
  } else if (ratio >= 0.85 && ratio < 1.1) {
    score += 22;
    notes.push("정방형");
  } else if (ratio >= 0.6 && ratio < 0.85) {
    score += 12;
    notes.push("가로형");
  } else if (ratio > 2.0) {
    score += 4;
    notes.push("세로로 긴 이미지");
  } else {
    score -= 12;
    notes.push("가로로 긴 배너");
  }

  // 출처 — 대표 이미지 우대
  if (c.origin === "og" || c.origin === "jsonld") {
    score += 18;
    notes.push("대표 이미지");
  } else if (c.origin === "link") score += 6;

  // 문서 앞쪽일수록 주요 컷일 확률이 높다
  score += Math.max(0, 12 - c.order * 0.35);

  // 브리프 키워드가 파일 경로에 있으면 가산
  const path = decodeURIComponent(c.url).toLowerCase();
  if (keywords.some((k) => k.length >= 2 && path.includes(k))) {
    score += 8;
    notes.push("키워드 일치");
  }
  return { score: Math.round(score), note: notes.join(" · ") };
}

// ---------- 본체 ----------
export async function collectImages(input: string, opts: { keywords?: string[]; limit?: number } = {}): Promise<CollectResult> {
  const pageUrl = normalizeUrl(input);
  const limit = Math.min(30, Math.max(6, opts.limit ?? 18));
  const keywords = (opts.keywords ?? []).map((k) => k.toLowerCase().trim()).filter(Boolean);

  let page;
  try {
    page = await follow(pageUrl, {
      accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      maxBytes: MAX_HTML_BYTES,
      timeout: HTML_TIMEOUT_MS,
    });
  } catch (e) {
    throw describeError(e, pageUrl.hostname);
  }
  if (page.status === 403 || page.status === 401) {
    throw new Error(`${pageUrl.hostname} 이 외부 접근을 막고 있어요 (HTTP ${page.status}). 사진을 직접 올리거나 다른 페이지 주소를 넣어 주세요.`);
  }
  if (page.status === 429) {
    throw new Error(`${pageUrl.hostname} 이 요청을 제한하고 있어요 (HTTP 429). 잠시 뒤 다시 시도하거나 사진을 직접 올려 주세요.`);
  }
  if (page.status >= 400) throw new Error(`페이지를 불러오지 못했어요 (HTTP ${page.status}). 주소를 확인해 주세요.`);

  const ct = String(page.headers["content-type"] ?? "");
  let html: string;
  if (/euc-kr|ks_c_5601|cp949/i.test(ct)) html = new TextDecoder("euc-kr").decode(page.body);
  else {
    html = page.body.toString("utf8");
    const meta = html.slice(0, 4000).match(/charset=["']?([\w-]+)/i)?.[1]?.toLowerCase();
    if (meta && /euc-kr|ks_c_5601|cp949/.test(meta)) {
      try {
        html = new TextDecoder("euc-kr").decode(page.body);
      } catch {
        /* 그대로 */
      }
    }
  }

  // JS 리다이렉트만 있는 랜딩 페이지(window.location.href="/lander")는 한 번 따라간다
  const jsRedirect = html.length < 4000 ? html.match(/(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/i)?.[1] : undefined;
  if (jsRedirect) {
    try {
      const next = new URL(jsRedirect, page.finalUrl);
      if (next.toString() !== page.finalUrl.toString()) {
        const r2 = await follow(next, { accept: "text/html,application/xhtml+xml,*/*;q=0.8", maxBytes: MAX_HTML_BYTES, timeout: HTML_TIMEOUT_MS });
        if (r2.status < 400 && r2.body.length > html.length) {
          page = r2;
          html = r2.body.toString("utf8");
        }
      }
    } catch {
      /* 원래 페이지로 진행 */
    }
  }

  const { raws, title } = extractCandidates(html, page.finalUrl);
  // 명백한 UI 요소·벡터 아이콘은 내려받기 전에 거른다
  const filtered = raws.filter((r) => !BAD_EXT.test(r.url) && !BAD_URL.test(r.url));
  const skippedByName = raws.length - filtered.length;

  // 같은 이미지의 리사이즈 변형은 한 번만 확인한다 (og 우선, 그다음 등장 순)
  const byFamily = new Map<string, Raw>();
  for (const r of filtered) {
    const key = familyKey(r.url);
    const prev = byFamily.get(key);
    if (!prev || (prev.origin !== "og" && r.origin === "og")) byFamily.set(key, r);
  }
  const probes = [...byFamily.values()].sort((a, b) => a.order - b.order).slice(0, MAX_PROBE);

  // 실제로 내려받아 크기를 확인한다
  const results: ImageCandidate[] = [];
  let tooSmall = 0;
  let failed = 0;
  let idx = 0;
  async function worker() {
    while (idx < probes.length) {
      const r = probes[idx++];
      try {
        const got = await follow(new URL(r.url), {
          accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          maxBytes: MAX_IMG_BYTES,
          timeout: IMG_TIMEOUT_MS,
        });
        if (got.status >= 400 || got.body.length < 100) {
          failed++;
          continue;
        }
        const size = imageSize(got.body);
        if (!size) {
          failed++;
          continue;
        }
        // 숏폼은 1080×1920로 확대되므로 너무 작은 이미지는 쓸 수 없다
        if (Math.min(size.width, size.height) < 400 || size.width * size.height < 300_000) {
          tooSmall++;
          continue;
        }
        const { score, note } = scoreOf({ ...size, origin: r.origin, order: r.order, url: r.url }, keywords);
        results.push({
          url: got.finalUrl.toString(),
          width: size.width,
          height: size.height,
          bytes: got.body.length,
          type: size.type,
          score,
          origin: r.origin,
          recommended: false,
          note,
        });
      } catch {
        failed++;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, probes.length) }, worker));

  results.sort((a, b) => b.score - a.score);
  const top = results.slice(0, limit);
  // 상위 8장을 기본 선택 (사진형 템플릿 권장 장수)
  top.slice(0, 8).forEach((c) => {
    c.recommended = true;
  });

  const skipped = skippedByName + tooSmall + failed;
  const message = top.length
    ? `${top.length}장을 찾았어요. 큰 세로·정방형 사진 ${Math.min(8, top.length)}장을 자동으로 골라 뒀어요.` +
      (skipped ? ` (로고·아이콘·작은 이미지 ${skipped}장 제외)` : "")
    : `이 페이지에서 쓸 만한 사진을 찾지 못했어요.${
        raws.length ? ` 후보 ${raws.length}장이 모두 작거나 UI 이미지였어요.` : " 이미지가 자바스크립트로 그려지는 페이지일 수 있어요."
      } 사진을 직접 올려 주세요.`;

  return { pageUrl: page.finalUrl.toString(), pageTitle: title, candidates: top, skipped, message };
}
