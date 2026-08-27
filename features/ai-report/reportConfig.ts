import { createClient } from "@/lib/supabase/client";

export type ReportChannel = "meta" | "naver";
export type PrimaryKpi = "ROAS" | "CPA" | "CTR";
export type ReportTone = "professional" | "executive" | "friendly";

export type ReportConfig = {
  client_id: string;
  active_channels: ReportChannel[];
  primary_kpi: PrimaryKpi;
  report_tone: ReportTone;
  custom_prompt_notes: string;
};

export type SavedReportConfig = ReportConfig & {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
};

// 르무통 광고 계정의 세트명/광고명 네이밍 규칙.
// 설정을 비워둔 광고주에도 이 규칙이 기본으로 주입된다.
export const LEMOUTON_NAMING_RULES = `광고 세트명 네이밍 규칙:
형식: {목적}_{전환}_{성별}_{라이프스타일}_{연령}_{이벤트}_{날짜}
예시: promotion_cv_men_office_3040_event_0604
→ 타겟: 30-40대 남성 직장인 / 이벤트: 6월 4일 프로모션

광고명 네이밍 규칙:
형식: {제작일}_{전환}_{소재유형}_{버전}
예시: 260325_cv_bd_l01 → 2026.03.25 제작, 배너 소재 1번

리포트 작성 시 세트명에서 타겟 정보를 파싱하여
타겟별 성과 해석에 활용할 것.`;

// 르무통 기준 기본값 — 설정 행이 없는 광고주는 이 값으로 시작한다
export const defaultReportConfig: Omit<ReportConfig, "client_id"> = {
  active_channels: ["meta"],
  primary_kpi: "CPA",
  report_tone: "professional",
  custom_prompt_notes: LEMOUTON_NAMING_RULES,
};

export const CHANNEL_OPTIONS: { value: ReportChannel; label: string }[] = [
  { value: "meta", label: "메타(Meta)" },
  { value: "naver", label: "네이버 SA" },
];

export const KPI_OPTIONS: { value: PrimaryKpi; label: string }[] = [
  { value: "ROAS", label: "ROAS (전환매출 효율)" },
  { value: "CPA", label: "CPA (전환당 비용)" },
  { value: "CTR", label: "CTR (클릭률)" },
];

export const TONE_OPTIONS: { value: ReportTone; label: string; hint: string }[] = [
  { value: "professional", label: "실무형", hint: "담당자 대상, 전문 용어 그대로" },
  { value: "executive", label: "보고형", hint: "임원 보고, 결론 우선 요약" },
  { value: "friendly", label: "친화형", hint: "광고주 대상, 쉬운 표현" },
];

const TONE_GUIDE: Record<ReportTone, string> = {
  professional:
    "퍼포먼스 마케팅 실무자를 독자로 가정합니다. 매체 전문 용어(퍼널, 피로도, 스케일업 등)를 그대로 쓰고, 수식어 없이 담백하게 작성하세요.",
  executive:
    "경영진 보고를 독자로 가정합니다. 결론과 숫자를 먼저 제시하고, 매체 전문 용어는 최소화하며, 각 섹션을 짧게 압축하세요.",
  friendly:
    "광고주 담당자를 독자로 가정합니다. 전문 용어에는 짧은 설명을 덧붙이고, 부드러운 존댓말로 친절하게 작성하세요.",
};

const KPI_GUIDE: Record<PrimaryKpi, string> = {
  ROAS: "ROAS(전환매출 ÷ 광고비)를 최우선 판단 기준으로 삼습니다. 성과 좋고 나쁨의 판단, 예산 재배분 제안은 모두 ROAS 기여도를 근거로 하세요.",
  CPA: "CPA(광고비 ÷ 전환수)를 최우선 판단 기준으로 삼습니다. 성과 좋고 나쁨의 판단, 예산 재배분 제안은 모두 CPA 개선 여부를 근거로 하세요.",
  CTR: "CTR(클릭 ÷ 노출)을 최우선 판단 기준으로 삼습니다. 소재 반응률과 피로도 해석을 리포트의 중심에 두세요.",
};

const CHANNEL_LABEL: Record<ReportChannel, string> = {
  meta: "메타(Meta)",
  naver: "네이버 검색광고(SA)",
};

// 브라우저 Supabase 클라이언트를 함수 안에서 만든다.
// buildSystemPrompt는 API 라우트(서버)에서도 import하므로 모듈 로드 시점에
// 브라우저 클라이언트를 만들지 않기 위함이다.
function db() {
  return createClient();
}

function toConfig(row: Record<string, unknown>, clientId: string): SavedReportConfig {
  const channels = Array.isArray(row.active_channels)
    ? (row.active_channels as string[]).filter(
        (c): c is ReportChannel => c === "meta" || c === "naver",
      )
    : [];
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    client_id: clientId,
    active_channels: channels.length ? channels : defaultReportConfig.active_channels,
    primary_kpi: (row.primary_kpi as PrimaryKpi) ?? defaultReportConfig.primary_kpi,
    report_tone: (row.report_tone as ReportTone) ?? defaultReportConfig.report_tone,
    custom_prompt_notes: (row.custom_prompt_notes as string | null) ?? "",
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

// 저장된 설정 조회. 행이 없으면 null (호출부에서 defaultReportConfig로 초기화)
export async function getReportConfig(
  clientId: string,
  userId?: string | null,
): Promise<SavedReportConfig | null> {
  const supabase = db();
  let uid = userId ?? null;
  if (!uid) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    uid = user?.id ?? null;
  }
  if (!uid) return null;

  const { data } = await supabase
    .from("client_report_config")
    .select("*")
    .eq("client_id", clientId)
    .eq("user_id", uid)
    .maybeSingle();

  return data ? toConfig(data, clientId) : null;
}

// 광고주 + 담당자 조합으로 upsert (unique(client_id, user_id))
export async function upsertReportConfig(config: ReportConfig) {
  const supabase = db();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다.");

  return supabase.from("client_report_config").upsert(
    {
      client_id: config.client_id,
      user_id: user.id,
      active_channels: config.active_channels,
      primary_kpi: config.primary_kpi,
      report_tone: config.report_tone,
      custom_prompt_notes: config.custom_prompt_notes.trim() || null,
    },
    { onConflict: "client_id,user_id" },
  );
}

// 설정을 Claude system prompt 블록으로 변환.
// 각 API 라우트의 기본 system prompt 뒤에 이어 붙여 사용한다.
export function buildSystemPrompt(config: Partial<ReportConfig> | null): string {
  const channels = config?.active_channels?.length
    ? config.active_channels
    : defaultReportConfig.active_channels;
  const kpi = config?.primary_kpi ?? defaultReportConfig.primary_kpi;
  const tone = config?.report_tone ?? defaultReportConfig.report_tone;
  const notes = config?.custom_prompt_notes?.trim() || LEMOUTON_NAMING_RULES;

  return `

[광고주 리포트 설정]

1. 분석 대상 매체
${channels.map((c) => `- ${CHANNEL_LABEL[c]}`).join("\n")}

2. 주요 KPI: ${kpi}
${KPI_GUIDE[kpi]}

3. 리포트 톤
${TONE_GUIDE[tone]}

4. 광고주 고유 규칙 및 특이사항
${notes}

위 규칙 중 네이밍 규칙이 있다면, 캠페인·광고세트·광고명을 그대로 인용하지 말고
규칙에 따라 타겟·소재 정보를 해석한 뒤 그 의미를 기준으로 성과를 설명하세요.`;
}
