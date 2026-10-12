// 자동 리포트 — Claude 호출(서버 전용): ① 예시 리포트에서 양식 학습 ② 계산된 수치로 코멘트 작성
// 모델은 앱 공통 claude-sonnet-5-5, 서버측 대체 모델 fallbacks "default". 문법 거절 시 스키마 없이 재시도
import Anthropic from "@anthropic-ai/sdk";
import { MEDIA_LABEL } from "@/features/correlation/types";
import { change, type ReportData } from "./compute";
import { fmt } from "./render";
import { COMPARES, FREQUENCIES, METRIC_KEYS, METRICS, PERIODS, SECTION_TYPES, TOP_TYPES, type CompareKey, type Frequency, type MetricKey, type PeriodKey, type ReportSpec, type SectionType } from "./types";

const MODEL = "claude-sonnet-5-5";

async function jsonCall<T>(opts: { system: string; content: Anthropic.Beta.BetaContentBlockParam[]; schema: Record<string, unknown>; maxTokens: number; effort: "low" | "medium" | "high"; timeout: number }): Promise<T> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: opts.timeout });
  const request = (withSchema: boolean) =>
    client.beta.messages
      .stream({
        model: MODEL,
        max_tokens: opts.maxTokens,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default" as never,
        thinking: { type: "adaptive" },
        output_config: withSchema ? { effort: opts.effort, format: { type: "json_schema", schema: opts.schema } } : { effort: opts.effort },
        system: withSchema ? opts.system : `${opts.system}\n\n반드시 아래 JSON 스키마를 만족하는 JSON 객체 하나만 출력한다.\n${JSON.stringify(opts.schema)}`,
        messages: [{ role: "user", content: opts.content }],
      })
      .finalMessage();
  let msg: Awaited<ReturnType<typeof request>>;
  try {
    msg = await request(true);
  } catch (e) {
    if (e instanceof Anthropic.BadRequestError && /grammar|schema/i.test(e.message)) msg = await request(false);
    else throw e;
  }
  if (msg.stop_reason === "refusal") throw new Error("AI가 이 요청을 처리하지 못했어요(거절).");
  const raw = msg.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  try {
    return JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as T;
  } catch {
    throw new Error("AI 응답을 읽지 못했어요. 다시 시도해 주세요.");
  }
}

// ── ① 양식 학습 ─────────────────────────────────────
// 스키마에는 enum을 넣지 않는다(문법 크기) — 값은 아래 normalize에서 정리
const LEARN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "subject", "intro", "tone", "sections", "learnedFrom", "unsupported", "period", "compare", "frequency", "weekday", "monthDay", "naverRaw"],
  properties: {
    name: { type: "string" },
    subject: { type: "string" },
    intro: { type: "string" },
    tone: { type: "string" },
    learnedFrom: { type: "string" },
    unsupported: { type: "array", items: { type: "string" } },
    period: { type: "string" },
    compare: { type: "string" },
    frequency: { type: "string" },
    weekday: { type: "integer" },
    monthDay: { type: "integer" },
    naverRaw: { type: "boolean" },
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "title", "metrics", "limit", "sortBy", "showCompare", "note", "weeks", "device", "sheet"],
        properties: {
          type: { type: "string" },
          title: { type: "string" },
          metrics: { type: "array", items: { type: "string" } },
          limit: { type: "integer" },
          sortBy: { type: "string" },
          showCompare: { type: "boolean" },
          note: { type: "string" },
          weeks: { type: "integer" },
          device: { type: "string" },
          sheet: { type: "string" },
        },
      },
    },
  },
} as const;

type LearnRaw = {
  name: string;
  subject: string;
  intro: string;
  tone: string;
  learnedFrom: string;
  unsupported: string[];
  period: string;
  compare: string;
  frequency: string;
  weekday: number;
  monthDay: number;
  naverRaw: boolean;
  sections: { type: string; title: string; metrics: string[]; limit: number; sortBy: string; showCompare: boolean; note: string; weeks: number; device: string; sheet: string }[];
};

export type LearnResult = {
  name: string;
  naverRaw: boolean;
  spec: ReportSpec;
  schedule: { period: PeriodKey; compare: CompareKey; frequency: Frequency; weekday: number; monthDay: number };
};

const LEARN_SYSTEM = `너는 광고 대행사의 리포트 자동화 담당자다. 담당자가 매번 손으로 만들던 광고주 리포트(엑셀·문서·슬라이드에서 뽑은 내용)를 읽고, CTCH가 매체 API 데이터로 같은 리포트를 자동으로 만들 수 있게 구조를 정리한다.

CTCH가 만들 수 있는 섹션(type):
${Object.entries(SECTION_TYPES)
  .map(([k, v]) => `- ${k}: ${v.label} — ${v.desc}`)
  .join("\n")}

쓸 수 있는 지표(metrics, 키 그대로): ${METRIC_KEYS.map((k) => `${k}(${METRICS[k].label})`).join(", ")}
데이터: 메타·네이버 SA·GFA·카카오모먼트·구글 Ads의 캠페인 단위 일별 광고비·노출·클릭·전환·매출 + 네이버 SA만 키워드·쇼핑 상품(소재)·기기(PC/모바일) 단위 기간 합계와 일별 원본. 그 밖의 매체의 광고그룹·소재·키워드, GA4 유입, 자사몰 매출, 경쟁사 동향, 목표 대비 달성률(목표값)은 만들 수 없다.

규칙:
- 원본의 순서·제목·말투를 최대한 그대로 따른다. 섹션 제목은 원본에서 쓰던 이름을 쓴다.
- 원본의 표가 매체별이면 media_table, 캠페인별이면 campaign_table, 날짜별이면 daily_table, 상단 요약 숫자는 kpi로 옮긴다. '매체별'이라고 적혀 있어도 행이 쇼핑검색·파워링크·브랜드검색처럼 캠페인 유형이면 type_table이다. 주 단위 행(주차별)은 weekly_table(weeks = 원본 주 수, 모르면 4), '전월 대비 달성율'처럼 이번 달 누적을 지난달과 비교하는 표는 achievement(metrics = 원본 열 순서).
- 네이버: 디바이스(PC/MO)별 표는 naver_device, 키워드별 TOP은 naver_keyword_top, 쇼핑검색 상품별 TOP은 naver_product_top(limit = 원본 줄 수, sortBy = 원본 정렬 기준 지표 — 노출 TOP이면 impressions, 클릭 TOP이면 clicks, device = 원본이 'PC 노출 TOP'처럼 기기를 한정하면 "P"·모바일이면 "M", 아니면 "all"). 원본에 같은 표가 기준 지표만 달리 여러 개(노출 TOP·클릭 TOP)면 섹션도 여러 개. 키워드·소재 단위 원본 데이터(RD) 시트가 있으면 naverRaw true. 원본 열 순서대로 metrics를 고른다(원본 열 이름이 달라도 뜻이 같으면 매핑: 집행금액·소진액=cost, 전환수·구매=conversions, 전환매출·구매액=revenue, ROAS·광고수익률=roas 등).
- 원본의 서술(총평·인사이트·다음 액션)은 insights로 옮기고, note에 원본이 무엇을 중심으로 썼는지 적는다. 인사말·안내처럼 매번 같은 글은 text로 옮기고 note에 그 글을 넣는다({광고주} {기간} 변수 사용 가능).
- 만들 수 없는 항목은 sections에 넣지 말고 unsupported에 짧게 적는다(예: "GA4 유입 채널 표", "소재별 성과 이미지").
- sheet: 그 표·글이 원본에서 있던 시트 이름을 그대로(원본 텍스트의 "### 시트 '이름'"). 첨부 엑셀을 원본과 같은 시트 구성으로 만든다. 원본이 엑셀이 아니면 "".
- 해당 없는 칸은 limit 0, sortBy "", note "", weeks 0, device "" 로 둔다. 캠페인 표 limit은 원본 줄 수(모르면 10).
- period: ${Object.keys(PERIODS).join(" | ")} 중 원본 기간과 가장 가까운 것. compare: ${Object.keys(COMPARES).join(" | ")}. frequency: ${Object.keys(FREQUENCIES).join(" | ")} (주간 리포트면 weekly, weekday 1=월…7=일, 월간이면 monthly·monthDay).
- subject는 메일 제목 — {광고주} {기간} 변수를 넣는다. tone은 원본 말투를 한 줄로(예: "보고서체, 항목당 2~3문장, 수치 근거").
- learnedFrom에는 원본에서 읽은 구조를 2~4문장으로 요약한다. 수치는 지어내지 않는다.`;

export async function learnSpec(input: { clientName: string; sourceName: string; text: string; pdfBase64?: string; connected: string[] }): Promise<LearnResult> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (input.pdfBase64) content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: input.pdfBase64 } });
  content.push({
    type: "text",
    text: `광고주: ${input.clientName}\n연동된 매체: ${input.connected.map((m) => MEDIA_LABEL[m] ?? m).join(", ") || "(없음)"}\n원본: ${input.sourceName}\n\n## 원본 내용${input.pdfBase64 ? "(PDF 첨부)" : ""}\n${input.text.slice(0, 60_000) || "(텍스트 없음)"}`,
  });
  const raw = await jsonCall<LearnRaw>({ system: LEARN_SYSTEM, content, schema: LEARN_SCHEMA as unknown as Record<string, unknown>, maxTokens: 16000, effort: "medium", timeout: 200_000 });
  return normalizeLearn(raw);
}

const pick = <T extends string>(v: string, keys: readonly T[], d: T): T => (keys.includes(v as T) ? (v as T) : d);
export function normalizeLearn(r: LearnRaw): LearnResult {
  const sections = (r.sections ?? [])
    .map((s, i) => {
      const type = pick(s.type, Object.keys(SECTION_TYPES) as SectionType[], "insights");
      const metrics = (s.metrics ?? []).filter((m): m is MetricKey => (METRIC_KEYS as string[]).includes(m));
      return {
        id: `s${i + 1}`,
        type,
        title: String(s.title || SECTION_TYPES[type].label).slice(0, 80),
        metrics: type === "insights" || type === "text" ? [] : metrics.length ? metrics : (["cost", "conversions", "roas"] as MetricKey[]),
        limit: TOP_TYPES.includes(type) ? Math.max(1, Math.min(50, s.limit || 10)) : undefined,
        sortBy: TOP_TYPES.includes(type) ? pick(s.sortBy, METRIC_KEYS, "cost") : undefined,
        weeks: type === "weekly_table" ? Math.max(1, Math.min(12, s.weeks || 4)) : undefined,
        device: type === "naver_keyword_top" || type === "naver_product_top" ? pick(s.device, ["all", "P", "M"] as const, "all") : undefined,
        showCompare: ["daily_table", "insights", "text", "achievement", "naver_device", "naver_keyword_top", "naver_product_top"].includes(type) ? undefined : type === "weekly_table" ? s.showCompare !== false : !!s.showCompare,
        note: s.note || undefined,
        sheet: s.sheet ? String(s.sheet).slice(0, 31) : undefined,
      };
    })
    .slice(0, 12);
  return {
    name: String(r.name || "자동 리포트").slice(0, 60),
    naverRaw: !!r.naverRaw,
    spec: {
      subject: r.subject || "[{광고주}] 광고 성과 리포트 ({기간})",
      intro: r.intro || undefined,
      tone: r.tone || "보고서체, 항목당 2~3문장",
      sections: sections.length ? sections : [{ id: "s1", type: "kpi", title: "핵심 지표", metrics: ["cost", "conversions", "roas"], showCompare: true }],
      learnedFrom: r.learnedFrom || undefined,
      unsupported: (r.unsupported ?? []).filter(Boolean).slice(0, 12),
    },
    schedule: {
      period: pick(r.period, Object.keys(PERIODS) as PeriodKey[], "last_week"),
      compare: pick(r.compare, Object.keys(COMPARES) as CompareKey[], "prev"),
      frequency: pick(r.frequency, Object.keys(FREQUENCIES) as Frequency[], "weekly"),
      weekday: Math.min(7, Math.max(1, r.weekday || 1)),
      monthDay: Math.min(28, Math.max(1, r.monthDay || 1)),
    },
  };
}

// ── ② 코멘트 ────────────────────────────────────────
const COMMENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["sections"],
  properties: { sections: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "text"], properties: { id: { type: "string" }, text: { type: "string" } } } } },
} as const;

function dataText(d: ReportData, periodLabel: string, compareLabel: string | null): string {
  const keys: MetricKey[] = ["cost", "impressions", "clicks", "ctr", "cpc", "conversions", "cvr", "cpa", "revenue", "roas"];
  const line = (label: string, r: ReportData["total"]) =>
    `- ${label}: ${keys
      .map((k) => {
        const c = change(r.cur[k], r.prev?.[k]);
        return `${METRICS[k].label} ${fmt(k, r.cur[k])}${c == null ? "" : `(${c > 0 ? "+" : ""}${(c * 100).toFixed(1)}%)`}`;
      })
      .join(", ")}`;
  return [
    `기간 ${periodLabel}${compareLabel ? ` / 괄호 = ${compareLabel} 대비 증감` : ""}`,
    "## 전체",
    line("전체", d.total),
    "## 매체별",
    ...d.byMedia.map((r) => line(r.label, r)),
    "## 캠페인별(광고비 상위 15)",
    ...d.byCampaign.slice(0, 15).map((r) => line(`[${MEDIA_LABEL[r.media ?? ""] ?? r.media}] ${r.label}`, r)),
    ...(d.byType.length > 1 ? ["## 캠페인 유형별", ...d.byType.map((r) => line(r.label, r))] : []),
    ...(d.weekly.length ? ["## 주차별(괄호 = 전 주 대비)", ...d.weekly.map((r) => line(r.label, r))] : []),
    ...(d.naver
      ? [
          "## 네이버 SA 기기별",
          ...d.naver.device.map((r) => line(r.label, r)),
          "## 네이버 SA 키워드(광고비 상위 10)",
          ...[...d.naver.keywords.all].sort((a, b) => (b.cur.cost ?? 0) - (a.cur.cost ?? 0)).slice(0, 10).map((r) => line(r.label, r)),
          "## 네이버 쇼핑검색 상품(광고비 상위 10)",
          ...[...d.naver.products.all].sort((a, b) => (b.cur.cost ?? 0) - (a.cur.cost ?? 0)).slice(0, 10).map((r) => line(r.label, r)),
        ]
      : []),
  ].join("\n");
}

export async function writeComments(input: { spec: ReportSpec; data: ReportData; clientName: string; periodLabel: string; compareLabel: string | null }): Promise<Record<string, string>> {
  const targets = input.spec.sections.filter((s) => s.type === "insights");
  if (!targets.length) return {};
  if (!input.data.byMedia.length) return Object.fromEntries(targets.map((s) => [s.id, "이 기간에 집계된 광고 성과가 없어요."]));
  const system = `너는 광고 대행사 퍼포먼스 마케터로, 광고주에게 보내는 정기 리포트의 코멘트를 쓴다.
- 아래 데이터의 수치만 쓴다. 데이터에 없는 수치·원인·외부 사정을 지어내지 않는다. 원인은 '가능성'으로만 말한다.
- 말투: ${input.spec.tone}
- 섹션마다 note에 적힌 방향을 따른다. 줄바꿈으로 문단·항목을 나눈다(마크다운 기호 #, ** 쓰지 않음, 항목은 '· '로 시작 가능).`;
  const r = await jsonCall<{ sections: { id: string; text: string }[] }>({
    system,
    content: [
      {
        type: "text",
        text: `광고주: ${input.clientName}\n\n${dataText(input.data, input.periodLabel, input.compareLabel)}\n\n## 써야 할 섹션\n${targets.map((s) => `- id ${s.id} · 제목 "${s.title}" · 방향: ${s.note || "요약과 다음 액션"}`).join("\n")}`,
      },
    ],
    schema: COMMENT_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 12000,
    effort: "low",
    timeout: 150_000,
  });
  return Object.fromEntries((r.sections ?? []).filter((s) => targets.some((t) => t.id === s.id)).map((s) => [s.id, s.text]));
}
