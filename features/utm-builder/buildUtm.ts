// UTM URL 생성 순수 로직 — UI와 분리해 테스트·재사용 가능하게

export type UtmFields = {
  baseUrl: string;
  source: string;
  medium: string;
  campaign: string;
  content: string;
  term: string;
};

// 매체별 프리셋 — source/medium 기본값 + 네이버 트래킹 파라미터 노출 여부
export type MediaPreset = {
  key: string;
  label: string;
  source: string;
  medium: string;
  naverTracking?: boolean; // 네이버 파워링크 n_* 파라미터 사용
};

export const MEDIA_PRESETS: MediaPreset[] = [
  { key: "custom", label: "직접 입력", source: "", medium: "" },
  { key: "naver_pc", label: "네이버 SA (PC)", source: "naver_pc", medium: "cpc", naverTracking: true },
  { key: "naver_mo", label: "네이버 SA (MO)", source: "naver_mo", medium: "cpc", naverTracking: true },
  { key: "google", label: "구글", source: "google", medium: "cpc" },
  { key: "meta", label: "메타", source: "meta", medium: "paid_social" },
  { key: "kakao", label: "카카오", source: "kakao", medium: "cpc" },
];

// 네이버 파워링크 추가 파라미터 (자생병원 URL 기준)
export type ExtraParam = { key: string; value: string };

export const NAVER_EXTRA_KEYS = [
  "n_media",
  "n_query",
  "n_rank",
  "n_ad_group",
  "n_ad",
  "n_campaign_type",
  "n_ad_group_type",
  "n_match",
  "NaPm",
];

// 한글·특수문자를 안전하게 인코딩해 최종 URL 조립
export function buildUtmUrl(
  fields: UtmFields,
  extras: ExtraParam[] = [],
): string {
  const base = fields.baseUrl.trim();
  if (!base) return "";

  // 랜딩 URL에 이미 붙어있는 파라미터(?a=b)를 보존
  const [path, existingQuery] = base.split("?");
  const params = new URLSearchParams(existingQuery || "");

  const utm: Record<string, string> = {
    utm_source: fields.source,
    utm_medium: fields.medium,
    utm_campaign: fields.campaign,
    utm_content: fields.content,
    utm_term: fields.term,
  };

  // 값이 있는 UTM만 추가 (빈 값은 URL에 안 넣음)
  for (const [k, v] of Object.entries(utm)) {
    if (v.trim()) params.set(k, v.trim());
  }

  // 매체 트래킹 파라미터 추가
  for (const { key, value } of extras) {
    if (key.trim() && value.trim()) params.set(key.trim(), value.trim());
  }

  const query = params.toString(); // URLSearchParams가 한글 자동 인코딩
  return query ? `${path}?${query}` : path;
}

// URL 유효성 간단 체크
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
