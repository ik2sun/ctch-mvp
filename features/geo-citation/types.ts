// GEO 인용 추적 — 화면·서버 공용 타입 (테이블은 0016_geo_citations.sql)

export type GeoEngine = "claude" | "openai" | "gemini" | "naver";
export const API_ENGINES = ["claude", "openai", "gemini"] as const;
export type ApiEngine = (typeof API_ENGINES)[number];

export const ENGINE_LABEL: Record<GeoEngine, string> = {
  claude: "Claude",
  openai: "ChatGPT",
  gemini: "Gemini",
  naver: "네이버 AI 브리핑",
};

// 엔진별 고정 색 (그래프·뱃지 공통). 글로벌 3종은 색각 이상 분리 검증 통과(validate_palette, all pairs).
// 네이버는 글로벌 엔진과 같은 그래프에 그리지 않는다.
export const ENGINE_COLOR: Record<GeoEngine, string> = {
  claude: "#eb6834",
  openai: "#1baf7a",
  gemini: "#2a78d6",
  naver: "#008300",
};

export const JOURNEY_STAGES = ["정보 탐색", "대안 비교", "문제 해결", "구매 직전"] as const;
export type JourneyStage = (typeof JOURNEY_STAGES)[number];

export type GeoSettings = {
  client_id: string;
  own_domains: string[];
  brand_terms: string[];
  competitors: string[];
  engines: ApiEngine[];
  auto_weekly?: boolean; // 0016 호환용 — 0017부터 measure_mode 사용
  measure_mode: MeasureMode;
  interval_days: IntervalDays;
  auto_start: string | null; // YYYY-MM-DD, null = 바로
  auto_end: string | null; // YYYY-MM-DD, null = 종료일 없음
  updated_at?: string;
};

// off = API를 전혀 호출하지 않음(수동 측정도 막음) / manual = 버튼으로만 / auto = 주기마다 자동 + 버튼
export type MeasureMode = "off" | "manual" | "auto";
export const MEASURE_MODES: { id: MeasureMode; label: string; desc: string }[] = [
  { id: "off", label: "측정 안 함", desc: "API를 호출하지 않아요. 비용 0, 지난 기록 조회만" },
  { id: "manual", label: "수동만", desc: "'지금 측정'을 누를 때만 측정" },
  { id: "auto", label: "자동", desc: "정한 주기·기간 동안 자동 측정 (수동도 가능)" },
];

export type IntervalDays = 1 | 3 | 7 | 14 | 30;
export const INTERVAL_OPTIONS: { days: IntervalDays; label: string }[] = [
  { days: 1, label: "매일" },
  { days: 3, label: "3일마다" },
  { days: 7, label: "매주" },
  { days: 14, label: "2주마다" },
  { days: 30, label: "매월(30일)" },
];

// 오늘(한국 시간) YYYY-MM-DD
export function todayKst(now = new Date()): string {
  return new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

// 자동 측정 기간 안인지 (양 끝 포함)
export function inAutoPeriod(s: Pick<GeoSettings, "auto_start" | "auto_end">, today = todayKst()): boolean {
  return (!s.auto_start || s.auto_start <= today) && (!s.auto_end || today <= s.auto_end);
}

export type GeoPrompt = {
  id: string;
  client_id: string;
  query: string;
  stage: JourneyStage;
  evidence: string | null;
  active: boolean;
  created_at: string;
};

export type GeoCitation = { rank: number; url: string; title: string; domain: string; own: boolean };

export type GeoRun = {
  id: string;
  client_id: string;
  trigger: "manual" | "cron";
  engines: ApiEngine[];
  status: "running" | "done" | "failed";
  total: number;
  completed: number;
  cost_usd: number;
  settings_snapshot: Partial<GeoSettings>;
  started_at: string;
  finished_at: string | null;
};

export type GeoAnswer = {
  id: string;
  run_id: string;
  prompt_id: string | null;
  engine: GeoEngine;
  model: string | null;
  query: string;
  stage: JourneyStage | null;
  status: "pending" | "running" | "done" | "error";
  answer: string | null;
  citations: GeoCitation[];
  sources: GeoCitation[];
  mentioned: boolean | null;
  mention_order: number | null;
  mention_override: boolean | null;
  own_cited: boolean | null;
  own_cite_rank: number | null;
  competitors_mentioned: string[];
  manual: boolean;
  cost_usd: number | null;
  error: string | null;
  answered_at: string | null;
};

// 사람이 보정한 값이 있으면 그것을 쓴다
export function isMentioned(a: Pick<GeoAnswer, "mentioned" | "mention_override">): boolean {
  return a.mention_override ?? a.mentioned ?? false;
}
