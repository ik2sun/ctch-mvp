// 캠페인 오토파일럿 · GFA 엑셀 벌크 업로드 — 템플릿 머리글, 행 해석, 이미지 파일명 ↔ 상품명 매칭(순수 함수)
// 시트 '소재'(필수): 한 행 = 상품 하나의 카피 → 매칭된 이미지 × 규격만큼 소재가 생긴다
// 열 '캠페인'(선택): 비우면 화면에서 고른 캠페인 전부, 이름·ID를 적으면 그 캠페인에만
// 시트 '광고그룹'(선택): adSetSheet.ts — 기존 광고그룹 설정 전 항목 내보내기, 새 광고그룹 설정
import { SINGLE_IMAGE_TEMPLATES, type PlanCopy } from "./types";

export const CREATIVE_HEADERS = ["캠페인", "광고그룹", "상품명", "이미지 파일명", "소재 규격", "광고 문구", "제목", "설명", "CTA", "랜딩 URL", "소재 이름"] as const;

export const CREATIVE_SAMPLE = [
  ["", "1005_핵심3040_aall", "링티 레몬맛", "", "정사각, 가로", "물보다 빠른 수분 보충, 링티 레몬맛으로 상큼하게", "링티 레몬맛", "운동 후·여름철 수분 보충", "지금 구매하기", "https://example.com/products/lemon", ""],
  ["", "1005_핵심3040_aall", "링티 복숭아맛", "peach_01.jpg, peach_02.jpg", "", "달콤한 복숭아맛으로 하루 수분 챙기기", "링티 복숭아맛", "가볍게 마시는 수분 보충", "BUY", "https://example.com/products/peach", ""],
  ["", "1005_운동2539_m2539", "링티 제로", "", "정사각", "칼로리 걱정 없이, 운동 전후 링티 제로", "링티 제로", "제로 칼로리 수분 보충", "더 알아보기", "https://example.com/products/zero", ""],
];
export const SHEET_GUIDE = [
  ["항목", "설명"],
  ["캠페인", "선택. 비우면 화면에서 고른 캠페인 전부에 같은 소재가 들어간다. 캠페인 이름이나 ID(번호)를 적으면 그 캠페인에만(쉼표로 여러 개)"],
  ["광고그룹", "소재를 넣을 광고그룹 이름. 캠페인에 같은 이름이 있으면 그 광고그룹에, 없으면 새로 만든다(설정은 '광고그룹' 시트의 같은 이름 행, 없으면 GFA 캠페인 기본값·화면의 기본 예산)"],
  ["상품명", "이미지 파일명과 매칭하는 키. 파일명에 상품명이 들어 있으면 자동으로 붙는다(띄어쓰기·대소문자·_·- 무시, 여러 상품명이 겹치면 더 긴 이름 우선)"],
  ["이미지 파일명", "선택. 쉼표로 여러 개. 적으면 상품명 매칭 대신 이 파일만 쓴다"],
  ["소재 규격", "선택. 가로(1200×628)·정사각(1200×1200)·세로(1200×1800)·네이티브(342×228) 중 쉼표로. 비우면 화면에서 고른 기본 규격"],
  ["광고 문구 / 제목 / 설명", "필수. 2자 이상. 권장 최대 65 / 25 / 45자"],
  ["CTA", "선택. 더 알아보기·지금 구매하기·지금 구경하기·쿠폰 받기 등(또는 MORE·BUY 코드). 비우면 더 알아보기"],
  ["랜딩 URL", "필수. http로 시작. UTM이 없으면 자동으로 붙일 수 있다(화면 옵션)"],
  ["소재 이름", "선택. 비우면 광고그룹_상품명_img01_sq 형식으로 자동"],
  ["미리 채운 행", "캠페인을 고르고 내려받으면 그 캠페인과 기존 광고그룹이 행마다 채워져 있다. 쓸 행에만 상품명·문구·랜딩을 적고, 안 쓰는 행은 그대로 두면 건너뛴다. 같은 광고그룹에 상품을 더 넣으려면 행을 복사"],
];

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
  templates: string[] | null; // null = 화면 기본
  copy: PlanCopy;
  landingUrl: string;
  name: string;
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

export function parseTemplates(v: string): { codes: string[] | null; bad: string[] } {
  if (!v.trim()) return { codes: null, bad: [] };
  const codes: string[] = [];
  const bad: string[] = [];
  for (const raw of v.split(/[,/·\n]+/).map((x) => x.trim()).filter(Boolean)) {
    const x = raw.toLowerCase();
    const t =
      SINGLE_IMAGE_TEMPLATES.find((s) => s.code.toLowerCase() === x) ??
      (/(가로|1200x628|1200×628|1\.91)/.test(x) ? SINGLE_IMAGE_TEMPLATES[0]
        : /(정사각|1200x1200|1200×1200|1:1|스퀘어|square)/.test(x) ? SINGLE_IMAGE_TEMPLATES[1]
          : /(세로|1200x1800|1200×1800|2:3)/.test(x) ? SINGLE_IMAGE_TEMPLATES[2]
            : /(네이티브|342|native)/.test(x) ? SINGLE_IMAGE_TEMPLATES[3]
              : undefined);
    if (t) {
      if (!codes.includes(t.code)) codes.push(t.code);
    } else bad.push(raw);
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
    if (["상품명", "이미지 파일명", "광고 문구", "제목", "설명", "랜딩 URL"].every((k) => !get(r, k))) continue;
    const errors: string[] = [];
    const warnings: string[] = [];
    const adSetName = get(r, "광고그룹");
    const product = get(r, "상품명");
    if (adSetName.length < 2) errors.push("광고그룹 이름 없음");
    if (!product) errors.push("상품명 없음");
    const tpl = parseTemplates(get(r, "소재 규격"));
    if (tpl.bad.length) errors.push(`모르는 규격: ${tpl.bad.join(", ")}`);
    const cta = parseCta(get(r, "CTA"));
    if (!cta) errors.push(`모르는 CTA: ${get(r, "CTA")}`);
    const copy: PlanCopy = { message: get(r, "광고 문구"), linkTitle: get(r, "제목"), linkDescription: get(r, "설명"), cta: cta ?? "MORE" };
    if (copy.message.length < 2) errors.push("광고 문구 2자 이상");
    if (copy.linkTitle.length < 2) errors.push("제목 2자 이상");
    if (copy.linkDescription.length < 2) errors.push("설명 2자 이상");
    if (copy.message.length > LIMITS.message) warnings.push(`광고 문구 ${copy.message.length}자(권장 ${LIMITS.message})`);
    if (copy.linkTitle.length > LIMITS.linkTitle) warnings.push(`제목 ${copy.linkTitle.length}자(권장 ${LIMITS.linkTitle})`);
    if (copy.linkDescription.length > LIMITS.linkDescription) warnings.push(`설명 ${copy.linkDescription.length}자(권장 ${LIMITS.linkDescription})`);
    const landingUrl = get(r, "랜딩 URL");
    if (!/^https?:\/\//i.test(landingUrl)) errors.push("랜딩 URL은 http로 시작");
    rows.push({
      row: i + 1,
      campaigns: get(r, "캠페인").split(/[,\n]+/).map((x) => x.trim()).filter(Boolean),
      adSetName,
      product,
      files: get(r, "이미지 파일명").split(/[,\n]+/).map((x) => x.trim()).filter(Boolean),
      templates: tpl.codes,
      copy,
      landingUrl,
      name: get(r, "소재 이름"),
      errors,
      warnings,
    });
  }
  return { rows };
}

