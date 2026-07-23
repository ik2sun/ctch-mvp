import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

type Row = {
  id: string;
  name: string;
  level: string;
  campaignName: string | null;
  adsetName: string | null;
  impressions: number;
  clicks: number;
  cost: number;
  reach: number;
  frequency: number;
  conversions: number;
  revenue: number;
};

// 토큰 절약: 지출 상위 N개 + 지표 미리 계산
function condense(rows: Row[], limit: number) {
  return [...rows]
    .sort((a, b) => b.cost - a.cost)
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      name: r.name,
      상위: r.level === "ad" ? r.adsetName : r.level === "adset" ? r.campaignName : undefined,
      노출: Math.round(r.impressions),
      도달: Math.round(r.reach),
      빈도: +r.frequency.toFixed(2),
      클릭: Math.round(r.clicks),
      광고비: Math.round(r.cost),
      전환: Math.round(r.conversions),
      매출: Math.round(r.revenue),
      CTR: r.impressions ? +((r.clicks / r.impressions) * 100).toFixed(2) : 0,
      CPA: r.conversions ? Math.round(r.cost / r.conversions) : 0,
      CVR: r.clicks ? +((r.conversions / r.clicks) * 100).toFixed(2) : 0,
      ROAS: r.cost ? +((r.revenue / r.cost) * 100).toFixed(0) : 0,
    }));
}

const SYSTEM = `당신은 메타(Meta) 광고 최적화 전문 AI 어시스턴트입니다.
캠페인/광고세트/소재 계층형 데이터를 분석해 대시보드 UI에 즉시 시각화할 인사이트를 도출합니다.

반드시 아래 스키마의 JSON만 출력하세요. 마크다운 코드펜스나 인사말, 설명 문장을 절대 붙이지 마세요.

{
  "statuses": [
    { "id": "데이터의 id를 그대로", "name": "항목명", "level": "campaign|adset|ad",
      "tag": "scale|risk|fatigue|monitor", "reason": "1줄 사유 (수치 포함)" }
  ],
  "trendSummary": "일별 흐름 2문장 요약",
  "bottleneck": { "path": ["캠페인명","광고세트명","소재명"], "explanation": "어디서 효율이 꺾였는지", "action": "OFF 또는 예산 축소 등 제안" },
  "mermaid": "flowchart LR\\n  A[상태확인] --> B{조건}\\n  ..."
}

작성 규칙:
- statuses: 최적화 액션이 시급한 상위 3~5개 항목을 계층 무관하게 선정. id는 반드시 입력 데이터의 id를 그대로 복사
- tag 기준: scale=효율 좋아 예산 증액 권장, risk=CPA 과다/예산 누수, fatigue=빈도 높고 CTR 하락, monitor=관찰 필요
- reason: 반드시 수치 근거 포함. 예) 빈도 3.5회로 CTR이 0.6%까지 하락
- 입체적 교차분석: 노출·도달·빈도를 함께 해석. 단순히 CTR이 낮다가 아니라 도달 대비 빈도가 높아 CTR이 꺾였다는 식으로
- bottleneck: 예산 낭비가 가장 심한 캠페인→세트→소재 경로 1개
- mermaid: flowchart LR 로 시작. 노드 텍스트에 괄호·따옴표·특수문자 금지, 한글과 쉼표만. 노드 5~8개
- 데이터로 확인 불가한 원인은 추측하지 말 것`;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "서버에 ANTHROPIC_API_KEY가 없어요." }, { status: 500 });
  }

  const { campaigns, adsets, ads, daily, period, clientName, context } = await req.json();

  const payload = {
    광고주: clientName ?? "",
    기간: period ? `${period.since} ~ ${period.until}` : "",
    일별추이: (daily ?? []).map((d: { date: string; cost: number; revenue: number; conversions: number }) => ({
      날짜: d.date,
      광고비: Math.round(d.cost),
      매출: Math.round(d.revenue),
      전환: Math.round(d.conversions),
      ROAS: d.cost ? +((d.revenue / d.cost) * 100).toFixed(0) : 0,
    })),
    캠페인: condense(campaigns ?? [], 15),
    광고세트: condense(adsets ?? [], 20),
    소재: condense(ads ?? [], 25),
  };

  const hasContext = typeof context === "string" && context.trim().length > 0;

  const userMsg = `${JSON.stringify(payload, null, 1)}

${hasContext ? `[마케터 추가 컨텍스트]\n${context.trim()}\n이 컨텍스트를 데이터로 검증해 reason과 trendSummary에 반영하세요. 단순 반복 금지.` : ""}

위 스키마의 JSON만 출력하세요.`;

  try {
    const msg = await anthropicCall(userMsg);
    return NextResponse.json(msg);
  } catch (e) {
    const message = e instanceof Error ? e.message : "AI 분석 중 오류가 발생했어요.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function anthropicCall(userMsg: string) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 2500,
    system: SYSTEM,
    messages: [{ role: "user", content: userMsg }],
  });

  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("\n")
    .trim();

  // 혹시 코드펜스가 붙어 나와도 안전하게 파싱
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const s = cleaned.indexOf("{");
    const e = cleaned.lastIndexOf("}");
    if (s >= 0 && e > s) return JSON.parse(cleaned.slice(s, e + 1));
    throw new Error("AI 응답을 해석하지 못했어요.");
  }
}
