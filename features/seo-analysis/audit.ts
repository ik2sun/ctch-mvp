// 서버 전용 — 대상 URL을 JS 실행 없이(AI 크롤러가 보는 방식으로) 가져와 SEO·AEO·GEO 기술 진단을 수행한다.
// 점검 항목은 geo-audit-framework 스킬 5단계(크롤러·렌더링·스키마·정합성·온페이지·국제화·AI 파일·인용 적합도·등록)를 따른다.
// 외부 파서 의존 없이 정규식으로 처리한다. 판정은 "확인된 것"만 기재하고, 확인 불가 항목은 info로 남긴다.

import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import zlib from "node:zlib";
import { constants as cryptoConstants } from "node:crypto";
import { CRAWLERS, SEARCH_CRAWLERS } from "./crawlers";
import type {
  AuditResult,
  CrawlerStatus,
  Engine,
  Finding,
  FindingArea,
  ProductCheck,
  SchemaNode,
  Severity,
} from "./types";

const FETCH_UA = "Mozilla/5.0 (compatible; CTCH-SEO-Audit/1.0; +https://ctch.nmg.co.kr)";
const TIMEOUT_MS = 15_000;
const MAX_HTML_BYTES = 3 * 1024 * 1024;

const ALL_ENGINES: Engine[] = ["ChatGPT", "Gemini·AIO", "Claude", "Perplexity", "Copilot", "네이버"];
const GLOBAL_ENGINES: Engine[] = ["ChatGPT", "Gemini·AIO", "Claude", "Perplexity", "Copilot"];

// ---------- URL 검증 (SSRF 방지) ----------

function assertPublicHost(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("http/https URL만 진단할 수 있어요.");
  const host = url.hostname.toLowerCase();
  const privateHost =
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    !host.includes(".") ||
    /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) ||
    host === "::1" ||
    host.startsWith("[");
  if (privateHost) throw new Error("내부망·로컬 주소는 진단할 수 없어요.");
}

export function normalizeTargetUrl(input: string): URL {
  let raw = input.trim();
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  const url = new URL(raw);
  assertPublicHost(url);
  url.hash = "";
  return url;
}

// ---------- fetch 유틸 ----------
// Node 기본 fetch(undici)는 약한 DH 키·레거시 TLS를 쓰는 서버(국내 병원·중소 사이트에 흔함)를
// ERR_SSL_DH_KEY_TOO_SMALL 등으로 거부한다. 진단 대상이 그런 서버여도 읽어야 하므로 https 모듈로 직접 요청하고,
// DHE 암호군을 제외해 서버가 ECDHE/RSA로 협상하게 한다. 리다이렉트는 수동으로 따라가며 매번 공개 호스트인지 확인한다.

// OpenSSL 보안 레벨: 기본(2)은 DH 2048비트 미만을 거부한다. 레벨 1은 1024비트까지 허용(브라우저·curl과 비슷한 관용도).
// 그래도 실패하면 레벨 0으로 한 번 더 시도한다. 인증서 검증(rejectUnauthorized)은 그대로 유지한다.
const CIPHERS_LENIENT = `${tls.DEFAULT_CIPHERS}:@SECLEVEL=1`;
const CIPHERS_LEGACY = `${tls.DEFAULT_CIPHERS}:@SECLEVEL=0`;

type FetchResult = { status: number; text: string; headers: Headers; finalUrl: string };

function isTlsError(e: unknown): boolean {
  const code = (e as { code?: string })?.code ?? "";
  const msg = e instanceof Error ? e.message : String(e);
  return code === "EPROTO" || code.startsWith("ERR_SSL") || code.startsWith("ERR_TLS") || /SSL routines|dh key|handshake/i.test(msg);
}

function requestOnce(url: URL, ciphers = CIPHERS_LENIENT): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === "https:";
    const mod = isHttps ? https : http;
    const req = mod.request(
      url,
      {
        method: "GET",
        headers: {
          "User-Agent": FETCH_UA,
          Accept: "text/html,application/xhtml+xml,text/plain,*/*;q=0.8",
          "Accept-Language": "ko,en;q=0.8",
          "Accept-Encoding": "gzip, deflate, br",
          Connection: "close",
        },
        ...(isHttps
          ? {
              ciphers,
              minVersion: "TLSv1" as const,
              secureOptions: cryptoConstants.SSL_OP_LEGACY_SERVER_CONNECT,
              rejectUnauthorized: true,
            }
          : {}),
      },
      (res) => {
        const chunks: Buffer[] = [];
        let total = 0;
        res.on("data", (chunk: Buffer) => {
          if (total >= MAX_HTML_BYTES) return;
          total += chunk.length;
          chunks.push(chunk);
        });
        res.on("end", () => {
          const raw = Buffer.concat(chunks);
          const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
          let body = raw;
          try {
            if (enc.includes("br")) body = zlib.brotliDecompressSync(raw);
            else if (enc.includes("gzip")) body = zlib.gunzipSync(raw);
            else if (enc.includes("deflate")) body = zlib.inflateSync(raw);
          } catch {
            body = raw; // 잘린 스트림은 그대로 사용
          }
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body });
        });
        res.on("error", reject);
      },
    );
    req.setTimeout(TIMEOUT_MS, () => req.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })));
    req.on("error", reject);
    req.end();
  });
}

function describeNetworkError(e: unknown, host: string): Error {
  const code = (e as { code?: string })?.code ?? "";
  const msg = e instanceof Error ? e.message : String(e);
  if (code === "ETIMEDOUT" || /timeout/i.test(msg)) return new Error(`${host} 응답이 ${TIMEOUT_MS / 1000}초를 넘어 중단했어요.`);
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return new Error(`${host} 도메인을 찾을 수 없어요. URL을 확인해 주세요.`);
  if (code === "ECONNREFUSED" || code === "ECONNRESET") return new Error(`${host} 서버가 연결을 거부했어요. 크롤러 차단(WAF)일 수 있어요.`);
  if (code.startsWith("ERR_TLS") || code.startsWith("ERR_SSL") || /certificate|SSL|TLS/i.test(msg)) return new Error(`${host} TLS 연결 실패 (${code || "인증서 오류"}). 서버 인증서·암호군 설정을 확인해 주세요.`);
  return new Error(`${host} 요청 실패: ${msg}`);
}

async function fetchText(url: string): Promise<FetchResult> {
  let current = new URL(url);
  for (let hop = 0; hop < 6; hop++) {
    assertPublicHost(current);
    let r;
    try {
      r = await requestOnce(current);
    } catch (e) {
      if (!isTlsError(e)) throw describeNetworkError(e, current.hostname);
      try {
        r = await requestOnce(current, CIPHERS_LEGACY);
      } catch (e2) {
        throw describeNetworkError(e2, current.hostname);
      }
    }
    const location = r.headers.location;
    if (r.status >= 300 && r.status < 400 && location) {
      current = new URL(Array.isArray(location) ? location[0] : location, current);
      continue;
    }
    const headers = new Headers();
    for (const [k, v] of Object.entries(r.headers)) {
      if (v == null) continue;
      headers.set(k, Array.isArray(v) ? v.join(", ") : String(v));
    }
    const ct = headers.get("content-type") ?? "";
    const charset = ct.match(/charset=([\w-]+)/i)?.[1]?.toLowerCase();
    let text: string;
    if (charset && charset !== "utf-8" && charset !== "utf8") {
      try {
        text = new TextDecoder(charset).decode(r.body);
      } catch {
        text = r.body.toString("utf8");
      }
    } else {
      text = r.body.toString("utf8");
      // 헤더에 charset이 없고 meta에 euc-kr이 선언된 국내 레거시 페이지 대응
      const metaCharset = text.slice(0, 4000).match(/charset=["']?([\w-]+)/i)?.[1]?.toLowerCase();
      if (metaCharset && /euc-kr|ks_c_5601|cp949/.test(metaCharset)) {
        try {
          text = new TextDecoder("euc-kr").decode(r.body);
        } catch {
          /* 그대로 둔다 */
        }
      }
    }
    return { status: r.status, text, headers, finalUrl: current.toString() };
  }
  throw new Error("리다이렉트가 너무 많아요.");
}

async function exists(url: string): Promise<boolean> {
  try {
    const r = await fetchText(url);
    if (r.status !== 200) return false;
    const ct = r.headers.get("content-type") ?? "";
    // 커스텀 404가 HTML로 200을 주는 경우를 걸러낸다
    if (url.endsWith(".txt")) return !/<html/i.test(r.text.slice(0, 500)) && r.text.trim().length > 0;
    if (url.endsWith(".xml")) return /<(urlset|sitemapindex)/i.test(r.text.slice(0, 2000)) || ct.includes("xml");
    return true;
  } catch {
    return false;
  }
}

// ---------- HTML 파싱 유틸 ----------

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

// 속성값 안의 '>' (onclick="a('x');" 등)에 걸리지 않도록 따옴표 구간을 통째로 건너뛴다
const TAG_RE = /<(?:[^>"']|"[^"]*"|'[^']*')*>/g;

function stripTags(html: string): string {
  return decodeEntities(html.replace(TAG_RE, " ")).replace(/\s+/g, " ").trim();
}

function removeNonContent(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<template[\s\S]*?<\/template>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
}

// 본문 단락 판정용 — 헤더·내비·푸터는 인용 대상이 아니므로 제외
function removeChrome(html: string): string {
  return html
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ");
}

function matchAll(html: string, re: RegExp): RegExpExecArray[] {
  const out: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  while ((m = r.exec(html)) !== null) out.push(m);
  return out;
}

function metaContent(html: string, name: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:name|property|http-equiv)=["']${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  if (!tag) return null;
  const c = tag.match(/content=["']([^"']*)["']/i)?.[1];
  return c != null ? decodeEntities(c).trim() : null;
}

function linkHref(html: string, rel: string): string | null {
  const tags = matchAll(html, /<link[^>]+>/gi).map((m) => m[0]);
  const t = tags.find((tag) => new RegExp(`rel=["'][^"']*\\b${rel}\\b[^"']*["']`, "i").test(tag));
  return t?.match(/href=["']([^"']+)["']/i)?.[1] ?? null;
}

function headings(html: string, level: number): string[] {
  return matchAll(html, new RegExp(`<h${level}[^>]*>([\\s\\S]*?)<\\/h${level}>`, "gi"))
    .map((m) => stripTags(m[1]))
    .filter((t) => t.length > 0);
}

function normUrl(u: string): string {
  try {
    const x = new URL(u);
    x.hash = "";
    let s = x.toString();
    if (s.endsWith("/")) s = s.slice(0, -1);
    return s.toLowerCase();
  } catch {
    return u.toLowerCase();
  }
}

// ---------- JSON-LD ----------

type Node = Record<string, unknown>;

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function typeOf(node: Node): string[] {
  return asArray(node["@type"] as string | string[] | undefined).map(String);
}

function flattenNodes(parsed: unknown): Node[] {
  const out: Node[] = [];
  const visit = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(visit);
    if (v && typeof v === "object") {
      const n = v as Node;
      if (Array.isArray(n["@graph"])) (n["@graph"] as unknown[]).forEach(visit);
      if (n["@type"]) out.push(n);
    }
  };
  visit(parsed);
  return out;
}

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (typeof v === "object") {
    const o = v as Node;
    if (typeof o.name === "string") return o.name;
    if (typeof o["@id"] === "string") return o["@id"];
  }
  return undefined;
}

const DEPRECATED_TYPES: Record<string, string> = {
  HowTo: "Google 리치결과 지원 종료(2023-09). AI 답변 소재로는 유지 가능",
  SpecialAnnouncement: "2025-07-31 지원 종료",
  ClaimReview: "2025-06 리치결과 종료",
  VehicleListing: "2025-06 리치결과 종료",
  CourseInfo: "2025-06 종료",
  EstimatedSalary: "2025-06 종료",
  LearningVideo: "2025-06 종료",
};

function analyzeSchema(html: string, visibleText: string) {
  const blocks = matchAll(html, /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  let parseErrors = 0;
  const nodes: Node[] = [];
  const rawParts: string[] = [];
  for (const b of blocks) {
    const raw = decodeEntities(b[1]).trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      nodes.push(...flattenNodes(parsed));
      rawParts.push(JSON.stringify(parsed));
    } catch {
      parseErrors += 1;
      rawParts.push(raw);
    }
  }
  const rawJsonLd = rawParts.join("\n").slice(0, 6000);

  const types = Array.from(new Set(nodes.flatMap(typeOf)));
  const schemaNodes: SchemaNode[] = [];
  const products: ProductCheck[] = [];
  const faqQuestions: string[] = [];
  const deprecated: string[] = [];
  let organizationSameAs: number | null = null;
  const hiddenValues: string[] = [];
  const dates: string[] = [];

  const textLower = visibleText.toLowerCase();
  const visible = (v: string | undefined) => (v ? textLower.includes(v.toLowerCase()) : false);
  const numberVisible = (v: string | undefined) => {
    if (!v) return false;
    const n = Number(String(v).replace(/[^\d.]/g, ""));
    if (!Number.isFinite(n)) return visible(v);
    const plain = String(Math.round(n));
    const comma = Math.round(n).toLocaleString("en-US");
    return textLower.includes(plain) || textLower.includes(comma);
  };

  for (const n of nodes) {
    const ts = typeOf(n);
    for (const t of ts) if (DEPRECATED_TYPES[t]) deprecated.push(`${t} — ${DEPRECATED_TYPES[t]}`);

    if (ts.includes("Product") || ts.includes("ProductGroup")) {
      const offers = asArray(n.offers as Node | Node[] | undefined)[0] ?? {};
      const agg = (n.aggregateRating ?? {}) as Node;
      const reviews = asArray(n.review as Node | Node[] | undefined);
      const present: string[] = [];
      const missing: string[] = [];
      const check = (label: string, ok: boolean) => (ok ? present : missing).push(label);
      check("offers.price", offers.price != null);
      check("offers.priceCurrency", offers.priceCurrency != null);
      check("offers.priceValidUntil", offers.priceValidUntil != null);
      check("offers.availability", offers.availability != null);
      check("offers.itemCondition", offers.itemCondition != null);
      check("offers.seller", offers.seller != null);
      check("식별자(sku·gtin·mpn·productID)", ["sku", "gtin", "gtin13", "gtin12", "gtin14", "gtin8", "mpn", "productID"].some((k) => n[k] != null));
      check("brand", n.brand != null);
      check("image", n.image != null);
      check("description", typeof n.description === "string" && (n.description as string).length > 30);
      check("aggregateRating", agg.ratingValue != null && (agg.reviewCount != null || agg.ratingCount != null));
      check("review", reviews.length > 0);
      check("review.author·reviewRating", reviews.length > 0 && reviews.every((r) => r.author != null && r.reviewRating != null));
      const price = str(offers.price);
      const ratingValue = str(agg.ratingValue);
      const reviewCount = str(agg.reviewCount ?? agg.ratingCount);
      products.push({ name: str(n.name), price, priceCurrency: str(offers.priceCurrency), ratingValue, reviewCount, present, missing });
      if (price && !numberVisible(price)) hiddenValues.push(`가격 ${price}`);
      if (reviewCount && !numberVisible(reviewCount)) hiddenValues.push(`리뷰 수 ${reviewCount}`);
      if (ratingValue && !visible(ratingValue)) hiddenValues.push(`평점 ${ratingValue}`);
      schemaNodes.push({ type: "Product", name: str(n.name), ok: present, issues: missing.map((m) => `${m} 없음`) });
    }

    if (ts.includes("FAQPage")) {
      const qs = asArray(n.mainEntity as Node | Node[] | undefined);
      const names = qs.map((q) => str(q.name)).filter((s): s is string => !!s);
      faqQuestions.push(...names);
      const hiddenQ = names.filter((q) => !visible(q.slice(0, 20)));
      if (names.length && hiddenQ.length === names.length) hiddenValues.push(`FAQ ${names.length}문항 전문`);
      schemaNodes.push({ type: "FAQPage", ok: [`${names.length}문항`], issues: names.length === 0 ? ["mainEntity 없음"] : [] });
    }

    if (ts.includes("Organization") || ts.includes("Brand") || ts.some((t) => t.endsWith("Business"))) {
      const same = asArray(n.sameAs as string | string[] | undefined).length;
      organizationSameAs = Math.max(organizationSameAs ?? 0, same);
      schemaNodes.push({ type: ts.join("/"), name: str(n.name), ok: same ? [`sameAs ${same}개`] : [], issues: same ? [] : ["sameAs 없음 (엔티티 연결 약함)"] });
    }

    if (ts.some((t) => ["Article", "BlogPosting", "NewsArticle", "MedicalWebPage", "WebPage"].includes(t))) {
      const issues: string[] = [];
      const ok: string[] = [];
      if (ts.some((t) => t.endsWith("Article") || t === "BlogPosting")) {
        n.author ? ok.push("author") : issues.push("author 없음");
      }
      for (const k of ["datePublished", "dateModified"]) {
        const v = str(n[k]);
        if (v) {
          ok.push(`${k} ${v.slice(0, 10)}`);
          dates.push(`${k}: ${v.slice(0, 10)}`);
        }
      }
      schemaNodes.push({ type: ts.join("/"), name: str(n.name ?? n.headline), ok, issues });
    }

    if (ts.includes("HowTo")) {
      schemaNodes.push({ type: "HowTo", name: str(n.name), ok: [`${asArray(n.step as unknown[]).length}스텝`], issues: [DEPRECATED_TYPES.HowTo] });
    }
    if (ts.includes("BreadcrumbList")) schemaNodes.push({ type: "BreadcrumbList", ok: [`${asArray(n.itemListElement as unknown[]).length}단계`], issues: [] });
    if (ts.includes("VideoObject")) schemaNodes.push({ type: "VideoObject", name: str(n.name), ok: n.transcript ? ["transcript 있음"] : [], issues: n.transcript ? [] : ["transcript 없음 (영상 내용은 AI가 읽지 못함)"] });
  }

  return {
    blocks: blocks.length,
    parseErrors,
    types,
    nodes: schemaNodes,
    products,
    faqQuestions: Array.from(new Set(faqQuestions)),
    deprecated: Array.from(new Set(deprecated)),
    organizationSameAs,
    hiddenValues,
    dates,
    rawJsonLd,
  };
}

// ---------- robots.txt ----------

type RobotsGroup = { agents: string[]; allow: string[]; disallow: string[] };

function parseRobots(txt: string): { groups: RobotsGroup[]; sitemaps: string[] } {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let cur: RobotsGroup | null = null;
  let curHasRules = false;
  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (!cur || curHasRules) {
        cur = { agents: [], allow: [], disallow: [] };
        groups.push(cur);
        curHasRules = false;
      }
      cur.agents.push(val.toLowerCase());
    } else if (key === "allow" || key === "disallow") {
      if (!cur) continue;
      curHasRules = true;
      if (val === "" && key === "disallow") continue; // 빈 Disallow = 전체 허용
      (key === "allow" ? cur.allow : cur.disallow).push(val);
    } else if (key === "sitemap") {
      sitemaps.push(val);
    }
  }
  return { groups, sitemaps };
}

function robotsPatternToRegex(p: string): RegExp {
  let body = p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  let anchor = "";
  if (body.endsWith("\\$") || body.endsWith("$")) {
    body = body.replace(/\\?\$$/, "");
    anchor = "$";
  }
  return new RegExp(`^${body}${anchor}`);
}

function robotsDecision(groups: RobotsGroup[], ua: string, path: string): { allowed: boolean; matchedGroup: string } {
  const lower = ua.toLowerCase();
  let matched = groups.filter((g) => g.agents.some((a) => a === lower || lower.startsWith(a) && a !== "*"));
  let label = ua;
  if (matched.length === 0) {
    matched = groups.filter((g) => g.agents.includes("*"));
    label = matched.length ? "*" : "none";
  }
  if (matched.length === 0) return { allowed: true, matchedGroup: label };
  let best: { allow: boolean; len: number } | null = null;
  for (const g of matched) {
    for (const rule of g.disallow) if (robotsPatternToRegex(rule).test(path) && (!best || rule.length > best.len || (rule.length === best.len && !best.allow))) best = { allow: false, len: rule.length };
    for (const rule of g.allow) if (robotsPatternToRegex(rule).test(path) && (!best || rule.length >= best.len)) best = { allow: true, len: rule.length };
  }
  return { allowed: best ? best.allow : true, matchedGroup: label };
}

// ---------- 인용 적합도 휴리스틱 ----------

const QUESTION_RE = /\?|어떻게|무엇|뭐가|뭘|왜|인가|일까|방법|차이|이란|란\s|하나요|할까|있나|있을까|추천|비교|how |what |why |which /i;

function analyzeCitability(contentHtml: string, h2: string[], h3: string[], visibleText: string) {
  const mainHtml = removeChrome(contentHtml);
  const paragraphs = matchAll(mainHtml, /<p(?:\s(?:[^>"']|"[^"]*"|'[^']*')*)?>([\s\S]*?)<\/p>/gi)
    .map((m) => stripTags(m[1]))
    .filter((t) => t.length >= 40 && /[가-힣a-zA-Z]{2}/.test(t) && !/onclick=|gtag_|href=/.test(t));
  const candidatePassages = paragraphs.filter((p) => p.length >= 180 && p.length <= 700).length;
  const firstParagraph = paragraphs[0] ?? null;
  const definitionPattern = /(는|은|이란|란)\s?[^.。]{2,80}(입니다|이다|을 말합니다|를 말합니다|의미합니다|뜻합니다)/.test(visibleText.slice(0, 1200));
  const sentences = visibleText.split(/(?<=[.!?。])\s+|(?<=다\.)\s*/).filter((s) => s.length > 8);
  const numericSentences = sentences.filter((s) => /\d+(\.\d+)?\s?(%|퍼센트|시간|일|배|건|명|원|mg|ml|ppm|회|개|점|위|kg|g\b|cm|mm)/.test(s)).length;
  const questionHeadings = [...h2, ...h3].filter((h) => QUESTION_RE.test(h)).slice(0, 12);
  return { paragraphs, candidatePassages, firstParagraph, definitionPattern, numericSentences, questionHeadings };
}

// ---------- 메인 ----------

export async function runAudit(input: string): Promise<AuditResult> {
  const started = Date.now();
  const target = normalizeTargetUrl(input);
  const origin = target.origin;

  const [pageRes, robotsRes, llms, llmsFull, sitemapXml] = await Promise.all([
    fetchText(target.toString()),
    fetchText(`${origin}/robots.txt`).catch(() => null),
    exists(`${origin}/llms.txt`),
    exists(`${origin}/llms-full.txt`),
    exists(`${origin}/sitemap.xml`),
  ]);

  if (pageRes.status >= 400) {
    throw new Error(`페이지 응답이 ${pageRes.status}입니다. URL을 확인해 주세요.`);
  }

  const html = pageRes.text;
  const headHtml = html.match(/<head[\s\S]*?<\/head>/i)?.[0] ?? html.slice(0, 20000);
  const bodyHtml = html.match(/<body[\s\S]*<\/body>/i)?.[0] ?? html;
  const contentHtml = removeNonContent(bodyHtml);
  const visibleText = stripTags(contentHtml);

  // ---- 온페이지 ----
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const titleText = title ? stripTags(title) : null;
  const metaDescription = metaContent(headHtml, "description");
  const canonical = linkHref(headHtml, "canonical");
  const lang = html.match(/<html[^>]*\slang=["']([^"']+)["']/i)?.[1] ?? null;
  const contentLanguage = pageRes.headers.get("content-language") ?? metaContent(headHtml, "content-language");
  const metaRobots = metaContent(headHtml, "robots") ?? metaContent(headHtml, "googlebot");
  const xRobotsTag = pageRes.headers.get("x-robots-tag");
  const robotsDirectives = `${metaRobots ?? ""} ${xRobotsTag ?? ""}`.toLowerCase();
  const snippetBlocked = /nosnippet|max-snippet:\s*0\b/.test(robotsDirectives) || /data-nosnippet/i.test(bodyHtml);
  const noindex = /\bnoindex\b/.test(robotsDirectives);
  const h1 = headings(contentHtml, 1);
  const h2 = headings(contentHtml, 2);
  const h3 = headings(contentHtml, 3);
  const hreflangCount = matchAll(headHtml, /<link[^>]+hreflang=["'][^"']+["'][^>]*>/gi).length;
  const imgs = matchAll(bodyHtml, /<img[^>]*>/gi).map((m) => m[0]);
  const imgAltMissing = imgs.filter((t) => !/\salt=["'][^"']+["']/i.test(t)).length;
  const listCount = matchAll(contentHtml, /<(ul|ol)[^>]*>/gi).length;
  const tableCount = matchAll(contentHtml, /<table[^>]*>/gi).length;
  const videoCount = matchAll(bodyHtml, /<(video|iframe)[^>]*(youtube|vimeo|\.mp4|player)[^>]*>/gi).length + matchAll(bodyHtml, /<video[^>]*>/gi).length;
  const hasNaverVerification = !!metaContent(headHtml, "naver-site-verification");
  const ogTitle = !!metaContent(headHtml, "og:title");
  const ogDescription = !!metaContent(headHtml, "og:description");

  const textChars = visibleText.replace(/\s/g, "").length;
  const textWords = visibleText.split(/\s+/).filter(Boolean).length;
  const csrHints: string[] = [];
  if (/id=["']__next["']|__NEXT_DATA__/.test(html)) csrHints.push("Next.js 앱 셸");
  if (/id=["']root["']\s*>\s*<\/div>/.test(html)) csrHints.push("빈 #root 컨테이너");
  if (/ng-app|ng-version/.test(html)) csrHints.push("Angular");
  if (/id=["']app["']\s*>\s*<\/div>/.test(html)) csrHints.push("빈 #app 컨테이너");
  const likelyCsr = textChars < 300 && csrHints.length > 0;

  // ---- 스키마 ----
  const schema = analyzeSchema(html, visibleText);

  // ---- 인용 적합도 ----
  const cit = analyzeCitability(contentHtml, h2, h3, visibleText);
  const dateSignals = [
    ...schema.dates,
    ...matchAll(bodyHtml, /<time[^>]+datetime=["']([^"']+)["']/gi).slice(0, 3).map((m) => `time: ${m[1].slice(0, 10)}`),
  ];
  const pub = metaContent(headHtml, "article:published_time");
  const mod = metaContent(headHtml, "article:modified_time");
  if (pub) dateSignals.push(`published_time: ${pub.slice(0, 10)}`);
  if (mod) dateSignals.push(`modified_time: ${mod.slice(0, 10)}`);

  // ---- robots ----
  const robotsFound = !!robotsRes && robotsRes.status === 200 && !/<html/i.test(robotsRes.text.slice(0, 300));
  const parsedRobots = robotsFound ? parseRobots(robotsRes!.text) : { groups: [], sitemaps: [] };
  const path = target.pathname + target.search;
  const crawlers: CrawlerStatus[] = CRAWLERS.map((c) => {
    const d = robotsDecision(parsedRobots.groups, c.ua, path);
    return { ua: c.ua, owner: c.owner, role: c.role, governs: c.governs, status: d.allowed ? "allowed" : "blocked", matchedGroup: robotsFound ? d.matchedGroup : "none", engines: c.engines };
  });

  // ---- findings ----
  const findings: Finding[] = [];
  let seq = 0;
  const add = (area: FindingArea, status: Finding["status"], title: string, detail: string, engines: Engine[], severity?: Severity) => {
    findings.push({ id: `F${String(++seq).padStart(2, "0")}`, area, status, severity: status === "fix" ? severity : undefined, title, detail, engines });
  };

  // 크롤러
  const blockedSearch = crawlers.filter((c) => c.role === "search" && c.status === "blocked");
  const blockedFetch = crawlers.filter((c) => c.role === "fetch" && c.status === "blocked");
  const blockedTraining = crawlers.filter((c) => c.role === "training" && c.status === "blocked");
  if (!robotsFound) {
    add("크롤러", "info", "robots.txt 없음 또는 비정상", "robots.txt가 없으면 모든 크롤러가 기본 허용됩니다. 다만 사이트맵 선언 위치가 없으므로 사이트맵을 GSC·Bing·서치어드바이저에 직접 제출해야 합니다.", ALL_ENGINES);
  } else if (blockedSearch.length === 0) {
    add("크롤러", "pass", `검색용 AI 크롤러 ${SEARCH_CRAWLERS.length}종 전부 허용`, `OAI-SearchBot · Googlebot · Claude-SearchBot · PerplexityBot · bingbot · Yeti가 이 경로에 접근할 수 있습니다.`, ALL_ENGINES);
  }
  for (const c of blockedSearch) {
    add("크롤러", "fix", `${c.ua} 차단 → ${c.engines.join("·")} 인용 불가`, `robots.txt(그룹 ${c.matchedGroup})가 이 경로를 막고 있습니다. ${c.governs}. 허용 규칙을 추가하고 CDN/WAF 차단도 함께 확인하세요.`, c.engines, "HIGH");
  }
  for (const c of blockedFetch) {
    add("크롤러", "fix", `${c.ua} 차단 → 실시간 fetch 불가`, `사용자 질의 시 페이지를 직접 읽어 답하는 경로가 막힙니다. ${c.governs}.`, c.engines, "MID");
  }
  if (blockedTraining.length) {
    add("크롤러", "info", `학습용 크롤러 ${blockedTraining.map((c) => c.ua).join("·")} 차단`, "학습용 UA 차단은 인용과 무관한 정책 선택입니다. 검색용 UA 판정과 합쳐 해석하지 않습니다.", []);
  }

  // 렌더링
  if (likelyCsr) {
    add("렌더링", "fix", "본문이 JS 실행 없이는 보이지 않음(CSR 추정)", `HTML만으로 취득한 본문이 ${textChars}자에 그치고 ${csrHints.join(", ")} 신호가 있습니다. AI 크롤러 대부분은 JS를 실행하지 않으므로 서버사이드 렌더링이 필요합니다.`, ALL_ENGINES, "HIGH");
  } else if (textChars < 300) {
    add("렌더링", "fix", `본문 텍스트가 매우 적음 (${textChars}자)`, "JS 없이 읽히는 텍스트가 거의 없습니다. 인용할 문장이 없으면 후보군에 들 수 없습니다.", ALL_ENGINES, "MID");
  } else {
    add("렌더링", "pass", `JS 없이 본문 ${textChars.toLocaleString()}자 · JSON-LD ${schema.blocks}블록 취득`, "AI 크롤러가 보는 방식(HTML만)으로도 본문과 구조화 데이터를 읽을 수 있습니다.", ALL_ENGINES);
  }
  if (noindex) add("온페이지", "fix", "noindex 지시자 감지", `robots 지시자: ${robotsDirectives.trim()}. 색인 자체가 막혀 어떤 엔진에서도 후보가 되지 않습니다.`, ALL_ENGINES, "HIGH");
  if (snippetBlocked) add("온페이지", "fix", "nosnippet / max-snippet:0 감지", "Google AI Overviews·AI Mode는 이 지시자가 있으면 단락을 인용하지 못합니다. Google-Extended가 아니라 이 지시자가 실제 제어 수단입니다.", ["Gemini·AIO"], "HIGH");

  // 스키마
  if (schema.blocks === 0) {
    add("스키마", "fix", "JSON-LD 구조화 데이터 없음", "Product·FAQ·Organization 등 구조화 데이터가 없습니다. Gemini는 JSON-LD 전용 문구까지 인용하고, ChatGPT는 정형 상품 데이터를 우선합니다.", ["Gemini·AIO", "ChatGPT", "네이버"], "HIGH");
  } else {
    add("스키마", "pass", `JSON-LD ${schema.blocks}블록 · 타입 ${schema.types.length}종`, schema.types.join(", "), ["Gemini·AIO", "ChatGPT", "네이버"]);
  }
  if (schema.parseErrors) add("스키마", "fix", `JSON-LD 파싱 오류 ${schema.parseErrors}건`, "JSON 문법 오류(후행 쉼표·이스케이프 등)가 있는 블록은 엔진이 무시합니다.", ["Gemini·AIO", "ChatGPT"], "MID");
  for (const p of schema.products) {
    const label = p.name ? `Product「${p.name.slice(0, 30)}」` : "Product";
    const high = p.missing.filter((m) => ["offers.price", "offers.availability", "식별자(sku·gtin·mpn·productID)"].includes(m));
    const mid = p.missing.filter((m) => ["offers.priceValidUntil", "offers.seller", "offers.itemCondition", "aggregateRating", "review", "review.author·reviewRating", "brand"].includes(m));
    if (high.length) add("스키마", "fix", `${label} 커머스 필수 필드 누락`, `${high.join(", ")} 없음. 가격·재고·식별자가 없는 페이지는 커머스 데이터 중심 엔진(ChatGPT)에서 "구매 가능한 상품"으로 인식되기 어렵습니다.`, ["ChatGPT", "Gemini·AIO", "Copilot"], "HIGH");
    if (mid.length) add("스키마", "fix", `${label} 권장 필드 누락`, `${mid.join(", ")} 없음. 평점·리뷰·판매자·가격 유효기간이 있어야 상품 카드 형식 답변에 실립니다.`, ["ChatGPT", "Gemini·AIO"], "MID");
    if (!high.length && !mid.length) add("스키마", "pass", `${label} 필드 완비`, p.present.join(", "), ["ChatGPT", "Gemini·AIO"]);
  }
  if (schema.faqQuestions.length) add("스키마", "pass", `FAQ ${schema.faqQuestions.length}문항 구조화`, "질문형 소재가 정형화되어 있어 비브랜드 질문 설계와 단락 인용에 유리합니다. (Google 리치결과 혜택은 2026-05 종료, AI 추출 소재로는 유효)", ["Gemini·AIO", "Perplexity", "네이버"]);
  if (schema.organizationSameAs === 0) add("스키마", "fix", "Organization sameAs 없음", "Wikipedia·Wikidata·공식 SNS·네이버 채널 등 엔티티 연결(sameAs)이 없습니다. Gemini·AI Overviews는 Knowledge Graph 엔티티 인식에 크게 의존합니다.", ["Gemini·AIO"], "MID");
  if (schema.organizationSameAs === null && schema.blocks > 0) add("스키마", "info", "Organization/Brand 노드 없음", "브랜드 엔티티 노드가 이 페이지에 없습니다. 사이트 공통 Organization 스키마가 다른 페이지에 있는지 확인하세요.", ["Gemini·AIO"]);
  for (const d of schema.deprecated) add("스키마", "fix", `지원 종료 타입: ${d.split(" — ")[0]}`, d.split(" — ")[1] ?? "", ["Gemini·AIO"], "LOW");

  // 정합성
  if (schema.hiddenValues.length) add("정합성", "fix", "구조화 데이터에만 있고 화면에 없는 값", `${schema.hiddenValues.join(" · ")}. 화면과 구조화 데이터가 다르면 신뢰 신호가 약해지고, 가격·리뷰는 판매 채널과 어긋날 수 있습니다.`, ["Gemini·AIO", "ChatGPT"], "MID");
  else if (schema.products.length) add("정합성", "pass", "구조화 데이터 값이 화면 텍스트에도 존재", "가격·리뷰·평점이 화면에 표시됩니다. 실제 판매 채널 가격과의 일치 여부는 별도 확인이 필요합니다.", ["ChatGPT", "Gemini·AIO"]);

  // 온페이지
  if (!titleText) add("온페이지", "fix", "<title> 없음", "제목이 없으면 검색 인덱스와 AI 출처 카드에 표시할 이름이 없습니다.", ALL_ENGINES, "HIGH");
  else if (titleText.length < 12) add("온페이지", "fix", `<title>이 짧음 ("${titleText}")`, "브랜드명만 있는 제목은 페이지 간 구분이 되지 않습니다. 제품명·주제를 포함하세요. (전 페이지 동일 여부는 사이트 단위 크롤로 확인)", ALL_ENGINES, "HIGH");
  else add("온페이지", "pass", `<title> ${titleText.length}자`, titleText, ALL_ENGINES);
  // h1이 페이지 제목(title)과 핵심어를 공유하는지 — 숨은 모달·약관 h1만 있는 경우를 잡아낸다
  const titleTokens = (titleText ?? "").split(/[\s|·\-–—:,()[\]]+/).filter((t) => t.length >= 3 && !/^aestura$|^home$/i.test(t));
  const h1Relevant = h1.some((h) => titleTokens.some((t) => h.toLowerCase().includes(t.toLowerCase())));
  if (h1.length === 0) add("온페이지", "fix", "<h1> 없음", "페이지 주제를 나타내는 h1이 없습니다. 제품명·주제를 h1에 넣으세요.", ALL_ENGINES, "HIGH");
  else if (titleTokens.length > 0 && !h1Relevant) add("온페이지", "fix", `<h1>이 페이지 주제와 무관 (${h1.length}개)`, `h1: "${h1[0].slice(0, 60)}" — 제목(title)의 핵심어가 h1에 없습니다. 제품명·주제를 담은 h1이 본문 상단에 있어야 엔진이 페이지 주제를 확정합니다.`, ALL_ENGINES, "HIGH");
  else if (h1.length > 1) add("온페이지", "fix", `<h1> ${h1.length}개`, "h1은 1개가 원칙입니다.", ALL_ENGINES, "LOW");
  else add("온페이지", "pass", "<h1> 1개", h1[0], ALL_ENGINES);
  if (h2.length === 0) add("온페이지", "fix", "<h2> 없음", "섹션 헤딩이 없으면 엔진이 단락을 주제별로 추출하기 어렵습니다. 질문형 h2 아래 2~3문장 직접 답변 구조를 권장합니다.", ["Gemini·AIO", "Perplexity", "네이버", "Claude"], "MID");
  if (!metaDescription) add("온페이지", "fix", "meta description 없음", "출처 카드·스니펫 요약의 기본 재료가 없습니다.", ALL_ENGINES, "MID");
  if (imgAltMissing > 0) add("온페이지", "fix", `이미지 alt 누락 ${imgAltMissing}/${imgs.length}`, "이미지 내용은 alt가 없으면 AI가 읽지 못합니다.", ALL_ENGINES, "LOW");
  if (!ogTitle || !ogDescription) add("온페이지", "fix", "Open Graph 태그 불완전", `og:title ${ogTitle ? "있음" : "없음"} · og:description ${ogDescription ? "있음" : "없음"}. 공유·출처 카드 표기에 쓰입니다.`, ALL_ENGINES, "LOW");

  // 국제화
  const canonicalMatches = canonical ? normUrl(new URL(canonical, target).toString()) === normUrl(pageRes.finalUrl) : null;
  if (!canonical) add("국제화", "fix", "canonical 없음", "쿼리 파라미터 변형 URL이 각각 색인되어 신호가 분산될 수 있습니다.", ALL_ENGINES, "MID");
  else if (canonicalMatches === false) add("국제화", "info", "canonical이 현재 URL과 다름", `canonical: ${canonical}. 모바일/PC 통합 등 의도된 설정인지 확인하세요.`, ALL_ENGINES);
  if (!lang) add("국제화", "fix", "<html lang> 없음", "문서 언어 선언이 없습니다. 한국어 콘텐츠면 lang=\"ko\"를 지정하세요.", ALL_ENGINES, "MID");
  if (lang && contentLanguage && !contentLanguage.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase())) {
    add("국제화", "fix", `content-language(${contentLanguage})와 lang(${lang}) 불일치`, "헤더와 문서 언어 선언이 다르면 언어 판정이 흔들립니다. 콘텐츠 언어에 맞춰 통일하세요.", ALL_ENGINES, "MID");
  }
  if (hreflangCount === 0) add("국제화", "info", "hreflang 없음", "다국어 사이트라면 언어·지역별 대체 URL을 선언해야 합니다. 단일 언어 사이트면 해당 없음.", GLOBAL_ENGINES);

  // AI 파일
  if (llms) add("AI 파일", "pass", "llms.txt 있음", `${llmsFull ? "llms-full.txt도 있음. " : ""}Google은 무시하지만 일부 AI 크롤러에는 사이트 안내로 쓰입니다.`, ["ChatGPT", "Claude", "Perplexity"]);
  else add("AI 파일", "fix", "llms.txt 없음", "Google 검색·AI Overviews에는 영향이 없습니다(공식 입장). 다른 AI 크롤러용 보조 안내로 /llms.txt 제공을 검토하세요. 인용 순위 지표로 쓰지 않습니다.", ["ChatGPT", "Claude", "Perplexity"], "LOW");
  if (sitemapXml || parsedRobots.sitemaps.length) add("등록", "pass", "사이트맵 확인", parsedRobots.sitemaps[0] ?? `${origin}/sitemap.xml`, ALL_ENGINES);
  else add("등록", "fix", "사이트맵 미확인", "/sitemap.xml이 없고 robots.txt에도 Sitemap 선언이 없습니다.", ALL_ENGINES, "MID");
  add("등록", "info", hasNaverVerification ? "네이버 서치어드바이저 인증 메타 있음" : "네이버 서치어드바이저 인증 메타 미검출", hasNaverVerification ? "네이버 색인 등록이 되어 있을 가능성이 높습니다." : "HTML 파일 업로드 등 다른 방식으로 인증했을 수 있습니다. 서치어드바이저에서 사이트 등록·Yeti 수집 상태를 확인하세요.", ["네이버"]);

  // 인용 적합도
  if (cit.questionHeadings.length === 0) add("인용 적합도", "fix", "질문형 헤딩 없음", "\"○○는 무엇인가\", \"○○ 어떻게 고르나\" 같은 질문형 h2/h3가 없습니다. 하위 질의(query fan-out)와 헤딩이 매칭될 때 그 아래 단락이 인용됩니다.", ["Gemini·AIO", "Perplexity", "네이버"], "MID");
  else add("인용 적합도", "pass", `질문형 헤딩 ${cit.questionHeadings.length}개`, cit.questionHeadings.slice(0, 3).join(" / "), ["Gemini·AIO", "Perplexity", "네이버"]);
  if (cit.candidatePassages === 0) add("인용 적합도", "fix", "인용 후보 단락(180~700자) 없음", "자기완결적으로 답하는 중간 길이 단락이 없습니다. 첫 30% 영역에 정의문·수치가 든 단락을 배치하세요.", ["Gemini·AIO", "Perplexity", "Claude", "네이버"], "MID");
  else add("인용 적합도", "pass", `인용 후보 단락 ${cit.candidatePassages}개`, "180~700자 범위의 자기완결 단락이 있습니다.", ["Gemini·AIO", "Perplexity", "Claude", "네이버"]);
  if (!cit.definitionPattern) add("인용 적합도", "fix", "첫 화면에 정의문 패턴 없음", "\"X는 Y입니다\" 형태의 직접 답변이 초반 1,200자 안에 없습니다. 네이버 AI 브리핑과 AI Overviews 모두 정의문을 우선 인용합니다.", ["Gemini·AIO", "네이버", "Perplexity"], "LOW");
  if (cit.numericSentences === 0) add("인용 적합도", "fix", "수치가 든 문장 없음", "통계·임상 수치·기간 같은 구체 수치가 인용 확률을 높입니다(통계 +31%, 인용구 +41% 보고).", GLOBAL_ENGINES, "LOW");
  if (dateSignals.length === 0) add("인용 적합도", "fix", "발행일·수정일 신호 없음", "Perplexity·Gemini는 최신성을 가중합니다. datePublished/dateModified 또는 <time>을 제공하세요.", ["Perplexity", "Gemini·AIO"], "MID");
  if (videoCount > 0 && textChars < 1500) add("인용 적합도", "fix", "영상 중심 페이지 — 텍스트 버전 부족", `영상 ${videoCount}개가 있지만 본문 텍스트가 ${textChars}자입니다. AI는 영상을 읽지 못하므로 같은 내용의 텍스트(요약·스크립트)를 함께 두세요.`, ALL_ENGINES, "MID");

  const summary = {
    pass: findings.filter((f) => f.status === "pass").length,
    high: findings.filter((f) => f.severity === "HIGH").length,
    mid: findings.filter((f) => f.severity === "MID").length,
    low: findings.filter((f) => f.severity === "LOW").length,
    searchCrawlersAllowed: crawlers.filter((c) => c.role === "search" && c.status === "allowed").length,
    searchCrawlersTotal: SEARCH_CRAWLERS.length,
  };

  return {
    url: target.toString(),
    finalUrl: pageRes.finalUrl,
    status: pageRes.status,
    fetchedAt: new Date().toISOString(),
    ms: Date.now() - started,
    page: {
      title: titleText,
      titleLength: titleText?.length ?? 0,
      metaDescription,
      canonical,
      canonicalMatches,
      lang,
      contentLanguage,
      metaRobots,
      xRobotsTag,
      snippetBlocked,
      noindex,
      h1,
      h2: h2.slice(0, 20),
      h3Count: h3.length,
      hreflangCount,
      imgCount: imgs.length,
      imgAltMissing,
      htmlBytes: html.length,
      textChars,
      textWords,
      paragraphCount: cit.paragraphs.length,
      listCount,
      tableCount,
      videoCount,
      hasNaverVerification,
      ogTitle,
      ogDescription,
      likelyCsr,
      csrHints,
    },
    citability: {
      questionHeadings: cit.questionHeadings,
      numericSentences: cit.numericSentences,
      candidatePassages: cit.candidatePassages,
      firstParagraph: cit.firstParagraph ? cit.firstParagraph.slice(0, 400) : null,
      definitionPattern: cit.definitionPattern,
      dates: Array.from(new Set(dateSignals)).slice(0, 6),
    },
    schema: {
      blocks: schema.blocks,
      parseErrors: schema.parseErrors,
      types: schema.types,
      nodes: schema.nodes,
      products: schema.products,
      faqQuestions: schema.faqQuestions.slice(0, 20),
      deprecated: schema.deprecated,
      organizationSameAs: schema.organizationSameAs,
      hiddenValues: schema.hiddenValues,
      rawJsonLd: schema.rawJsonLd,
    },
    robots: { found: robotsFound, sitemaps: parsedRobots.sitemaps, crawlers },
    files: { llmsTxt: llms, llmsFullTxt: llmsFull, sitemapXml },
    findings,
    summary,
  };
}
