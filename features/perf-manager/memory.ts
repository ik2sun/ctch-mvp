// 메일 AI 정리 — 서버 전용. 광고주와 주고받은 최근 메일을 읽어 KPI·합의·요청·일정·이슈·연락처로 정리해 pm_memory에 저장.
// 대화(캠페인 매니저)는 이 정리를 시스템 프롬프트에 넣고, 세부는 search_emails 도구로 원문을 찾는다.
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { PM_MODEL, type CampaignOwner, type PmMemory } from "./types";
import { membersText } from "./store";

const MAX_EMAILS = 120;
const BODY_CHARS = 1500;

const ITEM = {
  type: "object",
  properties: {
    content: { type: "string" },
    date: { type: "string", description: "YYYY-MM-DD(메일 날짜 또는 본문에 적힌 날짜), 모르면 빈 문자열" },
    campaign: { type: "string", description: "관련 캠페인·매체·소재, 없으면 빈 문자열" },
    owner: { type: "string", description: "NMG 측 담당자(이름 또는 이메일), 모르면 빈 문자열" },
    source: { type: "string", description: "근거 메일 'MM-DD 제목'" },
  },
  required: ["content", "date", "campaign", "owner", "source"],
  additionalProperties: false,
};

export const MEMORY_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "광고주 관계·현재 운영 상황 3~5문장" },
    kpis: {
      type: "array",
      items: {
        type: "object",
        properties: { item: { type: "string" }, value: { type: "string" }, source: { type: "string" } },
        required: ["item", "value", "source"],
        additionalProperties: false,
      },
    },
    agreements: { type: "array", items: ITEM },
    requests: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ...ITEM.properties,
          from: { type: "string", description: "요청한 사람(광고주 측 이름·이메일)" },
          due: { type: "string", description: "기한 YYYY-MM-DD, 없으면 빈 문자열" },
          status: { type: "string", description: "미해결 | 완료 | 확인 필요" },
        },
        required: [...ITEM.required, "from", "due", "status"],
        additionalProperties: false,
      },
    },
    schedule: { type: "array", items: ITEM },
    issues: { type: "array", items: ITEM },
    contacts: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, email: { type: "string" }, side: { type: "string", description: "광고주 | NMG | 기타" }, role: { type: "string" } },
        required: ["name", "email", "side", "role"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "kpis", "agreements", "requests", "schedule", "issues", "contacts"],
  additionalProperties: false,
};

const SYSTEM = `너는 광고대행사 NMG의 캠페인 매니저 보조다. 광고주와 주고받은 업무 메일을 읽고, 캠페인을 운영하는 사람이 바로 쓸 수 있게 정리한다.

원칙
- 메일에 적힌 사실만 쓴다. 추측·일반론을 넣지 않는다. 숫자(예산·목표 ROAS·CPA·기한)는 메일에 적힌 값 그대로.
- 같은 내용이 여러 메일에 있으면 가장 최근 것을 기준으로 하나로 합치고, 바뀐 경우 "(이전: …)"로 남긴다.
- requests는 광고주가 NMG에 요청한 일. 이후 메일에서 처리됐다고 확인되면 status "완료", 처리 흔적이 없으면 "미해결", 애매하면 "확인 필요".
- agreements는 양측이 합의·확정한 사항(예산, KPI, 소재 방향, 운영 방식, 보고 주기 등).
- issues는 불만·문제 제기·리스크(성과 저조 지적, 정산·세금계산서 문제, 소재 반려 등).
- owner는 그 건을 맡은 NMG 측 담당자. 메일 발신·수신자와 아래 '프로젝트 멤버' 표(구분·맡은 캠페인)로 판단한다.
- source는 근거 메일을 'MM-DD 제목' 형식으로.
- 항목마다 최근 것부터, 각 배열 최대 15개. 해당 내용이 없으면 빈 배열.
- 한국어, 짧은 문장.`;

export async function buildMemory(clientId: string, clientName: string, owners: CampaignOwner[], by: string): Promise<{ memory: PmMemory; emailCount: number; lastEmailAt: string | null }> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("pm_emails")
    .select("id, from_addr, from_name, to_addrs, cc_addrs, subject, sent_at, body, direction, mailboxes")
    .eq("client_id", clientId)
    .order("sent_at", { ascending: false })
    .limit(MAX_EMAILS);
  if (error) throw new Error(error.message);
  const mails = (data ?? []).reverse(); // 오래된 것 → 최신 순으로 읽게
  if (!mails.length) throw new Error("수집된 메일이 없어요. 메일 규칙을 저장하고 '메일 동기화'를 먼저 실행하세요.");

  const dirLabel: Record<string, string> = { inbound: "광고주→NMG", outbound: "NMG→광고주", internal: "내부·기타" };
  const text = mails
    .map((m) => {
      const date = m.sent_at ? String(m.sent_at).slice(0, 10) : "날짜 없음";
      const who = `${m.from_name ? `${m.from_name} ` : ""}<${m.from_addr}> → ${(m.to_addrs ?? []).join(", ")}${m.cc_addrs?.length ? ` (참조 ${m.cc_addrs.join(", ")})` : ""}`;
      return `### ${date} · ${dirLabel[m.direction ?? ""] ?? "기타"} · ${m.subject}\n${who}\n${String(m.body ?? "").slice(0, BODY_CHARS)}`;
    })
    .join("\n\n");
  const ownerTable = owners.length ? membersText(owners) : "(등록 안 됨 — 메일 발신자로 판단)";

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 280_000 });
  const request = (withSchema: boolean) =>
    client.beta.messages
      .stream({
        model: PM_MODEL,
        max_tokens: 32000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default" as never,
        thinking: { type: "adaptive" },
        output_config: withSchema ? { effort: "medium", format: { type: "json_schema", schema: MEMORY_SCHEMA } } : { effort: "medium" },
        system: withSchema ? SYSTEM : `${SYSTEM}\n\n반드시 아래 JSON 스키마를 만족하는 JSON 객체 하나만 출력한다.\n${JSON.stringify(MEMORY_SCHEMA)}`,
        messages: [
          {
            role: "user",
            content: `광고주: ${clientName}\n오늘: ${new Date().toISOString().slice(0, 10)}\n\n## 프로젝트 멤버(구분·맡은 캠페인)\n${ownerTable}\n\n## 메일 ${mails.length}건(오래된 순)\n\n${text}`,
          },
        ],
      })
      .finalMessage();

  let msg: Awaited<ReturnType<typeof request>>;
  try {
    msg = await request(true);
  } catch (e) {
    if (e instanceof Anthropic.BadRequestError && /grammar|schema/i.test(e.message)) msg = await request(false);
    else throw e;
  }
  if (msg.stop_reason === "refusal") throw new Error("메일 정리를 완료하지 못했어요(모델 거절). 메일 내용을 확인해 주세요.");
  const raw = msg.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  let memory: PmMemory;
  try {
    memory = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
  } catch {
    throw new Error("AI 정리 결과를 읽지 못했어요. 다시 시도해 주세요.");
  }
  for (const k of ["kpis", "agreements", "requests", "schedule", "issues", "contacts"] as const) if (!Array.isArray(memory[k])) (memory as Record<string, unknown>)[k] = [];

  const lastEmailAt = mails[mails.length - 1]?.sent_at ?? null;
  const { error: saveErr } = await db
    .from("pm_memory")
    .upsert({ client_id: clientId, memory, email_count: mails.length, last_email_at: lastEmailAt, built_at: new Date().toISOString(), built_by: by }, { onConflict: "client_id" });
  if (saveErr) throw new Error(saveErr.message);
  return { memory, emailCount: mails.length, lastEmailAt };
}

// 대화 시스템 프롬프트용 짧은 텍스트
export function memoryToText(m: PmMemory): string {
  const items = (title: string, arr: { content: string; date?: string; owner?: string; source?: string; status?: string; due?: string }[]) =>
    arr.length
      ? `### ${title}\n${arr
          .map((x) => `- ${x.date ? `[${x.date}] ` : ""}${x.status ? `(${x.status}) ` : ""}${x.content}${x.due ? ` · 기한 ${x.due}` : ""}${x.owner ? ` · 담당 ${x.owner}` : ""}${x.source ? ` · 출처 ${x.source}` : ""}`)
          .join("\n")}`
      : "";
  return [
    m.summary ? `### 요약\n${m.summary}` : "",
    m.kpis.length ? `### KPI·목표\n${m.kpis.map((k) => `- ${k.item}: ${k.value} · 출처 ${k.source}`).join("\n")}` : "",
    items("합의 사항", m.agreements),
    items("광고주 요청", m.requests),
    items("일정", m.schedule),
    items("이슈·리스크", m.issues),
    m.contacts.length ? `### 연락처\n${m.contacts.map((c) => `- ${c.name} <${c.email}> ${c.side} ${c.role}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
