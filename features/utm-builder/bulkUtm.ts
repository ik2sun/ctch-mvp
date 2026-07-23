// 벌크 UTM: 붙여넣기/엑셀 표를 파싱해 행별 UTM URL로 변환하는 순수 로직
import { buildUtmUrl, isValidUrl, type ExtraParam } from "./buildUtm";

// 인식하는 헤더 이름 → 표준 필드 매핑 (별칭 허용)
const HEADER_ALIASES: Record<string, string> = {
  url: "url",
  "랜딩url": "url",
  랜딩: "url",
  "landing_url": "url",
  source: "source",
  utm_source: "source",
  medium: "medium",
  utm_medium: "medium",
  campaign: "campaign",
  utm_campaign: "campaign",
  content: "content",
  utm_content: "content",
  term: "term",
  utm_term: "term",
  키워드: "term",
  memo: "memo",
  메모: "memo",
};

// 네이버 트래킹 열은 그대로 파라미터로 취급
const TRACKING_KEYS = new Set([
  "n_media",
  "n_query",
  "n_rank",
  "n_ad_group",
  "n_ad",
  "n_campaign_type",
  "n_ad_group_type",
  "n_match",
  "napm",
]);

export type BulkRow = {
  index: number;
  url: string;
  source: string;
  medium: string;
  campaign: string;
  content: string;
  term: string;
  memo: string;
  tracking: ExtraParam[];
  finalUrl: string;
  error: string | null;
};

export type CommonDefaults = {
  source: string;
  medium: string;
  campaign: string;
};

// 한 줄을 셀 배열로 분리 (탭 우선, 없으면 콤마)
function splitLine(line: string): string[] {
  const raw = line.includes("\t") ? line.split("\t") : line.split(",");
  return raw.map((c) => c.trim());
}

// 헤더 배열 → 각 열이 어떤 필드인지 매핑 인덱스 생성
function mapHeaders(headers: string[]) {
  return headers.map((h) => {
    const key = h.toLowerCase().trim();
    if (HEADER_ALIASES[key]) return { field: HEADER_ALIASES[key], raw: key };
    if (TRACKING_KEYS.has(key)) return { field: "tracking", raw: key };
    return { field: "ignore", raw: key };
  });
}

// 붙여넣기/파일에서 온 2차원 데이터를 파싱
// rows: 첫 줄이 헤더인 문자열 매트릭스
export function parseBulk(
  matrix: string[][],
  defaults: CommonDefaults,
): BulkRow[] {
  if (matrix.length < 2) return [];
  const headerMap = mapHeaders(matrix[0]);

  return matrix.slice(1).map((cells, i) => {
    const row: BulkRow = {
      index: i + 1,
      url: "",
      source: defaults.source,
      medium: defaults.medium,
      campaign: defaults.campaign,
      content: "",
      term: "",
      memo: "",
      tracking: [],
      finalUrl: "",
      error: null,
    };

    headerMap.forEach((h, col) => {
      const val = (cells[col] ?? "").trim();
      if (!val) return;
      switch (h.field) {
        case "url": row.url = val; break;
        case "source": row.source = val; break;
        case "medium": row.medium = val; break;
        case "campaign": row.campaign = val; break;
        case "content": row.content = val; break;
        case "term": row.term = val; break;
        case "memo": row.memo = val; break;
        case "tracking": row.tracking.push({ key: h.raw, value: val }); break;
      }
    });

    if (!row.url) {
      row.error = "URL 없음";
    } else if (!isValidUrl(row.url)) {
      row.error = "URL 형식 오류";
    } else {
      row.finalUrl = buildUtmUrl(
        {
          baseUrl: row.url,
          source: row.source,
          medium: row.medium,
          campaign: row.campaign,
          content: row.content,
          term: row.term,
        },
        row.tracking,
      );
    }
    return row;
  });
}

// 붙여넣은 텍스트 → 매트릭스
export function textToMatrix(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map(splitLine);
}

// 샘플 템플릿용 헤더/예시 (자생병원 구조 기반)
export const TEMPLATE_HEADERS = [
  "url", "source", "medium", "campaign", "content", "term", "n_query", "n_rank",
];
export const TEMPLATE_SAMPLE = [
  "https://ulsan.jaseng.co.kr/disease/back/herniated-disc.do?Location_Branch_Code=10014",
  "naver_mo", "cpc", "t.지역_애드부스트", "애드부스트_울산_척추", "울산척추통증", "삼산동허리디스크병원", "2",
];
