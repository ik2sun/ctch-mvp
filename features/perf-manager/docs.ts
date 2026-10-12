// AI 매니저 자료실 — 업로드 문서 학습·검색(서버 전용). pm_documents·pm_doc_chunks는 RLS 정책이 없어 service_role로만.
// 학습: 원문 텍스트(워드·파워포인트·엑셀·구글 문서는 브라우저가 추출) 또는 PDF(저장소 원본을 Claude가 직접 읽음) →
//   claude-sonnet-5-5 + json_schema로 요약·핵심 포인트·주제별 정리(숫자·조건 원문 그대로) → 정리 조각 + 원문 조각(1,500자)으로 저장.
// 검색: 질문 단어가 많이 들어간 조각 순(한국어라 전문 검색 대신 ilike + 코드 점수)
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { PM_MODEL } from "./types";

export const DOC_BUCKET = "pm-docs"; // 비공개 버킷(0034)
export const DOC_DIR = "docs";
const RAW_CHUNK = 1500;
const RAW_OVERLAP = 150;
const MAX_TEXT = 150_000; // Claude에 넣는 원문 상한(넘으면 앞부분)

export type DocMeta = {
  id: string;
  clientId: string | null;
  title: string;
  fileName: string;
  kind: string;
  docType: string | null;
  publisher: string | null;
  effectiveDate: string | null;
  summary: string | null;
  keyPoints: string[];
  tags: string[];
  chars: number;
  status: string;
  error: string | null;
  uploadedBy: string | null;
  createdAt: string;
  filePath: string | null;
};

const MISSING = /Could not find the table|relation .* does not exist|column .* does not exist/i;
export function docsMigrationHint(e: { message?: string } | null | undefined): string | null {
  return e?.message && MISSING.test(e.message) ? "자료실 테이블이 없어요. supabase/migrations/0034_pm_documents.sql을 Supabase SQL Editor에서 실행해 주세요." : null;
}

const fromRow = (r: Record<string, unknown>): DocMeta => ({
  id: String(r.id),
  clientId: (r.client_id as string) ?? null,
  title: String(r.title ?? ""),
  fileName: String(r.file_name ?? ""),
  kind: String(r.kind ?? ""),
  docType: (r.doc_type as string) ?? null,
  publisher: (r.publisher as string) ?? null,
  effectiveDate: (r.effective_date as string) ?? null,
  summary: (r.summary as string) ?? null,
  keyPoints: (r.key_points as string[]) ?? [],
  tags: (r.tags as string[]) ?? [],
  chars: Number(r.chars ?? 0),
  status: String(r.status ?? "ready"),
  error: (r.error as string) ?? null,
  uploadedBy: (r.uploaded_by as string) ?? null,
  createdAt: String(r.created_at ?? ""),
  filePath: (r.file_path as string) ?? null,
});

// 이 광고주가 볼 수 있는 문서 = 이 광고주 전용 + 공용
export async function listDocs(clientId: string): Promise<DocMeta[]> {
  const { data, error } = await createAdminClient()
    .from("pm_documents")
    .select("id, client_id, title, file_name, file_path, kind, doc_type, publisher, effective_date, summary, key_points, tags, chars, status, error, uploaded_by, created_at")
    .or(`client_id.eq.${clientId},client_id.is.null`)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(docsMigrationHint(error) ?? error.message);
  return (data ?? []).map(fromRow);
}

export async function deleteDoc(id: string, clientId: string) {
  const db = createAdminClient();
  const { data } = await db.from("pm_documents").select("id, client_id, file_path").eq("id", id).maybeSingle();
  if (!data || (data.client_id && data.client_id !== clientId)) throw new Error("문서를 찾지 못했어요.");
  if (data.file_path) await db.storage.from(DOC_BUCKET).remove([data.file_path]).catch(() => {});
  const { error } = await db.from("pm_documents").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ── 학습 ──────────────────────────────────────────────
const DIGEST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "docType", "publisher", "effectiveDate", "summary", "keyPoints", "tags", "sections"],
  properties: {
    title: { type: "string" },
    docType: { type: "string" },
    publisher: { type: "string" },
    effectiveDate: { type: "string" },
    summary: { type: "string" },
    keyPoints: { type: "array", items: { type: "string" } },
    tags: { type: "array", items: { type: "string" } },
    sections: { type: "array", items: { type: "object", additionalProperties: false, required: ["heading", "content"], properties: { heading: { type: "string" }, content: { type: "string" } } } },
  },
} as const;
type Digest = { title: string; docType: string; publisher: string; effectiveDate: string; summary: string; keyPoints: string[]; tags: string[]; sections: { heading: string; content: string }[] };

const DIGEST_SYSTEM = `너는 광고 대행사 NMG의 지식 관리 담당자다. 마케터가 올린 문서(매체 상품소개서, 광고주 상품소개서, 신기능 안내, 가이드 등)를 읽고, 나중에 AI 캠페인 매니저가 이 문서만 보고 정확히 답할 수 있게 정리한다.
- title: 문서 제목(문서에 쓰인 그대로, 없으면 내용을 대표하는 이름)
- docType: 매체 상품소개서 · 광고주 상품소개서 · 기능 안내 · 가이드 · 정책·약관 · 기타 중 하나
- publisher: 문서를 낸 회사·매체(예: 네이버, 메타, 카카오, 광고주 회사명). 모르면 ""
- effectiveDate: 문서 기준 시점(YYYY-MM 또는 YYYY-MM-DD). 문서에 없으면 ""
- summary: 3~5문장 — 무엇에 관한 문서이고 누가 언제 쓰면 되는지
- keyPoints: 핵심 사실 5~15개(상품명·기능·대상·단가·과금·최소 집행·규격·일정·조건). 숫자·단위는 원문 그대로
- tags: 검색용 단어 5~15개(상품명, 매체, 지면, 기능명, 영문 표기 포함)
- sections: 문서 전체를 주제별로 빠짐없이 나눠 정리(최대 30개, 섹션당 700자 이내). 상품·기능마다 한 섹션. content에는 그 주제의 핵심 — 설명·대상·규격·단가·과금 방식·최소 금액·조건·제약·일정 — 을 원문의 숫자·용어 그대로 압축해 담는다. 세부 원문은 따로 저장되니 섹션은 '어디에 무엇이 있는지' 찾기 좋게. 표는 '항목: 값' 줄로.
- 문서에 없는 내용·수치를 지어내지 않는다.`;

// PDF → 페이지 순서대로 원문 텍스트(검색용 원문 조각의 재료). 출력 한도에 닿으면 앞부분만(truncated)
export async function transcribePdf(pdfBase64: string): Promise<{ text: string; truncated: boolean }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 280_000 });
  const msg = await client.beta.messages
    .stream({
      model: PM_MODEL,
      max_tokens: 64000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default" as never,
      thinking: { type: "between_tools" } as never, // 생각 없이 옮겨 적기만(Sonnet 5.5는 disabled 불가)
      output_config: { effort: "low" },
      system: "너는 문서 전사 담당이다. 첨부한 PDF의 모든 글자를 페이지 순서대로 빠짐없이 옮겨 적는다. 페이지마다 첫 줄에 '--- p.N ---'. 표는 행마다 '항목: 값 | 항목: 값' 줄로, 이미지·도표 속 글자도 옮긴다. 요약·해설·생략 없이 원문 그대로(숫자·단위·고유명사 그대로). 머리말·꼬리말 반복 문구는 한 번만.",
      messages: [{ role: "user", content: [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } }, { type: "text", text: "전체를 옮겨 적어 주세요." }] }],
    })
    .finalMessage();
  const text = msg.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  return { text, truncated: msg.stop_reason === "max_tokens" };
}

export async function digest(input: { fileName: string; text?: string; pdfBase64?: string }): Promise<Digest> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 280_000 });
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (input.pdfBase64) content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: input.pdfBase64 } });
  content.push({ type: "text", text: `파일: ${input.fileName}\n\n${input.text ? `## 원문\n${input.text.slice(0, MAX_TEXT)}` : "(PDF 첨부 — 전체를 읽고 정리)"}` });
  const request = (withSchema: boolean) =>
    client.beta.messages
      .stream({
        model: PM_MODEL,
        max_tokens: 32000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default" as never,
        thinking: { type: "adaptive" },
        output_config: withSchema ? { effort: "medium", format: { type: "json_schema", schema: DIGEST_SCHEMA as unknown as Record<string, unknown> } } : { effort: "medium" },
        system: withSchema ? DIGEST_SYSTEM : `${DIGEST_SYSTEM}\n\n반드시 아래 JSON 스키마를 만족하는 JSON 객체 하나만 출력한다.\n${JSON.stringify(DIGEST_SCHEMA)}`,
        messages: [{ role: "user", content }],
      })
      .finalMessage();
  let msg: Awaited<ReturnType<typeof request>>;
  try {
    msg = await request(true);
  } catch (e) {
    if (e instanceof Anthropic.BadRequestError && /grammar|schema/i.test(e.message)) msg = await request(false);
    else throw e;
  }
  const raw = msg.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  try {
    return JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as Digest;
  } catch {
    throw new Error(msg.stop_reason === "max_tokens" ? "문서가 너무 길어 정리를 끝내지 못했어요. 파일을 나눠 올려 주세요." : "AI 정리 결과를 읽지 못했어요. 다시 시도해 주세요.");
  }
}

function rawChunks(text: string): string[] {
  const t = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const out: string[] = [];
  for (let i = 0; i < t.length; i += RAW_CHUNK - RAW_OVERLAP) out.push(t.slice(i, i + RAW_CHUNK));
  return out;
}

export async function ingestDoc(input: { clientId: string | null; fileName: string; kind: string; text?: string; filePath?: string | null; by: string }): Promise<DocMeta> {
  const db = createAdminClient();
  let pdfBase64: string | undefined;
  if (input.kind === "pdf") {
    if (!input.filePath) throw new Error("PDF 원본이 없어요.");
    const { data, error } = await db.storage.from(DOC_BUCKET).download(input.filePath);
    if (error || !data) throw new Error(`PDF를 저장소에서 읽지 못했어요 — ${error?.message ?? ""}`);
    const buf = Buffer.from(await data.arrayBuffer());
    if (buf.length > 30 * 1024 * 1024) throw new Error("PDF가 30MB를 넘어요. 나눠서 올려 주세요.");
    pdfBase64 = buf.toString("base64");
  }
  let text = (input.text ?? "").trim();
  let note: string | null = null;
  // PDF는 먼저 전체 원문을 옮겨 적고(원문 조각) 그 텍스트로 정리 — 정리만 하면 세부 수치가 빠진다
  if (pdfBase64 && !text) {
    const t = await transcribePdf(pdfBase64);
    text = t.text;
    if (t.truncated) note = "문서가 길어 앞부분만 원문으로 저장했어요(정리는 전체 기준)";
  }
  if (!text && !pdfBase64) throw new Error("문서에서 읽을 내용이 없어요.");
  // 정리는 텍스트가 있으면 텍스트로(빠르고 싸다), 원문이 잘렸으면 PDF 전체로
  const d = await digest({ fileName: input.fileName, text: note ? undefined : text || undefined, pdfBase64: note || !text ? pdfBase64 : undefined });
  const sections = (d.sections ?? []).filter((s) => s.content?.trim());
  const digestText = sections.map((s) => `${s.heading}\n${s.content}`).join("\n\n");
  const { data: row, error } = await db
    .from("pm_documents")
    .insert({
      client_id: input.clientId,
      title: (d.title || input.fileName).slice(0, 200),
      file_name: input.fileName.slice(0, 200),
      file_path: input.filePath ?? null,
      kind: input.kind,
      doc_type: d.docType || null,
      publisher: d.publisher || null,
      effective_date: d.effectiveDate || null,
      summary: d.summary || null,
      key_points: (d.keyPoints ?? []).slice(0, 20),
      tags: (d.tags ?? []).slice(0, 20),
      chars: text.length || digestText.length,
      uploaded_by: input.by,
      error: note,
    })
    .select("*")
    .single();
  if (error) throw new Error(docsMigrationHint(error) ?? error.message);
  const chunks = [
    { heading: "요약·핵심", content: [d.summary, ...(d.keyPoints ?? []).map((k) => `· ${k}`), (d.tags ?? []).length ? `태그: ${d.tags.join(", ")}` : ""].filter(Boolean).join("\n"), kind: "digest" },
    ...sections.map((s) => ({ heading: s.heading.slice(0, 200), content: s.content, kind: "digest" })),
    ...(text ? rawChunks(text).map((c) => ({ heading: null as string | null, content: c, kind: "raw" })) : []),
  ];
  for (let i = 0; i < chunks.length; i += 200) {
    const { error: e2 } = await db.from("pm_doc_chunks").insert(chunks.slice(i, i + 200).map((c, j) => ({ doc_id: row.id, client_id: input.clientId, idx: i + j, kind: c.kind, heading: c.heading, content: c.content })));
    if (e2) throw new Error(e2.message);
  }
  return fromRow(row);
}

// ── 대화용 ────────────────────────────────────────────
export function docsForPrompt(docs: DocMeta[]): string {
  const ready = docs.filter((d) => d.status === "ready");
  if (!ready.length) return "(올린 문서 없음 — 상품·기능 문서를 학습시키려면 이 화면의 '자료실'에 올리면 된다고 안내)";
  return ready
    .slice(0, 40)
    .map((d) => `- [${d.clientId ? "이 광고주" : "공용"}] ${d.title}${d.publisher ? ` · ${d.publisher}` : ""}${d.effectiveDate ? ` · ${d.effectiveDate}` : ""} (id ${d.id}) — ${(d.summary ?? "").slice(0, 220)}`)
    .join("\n");
}

const safeTerm = (t: string) => t.replace(/[,()%*\\]/g, " ").trim();

export async function searchDocs(clientId: string, query: string, limit = 8): Promise<string> {
  const terms = [...new Set(query.split(/\s+/).map(safeTerm).filter((t) => t.length >= 2))].slice(0, 8);
  if (!terms.length) return "검색어가 비었어요.";
  const db = createAdminClient();
  const { data, error } = await db
    .from("pm_doc_chunks")
    .select("doc_id, idx, kind, heading, content")
    .or(`client_id.eq.${clientId},client_id.is.null`)
    .or(terms.map((t) => `content.ilike.%${t}%,heading.ilike.%${t}%`).join(","))
    .limit(300);
  if (error) return `자료실 검색 실패: ${docsMigrationHint(error) ?? error.message}`;
  if (!data?.length) return "자료실에서 찾지 못했어요.";
  const low = (s: string) => s.toLowerCase();
  const scored = data
    .map((c) => {
      const body = low(`${c.heading ?? ""} ${c.content}`);
      const hit = terms.filter((t) => body.includes(low(t))).length;
      const occ = terms.reduce((n, t) => n + body.split(low(t)).length - 1, 0);
      return { c, score: hit * 10 + Math.min(occ, 20) + (c.kind === "digest" ? 3 : 0) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(15, Math.max(1, limit)));
  const ids = [...new Set(scored.map((s) => s.c.doc_id))];
  const { data: docs } = await db.from("pm_documents").select("id, title, publisher, effective_date").in("id", ids);
  const title = new Map((docs ?? []).map((d) => [d.id, `${d.title}${d.publisher ? ` · ${d.publisher}` : ""}${d.effective_date ? ` · ${d.effective_date}` : ""}`]));
  return scored
    .map(({ c }) => {
      const body = c.content;
      const first = terms.map((t) => low(body).indexOf(low(t))).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
      const from = Math.max(0, first - 200);
      return `### [자료: ${title.get(c.doc_id) ?? c.doc_id}] (doc ${c.doc_id})${c.heading ? ` · ${c.heading}` : ""}\n${from ? "…" : ""}${body.slice(from, from + 900)}${body.length > from + 900 ? "…" : ""}`;
    })
    .join("\n\n");
}

export async function readDoc(clientId: string, id: string): Promise<string> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return "id 형식이 아니에요. 자료 목록이나 검색 결과의 id를 그대로 넣으세요.";
  const db = createAdminClient();
  const { data: d } = await db.from("pm_documents").select("*").eq("id", id).maybeSingle();
  if (!d || (d.client_id && d.client_id !== clientId)) return "문서를 찾지 못했어요.";
  const { data: ch } = await db.from("pm_doc_chunks").select("heading, content").eq("doc_id", id).eq("kind", "digest").order("idx").limit(80);
  const body = (ch ?? []).map((c) => `## ${c.heading ?? ""}\n${c.content}`).join("\n\n");
  return `# ${d.title}\n종류: ${d.doc_type ?? "—"} · 발행: ${d.publisher ?? "—"} · 기준: ${d.effective_date ?? "—"} · 파일: ${d.file_name}\n\n${body.slice(0, 24_000)}${body.length > 24_000 ? "\n…(길어서 잘림 — 세부는 search_documents로)" : ""}`;
}
