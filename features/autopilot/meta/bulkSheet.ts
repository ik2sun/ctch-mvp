// 캠페인 오토파일럿 · 메타 엑셀 벌크 업로드 — 시트 머리글·안내·해석, 소재 파일 매칭(순수 함수)
// 메타 대량 편집(엑셀 200여 열, 타겟을 JSON으로 다시 입력)보다 단순하게 시트 2장:
//  · '광고' 한 행 = 광고 하나. '소재 파일'에 짝 이름 하나(fall_01)만 적으면 fall_01_feed.jpg + fall_01_story.jpg 를 찾아 피드 + 스토리·릴스 한 광고로
//    (파일명을 그대로 적어도 되고, 세로 칸을 비우면 같은 짝 이름의 9:16 파일을 자동으로 붙인다). 문구 빈 칸 = 화면 공통 문구
//  · '광고세트'(선택) 기존 세트가 설정과 함께 미리 채워진다. 행을 복사해 이름만 바꾸면 '복사할 세트'(원래 이름)의 타겟·최적화·입찰·게재 위치를 그대로 복사한 새 세트,
//    '복사할 세트'를 비우면 이 행의 성별·연령·예산·최적화·게재 위치로 새로 만든다. 이미 있는 이름이면 그 세트에 광고만 추가(설정 안 바꿈)
// 열 '캠페인'(선택): 비우면 화면에서 고른 캠페인 전부, 이름·ID를 적으면 그 캠페인만(쉼표로 여러 개)
// 열 구성은 2026-10-09 르무통 실세팅(세트 64·켜진 광고 195) 분석으로 정함 — 실제로 값이 달라지는 옵션만 열로:
//  세트: 성별·연령(25-65가 55개)·일 예산·기간·최적화·기여 설정(판매 7일 클릭+1일 조회+1일 참여 조회 / 트래픽·인지 1일 클릭)·포함·제외 맞춤 타겟(15개 세트 사용)·게재 위치 묶음·Advantage+ 타겟
//  광고: 소재(피드+세로 맞춤이 대부분)·문구 1개씩(여러 문구 0개)·버튼·랜딩(UTM은 URL에 직접)·상품 확장(43% 켬)
//  고정: 지역 대한민국·최저 비용·노출 과금·브랜드 세이프티 완화(58/64). 쓰지 않거나 드문 것(관심사 3·빈도 3·총 예산·캐러셀 0·여러 문구 0)은 '설정 복사'로
import { ATTRIBUTIONS, CTAS, OPTIMIZATION, PLACEMENT_MODES, isVertical, pairKey, pairedName, type AdSetDraft, type AttributionKey, type MediaItem, type MetaAdSetLite, type MetaAudience, type PlacementMode } from "./model";

export const AD_SHEET = "광고";
export const SET_SHEET = "광고세트";
export const GUIDE_SHEET = "작성 안내";
export const AUDIENCE_SHEET = "맞춤 타겟 목록";

export const AD_HEADERS = ["캠페인", "광고세트", "광고 이름", "소재 파일", "세로 소재 파일(9:16)", "기본 문구", "제목", "설명", "버튼", "랜딩 URL", "상품 확장"] as const;
export const AD_WIDTHS = [26, 30, 30, 34, 30, 50, 28, 22, 14, 44, 10];
export const SET_HEADERS = ["캠페인", "광고세트", "복사할 세트", "성별", "연령", "일 예산", "시작일", "종료일", "최적화", "기여 설정", "포함 타겟", "제외 타겟", "게재 위치", "Advantage+ 타겟", "참고: 상태·ID(수정 불필요)"] as const;
export const SET_WIDTHS = [26, 34, 34, 8, 10, 12, 12, 12, 16, 28, 34, 26, 18, 14, 34];

export const AD_SAMPLES: string[][] = [
  ["", "1009_f2544", "", "fall_01", "", "천천히 걸을수록 깊어지는 가을\n걸을 땐 편안한 르무통", "단풍놀이 갈 땐 편안한 르무통", "가을 혜택 확인하기", "더 알아보기", "https://example.com/event/fall", "켬"],
  ["", "1009_f2544", "fall_02_video", "fall_02_video_45.mp4", "fall_02_video_916.mp4", "", "", "", "", "", ""],
  ["", "1009_aall", "", "fall_03.jpg", "", "", "", "", "지금 구매하기", "https://example.com/products/3", ""],
];
export const SET_SAMPLES: string[][] = [
  ["", "1009_f2544", "", "여", "25-44", "50000", "", "", "구매 전환", "", "", "자사몰 구매_14일", "FB·IG 전체", "끔", ""],
  ["", "1009_aall", "", "전체", "25-65", "5만", "2026-10-20", "2026-10-31", "구매 전환", "7일 클릭·1일 조회", "유사 타겟 (5%) - 자사몰 결제시작_60일", "", "Advantage+ 게재 위치", "끔", ""],
];

const OPT_ALL = [...new Map(Object.values(OPTIMIZATION).flat().map((o) => [o.label, o])).values()];
export const AD_GUIDE: string[][] = [
  ["항목", "설명 — 시트 '광고' (한 행 = 광고 하나)"],
  ["캠페인", "선택. 비우면 화면에서 고른 캠페인 전부에 같은 광고가 들어간다. 캠페인 이름이나 ID를 적으면 그 캠페인만(쉼표로 여러 개). ID 목록은 아래"],
  ["광고세트", "필수. 캠페인에 같은 이름의 세트가 있으면 그 세트에 광고만 추가(세트 설정·켜짐 상태 안 바꿈). 없으면 '광고세트' 시트의 같은 이름 행으로 새로 만든다(행이 없으면 화면의 '새 세트 기본값')"],
  ["광고 이름", "선택. 비우면 소재 파일명(짝이면 비율·지면 표시를 뺀 이름, 예 fall_01)"],
  ["소재 파일", "필수. ① 파일명(확장자 생략 가능) 또는 ② 짝 이름 하나 — fall_01 이라고만 적으면 fall_01_feed.jpg(피드 1:1·4:5)와 fall_01_story.jpg(9:16)를 찾아 한 광고로 묶는다. 피드엔 피드 소재, 스토리·릴스엔 세로 소재가 나간다(게재 위치 맞춤). 파일명을 적고 세로 칸을 비워도 같은 짝 이름의 9:16 파일이 있으면 자동으로 붙는다. 짝 이름에서 빼는 표시: feed·story·reels·sq·45·916·1x1·4x5·9x16·1080x1920·피드·스토리·릴스 등"],
  ["세로 소재 파일(9:16)", "선택. 자동 짝 대신 세로 파일을 직접 지정할 때. 'X'를 적으면 자동 짝을 끈다(피드 소재 하나로 모든 지면)"],
  ["기본 문구 / 제목 / 설명", "선택. 비우면 화면의 공통 문구. 기본 문구는 피드 위 본문(125자 안쪽이 잘리지 않음), 제목 40자 안쪽 권장, 설명은 일부 지면만. 셀 안 줄바꿈(Alt+Enter) 그대로 들어간다"],
  ["버튼", `선택. 비우면 공통(기본 더 알아보기). ${CTAS.map((c) => c.label).join(" · ")} — 또는 SHOP_NOW 같은 코드`],
  ["랜딩 URL", "필수(빈 칸이면 공통 URL). https로 시작. UTM은 URL에 직접 넣거나(르무통 방식 utm_source=meta&utm_medium=display|video&utm_campaign=pm…&utm_content=infeed_…), 화면 'UTM 자동'을 켜면 utm_이 없는 URL에 메타가 붙인다({형식} = 이미지 display·영상 video)"],
  ["상품 확장", "선택. 켬 / 끔(기본 끔). 켜면 메타가 카탈로그 상품을 광고 아래에 함께 보여 준다(Advantage+ 크리에이티브 '상품 확장'). 다른 AI 보정(밝기·템플릿·문구 바꾸기 등)은 화면 'AI 보정' 하나로"],
  ["이미지 · 영상", "JPG·PNG·WEBP·GIF·MP4·MOV. 영상은 200MB까지, 메타 처리(수십 초~수 분)가 끝난 뒤 광고가 만들어진다"],
];
export const SET_GUIDE: string[][] = [
  ["항목", "설명 — 시트 '광고세트' (선택, 새로 만들 세트만 적으면 된다)"],
  ["미리 채운 행", "선택한 캠페인의 기존 광고세트와 설정이 들어 있다(참고용 — 기존 세트 설정은 바꾸지 않는다)"],
  ["설정 복사(추천)", "기존 세트 행을 복사해 '광고세트' 이름만 바꾸면 '복사할 세트'(원래 세트)의 관심사·맞춤 타겟·최적화·입찰·게재 위치·기여 설정을 그대로 복사한 새 세트가 된다. 이 행의 성별·연령·일 예산·시작일·종료일은 바꾼 값이 반영되고, 최적화·게재 위치·Advantage+ 칸은 복사에서는 무시(원본 그대로)"],
  ["새로 만들기", "'복사할 세트'를 비우면 이 행 값으로 새로 만든다 — 지역 대한민국, 최저 비용 입찰, 노출당 과금"],
  ["캠페인", "선택. 비우면 '광고' 시트에서 이 세트를 쓰는 모든 캠페인에 같은 설정. 캠페인마다 다르게 하려면 캠페인 이름·ID를 적은 행을 따로"],
  ["복사할 세트", "기존 세트 이름 또는 ID. 같은 캠페인 세트를 먼저 찾고, 없으면 선택한 다른 캠페인의 세트(목표가 같아야 메타가 받음)"],
  ["성별", "전체 / 여 / 남 (여성·남성·F·M 가능)"],
  ["연령", "25-44, 25~65, 65+ 처럼. 13~65(65 = 65세 이상)"],
  ["일 예산", "원. 50000, 5만, 5만원, 50,000 모두 가능. 캠페인 예산(CBO) 캠페인이면 무시. 복사에서 비우면 원본 예산"],
  ["시작일 · 종료일", "2026-10-20 처럼(엑셀 날짜도 됨). 시작일 비우면 바로, 종료일 비우면 계속. 한국 시간 0시 시작·23:59 종료"],
  ["최적화", `캠페인 목표에 맞는 것: ${OPT_ALL.map((o) => o.label).join(" · ")}. 비우면 목표의 첫 번째(판매 = 구매 전환)`],
  ["기여 설정", `새로 만드는 세트만. ${ATTRIBUTIONS.map((a) => a.label).join(" / ")}. 비우면 목표 기본 — 판매·리드 = 7일 클릭·1일 조회·1일 참여 조회, 트래픽·인지 = 1일 클릭(르무통 실세팅과 같음). 복사 세트는 원본 그대로(메타가 생성 뒤 변경을 막음 — 미리 채운 값과 다르게 적으면 멈춤)`],
  ["복사 시 주의", "원본이 이미 종료된 세트면 종료일을 새로 적어야 한다. 원본이 Advantage+ 타겟이면 연령은 25세 이하 ~ 65+ 범위 안에서만 바꿀 수 있다"],
  ["포함 타겟 / 제외 타겟", "맞춤 타겟·유사 타겟 이름(쉼표로 여러 개, '맞춤 타겟 목록' 시트의 이름 그대로). 예: 제외 타겟 = 자사몰 구매_14일. 새 세트에서 비우면 없음. 복사에서 비우면 원본 그대로, '없음'이라고 적으면 원본 것을 뺀다"],
  ["게재 위치", `${PLACEMENT_MODES.map((m) => `${m.label}(${m.desc})`).join(" · ")}. 비우면 Advantage+`],
  ["Advantage+ 타겟", "켬 / 끔(기본 끔). 켜면 연령·성별을 '제안'으로 보고 메타가 범위 밖으로 넓힌다. 메타 제한: 최소 연령 25세 이하 · 최대 연령 65+"],
];
export const GUIDE_TAIL: string[][] = [
  ["실행 순서", "소재 파일 업로드 → 광고 소재 → 광고세트(새로·복사) → 광고(세트 × 소재). 소재를 먼저 만들어 파일 문제로 실패해도 빈 세트가 남지 않는다. 기본은 꺼진 상태로 생성(화면 '바로 켜기'로 바꿈)"],
  ["파일을 먼저 불러온 경우", "소재 파일을 먼저 불러오고 템플릿을 내려받으면 광고 1개 = 1행으로 소재 파일·세로 파일·광고 이름이 채워진다(짝은 이미 묶여 있음). 광고세트·문구만 적으면 된다"],
];

// ── 해석 ────────────────────────────────────────────
const cell = (v: unknown) => (v == null ? "" : String(v).trim());
const list = (v: string) => v.split(/[,\n]+/).map((x) => x.trim()).filter(Boolean);
export const normName = (s: string) => s.normalize("NFC").toLowerCase().replace(/\.[a-z0-9]{2,4}$/i, "").replace(/[\s_\-().]+/g, "");
export const campaignKey = (s: string) => s.normalize("NFC").toLowerCase().replace(/\s+/g, "");

function columns(header: unknown[], names: readonly string[]) {
  const h = header.map((x) => cell(x).replace(/\s+/g, ""));
  return Object.fromEntries(names.map((n) => [n, h.indexOf(n.replace(/\s+/g, ""))])) as Record<string, number>;
}

// GFA식 코드·짧은 표기도 받는다
const CTA_ALIAS: Record<string, string> = { BUY: "BUY_NOW", SHOP: "SHOP_NOW", MORE: "LEARN_MORE", ORDER: "ORDER_NOW", APPLY: "APPLY_NOW", BOOK: "BOOK_TRAVEL", 구매: "SHOP_NOW", 구매하기: "BUY_NOW", 더보기: "LEARN_MORE", 자세히보기: "LEARN_MORE", 신청하기: "APPLY_NOW", 예약하기: "BOOK_TRAVEL", 없음: "NO_BUTTON" };
export function parseCta(v: string): string | null {
  const t = v.trim();
  if (!t) return "";
  const alias = CTA_ALIAS[t.toUpperCase().replace(/\s+/g, "")] ?? CTA_ALIAS[t.replace(/\s+/g, "")];
  if (alias) return alias;
  const hit = CTAS.find((c) => c.key === t.toUpperCase().replace(/\s+/g, "_") || c.label.replace(/\s/g, "") === t.replace(/\s/g, ""));
  return hit ? hit.key : null;
}

export type AdRow = {
  sheetRow: number;
  campaigns: string[];
  adSet: string;
  name: string;
  feedCell: string;
  verticalCell: string; // "X" = 자동 짝 끄기
  message: string;
  headline: string;
  description: string;
  cta: string; // 코드, "" = 공통
  url: string;
  productExt: boolean;
  errors: string[];
};

export function parseAdSheet(matrix: unknown[][]): { rows: AdRow[]; error?: string } {
  const hi = matrix.findIndex((r) => r.some((c) => cell(c) === "광고세트") && r.some((c) => cell(c) === "소재 파일"));
  if (hi < 0) return { rows: [], error: `'${AD_SHEET}' 시트에서 머리글(광고세트·소재 파일)을 찾지 못했어요. 템플릿을 내려받아 쓰세요.` };
  const col = columns(matrix[hi], AD_HEADERS);
  const get = (r: unknown[], k: string) => (col[k] >= 0 ? cell(r[col[k]]) : "");
  const rows: AdRow[] = [];
  matrix.slice(hi + 1).forEach((r, i) => {
    const feedCell = get(r, "소재 파일");
    const verticalCell = get(r, "세로 소재 파일(9:16)");
    const content = [feedCell, verticalCell, get(r, "기본 문구"), get(r, "제목"), get(r, "랜딩 URL")].some(Boolean);
    if (!content) return; // 미리 채운 빈 행은 건너뜀
    const errors: string[] = [];
    const adSet = get(r, "광고세트");
    if (!adSet) errors.push("광고세트 이름이 비었어요");
    if (!feedCell && (!verticalCell || verticalCell.toUpperCase() === "X")) errors.push("소재 파일이 비었어요");
    const ctaRaw = get(r, "버튼");
    const cta = parseCta(ctaRaw);
    if (cta === null) errors.push(`버튼 '${ctaRaw}'을 모르겠어요`);
    const url = get(r, "랜딩 URL");
    if (url && !/^https?:\/\/\S+\.\S+/.test(url)) errors.push("랜딩 URL은 https://로 시작");
    const pe = onOff(get(r, "상품 확장"));
    if (pe === undefined) errors.push(`상품 확장 '${get(r, "상품 확장")}'(켬·끔)`);
    rows.push({
      sheetRow: hi + i + 2,
      campaigns: list(get(r, "캠페인")),
      adSet,
      name: get(r, "광고 이름"),
      feedCell,
      verticalCell,
      message: get(r, "기본 문구"),
      headline: get(r, "제목"),
      description: get(r, "설명"),
      cta: cta ?? "",
      url,
      productExt: pe ?? false,
      errors,
    });
  });
  return { rows };
}

export type SetSpec = {
  sheetRow: number;
  campaign: string; // "" = 공통
  name: string;
  copyFrom: string;
  gender: AdSetDraft["gender"] | null;
  ageMin: number | null;
  ageMax: number | null;
  budget: number | null;
  startDate: string;
  endDate: string;
  optimization: string; // 원문(캠페인 목표에 맞춰 나중에 순번으로)
  attribution: AttributionKey | null;
  include: string[] | null; // 맞춤 타겟 이름·ID 원문. null = 비움, [] = '없음'
  exclude: string[] | null;
  placement: PlacementMode;
  advantageAudience: boolean;
  errors: string[];
};

const onOff = (v: string): boolean | null | undefined => {
  const t = v.trim().toLowerCase();
  if (!t) return null;
  if (/^(켬|켜기|on|y|yes|o|사용|true|1)$/.test(t)) return true;
  if (/^(끔|끄기|off|n|no|x|미사용|false|0)$/.test(t)) return false;
  return undefined;
};
// 기여 설정 — '7일 클릭·1일 조회' '1일 클릭' '7d click 1d view' 등
export function parseAttribution(v: string): AttributionKey | null | undefined {
  const t = v.replace(/\s/g, "").toLowerCase();
  if (!t) return null;
  const click = /(\d+)일클릭|(\d+)dclick|click(\d+)/.exec(t);
  const view = /(\d+)일조회|(\d+)dview|view(\d+)/.exec(t);
  const engaged = /참여/.test(t) || /engaged/.test(t);
  const c = click ? Number(click[1] ?? click[2] ?? click[3]) : null;
  const w = view ? Number(view[1] ?? view[2] ?? view[3]) : null;
  const key = `${c ?? ""}c${w ? `${w}v` : ""}${engaged ? "1e" : ""}`.replace(/^c/, "");
  return ATTRIBUTIONS.find((a) => a.key === key)?.key;
}
const nameList = (v: string): string[] | null => {
  const t = v.trim();
  if (!t) return null;
  if (/^(없음|none|-)$/i.test(t)) return [];
  return t.split(/[,\n]+/).map((x) => x.trim()).filter(Boolean);
};
// 맞춤 타겟 이름·ID → id. 모르는 이름은 bad
export function resolveAudiences(names: string[] | null, list: MetaAudience[]): { ids: string[] | null; bad: string[] } {
  if (names === null) return { ids: null, bad: [] };
  const ids: string[] = [];
  const bad: string[] = [];
  const k = (x: string) => x.normalize("NFC").replace(/\s+/g, "").toLowerCase();
  for (const n of names) {
    const hit = list.find((a) => a.id === n || k(a.name) === k(n));
    if (hit) ids.push(hit.id);
    else bad.push(n);
  }
  return { ids: [...new Set(ids)], bad };
}

export function parseGender(v: string): AdSetDraft["gender"] | null | undefined {
  const t = v.trim().toLowerCase();
  if (!t) return null;
  if (/^(전체|모두|all|a|남녀|남녀전체)$/.test(t)) return "all";
  if (/^(여|여성|f|female|w|woman)$/.test(t)) return "f";
  if (/^(남|남성|m|male|man)$/.test(t)) return "m";
  return undefined;
}
export function parseAge(v: string): { min: number; max: number } | null | undefined {
  const t = v.replace(/\s|세/g, "");
  if (!t) return null;
  let m = /^(\d{2})\+$/.exec(t);
  if (m) return { min: Number(m[1]), max: 65 };
  m = /^(\d{2})[-~](\d{2})\+?$/.exec(t);
  if (!m) return undefined;
  const a = { min: Number(m[1]), max: Math.min(65, Number(m[2])) };
  return a.min >= 13 && a.min <= a.max ? a : undefined;
}
export function parseMoney(v: unknown): number | null | undefined {
  if (typeof v === "number") return v > 0 ? Math.round(v) : null;
  const t = cell(v).replace(/[,\s원]/g, "");
  if (!t) return null;
  const m = /^(\d+(?:\.\d+)?)(만|천)?$/.exec(t);
  if (!m) return undefined;
  return Math.round(Number(m[1]) * (m[2] === "만" ? 10000 : m[2] === "천" ? 1000 : 1));
}
// 엑셀 날짜(일련번호) · 2026-10-20 · 2026.10.20 · 10/20 · 1020
export function parseDate(v: unknown, year = new Date(Date.now() + 9 * 3600_000).getUTCFullYear()): string | null | undefined {
  if (typeof v === "number" && v > 30000 && v < 80000) return new Date(Math.round((v - 25569) * 86400_000)).toISOString().slice(0, 10);
  const t = cell(v);
  if (!t) return null;
  let m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/.exec(t);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})[/.-](\d{1,2})$/.exec(t) ?? /^(\d{2})(\d{2})$/.exec(t);
  if (m) return `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return undefined;
}
export function parsePlacement(v: string): PlacementMode | undefined {
  const t = v.replace(/\s/g, "").toLowerCase();
  if (!t || /advantage|자동|어드밴티지/.test(t)) return "auto";
  const hit = PLACEMENT_MODES.find((m) => m.label.replace(/\s/g, "").toLowerCase() === t || m.key === t);
  if (hit) return hit.key;
  if (/인스타|instagram|^ig/.test(t)) return /릴스|reels/.test(t) && !/전체|피드|스토리/.test(t) ? "ig_reels" : "ig_all";
  if (/스토리|릴스|세로/.test(t)) return "vertical_only";
  if (/피드/.test(t)) return "feed_only";
  if (/전체|fb|ig/.test(t)) return "standard";
  return undefined;
}
// 최적화 원문 → 그 캠페인 목표의 순번(-1 = 못 찾음)
export function optimizationIndex(objective: string, v: string): number {
  const opts = OPTIMIZATION[objective] ?? [];
  const t = v.replace(/\s/g, "").toUpperCase();
  if (!t) return 0;
  return opts.findIndex((o) => o.label.replace(/\s/g, "").toUpperCase() === t || o.goal === t || (o.event && o.event === t) || o.label.replace(/\s/g, "").toUpperCase().startsWith(t));
}

export function parseSetSheet(matrix: unknown[][]): SetSpec[] {
  const hi = matrix.findIndex((r) => r.some((c) => cell(c) === "광고세트") && r.some((c) => cell(c) === "복사할 세트"));
  if (hi < 0) return [];
  const col = columns(matrix[hi], SET_HEADERS);
  const raw = (r: unknown[], k: string) => (col[k] >= 0 ? r[col[k]] : "");
  const get = (r: unknown[], k: string) => cell(raw(r, k));
  const out: SetSpec[] = [];
  matrix.slice(hi + 1).forEach((r, i) => {
    const name = get(r, "광고세트");
    if (!name) return;
    const errors: string[] = [];
    const g = parseGender(get(r, "성별"));
    if (g === undefined) errors.push(`성별 '${get(r, "성별")}'(전체·여·남)`);
    const age = parseAge(get(r, "연령"));
    if (age === undefined) errors.push(`연령 '${get(r, "연령")}'(예 25-44, 65+)`);
    const budget = parseMoney(raw(r, "일 예산"));
    if (budget === undefined) errors.push(`일 예산 '${get(r, "일 예산")}'(예 50000, 5만)`);
    const sd = parseDate(raw(r, "시작일"));
    const ed = parseDate(raw(r, "종료일"));
    if (sd === undefined) errors.push(`시작일 '${get(r, "시작일")}'`);
    if (ed === undefined) errors.push(`종료일 '${get(r, "종료일")}'`);
    const pl = parsePlacement(get(r, "게재 위치"));
    if (pl === undefined) errors.push(`게재 위치 '${get(r, "게재 위치")}'`);
    const at = parseAttribution(get(r, "기여 설정"));
    if (at === undefined) errors.push(`기여 설정 '${get(r, "기여 설정")}'(${ATTRIBUTIONS.map((a) => a.label).join(" / ")})`);
    const adv = onOff(get(r, "Advantage+ 타겟"));
    if (adv === undefined) errors.push(`Advantage+ 타겟 '${get(r, "Advantage+ 타겟")}'(켬·끔)`);
    out.push({
      sheetRow: hi + i + 2,
      campaign: get(r, "캠페인"),
      name,
      copyFrom: get(r, "복사할 세트"),
      gender: g ?? null,
      ageMin: age?.min ?? null,
      ageMax: age?.max ?? null,
      budget: budget ?? null,
      startDate: sd ?? "",
      endDate: ed ?? "",
      optimization: get(r, "최적화"),
      attribution: at ?? null,
      include: nameList(get(r, "포함 타겟")),
      exclude: nameList(get(r, "제외 타겟")),
      placement: pl ?? "auto",
      advantageAudience: adv ?? false,
      errors,
    });
  });
  return out;
}

// 기존 세트 → '광고세트' 시트 행(참고·복사용). 복사할 세트 칸에 자기 이름 — 행을 복사해 이름만 바꾸면 이 세트 복사
const OPT_LABEL = (goal: string, event: string | null) => Object.values(OPTIMIZATION).flat().find((o) => o.goal === goal && (o.event ?? null) === (event ?? null))?.label ?? (event ? `${goal}(${event})` : goal);
export function adSetToRow(campaignLabel: string, s: MetaAdSetLite): string[] {
  const g = s.genders.filter((x) => x === 1 || x === 2);
  return [
    campaignLabel,
    s.name,
    s.name,
    g.length === 1 ? (g[0] === 1 ? "남" : "여") : "전체",
    s.ageMin != null ? `${s.ageMin}-${s.ageMax ?? 65}` : "",
    s.dailyBudget ? String(Math.round(s.dailyBudget)) : "",
    s.startTime?.slice(0, 10) ?? "",
    s.endTime?.slice(0, 10) ?? "",
    OPT_LABEL(s.optimizationGoal, s.pixelEvent),
    ATTRIBUTIONS.find((a) => a.key === s.attribution)?.label ?? "",
    s.includeAudiences.map((a) => a.name).join(", "),
    s.excludeAudiences.map((a) => a.name).join(", "),
    s.placements,
    s.advantageAudience ? "켬" : "끔",
    `${{ ACTIVE: "켜짐", PAUSED: "꺼짐", CAMPAIGN_PAUSED: "캠페인 꺼짐" }[s.status] ?? s.status} · ID ${s.id}`,
  ];
}

// ── 소재 파일 매칭 ──────────────────────────────────
// 반환: 피드·세로 파일 id, 이름 기본값, 메모·문제
export function resolveMedia(feedCell: string, verticalCell: string, files: MediaItem[]): { feed: string | null; vertical: string | null; name: string; notes: string[]; problems: string[] } {
  const notes: string[] = [];
  const problems: string[] = [];
  const noAuto = verticalCell.trim().toUpperCase() === "X";
  const byName = (v: string) => {
    const k = normName(v);
    const exact = files.filter((f) => f.name.toLowerCase() === v.toLowerCase());
    return exact.length ? exact : files.filter((f) => normName(f.name) === k);
  };
  let feed: MediaItem | null = null;
  let vertical: MediaItem | null = null;
  let name = "";

  if (verticalCell && !noAuto) {
    const hit = byName(verticalCell);
    if (!hit.length) problems.push(`세로 파일 '${verticalCell}' 없음`);
    else vertical = hit[0];
  }
  if (feedCell) {
    const hit = byName(feedCell);
    if (hit.length === 1) {
      if (isVertical(hit[0]) && !vertical) vertical = hit[0];
      else feed = hit[0];
      name = hit[0].name.replace(/\.[^.]+$/, "");
    } else if (hit.length > 1) {
      problems.push(`'${feedCell}' 같은 이름 파일이 ${hit.length}개`);
    } else {
      // 짝 이름 — 같은 짝 키의 피드 1 + 세로 1
      const key = pairKey(feedCell);
      const group = files.filter((f) => pairKey(f.name) === key);
      const f = group.filter((x) => !isVertical(x));
      const v = group.filter(isVertical);
      if (!group.length) problems.push(`소재 파일 '${feedCell}' 없음`);
      else if (f.length > 1) problems.push(`'${feedCell}'에 피드 파일이 ${f.length}개(${f.map((x) => x.name).join(", ")}) — 파일명을 정확히`);
      else {
        feed = f[0] ?? null;
        if (!vertical && !noAuto) {
          if (v.length > 1) problems.push(`'${feedCell}'에 세로 파일이 ${v.length}개 — 세로 칸에 파일명을 정확히`);
          else vertical = v[0] ?? null;
        }
        name = feedCell.replace(/\.[^.]+$/, "");
      }
    }
  }
  // 파일명을 정확히 적었는데 세로 칸이 비면 같은 짝 이름의 9:16을 자동으로
  if (feed && !vertical && !verticalCell) {
    const v = files.filter((x) => isVertical(x) && x.kind === feed!.kind && pairKey(x.name) === pairKey(feed!.name));
    if (v.length === 1) {
      vertical = v[0];
      notes.push(`세로 ${v[0].name} 자동 짝`);
    }
  }
  if (feed && vertical) {
    if (feed.kind !== vertical.kind) problems.push("피드·세로는 둘 다 이미지거나 둘 다 영상이어야 해요");
    name = name && name !== feed.name.replace(/\.[^.]+$/, "") ? name : pairedName(feed.name);
  }
  return { feed: feed?.id ?? null, vertical: vertical?.id ?? null, name, notes, problems };
}

// '맞춤 타겟 목록' 시트 — 포함·제외 타겟 칸에 쓸 이름
export const AUDIENCE_HEADERS = ["이름(그대로 복사)", "유형", "대략 규모", "사용 가능", "ID"];
export function audienceRows(list: MetaAudience[]): (string | number)[][] {
  const TYPE: Record<string, string> = { WEBSITE: "웹사이트", LOOKALIKE: "유사 타겟", ENGAGEMENT: "참여", CUSTOM: "고객 목록", VIDEO: "동영상 조회", IG_BUSINESS: "인스타 참여", APP: "앱", OFFLINE_CONVERSION: "오프라인" };
  return list.map((a) => [a.name, TYPE[a.subtype] ?? a.subtype, a.size ?? "", a.ok ? "예" : "아니오", a.id]);
}
