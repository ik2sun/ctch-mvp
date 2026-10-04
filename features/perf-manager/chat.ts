// 캠페인 매니저 대화 — 서버 전용. 현재 광고주 한 곳의 캠페인 매니저로 동작한다. 스트리밍 수동 도구 루프:
//  - load_skill(클라이언트 도구): 퍼포먼스 전문 스킬 본문(시스템 프롬프트에는 이름·설명만)
//  - get_campaign_performance / get_campaign_daily: 연동 매체 캠페인 성과(서버가 매체 API 조회, 10분 캐시)
//  - search_emails / read_email: 담당자 메일함에서 수집한 광고주 메일(pm_emails)
//  - get_market_signals: CTCH 경쟁사·브랜드 키워드 모니터링 + 시장 메모
//  - web_search(서버 도구): 시장·업계·매체 최신 정보
// 메일 AI 정리(pm_memory)·담당자 표·광고주 정보는 시스템 프롬프트 두 번째 블록에 넣는다(광고주마다 다름 — 캐시 앞 블록과 분리).
// 대화는 저장하지 않는다. 화면이 보낸 이전 턴은 텍스트만 다시 넣는다(thinking 블록 재전송 없음).
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { SKILLS, skillByName } from "./skills";
import { campaignDaily, campaignReport, loadCampaigns } from "./campaigns";
import { marketSignals } from "./market";
import { membersText, type ClientProfile } from "./store";
import { PM_MODEL, type Brief, type CampaignOwner, type ChatEvent, type ChatTurn, type PmSettings } from "./types";

const MAX_LOOPS = 10;
const MAX_TURNS = 30; // 화면이 보내는 이전 턴 상한(오래된 것부터 버림 — 앞쪽만 잘라 내므로 안전)

const PERSONA = `너는 대행사 NMG에서 지금 선택된 광고주를 전담하는 '캠페인 매니저'다. 메타·구글·네이버·카카오 퍼포먼스 광고를 15년 넘게 운영한 최고 수준의 전문가로, 이 광고주의 메일 히스토리·매체 성과·시장 상황을 모두 꿰고 있는 사람처럼 일한다. 질문하는 사람은 이 광고주를 함께 맡는 NMG 마케터·팀장이다.

일하는 방식
- 결론부터. 첫 문장에 판단이나 답, 그다음 근거, 마지막에 할 일을 "오늘/이번 주/다음 점검"과 담당자를 붙여 쓴다.
- 근거는 세 가지로 나눠 밝힌다: ① 메일(날짜·제목·보낸 사람) ② 매체 데이터(도구로 조회한 수치) ③ 시장(웹 검색 출처·CTCH 모니터링). 확인 안 된 것은 확인 안 됐다고 쓴다.
- 성과·예산·이상 징후 질문이면 get_campaign_performance로 먼저 조회한다. 기간을 말하지 않으면 최근 30일. 한 캠페인을 깊게 볼 때는 get_campaign_daily.
- 광고주가 요청·합의한 내용, 일정, 담당자, 과거 경위는 아래 '메일 정리'를 먼저 보고, 세부나 원문이 필요하면 search_emails → read_email.
- 시장·경쟁·업계 동향은 get_market_signals와 웹 검색으로 확인하고 출처를 밝힌다.
- 할 일·이슈에는 담당자를 붙인다. 담당자는 아래 '프로젝트 사람'의 NMG 사람 중 그 건을 메일로 주고받은 사람으로 판단하고(search_emails로 확인), 알 수 없으면 '담당자 미지정'. 메일 속 사람이 광고주인지 NMG인지도 이 목록으로 판단한다.
- 숫자는 도구 결과·메일·출처에서만 쓴다. 업계 평균·벤치마크를 지어내지 않는다. 경험칙은 경험칙이라고 밝힌다.
- 상관과 인과를 구분한다. 플랫폼 리포트 수치는 증분이 아니다.
- 광고주에게 보낼 메일 초안을 요청받으면 메일 정리의 합의·요청 사항과 수치를 반영해 정중하고 간결하게 쓴다(발송은 사람이 한다).
- 전문 주제가 나오면 load_skill로 해당 스킬을 먼저 읽는다. 한 대화에서 이미 읽은 스킬은 다시 읽지 않는다.
- CTCH 메뉴가 도움이 되면 안내한다: 대시보드, 실시간 리포트, 소재 분석, 미디어믹스 최적화(예산 배분·동기화), 상관관계 분석, SA 관리(입찰 시뮬레이터·경쟁사·브랜드 키워드 모니터링), UTM 자동화(AI 마케팅 에이전트 하위).
- 한국어로, 동료에게 말하듯 간결하게. 표는 비교가 있을 때만. 과장·감탄사·이모지 없이.`;

const NO_PROPS = { type: "object" as const, properties: {}, required: [] as string[], additionalProperties: false };

const DATA_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "get_campaign_performance",
    description: "현재 광고주의 연동 매체(메타·네이버 SA·GFA·카카오모먼트) 캠페인 성과를 조회한다. 매체 합계, 캠페인별 기간 합계, 최근 7일 vs 직전 7일 변화, 캠페인 담당자를 돌려준다. 필터는 빈 문자열이면 전체.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        days: { type: "integer", description: "최근 며칠(어제까지). 7~90, 보통 30" },
        media: { type: "string", description: "meta | naver | gfa | kakao 또는 빈 문자열" },
        name_contains: { type: "string", description: "캠페인 이름에 포함된 문자열 또는 빈 문자열" },
        owner_email: { type: "string", description: "담당자 이메일 또는 빈 문자열" },
      },
      required: ["days", "media", "name_contains", "owner_email"],
      additionalProperties: false,
    },
  },
  {
    name: "get_campaign_daily",
    description: "이름에 특정 문자열이 들어간 캠페인(최대 3개)의 일별 광고비·노출·클릭·전환·매출 표.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { name_contains: { type: "string" }, days: { type: "integer", description: "7~90" } },
      required: ["name_contains", "days"],
      additionalProperties: false,
    },
  },
  {
    name: "search_emails",
    description: "담당자 메일함에서 수집한 이 광고주 관련 메일을 검색한다. 결과는 최신순 목록(id·날짜·방향·보낸 사람·제목·앞부분). 원문은 read_email로 읽는다.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "제목·본문에서 찾을 단어(공백으로 여러 개 = 모두 포함). 빈 문자열이면 최근 메일" },
        days: { type: "integer", description: "최근 며칠 안의 메일. 전체면 0" },
        direction: { type: "string", description: "inbound(광고주→NMG) | outbound(NMG→광고주) | internal | 빈 문자열(전체)" },
        limit: { type: "integer", description: "최대 개수 1~30" },
      },
      required: ["query", "days", "direction", "limit"],
      additionalProperties: false,
    },
  },
  {
    name: "read_email",
    description: "search_emails 결과의 id로 메일 원문(답장 인용부 제외)을 읽는다.",
    strict: true,
    input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
  },
  {
    name: "get_market_signals",
    description: "CTCH에 쌓인 시장·경쟁 신호: 업종·경쟁사 설정, 네이버 파워링크 경쟁사 키워드 순위, 브랜드 키워드 침해 감지, 시장 메모.",
    strict: true,
    input_schema: NO_PROPS,
  },
];

const LOAD_SKILL: Anthropic.Beta.BetaTool = {
  name: "load_skill",
  description: "퍼포먼스 마케팅 전문 스킬 문서를 읽는다. 질문 주제에 맞는 스킬을 답하기 전에 읽어라.",
  strict: true,
  input_schema: {
    type: "object",
    properties: { name: { type: "string", enum: SKILLS.map((s) => s.name), description: "스킬 이름" } },
    required: ["name"],
    additionalProperties: false,
  },
};

const TOOL_LABEL: Record<string, string> = {
  get_campaign_performance: "캠페인 성과 조회",
  get_campaign_daily: "캠페인 일별 조회",
  search_emails: "메일 검색",
  read_email: "메일 원문",
  get_market_signals: "시장·경쟁 신호",
};

export type ChatInput = {
  turns: ChatTurn[];
  webSearch: boolean;
  briefs: Brief[];
  supabase: SupabaseClient;
  ownerId: string;
  client: ClientProfile;
  settings: PmSettings;
  owners: CampaignOwner[];
  mailboxes: string[]; // 연결됐거나 메일을 가져온 담당자 메일함
  memoryText: string | null;
  memoryBuiltAt: string | null;
  mailCount: number;
};

function systemPrompt(input: ChatInput): Anthropic.Beta.BetaTextBlockParam[] {
  const skillList = SKILLS.map((s) => `- ${s.name} (${s.label}): ${s.description}`).join("\n");
  const briefList = input.briefs
    .slice(0, 40)
    .map((b) => `- [${b.date}] ${b.title} — ${b.summary} (출처: ${b.source.name} ${b.source.url})`)
    .join("\n");
  const c = input.client;
  const owners = input.owners.length ? membersText(input.owners) : "(미등록 — 담당자를 물으면 '캠페인 매니저 설정 > 프로젝트 멤버에서 등록하세요'라고 안내)";
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const clientBlock = [
    `오늘 날짜(한국): ${today}`,
    "",
    `# 담당 광고주: ${c.name}`,
    `업종 ${c.industry || "—"} · 월 예산 ${c.monthly_budget ? `${Number(c.monthly_budget).toLocaleString("ko-KR")}원` : "—"} · 광고주 관리상 담당 ${c.manager || "—"}${c.memo ? `\n메모: ${c.memo}` : ""}`,
    `메일 수집 조건: 특정인 ${[...input.settings.mailAddresses, ...input.settings.mailDomains.map((d) => `@${d}`)].join(", ") || "(없음)"} ${input.settings.mailMatch === "all" ? "AND" : "또는"} 키워드 ${input.settings.mailKeywords.join(", ") || "(없음)"} · 경쟁사: ${input.settings.competitors.join(", ") || "(미설정)"}`,
    "",
    "## 프로젝트 사람(광고주·NMG — 메일 수집 대상)",
    owners,
    "",
    `## 메일 정리(AI, ${input.memoryBuiltAt ? `${input.memoryBuiltAt.slice(0, 10)} 기준` : "아직 없음"} · 수집 메일 ${input.mailCount}건 · 담당자 메일함 ${input.mailboxes.length}개${input.mailboxes.length ? `: ${input.mailboxes.join(", ")}` : ""})`,
    input.memoryText || (input.mailCount ? "(정리 전 — 필요하면 search_emails로 직접 찾는다)" : "(수집된 메일 없음 — 담당자가 이 화면에서 Gmail을 연결하고 메일 규칙 저장 후 '메일 동기화'를 해야 한다)"),
    "",
    "## 업계 최신 정보(CTCH 정리, 출처 확인분)",
    briefList || "(없음)",
  ].join("\n");
  return [
    { type: "text", text: `${PERSONA}\n\n## 스킬 목록(load_skill의 name)\n${skillList}`, cache_control: { type: "ephemeral" } },
    { type: "text", text: clientBlock },
  ];
}

const clampInt = (v: unknown, lo: number, hi: number, d: number) => {
  const x = Math.round(Number(v));
  return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d;
};
const safeTerm = (t: string) => t.replace(/[,()%*\\]/g, " ").trim();

async function runTool(name: string, raw: unknown, input: ChatInput): Promise<string> {
  const a = (raw ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof a[k] === "string" ? (a[k] as string).trim() : "");
  const db = createAdminClient();
  switch (name) {
    case "get_campaign_performance": {
      const data = await loadCampaigns(input.supabase, input.client.id, input.ownerId, clampInt(a.days, 7, 90, 30));
      return campaignReport(data, input.owners, 40, { media: str("media") || undefined, nameContains: str("name_contains") || undefined, owner: str("owner_email") || undefined });
    }
    case "get_campaign_daily": {
      const q = str("name_contains");
      if (!q) return "name_contains가 비었어요.";
      const data = await loadCampaigns(input.supabase, input.client.id, input.ownerId, clampInt(a.days, 7, 90, 30));
      return campaignDaily(data, q);
    }
    case "search_emails": {
      let q = db
        .from("pm_emails")
        .select("id, sent_at, direction, from_addr, from_name, subject, snippet, mailboxes")
        .eq("client_id", input.client.id)
        .order("sent_at", { ascending: false })
        .limit(clampInt(a.limit, 1, 30, 15));
      for (const t of str("query").split(/\s+/).map(safeTerm).filter(Boolean).slice(0, 5)) q = q.or(`subject.ilike.%${t}%,body.ilike.%${t}%`);
      const days = clampInt(a.days, 0, 3650, 0);
      if (days) q = q.gte("sent_at", new Date(Date.now() - days * 86400000).toISOString());
      const dir = str("direction");
      if (["inbound", "outbound", "internal"].includes(dir)) q = q.eq("direction", dir);
      const { data, error } = await q;
      if (error) return `메일 검색 실패: ${error.message}`;
      if (!data?.length) return "조건에 맞는 메일이 없어요.";
      return data
        .map((m) => `- id ${m.id} · ${String(m.sent_at ?? "").slice(0, 16).replace("T", " ")} · ${m.direction} · ${m.from_name ? `${m.from_name} ` : ""}<${m.from_addr}> · 제목: ${m.subject}\n  ${String(m.snippet ?? "").slice(0, 200)}`)
        .join("\n");
    }
    case "read_email": {
      const id = str("id");
      if (!/^[0-9a-f-]{36}$/i.test(id)) return "id 형식이 아니에요. search_emails 결과의 id를 그대로 넣으세요.";
      const { data } = await db.from("pm_emails").select("*").eq("client_id", input.client.id).eq("id", id).maybeSingle();
      if (!data) return "메일을 찾지 못했어요.";
      return `날짜: ${data.sent_at}\n방향: ${data.direction}\n보낸 사람: ${data.from_name ?? ""} <${data.from_addr}>\n받는 사람: ${(data.to_addrs ?? []).join(", ")}\n참조: ${(data.cc_addrs ?? []).join(", ")}\n제목: ${data.subject}\n수집 메일함: ${(data.mailboxes ?? []).join(", ")}\n\n${data.body ?? ""}`;
    }
    case "get_market_signals":
      return marketSignals(input.supabase, input.client.id, input.ownerId, input.settings, input.client.industry);
    default:
      return "알 수 없는 도구예요.";
  }
}

export async function runChat(input: ChatInput, emit: (e: ChatEvent) => void, signal?: AbortSignal): Promise<void> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 280_000 });
  const turns = input.turns.slice(-MAX_TURNS);
  while (turns.length && turns[0].role !== "user") turns.shift();
  const messages: Anthropic.Beta.BetaMessageParam[] = turns.map((t) => ({ role: t.role, content: t.content }));

  const tools: Anthropic.Beta.BetaToolUnion[] = [LOAD_SKILL, ...DATA_TOOLS];
  if (input.webSearch) {
    // 기본형 web_search — 이 프로젝트 실측(2026-09-29)에서 동적 필터링형(20260209)은 인용이 비고 2분 넘게 걸렸다
    tools.push({ type: "web_search_20250305", name: "web_search", max_uses: 4, user_location: { type: "approximate", country: "KR", timezone: "Asia/Seoul" } });
  }
  const system = systemPrompt(input);
  const loaded = new Set<string>();
  const sources = new Map<string, string>();

  for (let loop = 0; loop < MAX_LOOPS; loop++) {
    const stream = client.beta.messages.stream(
      {
        model: PM_MODEL,
        max_tokens: 32000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default" as never, // 거절 시 분류별 자동 대체 모델(API는 지원, SDK 0.110 타입은 배열형만 선언)
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        system,
        tools,
        messages,
      },
      { signal },
    );
    let wrote = false;
    stream.on("text", (delta) => {
      if (delta) wrote = true;
      emit({ type: "text", text: delta });
    });
    const message = await stream.finalMessage();

    for (const b of message.content) {
      if (b.type === "server_tool_use" && b.name === "web_search") {
        const q = (b.input as { query?: string })?.query;
        if (q) emit({ type: "search", query: q });
      }
      if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
        for (const r of b.content) if (r.type === "web_search_result" && !sources.has(r.url)) sources.set(r.url, r.title);
      }
    }

    if (message.stop_reason === "refusal") {
      emit({ type: "error", message: "이 요청에는 답할 수 없어요. 질문을 바꿔 다시 시도해 주세요." });
      break;
    }
    if (message.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: message.content });
      continue;
    }
    const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (message.stop_reason !== "tool_use" || !toolUses.length) break;

    messages.push({ role: "assistant", content: message.content });
    // 여러 도구 호출은 병렬로 실행하고 결과는 한 메시지에 모아 돌려준다
    const results = await Promise.all(
      toolUses.map(async (t): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
        if (t.name === "load_skill") {
          const name = (t.input as { name?: unknown })?.name;
          const skill = typeof name === "string" ? skillByName(name) : undefined;
          if (!skill) return { type: "tool_result", tool_use_id: t.id, is_error: true, content: `알 수 없는 스킬이에요. 가능한 이름: ${SKILLS.map((s) => s.name).join(", ")}` };
          if (!loaded.has(skill.name)) emit({ type: "skill", name: skill.name, label: skill.label });
          loaded.add(skill.name);
          return { type: "tool_result", tool_use_id: t.id, content: skill.content };
        }
        emit({ type: "tool", label: TOOL_LABEL[t.name] ?? t.name });
        try {
          return { type: "tool_result", tool_use_id: t.id, content: (await runTool(t.name, t.input, input)).slice(0, 60000) };
        } catch (e) {
          return { type: "tool_result", tool_use_id: t.id, is_error: true, content: e instanceof Error ? e.message : "도구 실행 실패" };
        }
      }),
    );
    messages.push({ role: "user", content: results });
    if (wrote) emit({ type: "text", text: "\n\n" }); // 도구 호출 앞뒤 문단 구분
  }

  if (sources.size) emit({ type: "sources", items: [...sources].slice(0, 8).map(([url, title]) => ({ url, title })) });
}
