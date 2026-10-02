// Gmail API(읽기 전용) — 서버 전용. 검색(q)으로 메시지 id를 모으고, 메시지마다 헤더·본문(text)을 뽑아
// MCP 가져오기와 같은 ImportMail 모양으로 돌려준다(저장·중복 합치기는 features/perf-manager/mailStore.ts 공용).
import type { ImportMail } from "@/features/perf-manager/mailText";

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export class GmailApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function gmail<T>(token: string, path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  let res: Response;
  let json: unknown;
  // 사용자별 분당 한도(429·403 quota/rateLimit)에 걸리면 잠시 쉬었다 최대 3번 다시
  for (let attempt = 0; ; attempt++) {
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    json = await res.json().catch(() => ({}));
    const m = (json as { error?: { message?: string } }).error?.message ?? "";
    const limited = res.status === 429 || (res.status === 403 && /quota|rate ?limit/i.test(m));
    if (!limited || attempt >= 3) break;
    await sleep(5000 * (attempt + 1));
  }
  if (!res.ok) {
    const msg = (json as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`;
    if (res.status === 429 || /quota exceeded/i.test(msg)) throw new GmailApiError(429, "Gmail 사용 한도(분당)에 걸렸어요. 1~2분 뒤 다시 동기화해 주세요. 지금까지 받은 메일은 저장돼요.");
    if (res.status === 403 && /has not been used|disabled/i.test(msg)) throw new GmailApiError(403, "GCP 프로젝트에서 Gmail API가 꺼져 있어요. 관리자에게 Gmail API 사용 설정을 요청하세요.");
    if (res.status === 401) throw new GmailApiError(401, "Gmail 인증이 만료됐어요. 다시 연결하세요.");
    throw new GmailApiError(res.status, `Gmail API 오류: ${msg}`);
  }
  return json as T;
}

// 검색 결과 메시지 id(최신순). max까지
export async function listMessageIds(token: string, q: string, max: number): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  while (ids.length < max) {
    const page = await gmail<{ messages?: { id: string }[]; nextPageToken?: string }>(token, "/messages", {
      q,
      maxResults: String(Math.min(100, max - ids.length)),
      ...(pageToken ? { pageToken } : {}),
    });
    ids.push(...(page.messages ?? []).map((m) => m.id));
    if (!page.nextPageToken) break;
    pageToken = page.nextPageToken;
  }
  return ids;
}

type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[]; headers?: { name: string; value: string }[] };
type RawMessage = { id: string; threadId: string; snippet?: string; internalDate?: string; payload?: Part };

const decode = (d: string) => Buffer.from(d.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");

function findPart(p: Part | undefined, mime: string): string | null {
  if (!p) return null;
  if (p.mimeType === mime && p.body?.data) return decode(p.body.data);
  for (const c of p.parts ?? []) {
    const hit = findPart(c, mime);
    if (hit) return hit;
  }
  return null;
}

function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

export async function getMessage(token: string, id: string): Promise<ImportMail> {
  const m = await gmail<RawMessage>(token, `/messages/${id}`, { format: "full" });
  const h = (name: string) => m.payload?.headers?.find((x) => x.name.toLowerCase() === name.toLowerCase())?.value;
  const plain = findPart(m.payload, "text/plain");
  const html = plain ? null : findPart(m.payload, "text/html");
  return {
    messageId: h("Message-ID") ?? h("Message-Id") ?? undefined,
    threadId: m.threadId,
    from: h("From") ?? "",
    to: h("To") ?? "",
    cc: h("Cc") ?? "",
    subject: h("Subject") ?? "(제목 없음)",
    date: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : h("Date") ?? "",
    body: plain ?? (html ? htmlToText(html) : m.snippet ?? ""),
    snippet: m.snippet ?? "",
  };
}

// 동시 n개씩
export async function mapLimit<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        try {
          out[k] = { status: "fulfilled", value: await fn(items[k]) };
        } catch (e) {
          out[k] = { status: "rejected", reason: e };
        }
      }
    }),
  );
  return out;
}
