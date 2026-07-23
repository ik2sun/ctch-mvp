import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

type Row = {
  name: string;
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

// 토큰 절약: 지출 상위 N개만 + 효율 지표 미리 계산해서 전달
function condense(rows: Row[], limit: number) {
  return [...rows]
    .sort((a, b) => b.cost - a.cost)
    .slice(0, limit)
    .map((r) => ({
      name: r.name,
      상위캠페인: r.campaignName ?? undefined,
      상위광고세트: r.adsetName ?? undefined,
      노출: Math.round(r.impressions),
      도달: Math.round(r.reach),
      빈도: +r.frequency.toFixed(2),
      클릭: Math.round(r.clicks),
      광고비: Math.round(r.cost),
      전환: Math.round(r.conversions),
      매출: Math.round(r.revenue),
      CTR: r.impressions ? +((r.clicks / r.impressions) * 100).toFixed(2) : 0,
      CPC: r.clicks ? Math.round(r.cost / r.clicks) : 0,
      CPA: r.conversions ? Math.round(r.cost / r.conversions) : 0,
      CVR: r.clicks ? +((r.conversions / r.clicks) * 100).toFixed(2) : 0,
      ROAS: r.cost ? +((r.revenue / r.cost) * 100).toFixed(0) : 0,
    }));
}

const SYSTEM_PROMPT = `당신은 10년 이상의 경험을 가진 '수석 퍼포먼스 마케터'이자 '데이터 시각화 전문가'입니다.

제공된 메타(Meta) 광고 데이터(캠페인 > 광고 세트 > 광고 소재의 계층 구조)를 심층 분석하여, 광고 효율(ROAS, CPA 등)을 극대화하기 위한 '효율 개선 최적화 리포트'를 작성합니다. 단순 수치 나열은 금지하며, 데이터 간 상관관계를 분석해 즉각적인 액션(ON/OFF, 예산 증감, 소재 교체)을 도출해야 합니다.

[출력 구조]
반드시 아래 섹션 순서와 마크다운 포맷을 지키세요.

## 1. 핵심 요약
- 전체 예산 대비 핵심 KPI(ROAS, CPA 등) 달성 현황을 3문장 이내로 요약
- 가장 시급한 'Critical Issue' 1가지를 굵게 명시

## 2. 계층별 효율 병목 분석
- **캠페인 레벨**: 예산 소진 분포와 캠페인별 효율 격차 분석
- **광고 세트 레벨**: 예산 낭비가 발생하는 세트 식별
- **소재 레벨**: CTR·CVR 기반 위닝 소재와 피로도 누적 소재 분류 (빈도(frequency)가 높고 CTR이 낮으면 피로도 신호)
- 각 레벨의 핵심 비교 데이터는 반드시 마크다운 표(Table)로 시각화

## 3. 최적화 의사결정 트리
- 취해야 할 액션을 Mermaid.js flowchart로 시각화
- 반드시 \`\`\`mermaid 코드블록으로 감싸고 \`flowchart TD\`로 시작
- 노드 텍스트에 괄호()·대괄호[]·따옴표 등 특수문자를 쓰지 말고 한글과 쉼표만 사용
- 노드 5~9개 내외로 간결하게

## 4. 넥스트 액션 플랜
- 내일 즉시 실행할 최적화 작업 3가지를 우선순위대로
- 각 액션의 기대 효과를 데이터 근거와 함께 1줄로

[제약]
- 불확실한 원인을 추측하지 말 것. 주어진 지표 안에서 논리적으로 도출 가능한 결론만 작성
- 퍼널, 피로도, A/B 테스트, 스케일업 등 전문 용어로 실무자 톤앤매너 유지
- 금액은 원화, 비율은 %로 표기`;

const CONTEXT_GUIDE = `

[마케터 컨텍스트 통합 지침]
마케터가 입력한 추가 컨텍스트가 있습니다. API 데이터와 융합해 분석하되 다음을 엄수하세요.
1. 가설 검증: 마케터의 분석·가설을 단순 반복하지 말고, 데이터(CTR, CVR, CPA, 빈도 등)를 근거로 참/거짓을 수치로 검증
2. 전략적 동기화: 마케터가 제시한 방향성을 최우선 가이드로 삼되, 데이터로 더 정교하게 다듬는 보완책 제시
3. 사각지대 발굴: 마케터가 언급하지 않았으나 데이터상 위험 신호(예산 누수, CVR 급락 등)가 있으면 경고

또한 아래 섹션을 리포트 마지막에 추가하세요.

## 5. 휴먼 & AI 시너지 인사이트
마케터의 분석과 AI의 데이터 검증 결과를 마크다운 표로 대조
열 구성: | 마케터의 분석 | AI의 데이터 기반 검증 | 최종 액션 제안 |`;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "서버에 ANTHROPIC_API_KEY가 설정되지 않았어요." },
      { status: 500 },
    );
  }

  const { campaigns, adsets, ads, context, period, clientName, goal } =
    await req.json();

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const hasContext = typeof context === "string" && context.trim().length > 0;

  const payload = {
    광고주: clientName ?? "",
    기간: period ? `${period.since} ~ ${period.until}` : "",
    타겟지표: goal || "ROAS 극대화 및 CPA 최적화",
    캠페인: condense(campaigns ?? [], 20),
    광고세트: condense(adsets ?? [], 25),
    소재: condense(ads ?? [], 30),
  };

  const userMsg = `아래는 메타 광고 성과 데이터입니다.

[Meta API 데이터]
${JSON.stringify(payload, null, 1)}

${hasContext ? `[마케터의 추가 컨텍스트]\n${context.trim()}` : "[마케터의 추가 컨텍스트]\n(없음 — 5번 섹션은 생략하세요)"}

위 지침에 따라 최적화 리포트를 작성해 주세요.`;

  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 4000,
      system: SYSTEM_PROMPT + (hasContext ? CONTEXT_GUIDE : ""),
      messages: [{ role: "user", content: userMsg }],
    });

    const text = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n");

    return NextResponse.json({ report: text });
  } catch (e) {
    const message = e instanceof Error ? e.message : "AI 리포트 생성 중 오류가 발생했어요.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
