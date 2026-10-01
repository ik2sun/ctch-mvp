// 퍼포먼스 매니저 대화 — 서버 전용. 스트리밍 수동 도구 루프:
//  - load_skill(클라이언트 도구): 필요한 전문 스킬 본문을 읽는다(시스템 프롬프트에는 이름·설명만)
//  - web_search(서버 도구): 최신 제품 변경·세미나 자료 확인(사용자가 켰을 때)
// 대화는 저장하지 않는다. 화면이 보낸 이전 턴은 텍스트만 다시 넣는다(thinking 블록 재전송 없음 — 보존 thinking 규칙상 안전).
import Anthropic from "@anthropic-ai/sdk";
import { SKILLS, skillByName } from "./skills";
import type { Brief, ChatEvent, ChatTurn } from "./types";

export const PM_MODEL = "claude-opus-5-5";
const MAX_LOOPS = 8;
const MAX_TURNS = 30; // 화면이 보내는 이전 턴 상한(오래된 것부터 버림 — 앞쪽만 잘라 내므로 안전)

const PERSONA = `너는 'NMG 퍼포먼스 매니저'다. 메타·구글·네이버·카카오 퍼포먼스 광고를 15년 이상 운영하고, 글로벌 브랜드와 국내 커머스·앱·리드 광고주의 성장을 이끈 세계 최고 수준의 퍼포먼스 마케팅 전문가다. 대행사(NMG) 마케터와 팀장들이 동료로서 너에게 묻는다.

일하는 방식
- 결론부터. 첫 문장에 판단이나 답을 쓰고, 근거와 실행 순서를 뒤에 붙인다. 실행할 일은 "오늘/이번 주/다음 점검"처럼 시점을 붙여 구체적으로.
- 숫자는 사용자가 준 데이터, 아래 '현재 광고주 성과' 데이터, 웹 검색 출처에서만 쓴다. 업계 평균·벤치마크 수치를 지어내지 않는다. 일반론의 경험칙(예: 학습에 주 50건 전환)은 경험칙이라고 밝힌다.
- 모르는 것, 데이터로 확인이 필요한 것은 그렇게 말하고 무엇을 보면 되는지 알려 준다.
- 질문이 모호해도 되묻기보다 가장 그럴듯한 가정을 밝히고 답한 뒤, 가정이 다르면 알려 달라고 한다.
- 상관과 인과를 구분한다. 플랫폼 리포트 수치는 증분이 아니다.
- 최신 기능·정책·세미나 내용은 기억에 의존하지 말고 아래 '최신 정보' 목록이나 웹 검색으로 확인하고 출처를 밝힌다. 웹 검색이 꺼져 있으면 기억 기반이라 최신이 아닐 수 있다고 알린다.
- 전문 주제가 나오면 load_skill로 해당 스킬을 먼저 읽고 그 절차를 따른다. 여러 개를 읽어도 된다. 한 대화에서 이미 읽은 스킬은 다시 읽지 않는다.
- CTCH 대시보드에 해당 기능이 있으면 메뉴를 안내한다: 대시보드(매체별 효율·인사이트), 실시간 리포트, 파일 분석, 소재 분석, 미디어믹스 최적화(예산 배분·효율 한계점·예산 동기화), 상관관계 분석(영상·트래픽 캠페인의 시차 효과), UTM 자동화, SA 입찰 시뮬레이터·경쟁사·브랜드 키워드 모니터링, SEO 분석·AI 인용 추적, 소재 생성.
- 한국어로, 동료에게 말하듯 간결하게. 표는 비교가 있을 때만. 과장·감탄사·이모지 없이.`;

function systemPrompt(briefs: Brief[]): Anthropic.Beta.BetaTextBlockParam[] {
  const skillList = SKILLS.map((s) => `- ${s.name} (${s.label}): ${s.description}`).join("\n");
  const today = new Date().toISOString().slice(0, 10);
  const briefList = briefs
    .slice(0, 40)
    .map((b) => `- [${b.date}] ${b.title} — ${b.summary} (출처: ${b.source.name} ${b.source.url})`)
    .join("\n");
  return [
    // 고정 부분 — 캐시
    { type: "text", text: `${PERSONA}\n\n## 스킬 목록(load_skill의 name)\n${skillList}`, cache_control: { type: "ephemeral" } },
    { type: "text", text: `오늘 날짜: ${today}\n\n## 최신 정보(대시보드에 정리된 항목, 출처 확인분)\n${briefList || "(없음)"}` },
  ];
}

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

export type ChatInput = { turns: ChatTurn[]; context?: string | null; webSearch: boolean; briefs: Brief[] };

export async function runChat(input: ChatInput, emit: (e: ChatEvent) => void, signal?: AbortSignal): Promise<void> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 280_000 });
  const turns = input.turns.slice(-MAX_TURNS);
  while (turns.length && turns[0].role !== "user") turns.shift();
  const messages: Anthropic.Beta.BetaMessageParam[] = turns.map((t) => ({ role: t.role, content: t.content }));
  // 현재 광고주 데이터는 마지막 사용자 턴 앞에 붙인다(매 요청 새로 만든 텍스트 — 이전 턴은 건드리지 않음)
  if (input.context && messages.length) {
    const last = messages[messages.length - 1];
    messages[messages.length - 1] = { role: "user", content: `[현재 광고주 성과 — CTCH 매체 API 기준]\n${input.context}\n\n[질문]\n${last.content as string}` };
  }

  const tools: Anthropic.Beta.BetaToolUnion[] = [LOAD_SKILL];
  if (input.webSearch) {
    // 기본형 web_search — 이 프로젝트 실측(2026-09-29)에서 동적 필터링형(20260209)은 인용이 비고 2분 넘게 걸렸다
    tools.push({ type: "web_search_20250305", name: "web_search", max_uses: 4, user_location: { type: "approximate", country: "KR", timezone: "Asia/Seoul" } });
  }
  const system = systemPrompt(input.briefs);
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
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = toolUses.map((t) => {
      const name = (t.input as { name?: unknown })?.name;
      const skill = typeof name === "string" ? skillByName(name) : undefined;
      if (t.name !== "load_skill" || !skill) {
        return { type: "tool_result", tool_use_id: t.id, is_error: true, content: `알 수 없는 스킬이에요. 가능한 이름: ${SKILLS.map((s) => s.name).join(", ")}` };
      }
      if (!loaded.has(skill.name)) emit({ type: "skill", name: skill.name, label: skill.label });
      loaded.add(skill.name);
      return { type: "tool_result", tool_use_id: t.id, content: skill.content };
    });
    messages.push({ role: "user", content: results });
    if (wrote) emit({ type: "text", text: "\n\n" }); // 도구 호출 앞뒤 문단 구분
  }

  if (sources.size) emit({ type: "sources", items: [...sources].slice(0, 8).map(([url, title]) => ({ url, title })) });
}
