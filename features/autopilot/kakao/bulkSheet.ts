// 캠페인 오토파일럿 · 카카오 엑셀 벌크 업로드 — 시트 정의·해석(순수 함수)
// 시트 '소재'(한 행 = 소재 1개 × 그 행의 캠페인들) · '광고그룹'(이름 칸 하나 — 캠페인에 있으면 소재만 추가, 없으면 새로/원본 복사) · '작성 안내'
// 소재 형식은 캠페인 유형이 정한다(비즈보드 → 배너 / 디스플레이 → 네이티브 이미지 / 동영상 → 동영상 네이티브) — 형식에 없는 칸은 무시
import { parseDate, parseMoney, normName, campaignKey } from "../meta/bulkSheet";
import { ACTION_BUTTONS, AGE_BUCKETS, ageBucketLabel, bidLabel, BID_TARGET_LABEL, freqLabel, type BidSpec, type Freq, type Gender, type KakaoAdGroupLite } from "./model";

export { normName, campaignKey };
export const CR_SHEET = "소재";
export const AG_SHEET = "광고그룹";
export const GUIDE_SHEET = "작성 안내";
export const STATUS_HEADER = "CTCH 상태";
export const FIX_HEADER = "수정할 부분";

export const CR_HEADERS = ["캠페인", "광고그룹", "소재 이름", "소재 파일", "썸네일 파일(동영상)", "타이틀", "홍보문구", "프로필 이름", "행동유도버튼", "랜딩 URL", "소재 설명", "게재빈도", "AI 표기", "심사 의견"] as const;
export const CR_WIDTHS = [26, 30, 32, 34, 24, 28, 46, 14, 12, 44, 30, 12, 9, 30];
export const AG_HEADERS = ["캠페인", "광고그룹", "성별", "연령", "일 예산", "시작일", "종료일", "입찰", "참고: 현재 설정(수정 불필요)", "원본 광고그룹 ID(설정 복사 기준)"] as const;
export const AG_WIDTHS = [26, 34, 8, 14, 12, 12, 12, 22, 60, 30];

export const CR_SAMPLES: string[][] = [
  ["", "1015_cv_cozy3_biz", "261015_cv_cozy3_biz_01", "cozy3_biz_01.png", "", "", "", "", "", "https://example.com/event", "포근한 신제품 코지3", "", "", ""],
  ["", "1015_cv_cozy3_nb", "261015_cv_cozy3_nb_01", "cozy3_nb_01.jpg", "", "새롭게 돌아온 코지3", "특허 원단의 편안함에 포근함을 더한 코지3를 만나보세요", "", "바로가기", "https://example.com/event", "", "하루 3회", "", ""],
];
export const AG_SAMPLES: string[][] = [["", "1015_cv_cozy3_biz", "전체", "25-70", "100000", "", "", "", "", ""]];

const BTN = ACTION_BUTTONS.map((a) => a.label).join(" · ");
export const CR_GUIDE: string[][] = [
  ["'소재' 시트", "한 행 = 소재 1개. 소재 형식은 캠페인 유형이 정해요 — 비즈보드 = 배너 이미지 / 디스플레이 = 네이티브 이미지 / 동영상 = 동영상 네이티브"],
  ["캠페인", "비우면 화면에서 고른 캠페인 전부. 캠페인 ID나 이름(쉼표로 여러 개)을 적으면 그 캠페인만"],
  ["광고그룹", "캠페인에 있는 이름이면 그 광고그룹에 소재만 추가, 없으면 '광고그룹' 시트 설정으로 새로 만들어요"],
  ["소재 이름", "카카오 소재 이름(50자). 비우면 파일 이름"],
  ["소재 파일", "불러온 파일 이름(확장자·띄어쓰기·_ 무시). 비즈보드 = 1029×258 PNG 300KB / 네이티브 = 1:1·2:1·9:16·4:5(가까운 비율로 가운데 잘라 500KB JPEG로 맞춤) / 동영상 = MP4 9:16·16:9·1:1"],
  ["썸네일 파일(동영상)", "동영상 맞춤 썸네일(선택) — 비우면 영상 첫 장면"],
  ["타이틀 · 홍보문구 · 프로필 이름 · 행동유도버튼", "네이티브·동영상만 — 타이틀 25자, 홍보문구 45자, 프로필 이름 20자. 비우면 화면 공통 값. 버튼: " + BTN],
  ["랜딩 URL", "비우면 화면 공통 URL. SNS 게시물 주소는 안 돼요"],
  ["소재 설명", "비즈보드·네이티브 이미지의 대체 텍스트(30자, 특수문자 불가). 비우면 공통 값 → 타이틀에서 자동"],
  ["게재빈도", "자동 / 하루 3회 / 12시간 2회(1~24시간에 1~5회). 비우면 화면 기본(이 계정 기존 소재 설정)"],
  ["AI 표기", "비즈보드만 — 생성형 AI로 만든 소재면 '켬'"],
  ["심사 의견", "카카오 심사 담당자에게 남길 말(선택, 예: 랜딩 오픈 예정 시각)"],
];
export const AG_GUIDE: string[][] = [
  ["'광고그룹' 시트", "새로 만들 광고그룹만 쓰면 돼요(기존 광고그룹은 참고용으로 미리 채워 둠 — 그대로 두면 설정을 바꾸지 않아요)"],
  ["원본 광고그룹 ID", "기존 광고그룹 행을 복사해 '광고그룹' 이름만 바꾸면 이 ID의 설정(지면·기기·맞춤타겟·입찰·요일/시간)을 그대로 복사해 새로 만들어요. 비우면 기본값(자동입찰·국내 전체·안드로이드/iOS·가능한 모든 지면)"],
  ["성별 · 연령", "전체 / 여 / 남, 연령은 25-54 · 20+ · 전체(5세 단위: " + AGE_BUCKETS.map(ageBucketLabel).join(" ") + "). 복사할 때 비우면 원본 그대로"],
  ["일 예산", "1만 원 이상 10원 단위(5만 · 100000 가능). 복사할 때 비우면 원본, 새로 만들 땐 화면 기본값"],
  ["시작일 · 종료일", "2026-10-20 · 10/20. 시작일을 비우면 오늘(원본 시작일이 지났을 때). 종료일 '없음' = 종료일 없음"],
  ["입찰", "자동(전환=전환수 최대화, 방문=클릭수 최대화) / 수동 300(원) / CPA 목표 15000 / CPC 목표 300 / ROAS 목표 500% / 전환 가치 최대화. 동영상은 수동 CPV만. 비우면 원본 그대로"],
];
export const GUIDE_TAIL: string[][] = [
  ["상태", "새 광고그룹은 꺼진 채로 만들어요(화면 '바로 켜기'를 켜면 켠 채로). 소재는 모두 카카오 심사(WAITING)를 거쳐요"],
  ["다시 올리기", "실행 뒤 '수정할 부분 표시해 내려받기'로 받은 파일을 고쳐 다시 올리면 'CTCH 상태'가 완료인 행은 건너뛰어요"],
];

const cell = (v: unknown) => (v == null ? "" : String(v).trim());
const list = (v: string) => v.split(/[,\n]+/).map((x) => x.trim()).filter(Boolean);
function columns(header: unknown[], names: readonly string[]) {
  const h = header.map((x) => cell(x).replace(/\s+/g, ""));
  return Object.fromEntries(names.map((n) => [n, h.indexOf(n.replace(/\s+/g, ""))])) as Record<string, number>;
}
const onOff = (v: string): boolean | null | undefined => {
  const t = v.replace(/\s/g, "").toLowerCase();
  if (!t) return null;
  if (["켬", "on", "o", "y", "yes", "true", "1", "사용", "예"].includes(t)) return true;
  if (["끔", "off", "x", "n", "no", "false", "0", "미사용", "아니오"].includes(t)) return false;
  return undefined;
};

export function parseButton(v: string): string | null {
  const t = v.replace(/\s/g, "");
  if (!t) return "";
  const hit = ACTION_BUTTONS.find((a) => a.key === t.toUpperCase() || a.label.replace(/\s/g, "") === t);
  if (hit) return hit.key;
  const alias: Record<string, string> = { 더보기: "MORE", 자세히보기: "MORE", 구매: "PURCHASE", 신청: "REQUEST", 예약: "RESERVATION", 가입: "JOIN", 문의: "INQUIRE", 쿠폰: "COUPON" };
  return alias[t] ?? null;
}
// 자동 · 하루 3회 · 3 · 12시간 2회 · 3/24
export function parseFreq(v: string): Freq | null | undefined {
  const t = v.replace(/\s/g, "");
  if (!t) return null;
  if (/^(자동|auto)$/i.test(t)) return { type: "AUTO" };
  let m = /^(?:하루|1일|일)(\d)회?$/.exec(t) ?? /^(\d)회?$/.exec(t);
  if (m) return Number(m[1]) >= 1 && Number(m[1]) <= 5 ? { type: "DAY_IMP", cap: Number(m[1]), hours: 24 } : undefined;
  m = /^(\d{1,2})시간(\d)회?$/.exec(t);
  if (m) return inRange(Number(m[2]), Number(m[1]));
  m = /^(\d)\/(\d{1,2})$/.exec(t);
  if (m) return inRange(Number(m[1]), Number(m[2]));
  return undefined;
}
const inRange = (cap: number, hours: number): Freq | undefined => (cap >= 1 && cap <= 5 && hours >= 1 && hours <= 24 ? { type: "DAY_IMP", cap, hours } : undefined);

export function parseGender(v: string): Gender | null | undefined {
  const t = v.replace(/\s/g, "");
  if (!t) return null;
  if (/^(전체|모두|all|남녀)$/i.test(t)) return "all";
  if (/^(여|여자|여성|f|female)$/i.test(t)) return "f";
  if (/^(남|남자|남성|m|male)$/i.test(t)) return "m";
  return undefined;
}
// 25-54 → 25·30·…·50 / 20+ → 20…70 / 전체 → [] / 25,30,35 도 받음
export function parseAges(v: string): string[] | null | undefined {
  const t = v.replace(/\s|세/g, "");
  if (!t) return null;
  if (/^(전체|모두|all)$/i.test(t)) return [];
  const range = (lo: number, hi: number) => AGE_BUCKETS.filter((b) => Number(b) >= lo && Number(b) <= hi);
  let m = /^(\d{2})\+$/.exec(t) ?? /^(\d{2})(?:-|~)$/.exec(t);
  if (m) return snap(m[1]) ? range(Number(m[1]), 70) : undefined;
  m = /^(\d{2})(?:-|~)(\d{2})\+?$/.exec(t);
  if (m) {
    const lo = Number(m[1]);
    const hi = Number(m[2]);
    if (!snap(m[1]) || hi < lo) return undefined;
    return range(lo, hi >= 70 ? 70 : hi - 4);
  }
  const parts = t.split(/[,·]/);
  if (parts.every((p) => AGE_BUCKETS.includes(p.replace(/-\d+$/, "")))) return [...new Set(parts.map((p) => p.replace(/-\d+$/, "")))];
  return undefined;
}
const snap = (s: string) => AGE_BUCKETS.includes(s);
export const agesLabel = (ages: string[]) => {
  if (!ages.length) return "전체";
  const s = [...ages].map(Number).sort((a, b) => a - b);
  const contiguous = s.every((x, i) => i === 0 || x - s[i - 1] === 5);
  return contiguous ? (s[s.length - 1] === 70 ? `${s[0]}+` : `${s[0]}-${s[s.length - 1] + 4}`) : s.join(",");
};

// 자동 · 수동 300 · CPA 목표 15000 · CPC 목표 300 · ROAS 목표 500% · 전환 가치 최대화
export function parseBid(v: string): BidSpec | null | undefined {
  const t = v.replace(/[\s,원]/g, "");
  if (!t) return null;
  if (/^(자동|자동입찰|전환수최대화|클릭수최대화|auto)$/i.test(t)) return { strategy: "AUTOBID", amount: 0, target: null };
  if (/^전환가치최대화$/.test(t)) return { strategy: "AUTOBID", amount: 0, target: { type: "MAXIMIZE_CONVERSION_VALUE", value: 0 } };
  let m = /^(?:수동|manual)(?:cp[cmv])?(\d+)$/i.exec(t) ?? /^(\d+)$/.exec(t);
  if (m) return { strategy: "MANUAL", amount: Number(m[1]), target: null };
  m = /^(cpa|cpc|roas)목표(\d+)%?$/i.exec(t);
  if (m) return { strategy: "AUTOBID", amount: 0, target: { type: `TARGET_${m[1].toUpperCase()}`, value: Number(m[2]) } };
  return undefined;
}
export const bidText = (b: BidSpec) => (b.strategy === "MANUAL" ? `수동 ${b.amount}` : b.target ? (b.target.type === "MAXIMIZE_CONVERSION_VALUE" ? "전환 가치 최대화" : `${BID_TARGET_LABEL[b.target.type].replace(" 비용", "")} ${b.target.value}${b.target.type === "TARGET_ROAS" ? "%" : ""}`) : "자동");

export type CrRow = {
  sheetRow: number;
  campaigns: string[];
  adGroup: string;
  name: string;
  fileCell: string;
  thumbCell: string;
  title: string;
  description: string;
  profileName: string;
  actionButton: string; // "" = 공통
  url: string;
  altText: string;
  freq: Freq | null;
  aiLabel: boolean;
  opinion: string;
  errors: string[];
};

export function parseCrSheet(matrix: unknown[][]): { rows: CrRow[]; error?: string } {
  const hi = matrix.findIndex((r) => r.some((c) => cell(c) === "광고그룹") && r.some((c) => cell(c) === "소재 파일"));
  if (hi < 0) return { rows: [], error: `'${CR_SHEET}' 시트에서 머리글(광고그룹·소재 파일)을 찾지 못했어요. 템플릿을 내려받아 쓰세요.` };
  const col = columns(matrix[hi], CR_HEADERS);
  const get = (r: unknown[], k: string) => (col[k] >= 0 ? cell(r[col[k]]) : "");
  const statusCol = matrix[hi].findIndex((c) => cell(c) === STATUS_HEADER);
  const rows: CrRow[] = [];
  matrix.slice(hi + 1).forEach((r, i) => {
    if (statusCol >= 0 && cell(r[statusCol]).startsWith("완료")) return;
    const fileCell = get(r, "소재 파일");
    if (![fileCell, get(r, "타이틀"), get(r, "홍보문구"), get(r, "랜딩 URL")].some(Boolean)) return; // 미리 채운 빈 행
    const errors: string[] = [];
    const adGroup = get(r, "광고그룹");
    if (!adGroup) errors.push("광고그룹 이름이 비었어요");
    else if ([...adGroup].length > 50) errors.push("광고그룹 이름 50자 이하");
    if (!fileCell) errors.push("소재 파일이 비었어요");
    const btnRaw = get(r, "행동유도버튼");
    const btn = parseButton(btnRaw);
    if (btn === null) errors.push(`행동유도버튼 '${btnRaw}'을 모르겠어요(${BTN})`);
    const fq = parseFreq(get(r, "게재빈도"));
    if (fq === undefined) errors.push(`게재빈도 '${get(r, "게재빈도")}'(자동 · 하루 3회 · 12시간 2회)`);
    const ai = onOff(get(r, "AI 표기"));
    if (ai === undefined) errors.push(`AI 표기 '${get(r, "AI 표기")}'(켬·끔)`);
    const name = get(r, "소재 이름");
    if ([...name].length > 50) errors.push("소재 이름 50자 이하");
    rows.push({
      sheetRow: hi + i + 2,
      campaigns: list(get(r, "캠페인")),
      adGroup,
      name,
      fileCell,
      thumbCell: get(r, "썸네일 파일(동영상)"),
      title: get(r, "타이틀"),
      description: get(r, "홍보문구"),
      profileName: get(r, "프로필 이름"),
      actionButton: btn ?? "",
      url: get(r, "랜딩 URL"),
      altText: get(r, "소재 설명"),
      freq: fq ?? null,
      aiLabel: ai ?? false,
      opinion: get(r, "심사 의견"),
      errors,
    });
  });
  return { rows };
}

export type AgSpec = {
  sheetRow: number;
  campaign: string; // "" = 공통
  name: string;
  copyFrom: string; // 원본 광고그룹 ID
  gender: Gender | null;
  ages: string[] | null;
  budget: number | null;
  beginDate: string;
  endDate: string; // "none" = 종료일 없음
  bid: BidSpec | null;
  errors: string[];
};

export function parseAgSheet(matrix: unknown[][]): AgSpec[] {
  const hi = matrix.findIndex((r) => r.some((c) => cell(c) === "광고그룹") && r.some((c) => cell(c) === "성별"));
  if (hi < 0) return [];
  const col = columns(matrix[hi], AG_HEADERS);
  const raw = (r: unknown[], k: string) => (col[k] >= 0 ? r[col[k]] : "");
  const get = (r: unknown[], k: string) => cell(raw(r, k));
  const out: AgSpec[] = [];
  matrix.slice(hi + 1).forEach((r, i) => {
    const name = get(r, "광고그룹");
    if (!name) return;
    const errors: string[] = [];
    const g = parseGender(get(r, "성별"));
    if (g === undefined) errors.push(`성별 '${get(r, "성별")}'(전체·여·남)`);
    const ages = parseAges(get(r, "연령"));
    if (ages === undefined) errors.push(`연령 '${get(r, "연령")}'(예 25-54, 20+, 전체 — 5세 단위)`);
    const budget = parseMoney(raw(r, "일 예산"));
    if (budget === undefined) errors.push(`일 예산 '${get(r, "일 예산")}'(예 100000, 10만)`);
    const sd = parseDate(raw(r, "시작일"));
    if (sd === undefined) errors.push(`시작일 '${get(r, "시작일")}'`);
    const endRaw = get(r, "종료일");
    const ed = /^(없음|무기한|none|-)$/i.test(endRaw) ? "none" : parseDate(raw(r, "종료일"));
    if (ed === undefined) errors.push(`종료일 '${endRaw}'(날짜 또는 없음)`);
    const bid = parseBid(get(r, "입찰"));
    if (bid === undefined) errors.push(`입찰 '${get(r, "입찰")}'(자동 · 수동 300 · CPA 목표 15000 · ROAS 목표 500%)`);
    out.push({
      sheetRow: hi + i + 2,
      campaign: get(r, "캠페인"),
      name,
      copyFrom: (get(r, "원본 광고그룹 ID(설정 복사 기준)").match(/\d{4,}/) ?? [""])[0],
      gender: g ?? null,
      ages: ages ?? null,
      budget: budget ?? null,
      beginDate: sd ?? "",
      endDate: ed ?? "",
      bid: bid ?? null,
      errors,
    });
  });
  return out;
}

// 기존 광고그룹 → '광고그룹' 시트 행(참고·복사용). 맨 끝 = 자기 ID — 행을 복사해 이름만 바꾸면 이 광고그룹 설정 복사
export function adGroupToRow(campaignLabel: string, g: KakaoAdGroupLite, goal: string): string[] {
  const ref = [g.on ? "ON" : "OFF", g.statusText, `${bidLabel(g, goal)}`, `기기 ${g.deviceTypes.join("·")}`, g.locations, ...(g.audience.length ? [`맞춤타겟 ${g.audience.join(", ")}`] : []), `소재 ${g.creativeCount}`].filter(Boolean).join(" · ");
  return [
    campaignLabel,
    g.name,
    g.genders.length === 1 ? (g.genders[0] === "F" ? "여" : "남") : "전체",
    agesLabel(g.ages),
    g.dailyBudget ? String(g.dailyBudget) : "",
    g.beginDate ?? "",
    g.endDate ?? "없음",
    g.bidStrategy === "OPTIMIZATION" ? "" : g.bidStrategy === "MANUAL" ? `수동 ${g.bidAmount}` : g.bidTarget ? bidText({ strategy: "AUTOBID", amount: 0, target: g.bidTarget }) : "자동",
    ref,
    g.id,
  ];
}

// 파일 찾기 — 정확한 이름 → 정규화 이름(확장자·띄어쓰기·_·- 무시)
export function findFile<T extends { id: string; name: string }>(cellValue: string, files: T[]): { file: T | null; problem: string | null } {
  if (!cellValue) return { file: null, problem: null };
  const exact = files.filter((f) => f.name.toLowerCase() === cellValue.toLowerCase());
  const hit = exact.length ? exact : files.filter((f) => normName(f.name) === normName(cellValue));
  if (!hit.length) return { file: null, problem: `파일 '${cellValue}' 없음` };
  if (hit.length > 1) return { file: null, problem: `'${cellValue}' 같은 이름 파일이 ${hit.length}개 — 파일명을 정확히` };
  return { file: hit[0], problem: null };
}

export const freqText = (f: Freq | null) => (f ? freqLabel(f) : "");
