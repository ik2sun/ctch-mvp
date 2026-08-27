// 벌크 브랜드 키워드 등록: 붙여넣기/엑셀 표를 파싱해 행별로 검증하는 순수 로직
import { parseEmailList } from "@/lib/utils/email";
import type { CheckIntervalHours } from "./brandKeywordData";

const HEADER_ALIASES: Record<string, string> = {
  keyword: "keyword",
  키워드: "keyword",
  브랜드키워드: "keyword",
  domain: "ownerDomain",
  owner_domain: "ownerDomain",
  도메인: "ownerDomain",
  우리도메인: "ownerDomain",
  "우리 도메인": "ownerDomain",
  광고주도메인: "ownerDomain",
  "광고주 도메인": "ownerDomain",
  email: "alertEmail",
  alert_email: "alertEmail",
  메일: "alertEmail",
  담당자메일: "alertEmail",
  "담당자 메일": "alertEmail",
  interval: "interval",
  check_interval: "interval",
  주기: "interval",
  체크주기: "interval",
  "체크 주기": "interval",
  memo: "memo",
  메모: "memo",
};

// 체크 주기 열에 쓸 수 있는 표기 → 시간 단위 값
const INTERVAL_LABELS: Record<string, CheckIntervalHours> = {
  수동: null,
  manual: null,
  "6": 6,
  "6시간": 6,
  "6시간마다": 6,
  "12": 12,
  "12시간": 12,
  "12시간마다": 12,
  "24": 24,
  매일: 24,
  "24시간마다": 24,
  "168": 168,
  매주: 168,
  "168시간마다": 168,
};

export type BulkKeywordRow = {
  index: number;
  keyword: string;
  ownerDomain: string;
  alertEmail: string;
  checkIntervalHours: CheckIntervalHours;
  memo: string;
  error: string | null;
};

export type BulkKeywordDefaults = {
  ownerDomain: string;
  alertEmail: string;
  checkIntervalHours: CheckIntervalHours;
};

// 한 줄을 셀 배열로 분리 (탭 우선, 없으면 콤마)
function splitLine(line: string): string[] {
  const raw = line.includes("\t") ? line.split("\t") : line.split(",");
  return raw.map((c) => c.trim());
}

export function textToMatrix(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map(splitLine);
}

function mapHeaders(headers: string[]): string[] {
  return headers.map((h) => HEADER_ALIASES[h.toLowerCase().trim()] ?? "ignore");
}

function parseInterval(raw: string): CheckIntervalHours | "invalid" {
  const key = raw.trim().toLowerCase();
  if (key in INTERVAL_LABELS) return INTERVAL_LABELS[key];
  return "invalid";
}

// 붙여넣기/파일에서 온 2차원 데이터를 파싱해 검증한다.
// existingKeywords: 이미 등록돼 있는 키워드(같은 광고주) — 엑셀 업로드 전에 미리 중복을 표시해 준다.
export function parseBulk(
  matrix: string[][],
  defaults: BulkKeywordDefaults,
  existingKeywords: Set<string> = new Set(),
): BulkKeywordRow[] {
  if (matrix.length < 2) return [];
  const headerMap = mapHeaders(matrix[0]);
  const seen = new Set<string>();

  return matrix.slice(1).map((cells, i) => {
    const row: BulkKeywordRow = {
      index: i + 1,
      keyword: "",
      ownerDomain: defaults.ownerDomain,
      alertEmail: defaults.alertEmail,
      checkIntervalHours: defaults.checkIntervalHours,
      memo: "",
      error: null,
    };

    let intervalRaw = "";
    headerMap.forEach((field, col) => {
      const val = (cells[col] ?? "").trim();
      if (!val) return;
      switch (field) {
        case "keyword": row.keyword = val; break;
        case "ownerDomain": row.ownerDomain = val; break;
        case "alertEmail": row.alertEmail = val; break;
        case "interval": intervalRaw = val; break;
        case "memo": row.memo = val; break;
      }
    });

    if (!row.keyword) {
      row.error = "키워드 없음";
      return row;
    }
    const dupKey = row.keyword.trim().toLowerCase();
    if (seen.has(dupKey)) {
      row.error = "엑셀 안에 같은 키워드가 중복돼요.";
      return row;
    }
    if (existingKeywords.has(dupKey)) {
      row.error = "이미 등록된 키워드예요.";
      return row;
    }
    seen.add(dupKey);

    if (!row.ownerDomain) {
      row.error = "광고주 도메인 없음";
      return row;
    }

    const emails = parseEmailList(row.alertEmail);
    if (!emails) {
      row.error = "담당자 메일 형식 오류 (여러 명은 콤마로 구분)";
      return row;
    }
    row.alertEmail = emails.join(", ");

    if (intervalRaw) {
      const parsed = parseInterval(intervalRaw);
      if (parsed === "invalid") {
        row.error = `체크 주기 값을 인식할 수 없어요: "${intervalRaw}" (수동/6/12/24/168/매일/매주)`;
        return row;
      }
      row.checkIntervalHours = parsed;
    }

    return row;
  });
}

export const TEMPLATE_HEADERS = ["키워드", "광고주 도메인", "담당자 메일", "체크 주기", "메모"];
export const TEMPLATE_SAMPLE = ["캐치이사", "example.com", "marketing@example.com", "매일", ""];
