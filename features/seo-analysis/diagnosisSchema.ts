// AI 진단 구조화 출력 스키마 — enum 제약 없이 가볍게 유지한다 (API의 문법 컴파일 크기 제한 회피). 값 검증은 route에서 한다.

const strArr = { type: "array", items: { type: "string" } } as const;

export const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "siteRole", "engines", "questions", "offsite", "priorities", "reinterpretation", "caveats", "aeo", "geo", "sov", "schemaProposal"],
  properties: {
    summary: { type: "string", description: "총평 2~3문장. 진단 데이터의 수치를 근거로" },
    siteRole: { type: "string", description: "이 페이지/사이트가 AI 답변에서 맡을 역할 한 문장" },
    engines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["engine", "readiness", "evidence", "blockers", "actions"],
        properties: { engine: { type: "string" }, readiness: { type: "string", description: "양호 | 보통 | 미흡" }, evidence: { type: "string" }, blockers: strArr, actions: strArr },
      },
    },
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["no", "question", "type", "intent", "basis"],
        properties: { no: { type: "integer" }, question: { type: "string" }, type: { type: "string", description: "범용형 | 검증형" }, intent: { type: "string", description: "정보 탐색 | 대안 비교 | 솔루션 탐색 | 구매 결정" }, basis: { type: "string" } },
      },
    },
    offsite: strArr,
    priorities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["rank", "action", "why", "engines", "severity"],
        properties: { rank: { type: "integer" }, action: { type: "string" }, why: { type: "string" }, engines: strArr, severity: { type: "string", description: "HIGH | MID | LOW" } },
      },
    },
    reinterpretation: { type: "string" },
    caveats: strArr,
    aeo: {
      type: "object",
      additionalProperties: false,
      required: ["items", "faq", "summaryTable"],
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["no", "stage", "question", "h2", "directAnswer"],
            properties: { no: { type: "integer" }, stage: { type: "string", description: "정보 탐색 | 대안 비교 | 솔루션 탐색 | 구매 결정" }, question: { type: "string" }, h2: { type: "string" }, directAnswer: { type: "string" } },
          },
        },
        faq: { type: "array", items: { type: "object", additionalProperties: false, required: ["question", "answer"], properties: { question: { type: "string" }, answer: { type: "string" } } } },
        summaryTable: {
          type: "object",
          additionalProperties: false,
          required: ["title", "columns", "rows"],
          properties: { title: { type: "string" }, columns: strArr, rows: { type: "array", items: strArr } },
        },
      },
    },
    geo: {
      type: "object",
      additionalProperties: false,
      required: ["snippets", "twoPaths", "entityMap"],
      properties: {
        snippets: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["no", "snippet", "basis", "placement", "targetEngines"],
            properties: { no: { type: "integer" }, snippet: { type: "string" }, basis: { type: "string" }, placement: { type: "string" }, targetEngines: strArr },
          },
        },
        twoPaths: { type: "object", additionalProperties: false, required: ["pathA", "pathB"], properties: { pathA: strArr, pathB: strArr } },
        entityMap: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["entity", "category", "coreKeywords", "supportKeywords", "sameAs", "schemaHint"],
            properties: { entity: { type: "string" }, category: { type: "string" }, coreKeywords: strArr, supportKeywords: strArr, sameAs: strArr, schemaHint: { type: "string" } },
          },
        },
      },
    },
    sov: {
      type: "object",
      additionalProperties: false,
      required: ["prompts", "decisionTree"],
      properties: {
        prompts: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["no", "stage", "prompt", "note"],
            properties: { no: { type: "integer" }, stage: { type: "string", description: "정보 탐색 | 대안 비교 | 솔루션 탐색 | 구매 결정" }, prompt: { type: "string" }, note: { type: "string" } },
          },
        },
        decisionTree: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["step", "check", "verdictForThisPage", "ifFail", "ifPass"],
            properties: { step: { type: "integer" }, check: { type: "string" }, verdictForThisPage: { type: "string" }, ifFail: { type: "string" }, ifPass: { type: "string" } },
          },
        },
      },
    },
    schemaProposal: {
      type: "object",
      additionalProperties: false,
      required: ["industry", "reason", "jsonLd", "notes"],
      properties: { industry: { type: "string" }, reason: { type: "string" }, jsonLd: { type: "string" }, notes: strArr },
    },
  },
} as const;

// 전체 스키마는 API의 문법 크기 제한에 걸리므로 세 부분으로 나눠 병렬 호출한다. 각 부분은 수락 확인됨(2026-09-16).
export const PART_KEYS = {
  core: ["summary", "siteRole", "engines", "offsite", "priorities", "reinterpretation", "caveats"],
  content: ["questions", "aeo", "sov"],
  geo: ["geo", "schemaProposal"],
} as const;
export type PartName = keyof typeof PART_KEYS;

export function schemaSubset(part: PartName): Record<string, unknown> {
  const keys = PART_KEYS[part] as readonly string[];
  const props = (OUTPUT_SCHEMA as unknown as { properties: Record<string, unknown> }).properties;
  return { type: "object", additionalProperties: false, required: [...keys], properties: Object.fromEntries(keys.map((k) => [k, props[k]])) };
}
