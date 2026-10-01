// GA4 API 호출 — Data API(runReport) + Admin API(접근 가능한 속성 목록). 서버 전용.
// Data API는 GCP 프로젝트에서 'Google Analytics Data API', 속성 목록은 'Google Analytics Admin API'를 사용 설정해야 한다.
const DATA_API = "https://analyticsdata.googleapis.com/v1beta";
const ADMIN_API = "https://analyticsadmin.googleapis.com/v1beta";

export class Ga4ApiError extends Error {
  code: "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "API_DISABLED" | "OTHER";
  constructor(code: Ga4ApiError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

async function ga4Fetch<T>(url: string, token: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; status?: string; details?: { reason?: string }[] } } & T;
  if (res.ok) return json;
  const msg = json.error?.message ?? `HTTP ${res.status}`;
  if (json.error?.details?.some((d) => d.reason === "SERVICE_DISABLED") || /has not been used|is disabled/.test(msg)) {
    throw new Ga4ApiError("API_DISABLED", `GCP 프로젝트에서 이 API가 꺼져 있어요 — ${msg}`);
  }
  if (res.status === 401) throw new Ga4ApiError("UNAUTHORIZED", msg);
  if (res.status === 403) throw new Ga4ApiError("FORBIDDEN", msg);
  if (res.status === 404) throw new Ga4ApiError("NOT_FOUND", msg);
  throw new Ga4ApiError("OTHER", msg);
}

type RunReportResponse = {
  dimensionHeaders?: { name: string }[];
  metricHeaders?: { name: string }[];
  rows?: { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }[];
};

export type Ga4ReportRow = { dims: string[]; metrics: number[] };

export async function runReport(
  token: string,
  propertyId: string,
  req: { startDate: string; endDate: string; metrics: string[]; dimensions?: string[]; limit?: number },
): Promise<Ga4ReportRow[]> {
  const json = await ga4Fetch<RunReportResponse>(`${DATA_API}/properties/${encodeURIComponent(propertyId)}:runReport`, token, {
    dateRanges: [{ startDate: req.startDate, endDate: req.endDate }],
    metrics: req.metrics.map((name) => ({ name })),
    dimensions: (req.dimensions ?? []).map((name) => ({ name })),
    limit: req.limit ?? 10000,
  });
  return (json.rows ?? []).map((r) => ({
    dims: (r.dimensionValues ?? []).map((d) => d.value),
    metrics: (r.metricValues ?? []).map((m) => Number(m.value) || 0),
  }));
}

// 연결 점검용 — 최근 7일 세션·활성 사용자 합계
export async function probeProperty(token: string, propertyId: string): Promise<{ sessions: number; users: number }> {
  const rows = await runReport(token, propertyId, { startDate: "7daysAgo", endDate: "yesterday", metrics: ["sessions", "activeUsers"] });
  return { sessions: rows[0]?.metrics[0] ?? 0, users: rows[0]?.metrics[1] ?? 0 };
}

export type Ga4PropertySummary = { propertyId: string; name: string; account: string };

// 연결한 계정이 접근할 수 있는 GA4 속성 전체(Admin API accountSummaries)
export async function fetchAccessibleProperties(token: string): Promise<Ga4PropertySummary[]> {
  const out: Ga4PropertySummary[] = [];
  let pageToken = "";
  for (let i = 0; i < 20; i++) {
    const url = `${ADMIN_API}/accountSummaries?pageSize=200${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
    const json = await ga4Fetch<{
      accountSummaries?: { displayName?: string; propertySummaries?: { property: string; displayName?: string }[] }[];
      nextPageToken?: string;
    }>(url, token);
    for (const a of json.accountSummaries ?? []) {
      for (const p of a.propertySummaries ?? []) {
        out.push({ propertyId: p.property.replace(/^properties\//, ""), name: p.displayName ?? "", account: a.displayName ?? "" });
      }
    }
    if (!json.nextPageToken) break;
    pageToken = json.nextPageToken;
  }
  return out;
}
