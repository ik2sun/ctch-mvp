// 네이버 통합검색의 '네이버 가격비교'·'네이버플러스 스토어' 영역 파싱.
// 두 영역은 HTML 클래스명이 빌드마다 바뀌는 해시라, 페이지에 같이 실려 오는 초기 상태 JSON
// `naver.search.ext.newshopping["shopping"|"nstore"]._INITIAL_STATE = {...}`을 읽는다(2026-10 기준 구조).
// shopping = 가격비교(pagedSlot[].slots[].data), nstore = 플러스 스토어(products[]).
// 모바일 가격비교는 옆으로 넘기는 여러 페이지가 한꺼번에 오므로 첫 화면(1페이지)만 쓴다.

import type { Device } from "./rankChecker";

export type ShopSection = "price" | "store";
export type ShopKind = "ad" | "catalog" | "organic" | "superpoint";

export type ShopItem = {
  position: number; // 화면 노출 순서(1부터)
  kind: ShopKind;
  title: string;
  mall: string; // 판매처. 가격비교 묶음(catalog)은 "판매처 N곳"
  price: number | null; // 판매가(할인 적용)
  originalPrice: number | null; // 할인 전 가격(할인이 있을 때만)
  imageUrl: string;
  url: string; // 상품 페이지(없으면 네이버 클릭 URL)
  mallUrl: string;
  reviewScore: number | null;
  reviewCount: number | null;
};

export type ShoppingResult = {
  price: ShopItem[];
  store: ShopItem[];
  priceRank: number | null; // 타겟이 처음 나온 노출 순서
  storeRank: number | null;
};

// 키워드별로 고르는 수집 영역(competitor_keywords.collect_sections, 0036)
export type CollectSection = "powerlink" | "price" | "store";
export const ALL_SECTIONS: CollectSection[] = ["powerlink", "price", "store"];
export const COLLECT_LABEL: Record<CollectSection, string> = {
  powerlink: "파워링크",
  price: "가격비교",
  store: "플러스 스토어",
};

export function normalizeSections(v: unknown): CollectSection[] {
  if (!Array.isArray(v)) return ALL_SECTIONS; // 0036 전 = 전부
  const set = ALL_SECTIONS.filter((s) => v.includes(s));
  return set.length ? set : ALL_SECTIONS;
}

// 이력에 저장하는 모양 — 그 회차에 실제로 수집한 영역(sections)만 키가 있다.
// sections가 없는 예전 기록은 파워링크·가격비교·스토어를 모두 수집한 것으로 본다.
export type ShoppingSnapshot = {
  sections?: CollectSection[];
  price?: ShopItem[];
  store?: ShopItem[];
  priceRank?: number | null;
  storeRank?: number | null;
};

export function snapshotHas(snap: ShoppingSnapshot | null | undefined, section: CollectSection): boolean {
  if (!snap) return section === "powerlink"; // 0035 전 기록 = 파워링크만
  return snap.sections ? snap.sections.includes(section) : true;
}

export const SHOP_KIND_LABEL: Record<ShopKind, string> = {
  ad: "광고",
  catalog: "가격비교",
  organic: "일반",
  superpoint: "슈퍼적립",
};

export const SHOP_SECTION_LABEL: Record<ShopSection, string> = {
  price: "네이버 가격비교",
  store: "네이버플러스 스토어",
};

const MAX_ITEMS = 20;

// 네이버 상품 이미지 축소본(300px). shopping-phinf·searchad-phinf 둘 다 f300은 되고 f140 등은 404인 서버가 있다(2026-10-14 실측).
export function thumbUrl(url: string): string {
  if (!/^https:\/\/[^/]+\.pstatic\.net\//.test(url) || url.includes("?")) return url;
  return `${url}?type=f300`;
}

// `= {` 뒤에서 괄호 짝을 맞춰 JSON 본문만 잘라낸다(문자열 안의 괄호는 무시).
function sliceJson(html: string, start: number): string | null {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  return null;
}

function readStates(html: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const re = /naver\.search\.ext\.newshopping\["([^"]+)"\]\._INITIAL_STATE=/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const body = sliceJson(html, m.index + m[0].length);
    if (!body) continue;
    try {
      out[m[1]] = JSON.parse(body);
    } catch {
      // 구조가 바뀌어 깨진 블록은 건너뛴다
    }
  }
  return out;
}

type Raw = Record<string, unknown>;

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function cleanText(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function kindOf(d: Raw): ShopKind {
  const card = str(d.cardType);
  if (card === "CATALOG_CARD") return "catalog"; // 광고 묶음(AD)이어도 가격비교 묶음이 본질
  if (str(d.sourceType) === "AD" || card === "AD_CARD") return "ad";
  if (card === "SUPER_POINT_CARD") return "superpoint";
  return "organic";
}

function pick(urls: unknown, device: Device): string {
  const u = (urls ?? {}) as Raw;
  return device === "pc" ? str(u.pcUrl) || str(u.mobileUrl) : str(u.mobileUrl) || str(u.pcUrl);
}

function toItem(d: Raw, position: number, device: Device): ShopItem {
  const kind = kindOf(d);
  const extra = (d.shoppingExtraInfo ?? {}) as Raw;
  const mallCount = num(d.mallCount) ?? num(extra.mallCount);
  const mallName = cleanText(str(d.mallName));
  const sale = num(d.discountedSalePrice) ?? num(d.salePrice);
  const before = num(d.salePrice);
  const images = Array.isArray(d.images) ? (d.images as Raw[]) : [];
  return {
    position,
    kind,
    title: cleanText(str(d.productName)),
    mall: mallName || (mallCount ? `판매처 ${mallCount}곳` : ""),
    price: sale && sale > 0 ? sale : null,
    originalPrice: before && sale && before > sale ? before : null,
    imageUrl: str(images[0]?.imageUrl),
    url: pick(d.productUrl, device) || pick(d.productClickUrl, device),
    mallUrl: pick(d.mallUrl, device),
    reviewScore: num(d.averageReviewScore),
    reviewCount: num(d.totalReviewCount),
  };
}

export function parseShopping(html: string, device: Device): { price: ShopItem[]; store: ShopItem[] } {
  const states = readStates(html);

  const price: ShopItem[] = [];
  const shopping = (states.shopping as Raw | undefined)?.initProps as Raw | undefined;
  const pages = Array.isArray(shopping?.pagedSlot) ? (shopping!.pagedSlot as Raw[]) : [];
  const firstPage = pages.find((p) => p.page === 1) ?? pages[0];
  for (const slot of (firstPage?.slots as Raw[] | undefined) ?? []) {
    const d = slot.data as Raw | undefined;
    if (!d || !d.productName) continue;
    price.push(toItem(d, price.length + 1, device));
    if (price.length >= MAX_ITEMS) break;
  }

  const store: ShopItem[] = [];
  const nstore = (states.nstore as Raw | undefined)?.initProps as Raw | undefined;
  for (const d of (Array.isArray(nstore?.products) ? (nstore!.products as Raw[]) : [])) {
    if (!d.productName) continue;
    store.push(toItem(d, store.length + 1, device));
    if (store.length >= MAX_ITEMS) break;
  }

  return { price, store };
}

// 스마트스토어 몰 주소는 `inflow/outlink/url?url=<실제 주소>`로 감싸져 온다.
function hostOf(raw: string): string {
  if (!raw) return "";
  try {
    const u = new URL(raw);
    const inner = u.searchParams.get("url");
    const real = inner && /^https?:/.test(inner) ? new URL(inner) : u;
    const host = real.hostname.replace(/^(www|m)\./, "").toLowerCase();
    // 스마트스토어는 호스트가 같으니 스토어 경로까지 본다(smartstore.naver.com/northduck)
    if (/smartstore\.naver\.com|brand\.naver\.com/.test(host)) {
      const seg = real.pathname.split("/").filter(Boolean)[0];
      return seg && seg !== "main" && seg !== "inflow" ? `${host}/${seg}` : host;
    }
    return host;
  } catch {
    return "";
  }
}

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, "");

// 타겟 도메인 → 상품·몰 주소, 타겟 몰 이름 → 판매처·상품명(공백 무시 포함 관계)
export function findShopRank(items: ShopItem[], targetDomain: string | null, targetMall: string | null): number | null {
  const domain = targetDomain ? targetDomain.toLowerCase().replace(/^https?:\/\//, "").replace(/^(www|m)\./, "").replace(/\/$/, "") : "";
  const mall = targetMall ? squash(targetMall) : "";
  if (!domain && !mall) return null;
  for (const it of items) {
    if (domain) {
      const hosts = [hostOf(it.url), hostOf(it.mallUrl)].filter(Boolean);
      // 스토어 경로가 없는 상품 주소(smartstore.naver.com/main/…)는 몰 주소(mallUrl) 쪽으로 판정된다
      if (hosts.some((h) => h === domain || h.endsWith(`.${domain}`) || h.startsWith(`${domain}/`))) {
        return it.position;
      }
    }
    if (mall && (squash(it.mall).includes(mall) || squash(it.title).includes(mall))) return it.position;
  }
  return null;
}
