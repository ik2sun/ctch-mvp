// 캠페인 오토파일럿 · GFA 엑셀 벌크 업로드 — 템플릿 머리글, 행 해석, 이미지 파일명 ↔ 상품명 매칭(순수 함수)
// 시트 '소재'(필수): 한 행 = 상품 하나의 카피 → 매칭된 이미지 × 규격만큼 소재가 생긴다
// 열 '캠페인'(선택): 비우면 화면에서 고른 캠페인 전부, 이름·ID를 적으면 그 캠페인에만
// 시트 '광고그룹'(선택): adSetSheet.ts — 기존 광고그룹 설정 전 항목 내보내기, 새 광고그룹 설정
import { ALL_TEMPLATES, BANNER_TEMPLATES, SINGLE_IMAGE_TEMPLATES, autoTemplates, type PlanCopy, type TemplateSpec } from "./types";

export const CREATIVE_HEADERS = ["캠페인", "광고그룹", "상품명", "이미지 파일명", "소재 규격", "광고 문구", "제목", "설명", "광고 안내 문구", "CTA", "랜딩 URL", "소재 이름"] as const;

export const CREATIVE_SAMPLE = [
  ["", "1005_핵심3040_aall", "링티 레몬맛", "", "정사각, 가로", "물보다 빠른 수분 보충, 링티 레몬맛으로 상큼하게", "링티 레몬맛", "운동 후·여름철 수분 보충", "", "지금 구매하기", "https://example.com/products/lemon", ""],
  ["", "1005_핵심3040_aall", "링티 복숭아맛", "peach_01.jpg, peach_02.jpg", "", "달콤한 복숭아맛으로 하루 수분 챙기기", "링티 복숭아맛", "가볍게 마시는 수분 보충", "", "BUY", "https://example.com/products/peach", ""],
  ["", "1005_운동2539_m2539", "링티 제로", "", "정사각", "칼로리 걱정 없이, 운동 전후 링티 제로", "링티 제로", "제로 칼로리 수분 보충", "", "더 알아보기", "https://example.com/products/zero", ""],
  ["", "1005_스마트채널_aall", "", "스마트채널_썸네일형_750x280_05.png", "", "", "", "", "르무통 가을 단풍 시즌 최대 30% 할인, 메리노울 워킹화", "", "https://example.com/event/fall", ""],
];
export const SHEET_GUIDE = [
  ["항목", "설명"],
  ["캠페인", "선택. 비우면 화면에서 고른 캠페인 전부에 같은 소재가 들어간다. 캠페인 이름이나 ID(번호)를 적으면 그 캠페인에만(쉼표로 여러 개)"],
  ["광고그룹", "소재를 넣을 광고그룹 이름. 캠페인에 같은 이름이 있으면 그 광고그룹에, 없으면 새로 만든다(설정은 '광고그룹' 시트의 같은 이름 행, 없으면 GFA 캠페인 기본값·화면의 기본 예산)"],
  ["상품명", "상품명 또는 이미지 파일명 중 하나는 필수. 파일명에 상품명이 들어 있는 이미지가 자동으로 붙는다(띄어쓰기·대소문자·_·- 무시, 여러 상품명이 겹치면 더 긴 이름 우선)"],
  ["이미지 파일명", "선택. 쉼표로 여러 개. 적으면 상품명 매칭 대신 이 파일만 쓴다(예: 스마트채널_썸네일형_750x280_05.png)"],
  ["소재 규격", "선택(권장: 비움). 비우면 이미지 크기로 자동 — 750×160·750×280 = 스마트채널, 750×200·1250×560 = 배너, 1200×628·1200×1200·1200×1800 = 피드, 342×228 = 네이티브(비율 ±2%). 1:1은 피드 정사각(배너 1200×1200은 '배너 1200x1200'으로 직접 적기). 맞는 비율이 없으면 화면의 기본 규격으로 잘라 씀. 직접 적을 때는 가로·정사각·세로·네이티브·스마트채널·배너 또는 750x280 같은 크기를 쉼표로"],
  ["광고 문구 / 제목 / 설명", "피드: 모두 선택. 네이티브: 광고 문구 필수. 스마트채널·배너: 글자가 이미지 안에 있어 안 쓴다. 적는 칸은 2자 이상, 권장 최대 65 / 25 / 45자"],
  ["광고 안내 문구", "스마트채널·배너 소재의 대체 텍스트 — 화면 낭독기가 시각장애인에게 읽어 주는 문구라 이미지 속 글자(브랜드·혜택·기간)를 그대로 적는다. 2~100자, GFA 필수. 비우면 광고 문구 → 제목 → 상품명 중 처음 적힌 것을 대신 넣고 미리보기에 경고. 피드·네이티브 소재는 GFA API에 이 칸이 없어 들어가지 않는다(GFA 화면에서 입력)"],
  ["CTA", "선택(피드·네이티브만). 더 알아보기·지금 구매하기·지금 구경하기·쿠폰 받기 등(또는 MORE·BUY 코드). 비우면 더 알아보기"],
  ["랜딩 URL", "필수. http로 시작. UTM이 없으면 자동으로 붙일 수 있다(화면 옵션)"],
  ["소재 이름", "선택. 비우면 광고그룹_상품명_img01_sq 형식으로 자동"],
  ["미리 채운 행", "캠페인을 고르고 내려받으면 그 캠페인과 기존 광고그룹이 행마다 채워져 있다. 쓸 행에만 상품명·문구·랜딩을 적고, 안 쓰는 행은 그대로 두면 건너뛴다. 같은 광고그룹에 상품을 더 넣으려면 행을 복사"],
  ["이미지를 먼저 불러온 경우", "구글 드라이브·내 PC 이미지를 먼저 불러오고 내려받으면 이미지 1장 = 1행으로 이미지 파일명·소재 이름(파일명)이 채워진다. 광고그룹은 이름으로 확실히 고를 수 있을 때만 채워지니 빈 칸을 채우고(기존 이름은 '광고그룹' 시트 참고), 랜딩 URL과 지면별 문구를 적는다. 맨 끝 '참고: 인식 규격' 열은 자동 인식 결과 확인용이라 고치지 않아도 된다. 안 쓸 이미지 행은 지운다"],
];

// ── 불러온 이미지로 '소재' 시트 미리 채우기 ─────────────────
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

export function imageTemplateRows(images: { name: string; width: number; height: number }[], adSetNames: string[]): string[][] {
  const sorted = [...images].sort((a, b) => a.name.localeCompare(b.name, "ko", { numeric: true }));
  return sorted.map((img) => {
    const t = autoTemplates(img, "SINGLE_IMAGE")[0];
    const ref = t ? `${img.width}×${img.height} → ${t.label}` : `${img.width}×${img.height} → 맞는 규격 없음(화면의 기본 규격으로 잘라 씀)`;
    const base = img.name.replace(/\.[^.]+$/, "").trim().slice(0, 128);
    const byHeader: Record<string, string> = { 광고그룹: guessAdSet(t, adSetNames), "이미지 파일명": img.name, "소재 이름": base.length >= 2 ? base : "" };
    return [...CREATIVE_HEADERS.map((h) => byHeader[h] ?? ""), ref];
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

export const LIMITS = { message: 65, linkTitle: 25, linkDescription: 45 };

export type BulkRow = {
  row: number; // 엑셀 행 번호(머리글 = 1)
  campaigns: string[]; // 비면 선택한 캠페인 전부
  adSetName: string;
  product: string;
  files: string[];
  templates: string[] | null; // null = 이미지 크기로 자동
  copy: PlanCopy;
  landingUrl: string;
  name: string;
  errors: string[];
  altMessage: string; // 배너 광고 안내 문구(대체 텍스트) — 비면 대신 넣을 값(altFallback)
  altFallback: string;
  nativeCopyErrors: string[]; // 네이티브 규격이 하나라도 쓰이면 오류(광고 문구 필수)
  bannerCopyErrors: string[]; // 스마트채널·배너 규격이 하나라도 쓰이면 오류(광고 안내 문구 필수)
  bannerNotes: string[]; // 스마트채널·배너 규격이 쓰이면 경고
  feedNotes: string[]; // 피드·네이티브만 쓰이면 경고
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

// 소재 규격 칸 해석 — 비우거나 '자동'이면 null(이미지 크기로 자동). 스마트채널·배너는 이미지 비율이 맞는 규격에만 쓰인다
export function parseTemplates(v: string): { codes: string[] | null; bad: string[] } {
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
    const banner = /(배너|banner)/.test(x);
    if (code) add(code.code);
    else if (size) {
      const [w, h] = [Number(size[1]), Number(size[2])];
      const hits = ALL_TEMPLATES.filter((t) => t.width === w && t.height === h);
      const pick = hits.find((t) => (banner ? t.kind === "IMAGE_BANNER" : t.kind === "SINGLE_IMAGE")) ?? hits[0];
      if (pick) add(pick.code);
      else bad.push(raw);
    } else if (/(스마트채널|smartchannel)/.test(x)) ["BANNER_750", "BANNER_750X280"].forEach(add);
    else if (banner) BANNER_TEMPLATES.forEach((t) => add(t.code));
    else if (/(가로|1\.91)/.test(x)) add(SINGLE_IMAGE_TEMPLATES[0].code);
    else if (/(정사각|1:1|스퀘어|square)/.test(x)) add(SINGLE_IMAGE_TEMPLATES[1].code);
    else if (/(세로|2:3)/.test(x)) add(SINGLE_IMAGE_TEMPLATES[2].code);
    else if (/(네이티브|native)/.test(x)) add(SINGLE_IMAGE_TEMPLATES[3].code);
    else bad.push(raw);
  }
  return { codes: codes.length ? codes : null, bad };
}

export function parseCta(v: string): string | null {
  const x = v.trim();
  if (!x) return "MORE";
  const hit = CTA_ALL.find((c) => c.value.toLowerCase() === x.toLowerCase() || c.name.replace(/\s/g, "") === x.replace(/\s/g, ""));
  return hit?.value ?? null;
}




// 머리글 행을 찾아 열 위치를 잡는다(열 순서가 바뀌어도 됨)
function columns(header: unknown[], names: readonly string[]) {
  const h = header.map((x) => cell(x).replace(/\s/g, ""));
  return Object.fromEntries(names.map((n) => [n, h.indexOf(n.replace(/\s/g, ""))])) as Record<string, number>;
}

export function parseCreativeSheet(matrix: unknown[][]): { rows: BulkRow[]; error?: string } {
  const headerIdx = matrix.findIndex((r) => r.some((x) => cell(x) === "상품명") && r.some((x) => cell(x) === "광고그룹"));
  if (headerIdx < 0) return { rows: [], error: "'소재' 시트에서 '광고그룹'·'상품명' 머리글을 찾지 못했어요. 템플릿을 내려받아 쓰세요." };
  const col = columns(matrix[headerIdx], CREATIVE_HEADERS);
  const get = (r: unknown[], k: string) => (col[k] >= 0 ? cell(r[col[k]]) : "");
  const rows: BulkRow[] = [];
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const r = matrix[i];
    if (!r || r.every((x) => !cell(x))) continue;
    // 템플릿이 미리 채운 캠페인·광고그룹만 있고 소재 내용이 빈 행은 건너뛴다(안 쓰는 광고그룹)
    if (["상품명", "이미지 파일명", "광고 문구", "제목", "설명", "광고 안내 문구", "랜딩 URL"].every((k) => !get(r, k))) continue;
    const errors: string[] = [];
    const warnings: string[] = [];
    const adSetName = get(r, "광고그룹");
    const product = get(r, "상품명");
    const files = get(r, "이미지 파일명").split(/[,\n]+/).map((x) => x.trim()).filter(Boolean);
    if (adSetName.length < 2) errors.push("광고그룹 이름 없음");
    if (!product && !files.length) errors.push("상품명 또는 이미지 파일명 필요");
    const tpl = parseTemplates(get(r, "소재 규격"));
    if (tpl.bad.length) errors.push(`모르는 규격: ${tpl.bad.join(", ")}`);
    const cta = parseCta(get(r, "CTA"));
    if (!cta) errors.push(`모르는 CTA: ${get(r, "CTA")}`);
    const copy: PlanCopy = { message: get(r, "광고 문구"), linkTitle: get(r, "제목"), linkDescription: get(r, "설명"), cta: cta ?? "MORE" };
    // 문구는 규격에 따라 다르다(실제 규격이 정해진 뒤 화면이 고른다): 피드 = 전부 선택 / 네이티브 = 광고 문구 필수 /
    // 배너 = 광고 안내 문구(altMessage, 시각장애인용 대체 텍스트) GFA 필수 — 비면 광고 문구 → 제목 → 상품명으로 대신 채우고 경고. 적은 칸은 2자 이상(GFA 최소 길이)
    for (const [k, v] of [["광고 문구", copy.message], ["제목", copy.linkTitle], ["설명", copy.linkDescription]] as const) {
      if (v.length === 1) errors.push(`${k}는 비우거나 2자 이상`);
    }
    const altMessage = get(r, "광고 안내 문구");
    if (altMessage.length === 1) errors.push("광고 안내 문구는 비우거나 2자 이상");
    if (altMessage.length > 100) errors.push(`광고 안내 문구 ${altMessage.length}자(최대 100)`);
    const altFallback = copy.message || copy.linkTitle || product;
    const nativeCopyErrors = copy.message.length < 2 ? ["네이티브 소재는 광고 문구 필수"] : [];
    const bannerCopyErrors = !altMessage && altFallback.length < 2 ? ["배너 소재는 광고 안내 문구 필수(GFA) — 이미지 속 글자를 적어 주세요"] : [];
    const bannerNotes = !altMessage && altFallback.length >= 2 ? [`광고 안내 문구가 비어 '${altFallback.slice(0, 30)}'로 대신 넣음 — 이미지 속 글자를 적는 것을 권장`] : [];
    const feedNotes = altMessage ? ["피드·네이티브 소재는 GFA API에 광고 안내 문구 칸이 없어 들어가지 않음(GFA 화면에서 입력)"] : [];
    if (copy.message.length > LIMITS.message) warnings.push(`광고 문구 ${copy.message.length}자(피드 권장 ${LIMITS.message}, 배너 최대 100)`);
    if (copy.linkTitle.length > LIMITS.linkTitle) warnings.push(`제목 ${copy.linkTitle.length}자(권장 ${LIMITS.linkTitle})`);
    if (copy.linkDescription.length > LIMITS.linkDescription) warnings.push(`설명 ${copy.linkDescription.length}자(권장 ${LIMITS.linkDescription})`);
    const landingUrl = get(r, "랜딩 URL");
    if (!/^https?:\/\//i.test(landingUrl)) errors.push("랜딩 URL은 http로 시작");
    rows.push({
      row: i + 1,
      campaigns: get(r, "캠페인").split(/[,\n]+/).map((x) => x.trim()).filter(Boolean),
      adSetName,
      product,
      files,
      templates: tpl.codes,
      copy,
      landingUrl,
      name: get(r, "소재 이름"),
      errors,
      altMessage,
      altFallback,
      nativeCopyErrors,
      bannerCopyErrors,
      bannerNotes,
      feedNotes,
      warnings,
    });
  }
  return { rows };
}

