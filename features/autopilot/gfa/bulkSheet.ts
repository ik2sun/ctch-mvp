// 캠페인 오토파일럿 · GFA 엑셀 벌크 업로드 — 소재 유형별 시트 머리글, 행 해석, 이미지 파일명 ↔ 상품명 매칭(순수 함수)
// 소재 유형 3가지 = 시트 3가지(템플릿을 내려받을 때 유형을 고른다). 공식 소재 가이드 기준 — types.ts COPY_RULES 참고
//  · '네이티브 이미지': 한 행 = 상품 하나의 카피 → 매칭된 이미지 × 소재 유형(피드형·배너형 모바일·배너형 PC)만큼 소재. 유형마다 받는 문구 칸이 다르다
//    피드형의 가로·정사각·세로는 이미지 비율로 정한다(규격 칸 없음). 프로필 이름 = 광고계정 프로필 확인용(API로 소재별 지정 불가)
//  · '이미지 배너': 한 행 = 배너 이미지(들) → 광고 안내 문구(대체 텍스트) + 랜딩 URL
//  · '컬렉션': 한 행 = 카드 하나, 같은 광고그룹·소재 이름의 행 4~10개가 소재 하나
//  · 예전 '소재' 시트(유형 구분 없음)도 그대로 읽는다(제목 → 설명 문구1, 설명 → 설명 문구2)
// 열 '캠페인'(선택): 비우면 화면에서 고른 캠페인 전부, 이름·ID를 적으면 그 캠페인에만
// 시트 '광고그룹'(선택): adSetSheet.ts — 기존 광고그룹 설정 전 항목 내보내기, 새 광고그룹 설정
import {
  ALL_TEMPLATES,
  BANNER_TEMPLATES,
  COLLECTION_CARDS,
  COLLECTION_TEMPLATE,
  SINGLE_IMAGE_TEMPLATES,
  autoTemplates,
  type CreativeKind,
  type PlanCopy,
  type TemplateSpec,
} from "./types";

export type Family = "native" | "banner" | "collection";
export const FAMILIES: Family[] = ["banner", "native", "collection"]; // 화면·안내 순서
export const FAMILY_LABEL: Record<Family, string> = { native: "네이티브 이미지", banner: "이미지 배너", collection: "컬렉션" };
export const FAMILY_DESC: Record<Family, string> = {
  native: "피드형(1200×628·1200×1200·1200×1800) · 배너형 모바일·PC(342×228) — 프로필 + 광고 문구·설명 문구·CTA",
  banner: "스마트채널(750×160·750×280) · 배너(750×200·1250×560·1200×1200) — 글자가 이미지 안, 광고 안내 문구 + 랜딩 URL",
  collection: "600×600 카드 4~10장(카드마다 설명 문구·랜딩 URL) + 프로필·광고 문구·CTA",
};
const FAMILY_KIND: Record<Exclude<Family, "collection">, CreativeKind> = { native: "SINGLE_IMAGE", banner: "IMAGE_BANNER" };
export const LEGACY_SHEET = "소재";

export const NATIVE_HEADERS = ["캠페인", "광고그룹", "소재 유형", "프로필 이름", "상품명", "이미지 파일명", "광고 문구", "설명 문구1", "설명 문구2", "설명 문구3", "PC 긴 설명1", "PC 긴 설명2", "고지 문구", "CTA", "랜딩 URL", "소재 이름"] as const;
export const BANNER_HEADERS = ["캠페인", "광고그룹", "상품명", "이미지 파일명", "소재 규격", "광고 안내 문구", "랜딩 URL", "소재 이름"] as const;
export const COLLECTION_HEADERS = ["캠페인", "광고그룹", "소재 이름", "프로필 이름", "광고 문구", "CTA", "CTA URL", "이미지 파일명", "카드 설명 문구", "카드 랜딩 URL"] as const;
export const PROFILE_HEADER = "프로필 이름";
export const HEADERS: Record<Family, readonly string[]> = { native: NATIVE_HEADERS, banner: BANNER_HEADERS, collection: COLLECTION_HEADERS };
// 예전 '소재' 시트 머리글 — 읽기만
const LEGACY_HEADERS = ["캠페인", "광고그룹", "상품명", "이미지 파일명", "소재 규격", "광고 문구", "제목", "설명", "광고 안내 문구", "CTA", "랜딩 URL", "소재 이름"];
// 열 이름이 달라도 같은 칸으로 읽는다(예전 템플릿 호환)
const ALIASES: Record<string, string[]> = { "설명 문구1": ["제목"], "설명 문구2": ["설명"] };

export const COL_WIDTHS: Record<Family, number[]> = {
  native: [24, 30, 16, 16, 16, 36, 40, 14, 14, 14, 24, 24, 24, 14, 40, 30, 36],
  banner: [24, 30, 16, 40, 16, 50, 40, 30, 36],
  collection: [24, 30, 20, 16, 40, 14, 40, 36, 24, 40, 36],
};

export const SAMPLES: Record<Family, string[][]> = {
  native: [
    ["", "1005_핵심3040_aall", "피드형", "", "링티 레몬맛", "", "물보다 빠른 수분 보충, 링티 레몬맛으로 상큼하게", "", "", "", "", "", "", "지금 구매하기", "https://example.com/products/lemon", ""],
    ["", "1005_핵심3040_aall", "피드형", "", "링티 복숭아맛", "peach_01.jpg, peach_02.jpg", "달콤한 복숭아맛 수분 보충", "", "", "", "", "", "", "BUY", "https://example.com/products/peach", ""],
    ["", "1005_네이티브_aall", "배너형(모바일)", "", "링티 제로", "zero_342x228.jpg", "칼로리 걱정 없는 링티 제로", "제로 칼로리", "운동 전후", "수분 보충", "", "", "", "더 알아보기", "https://example.com/products/zero", ""],
    ["", "1005_네이티브PC_aall", "배너형(PC)", "", "링티 제로", "zero_342x228.jpg", "칼로리 걱정 없는 링티 제로", "", "", "", "운동 전후 마시는 제로 칼로리 음료", "지금 구매하면 1+1 증정", "", "더 알아보기", "https://example.com/products/zero", ""],
  ],
  banner: [
    ["", "1005_스마트채널_aall", "", "스마트채널_썸네일형_750x280_05.png", "", "르무통 가을 단풍 시즌 최대 30% 할인, 메리노울 워킹화", "https://example.com/event/fall", ""],
    ["", "1005_메인배너_aall", "", "메인배너_1250x560.jpg", "", "르무통 가을 신상 출시 기념 무료배송", "https://example.com/event/new", ""],
  ],
  collection: [
    ["", "1005_피드_aall", "컬렉션01", "", "가을 신상 워킹화 모아보기", "지금 구매하기", "https://example.com/event/fall", "col_01.jpg", "메리노울 워킹화", "https://example.com/products/1"],
    ["", "1005_피드_aall", "컬렉션01", "", "", "", "", "col_02.jpg", "가벼운 러닝화", "https://example.com/products/2"],
    ["", "1005_피드_aall", "컬렉션01", "", "", "", "", "col_03.jpg", "방수 트레킹화", "https://example.com/products/3"],
    ["", "1005_피드_aall", "컬렉션01", "", "", "", "", "col_04.jpg", "키즈 운동화", "https://example.com/products/4"],
  ],
};

const PROFILE_GUIDE = [
  "프로필 이름",
  "확인용. GFA는 프로필(이미지·이름)을 소재마다 받지 않고 광고계정에 등록된 프로필(광고 계정 관리 > 프로필 관리)을 자동으로 붙인다 — 생성 API에 프로필 칸이 없어 여기 적어도 바뀌지 않는다. 템플릿에는 지금 계정 프로필 이름이 채워지고, 다른 이름을 적으면 미리보기에서 멈춘다(실수로 다른 브랜드 프로필로 나가는 것 방지). 비워도 된다. 프로필을 바꾸려면 GFA에서 계정 프로필을 바꾼 뒤 올린다",
];
const COMMON_GUIDE = [
  ["캠페인", "선택. 비우면 화면에서 고른 캠페인 전부에 같은 소재가 들어간다. 캠페인 이름이나 ID(번호)를 적으면 그 캠페인에만(쉼표로 여러 개)"],
  ["광고그룹", "필수. 캠페인에 같은 이름이 있으면 그 광고그룹에, 없으면 새로 만든다(설정은 '광고그룹' 시트의 같은 이름 행, 없으면 GFA 캠페인 기본값·화면의 기본 예산). 광고그룹 게재 위치가 그 소재 유형을 받아야 한다"],
];
export const GUIDES: Record<Family, string[][]> = {
  native: [
    ["항목", "설명 — 네이티브 이미지(공식 소재 가이드 기준)"],
    ...COMMON_GUIDE,
    ["소재 유형", "피드형 / 배너형(모바일) / 배너형(PC) 중 하나(쉼표로 여러 개면 그만큼 소재). 피드형의 가로(1200×628)·정사각(1:1)·세로(2:3)는 이미지 비율로 자동 — 맞는 비율이 없으면 화면의 기본 피드 규격으로 잘라 씀. 배너형은 342×228. 비우면 이미지 크기로 자동(342×228 = 배너형, 나머지 = 피드형)"],
    PROFILE_GUIDE,
    ["상품명", "상품명 또는 이미지 파일명 중 하나는 필수. 파일명에 상품명이 들어 있는 이미지가 자동으로 붙는다(띄어쓰기·대소문자·_·- 무시, 겹치면 더 긴 이름 우선)"],
    ["이미지 파일명", "선택. 쉼표로 여러 개. 적으면 상품명 매칭 대신 이 파일만"],
    ["유형별 필수 칸", "피드형: 광고 문구 2~65자만 (설명 문구 칸 없음) / 배너형(모바일): 광고 문구 2~20 + 설명 문구1·2·3 각 2~12 / 배너형(PC): 광고 문구 2~20 + PC 긴 설명1·2 각 2~28 / 고지 문구: 배너형만, 선택, 최대 45. 유형이 안 받는 칸은 GFA에 보내지 않는다"],
    ["CTA", "필수(비우면 더 알아보기). 더 알아보기·지금 구매하기·지금 구경하기·쿠폰 받기 등 또는 MORE·BUY 코드. 광고그룹이 안 받는 CTA면 더 알아보기로 바꿈"],
    ["랜딩 URL", "필수. http로 시작. UTM이 없으면 자동으로 붙일 수 있다(화면 옵션)"],
    ["소재 이름", "선택. 비우면 광고그룹_상품명_01_sq 형식으로 자동"],
    ["프로필 등록", "광고계정에 프로필이 등록돼 있지 않으면 네이티브 소재를 만들 수 없다(GFA 광고 계정 관리 > 프로필 관리)"],
  ],
  banner: [
    ["항목", "설명 — 이미지 배너(공식 소재 가이드 기준)"],
    ...COMMON_GUIDE,
    ["상품명", "상품명 또는 이미지 파일명 중 하나는 필수(이미지 매칭용)"],
    ["이미지 파일명", "선택. 쉼표로 여러 개"],
    ["소재 규격", "선택(권장: 비움). 비우면 이미지 크기로 자동 — 750×160·750×280 = 스마트채널, 750×200·1250×560·1200×1200 = 배너. 배너는 잘라 쓰지 않아 비율이 맞는 이미지에만(±2%, 크기가 다르면 같은 비율로 줄임). 직접 적을 때: 스마트채널·배너 또는 750x280 같은 크기"],
    ["광고 안내 문구", "필수(GFA) 2~100자. 화면 낭독기가 시각장애인에게 읽어 주는 대체 텍스트 — 이미지 속 글자(브랜드·혜택·기간)를 그대로 적는다. 비우면 상품명을 대신 넣고 미리보기에 경고"],
    ["랜딩 URL", "필수. http로 시작"],
    ["소재 이름", "선택. 비우면 광고그룹_파일명_sc280 형식으로 자동"],
    ["행동 유도 버튼", "이미지 배너의 버튼 문구·URL은 GFA API에 칸이 없어 넣을 수 없다(필요하면 GFA 화면에서)"],
  ],
  collection: [
    ["항목", "설명 — 컬렉션(이미지 컬렉션, 공식 소재 가이드 기준)"],
    ...COMMON_GUIDE,
    ["소재 이름", "필수. 같은 광고그룹에서 소재 이름이 같은 행들이 컬렉션 소재 하나 — 카드(행) 4~10개"],
    PROFILE_GUIDE,
    ["광고 문구", "필수 2~65자. 묶음의 첫 행에만 적어도 된다"],
    ["CTA / CTA URL", "CTA는 비우면 더 알아보기. CTA URL은 필수(http) — 묶음 첫 행에만 적어도 되고, 비우면 첫 카드 랜딩 URL"],
    ["이미지 파일명", "필수. 카드 이미지 — 600×600으로 가운데 잘라 올린다(정사각 권장)"],
    ["카드 설명 문구", "필수 2~28자"],
    ["카드 랜딩 URL", "필수. http로 시작"],
    ["동영상 컬렉션", "동영상 + 이미지 컬렉션은 동영상 업로드가 필요해 이 업로드에서는 지원하지 않는다"],
  ],
};
export const GUIDE_TAIL = [
  ["미리 채운 행", "캠페인을 고르고 내려받으면 그 캠페인과 기존 광고그룹이 행마다 채워져 있다. 쓸 행에만 내용을 적고, 안 쓰는 행은 그대로 두면 건너뛴다"],
  ["이미지를 먼저 불러온 경우", "구글 드라이브·내 PC 이미지를 먼저 불러오고 내려받으면 이미지 1장 = 1행으로 이미지 파일명·소재 이름(파일명)이 채워진다. 광고그룹은 이름으로 확실히 고를 수 있을 때만 채워지니 빈 칸을 채운다(기존 이름은 '광고그룹' 시트). 맨 끝 '참고: 인식 규격' 열은 확인용이라 고치지 않아도 된다. 안 쓸 이미지 행은 지운다"],
];

// ── 불러온 이미지로 시트 미리 채우기 ─────────────────
// 이미지(구글 드라이브·내 PC)를 먼저 불러오고 템플릿을 내려받으면 이미지 1장 = 1행: 이미지 파일명·소재 이름(확장자 뺀 파일명)을 채우고,
// 마지막 '참고' 열에 이미지 크기로 자동 인식한 규격을 적는다(해석 때는 무시되는 열). 광고그룹은 이름으로 확실히 하나만 고를 수 있을 때만 채운다
export const IMAGE_REF_HEADER = "참고: 인식 규격(수정 불필요)";

type Placement = "smart" | "banner" | "feed" | "native";
function placementOf(t: TemplateSpec): Placement {
  if (t.code === "BANNER_750" || t.code === "BANNER_750X280") return "smart";
  if (t.kind === "IMAGE_BANNER") return "banner";
  return t.code.startsWith("NATIVE_") ? "native" : "feed";
}
const PLACEMENT_WORDS: Record<Placement, RegExp> = {
  smart: /smartchannel|스마트채널/,
  banner: /banner|배너|main|메인/,
  feed: /feed|피드/,
  native: /native|네이티브/,
};

// 광고그룹 추정 — 기존 광고그룹이 하나뿐이면 그것, 아니면 이름에 지면 단어(smartchannel·banner·feed·native)가 든 광고그룹이 딱 하나일 때만
export function guessAdSet(t: TemplateSpec | undefined, adSetNames: string[]): string {
  const names = [...new Set(adSetNames.map((n) => n.trim()).filter(Boolean))];
  if (names.length === 1) return names[0];
  if (!t) return "";
  const re = PLACEMENT_WORDS[placementOf(t)];
  const hits = names.filter((n) => re.test(n.toLowerCase().replace(/[\s_\-]/g, "")));
  return hits.length === 1 ? hits[0] : "";
}

type Img = { name: string; width: number; height: number };
const baseName = (n: string) => n.replace(/\.[^.]+$/, "").trim().slice(0, 128);

// 유형에 맞는 이미지만 행으로 — 네이티브 = 배너 비율이 아닌 이미지, 배너 = 배너 비율 이미지(없으면 전부), 컬렉션 = 전부(10장씩 묶음)
export function imageTemplateRows(family: Family, images: Img[], adSetNames: string[]): string[][] {
  const sorted = [...images].sort((a, b) => a.name.localeCompare(b.name, "ko", { numeric: true }));
  const headers = HEADERS[family];
  const row = (cells: Record<string, string>, ref: string) => [...headers.map((h) => cells[h] ?? ""), ref];
  if (family === "collection") {
    return sorted.map((img, i) => {
      const group = `컬렉션${String(Math.floor(i / COLLECTION_CARDS.max) + 1).padStart(2, "0")}`;
      const ref = `${img.width}×${img.height} → ${COLLECTION_TEMPLATE.label}${img.width === img.height ? "" : "(가운데 잘림)"}`;
      return row({ 광고그룹: guessAdSet(SINGLE_IMAGE_TEMPLATES[1], adSetNames), "소재 이름": group, "이미지 파일명": img.name }, ref);
    });
  }
  const kind = FAMILY_KIND[family];
  const withTpl = sorted.map((img) => ({ img, t: autoTemplates(img, kind, kind)[0], other: autoTemplates(img, kind)[0] }));
  let pick = withTpl.filter((x) => (family === "banner" ? !!x.t : !(x.other && x.other.kind === "IMAGE_BANNER" && !x.t)));
  if (family === "banner" && !pick.length) pick = withTpl;
  return pick.map(({ img, t }) => {
    const ref = t
      ? `${img.width}×${img.height} → ${t.label}${t.code === "NATIVE_SINGLE_IMAGE_V2" ? "(PC면 소재 유형을 배너형(PC)로)" : ""}`
      : family === "banner"
        ? `${img.width}×${img.height} → 배너 규격과 비율이 달라요(배너는 잘라 쓰지 않음)`
        : `${img.width}×${img.height} → 맞는 규격 없음(화면의 기본 규격으로 잘라 씀)`;
    const base = baseName(img.name);
    const nativeType = family === "native" ? (t?.code.startsWith("NATIVE_") ? NATIVE_TYPE_LABEL.mobile : NATIVE_TYPE_LABEL.feed) : "";
    return row({ 광고그룹: guessAdSet(t, adSetNames), "소재 유형": nativeType, "이미지 파일명": img.name, "소재 이름": base.length >= 2 ? base : "" }, ref);
  });
}

// GFA CTA 전체(실계정 callToActions 응답, 2026-10-04) — 한글 이름이나 코드 둘 다 받는다
export const CTA_ALL = [
  { value: "MORE", name: "더 알아보기" },
  { value: "RESERVE", name: "지금 예약하기" },
  { value: "ASK", name: "문의하기" },
  { value: "DOWNLOAD", name: "다운로드" },
  { value: "BUY", name: "지금 구매하기" },
  { value: "JOIN", name: "가입하기" },
  { value: "PLAY_VIDEO", name: "동영상 더보기" },
  { value: "N_APPLY", name: "지금 신청하기" },
  { value: "N_COUPON", name: "쿠폰 받기" },
  { value: "N_RENT", name: "지금 렌탈하기" },
  { value: "N_LOOK", name: "지금 구경하기" },
  { value: "N_ACCOUNT", name: "계좌 개설하기" },
  { value: "N_INSURANCE", name: "내보험료 확인" },
  { value: "N_ESTIMATION", name: "견적 요청하기" },
  { value: "NO_ACTION", name: "버튼 없음" },
];

// 네이티브 이미지·이미지 배너 행(예전 '소재' 시트 = mixed)
export type BulkRow = {
  key: string; // 시트:행 — 시트가 여러 개라 행 번호만으로는 겹친다
  sheet: string;
  row: number; // 엑셀 행 번호(머리글 = 1)
  family: "native" | "banner" | "mixed";
  campaigns: string[]; // 비면 선택한 캠페인 전부
  adSetName: string;
  product: string;
  files: string[];
  templates: string[] | null; // null = 이미지 크기로 자동(배너·예전 시트의 '소재 규격')
  nativeTypes: NativeType[] | null; // 네이티브 '소재 유형' — null = 이미지 크기로 자동
  profileName: string; // 확인용 — 계정 프로필과 다르면 화면이 멈춘다
  copy: PlanCopy; // 네이티브 문구 칸 전부 — 보낼 칸은 템플릿이 정한다
  landingUrl: string;
  name: string;
  altMessage: string; // 배너 광고 안내 문구(대체 텍스트) — 비면 altFallback
  altFallback: string;
  errors: string[];
  warnings: string[];
};

// 컬렉션 — 같은 광고그룹·소재 이름 행 묶음 = 소재 하나
export type CollectionCard = { row: number; file: string; title: string; url: string };
export type CollectionGroup = {
  key: string;
  sheet: string;
  rows: number[];
  campaigns: string[];
  adSetName: string;
  name: string;
  profileName: string;
  message: string;
  cta: string;
  ctaUrl: string;
  cards: CollectionCard[];
  errors: string[];
  warnings: string[];
};

// ── 정규화·매칭 ─────────────────────────────────────
export function norm(s: string) {
  return s
    .normalize("NFC")
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,5}$/, "")
    .replace(/[\s_\-()[\]{}.,+·]/g, "");
}

// 각 이미지를 상품명 하나에 배정 — 파일명(정규화)에 상품명(정규화)이 들어 있는 것 중 가장 긴 상품명
export function matchImages<T extends { name: string }>(products: string[], files: T[]): { byProduct: Map<string, T[]>; unmatched: T[] } {
  const keys = [...new Set(products.filter(Boolean))].map((p) => ({ p, n: norm(p) })).filter((x) => x.n.length >= 2);
  keys.sort((a, b) => b.n.length - a.n.length);
  const byProduct = new Map<string, T[]>();
  const unmatched: T[] = [];
  for (const f of files) {
    const fn = norm(f.name);
    const hit = keys.find((k) => fn.includes(k.n));
    if (!hit) {
      unmatched.push(f);
      continue;
    }
    byProduct.set(hit.p, [...(byProduct.get(hit.p) ?? []), f]);
  }
  for (const list of byProduct.values()) list.sort((a, b) => norm(a.name).localeCompare(norm(b.name), "ko", { numeric: true }));
  return { byProduct, unmatched };
}

// ── 값 해석 ─────────────────────────────────────────
const cell = (v: unknown) => (v == null ? "" : String(v).trim());

// 소재 규격 칸 해석 — 비우거나 '자동'이면 null(이미지 크기로 자동). 시트 유형에 없는 규격은 오류(네이티브 시트에 배너 등)
export function parseTemplates(v: string, family: BulkRow["family"] = "mixed"): { codes: string[] | null; bad: string[] } {
  const codes: string[] = [];
  const bad: string[] = [];
  const add = (c: string) => {
    if (!codes.includes(c)) codes.push(c);
  };
  for (const raw of v.split(/[,/·\n]+/).map((x) => x.trim()).filter(Boolean)) {
    const x = raw.toLowerCase().replace(/\s/g, "");
    if (/^(자동|auto)$/.test(x)) continue;
    const code = ALL_TEMPLATES.find((s) => s.code.toLowerCase() === x);
    const size = x.match(/(\d{3,4})[x×*](\d{3,4})/);
    const banner = /(배너|banner)/.test(x) || family === "banner";
    const before = codes.length;
    if (code) add(code.code);
    else if (size) {
      const [w, h] = [Number(size[1]), Number(size[2])];
      const hits = ALL_TEMPLATES.filter((t) => t.width === w && t.height === h && t.code !== "NATIVE_SINGLE_IMAGE_PC");
      const pick = hits.find((t) => (banner ? t.kind === "IMAGE_BANNER" : t.kind === "SINGLE_IMAGE")) ?? hits[0];
      if (pick) add(pick.code);
    } else if (/(스마트채널|smartchannel)/.test(x)) ["BANNER_750", "BANNER_750X280"].forEach(add);
    else if (/(배너|banner)/.test(x)) BANNER_TEMPLATES.forEach((t) => add(t.code));
    else if (/(네이티브|native)/.test(x) && /pc/.test(x)) add("NATIVE_SINGLE_IMAGE_PC");
    else if (/(네이티브|native)/.test(x)) add("NATIVE_SINGLE_IMAGE_V2");
    else if (/(가로|1\.91)/.test(x)) add("FEED_SINGLE_IMAGE");
    else if (/(정사각|1:1|스퀘어|square)/.test(x)) add("FEED_SINGLE_IMAGE_SQUARE");
    else if (/(세로|2:3)/.test(x)) add("FEED_SINGLE_IMAGE_2TO3");
    if (codes.length === before) bad.push(raw);
  }
  // 시트 유형과 안 맞는 규격
  if (family !== "mixed") {
    const kind = FAMILY_KIND[family];
    const wrong = codes.filter((c) => ALL_TEMPLATES.find((t) => t.code === c)?.kind !== kind);
    if (wrong.length) {
      bad.push(...wrong.map((c) => `${ALL_TEMPLATES.find((t) => t.code === c)?.label}(${family === "native" ? "이미지 배너 시트에" : "네이티브 이미지 시트에"} 적어 주세요)`));
      return { codes: codes.filter((c) => !wrong.includes(c)).length ? codes.filter((c) => !wrong.includes(c)) : null, bad };
    }
  }
  return { codes: codes.length ? codes : null, bad };
}

// 네이티브 '소재 유형' — 피드형 / 배너형(모바일) / 배너형(PC). 비우면 null(자동)
export type NativeType = "feed" | "mobile" | "pc";
export const NATIVE_TYPE_LABEL: Record<NativeType, string> = { feed: "피드형", mobile: "배너형(모바일)", pc: "배너형(PC)" };
export function parseNativeTypes(v: string): { types: NativeType[] | null; bad: string[] } {
  const types: NativeType[] = [];
  const bad: string[] = [];
  for (const raw of v.split(/[,/·\n]+/).map((x) => x.trim()).filter(Boolean)) {
    const x = raw.toLowerCase().replace(/[\s()]/g, "");
    const t: NativeType | null = /피드|feed/.test(x) ? "feed" : /pc/.test(x) ? "pc" : /배너|모바일|mobile|banner|네이티브|native/.test(x) ? "mobile" : null;
    if (!t) bad.push(raw);
    else if (!types.includes(t)) types.push(t);
  }
  return { types: types.length ? types : null, bad };
}

export function parseCta(v: string): string | null {
  const x = v.trim();
  if (!x) return "MORE";
  const hit = CTA_ALL.find((c) => c.value.toLowerCase() === x.toLowerCase() || c.name.replace(/\s/g, "") === x.replace(/\s/g, ""));
  return hit?.value ?? null;
}

// 머리글 행을 찾아 열 위치를 잡는다(열 순서가 바뀌어도 됨, ALIASES = 예전 이름)
function columns(header: unknown[], names: readonly string[]) {
  const h = header.map((x) => cell(x).replace(/\s/g, ""));
  const at = (n: string) => h.indexOf(n.replace(/\s/g, ""));
  return Object.fromEntries(names.map((n) => [n, [n, ...(ALIASES[n] ?? [])].map(at).find((i) => i >= 0) ?? -1])) as Record<string, number>;
}
const isUrl = (u: string) => /^https?:\/\//i.test(u);
const list = (v: string) => v.split(/[,\n]+/).map((x) => x.trim()).filter(Boolean);

// 시트 이름·머리글로 유형 판단 — 유형 이름 시트가 우선, 아니면 머리글(카드 설명 문구 = 컬렉션, 광고 문구 없이 광고 안내 문구 = 배너)
export function sheetFamily(sheetName: string, matrix: unknown[][]): BulkRow["family"] | "collection" | null {
  const byName = (Object.keys(FAMILY_LABEL) as Family[]).find((f) => FAMILY_LABEL[f] === sheetName.trim());
  if (byName) return byName;
  const head = matrix.slice(0, 10).find((r) => r.some((x) => cell(x) === "광고그룹"));
  if (!head) return null;
  const has = (n: string) => head.some((x) => cell(x).replace(/\s/g, "") === n.replace(/\s/g, ""));
  if (has("카드 설명 문구")) return "collection";
  if (!has("상품명")) return null;
  if (has("광고 안내 문구") && !has("광고 문구")) return "banner";
  if (has("제목") || sheetName.trim() === LEGACY_SHEET) return "mixed";
  return "native";
}

export function parseCreativeSheet(matrix: unknown[][], family: BulkRow["family"] = "mixed", sheet = LEGACY_SHEET): { rows: BulkRow[]; error?: string } {
  const headerIdx = matrix.findIndex((r) => r.some((x) => cell(x) === "광고그룹") && r.some((x) => cell(x) === "상품명" || cell(x) === "이미지 파일명"));
  if (headerIdx < 0) return { rows: [], error: `'${sheet}' 시트에서 '광고그룹'·'상품명' 머리글을 찾지 못했어요. 템플릿을 내려받아 쓰세요.` };
  const names = family === "native" ? NATIVE_HEADERS : family === "banner" ? BANNER_HEADERS : [...new Set([...LEGACY_HEADERS, ...NATIVE_HEADERS])];
  const col = columns(matrix[headerIdx], names);
  const get = (r: unknown[], k: string) => (col[k] >= 0 ? cell(r[col[k]]) : "");
  const content = names.filter((n) => !["캠페인", "광고그룹", "소재 규격", "소재 유형", "프로필 이름", "CTA", "소재 이름"].includes(n));
  const rows: BulkRow[] = [];
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const r = matrix[i];
    if (!r || r.every((x) => !cell(x))) continue;
    // 템플릿이 미리 채운 캠페인·광고그룹만 있고 소재 내용이 빈 행은 건너뛴다(안 쓰는 광고그룹)
    if (content.every((k) => !get(r, k))) continue;
    const errors: string[] = [];
    const warnings: string[] = [];
    const adSetName = get(r, "광고그룹");
    const product = get(r, "상품명");
    const files = list(get(r, "이미지 파일명"));
    if (adSetName.length < 2) errors.push("광고그룹 이름 없음");
    if (!product && !files.length) errors.push("상품명 또는 이미지 파일명 필요");
    const tpl = parseTemplates(get(r, "소재 규격"), family);
    if (tpl.bad.length) errors.push(`모르는 규격: ${tpl.bad.join(", ")}`);
    const nt = parseNativeTypes(get(r, "소재 유형"));
    if (nt.bad.length) errors.push(`모르는 소재 유형: ${nt.bad.join(", ")}(피드형·배너형(모바일)·배너형(PC))`);
    const cta = parseCta(get(r, "CTA"));
    if (!cta) errors.push(`모르는 CTA: ${get(r, "CTA")}`);
    const copy: PlanCopy = {
      message: get(r, "광고 문구"),
      linkTitle: get(r, "설명 문구1"),
      linkDescription: get(r, "설명 문구2"),
      linkText3rd: get(r, "설명 문구3"),
      linkText4th: get(r, "PC 긴 설명1"),
      linkText5th: get(r, "PC 긴 설명2"),
      adviceMessage: get(r, "고지 문구"),
      cta: cta ?? "MORE",
    };
    // 필수·글자 수는 템플릿마다 달라 규격이 정해진 뒤 화면이 점검한다(templateCopyProblems). 여기서는 배너 대체 텍스트만
    const altMessage = get(r, "광고 안내 문구");
    if (altMessage.length === 1) errors.push("광고 안내 문구는 비우거나 2자 이상");
    if (altMessage.length > 100) errors.push(`광고 안내 문구 ${altMessage.length}자(최대 100)`);
    const landingUrl = get(r, "랜딩 URL");
    if (!isUrl(landingUrl)) errors.push("랜딩 URL은 http로 시작");
    rows.push({
      key: `${sheet}:${i + 1}`,
      sheet,
      row: i + 1,
      family,
      campaigns: list(get(r, "캠페인")),
      adSetName,
      product,
      files,
      templates: tpl.codes,
      nativeTypes: nt.types,
      profileName: get(r, "프로필 이름"),
      copy,
      landingUrl,
      name: get(r, "소재 이름"),
      altMessage,
      altFallback: copy.message || copy.linkTitle || product,
      errors,
      warnings,
    });
  }
  return { rows };
}

export function parseCollectionSheet(matrix: unknown[][], sheet = FAMILY_LABEL.collection): { groups: CollectionGroup[]; error?: string } {
  const headerIdx = matrix.findIndex((r) => r.some((x) => cell(x) === "광고그룹") && r.some((x) => cell(x).replace(/\s/g, "") === "카드설명문구"));
  if (headerIdx < 0) return { groups: [], error: `'${sheet}' 시트에서 '광고그룹'·'카드 설명 문구' 머리글을 찾지 못했어요. 템플릿을 내려받아 쓰세요.` };
  const col = columns(matrix[headerIdx], COLLECTION_HEADERS);
  const get = (r: unknown[], k: string) => (col[k] >= 0 ? cell(r[col[k]]) : "");
  const byKey = new Map<string, CollectionGroup>();
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const r = matrix[i];
    if (!r || r.every((x) => !cell(x))) continue;
    if (["소재 이름", "광고 문구", "이미지 파일명", "카드 설명 문구", "카드 랜딩 URL"].every((k) => !get(r, k))) continue;
    const campaigns = get(r, "캠페인");
    const adSetName = get(r, "광고그룹");
    const name = get(r, "소재 이름");
    const k = `${campaigns}|${adSetName}|${name}`;
    let g = byKey.get(k);
    if (!g) {
      g = { key: `${sheet}:${i + 1}`, sheet, rows: [], campaigns: list(campaigns), adSetName, name, profileName: "", message: "", cta: "MORE", ctaUrl: "", cards: [], errors: [], warnings: [] };
      if (adSetName.length < 2) g.errors.push("광고그룹 이름 없음");
      if (name.length < 2) g.errors.push("소재 이름 필수(같은 이름 행끼리 한 소재)");
      byKey.set(k, g);
    }
    g.rows.push(i + 1);
    // 묶음 공통 칸은 처음 적힌 값, 다르게 적힌 행이 있으면 경고
    for (const [field, label] of [["message", "광고 문구"], ["ctaUrl", "CTA URL"], ["profileName", "프로필 이름"]] as const) {
      const v = get(r, label);
      if (!v) continue;
      if (!g[field]) g[field] = v;
      else if (g[field] !== v) g.warnings.push(`${i + 1}행 ${label}가 첫 값과 달라 첫 값을 씀`);
    }
    const ctaRaw = get(r, "CTA");
    if (ctaRaw) {
      const c = parseCta(ctaRaw);
      if (!c) g.errors.push(`${i + 1}행 모르는 CTA: ${ctaRaw}`);
      else if (g.rows.length === 1 || g.cta === "MORE") g.cta = c;
    }
    const card: CollectionCard = { row: i + 1, file: get(r, "이미지 파일명"), title: get(r, "카드 설명 문구"), url: get(r, "카드 랜딩 URL") };
    if (!card.file) g.errors.push(`${i + 1}행 이미지 파일명 없음`);
    if (card.title.length < 2 || card.title.length > COLLECTION_CARDS.titleMax) g.errors.push(`${i + 1}행 카드 설명 문구 2~${COLLECTION_CARDS.titleMax}자(지금 ${card.title.length}자)`);
    if (!isUrl(card.url)) g.errors.push(`${i + 1}행 카드 랜딩 URL은 http로 시작`);
    g.cards.push(card);
  }
  const groups = [...byKey.values()];
  for (const g of groups) {
    if (g.cards.length < COLLECTION_CARDS.min || g.cards.length > COLLECTION_CARDS.max) g.errors.push(`카드 ${g.cards.length}장 — ${COLLECTION_CARDS.min}~${COLLECTION_CARDS.max}장이어야 해요`);
    if (g.message.length < 2 || g.message.length > COLLECTION_CARDS.messageMax) g.errors.push(`광고 문구 2~${COLLECTION_CARDS.messageMax}자(지금 ${g.message.length}자)`);
    if (!g.ctaUrl) {
      const first = g.cards.find((c) => isUrl(c.url));
      if (first) {
        g.ctaUrl = first.url;
        g.warnings.push("CTA URL이 비어 첫 카드 랜딩 URL을 씀");
      } else g.errors.push("CTA URL 필요");
    } else if (!isUrl(g.ctaUrl)) g.errors.push("CTA URL은 http로 시작");
  }
  return { groups };
}
