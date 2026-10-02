import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

type Totals = {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;
};

type ChannelInput = { label: string } & Totals;

function round(totals: Totals) {
  return {
    노출: Math.round(totals.impressions),
    클릭: Math.round(totals.clicks),
    광고비: Math.round(totals.cost),
    전환: Math.round(totals.conversions),
    매출: Math.round(totals.revenue),
    CTR: totals.impressions ? +((totals.clicks / totals.impressions) * 100).toFixed(2) : 0,
    CPA: totals.conversions ? Math.round(totals.cost / totals.conversions) : 0,
    ROAS: totals.cost ? +((totals.revenue / totals.cost) * 100).toFixed(0) : 0,
  };
}

const SYSTEM = `당신은 퍼포먼스 마케팅 대시보드용 AI 어시스턴트입니다.
광고주의 매체별 요약 지표(광고비/노출/클릭/전환/매출)와 전주·전월 비교 데이터를 보고 대시보드에 바로 띄울 액션 플랜을 만듭니다.

반드시 아래 스키마의 JSON만 출력하세요. 마크다운 코드펜스나 인사말, 설명 문장을 절대 붙이지 마세요.

{
  "issues": ["이번 주 주요 이슈 1~3개, 각각 수치 근거 포함"],
  "urgentActions": ["즉시 조치가 필요한 항목 (없으면 빈 배열)"],
  "nextWeekActions": ["다음 주 추천 액션 1~3개"]
}

작성 규칙:
- issues: 반드시 수치 근거 포함 (예: "ROAS가 전주 대비 32% 하락했어요")
- urgentActions: CPA 급등, ROAS 급락, 예산 소진 이상 등 즉시 대응이 필요한 신호가 있을 때만 작성. 없으면 빈 배열로 둘 것 — 억지로 만들지 말 것
- nextWeekActions: issues/urgentActions에서 자연스럽게 이어지는 실행 가능한 제안
- 데이터로 확인할 수 없는 원인은 추측하지 말 것
- 매체가 1개뿐이면 매체 간 비교는 하지 말 것`;

// 구조화 출력 — 응답이 항상 이 모양의 JSON(코드펜스·설명 문장 없음)
const PLAN_SCHEMA = {
  type: "object",
  properties: {
    issues: { type: "array", items: { type: "string" } },
    urgentActions: { type: "array", items: { type: "string" } },
    nextWeekActions: { type: "array", items: { type: "string" } },
  },
  required: ["issues", "urgentActions", "nextWeekActions"],
  additionalProperties: false,
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "서버에 ANTHROPIC_API_KEY가 없어요." }, { status: 500 });
  }

  const { clientName, period, channels, channelCompare, combined, compare } = (await req.json()) as {
    clientName?: string;
    period?: { since: string; until: string };
    channels: ChannelInput[];
    channelCompare?: { label: string; previous: Totals; lastMonth?: Totals }[];
    combined: Totals;
    compare?: { previous: Totals; lastMonth?: Totals } | null;
  };

  if (!channels || channels.length === 0) {
    return NextResponse.json({ issues: [], urgentActions: [], nextWeekActions: [] });
  }

  const payload = {
    광고주: clientName ?? "",
    기간: period ? `${period.since} ~ ${period.until}` : "",
    매체별: Object.fromEntries(channels.map((c) => [c.label, round(c)])),
    합계: round(combined),
    직전기간비교: compare ? round(compare.previous) : null,
    전월비교: compare?.lastMonth ? round(compare.lastMonth) : null,
    매체별_직전기간: channelCompare ? Object.fromEntries(channelCompare.map((c) => [c.label, round(c.previous)])) : null,
    매체별_전월동기간: channelCompare?.every((c) => c.lastMonth) ? Object.fromEntries(channelCompare.map((c) => [c.label, round(c.lastMonth!)])) : null,
  };

  const userMsg = `${JSON.stringify(payload, null, 1)}

위 스키마의 JSON만 출력하세요.`;

  try {
    // Vercel 환경변수에 붙여 넣을 때 따라온 공백·따옴표 제거
    const apiKey = process.env.ANTHROPIC_API_KEY.trim().replace(/^["']|["']$/g, "");
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-5-5",
      // claude-sonnet-5-5는 항상 생각(adaptive thinking)한 뒤 답한다 — 생각도 max_tokens에 포함되므로 여유 있게, 정형 작업이라 effort low
      max_tokens: 16000,
      output_config: { effort: "low", format: { type: "json_schema", schema: PLAN_SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content: userMsg }],
    });
    if (msg.stop_reason === "refusal") throw new Error("AI가 이 데이터에 대한 분석을 거절했어요. 다시 시도해 주세요.");
    if (msg.stop_reason === "max_tokens") throw new Error("AI 응답이 길이 한도에 걸려 잘렸어요. 다시 시도해 주세요.");

    const text = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n")
      .trim();

    const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const s = cleaned.indexOf("{");
      const e = cleaned.lastIndexOf("}");
      if (s < 0 || e <= s) throw new Error("AI 응답을 해석하지 못했어요.");
      parsed = JSON.parse(cleaned.slice(s, e + 1));
    }

    return NextResponse.json(parsed);
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      return NextResponse.json(
        { error: "AI 키(ANTHROPIC_API_KEY)가 유효하지 않아요. 서버 환경변수를 확인해 주세요." },
        { status: 500 },
      );
    }
    const message = e instanceof Error ? e.message : "AI 분석 중 오류가 발생했어요.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
