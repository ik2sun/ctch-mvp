import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { parseJsonResponse } from "@/features/proposal/parseJsonResponse";
import type { BasicInfo, FileAnalysis, Insight, Slide } from "@/features/proposal/types";

const SYSTEM_PROMPT = `너는 10년 경력의 디지털 마케팅 전략 컨설턴트야.
대형 광고대행사 수준의 제안서를 작성해.

절대 하지 말 것:
- AI가 분석한 결과 같은 표현 금지
- 글머리 기호만 나열 금지
- 시너지, 최적화, 혁신적인 등 뻔한 용어 금지
- 모든 슬라이드 같은 레이아웃 반복 금지

반드시 할 것:
- 슬라이드마다 핵심 메시지 1줄로 시작
- 숫자와 데이터로 주장 뒷받침
- 스토리텔링 구조 (문제→원인→해결책→기대효과)
- 클라이언트가 우리를 잘 아는구나 느끼도록

슬라이드 구성 8장:
1. 표지 - 임팩트 있는 한 줄 메시지
2. 현황 진단 - 클라이언트 현재 상황 (데이터 기반)
3. 시장 기회 - 경쟁사/트렌드 분석
4. 전략 방향 - 핵심 3가지
5. 매체 전략 - 채널별 역할과 예산 배분
6. 실행 타임라인 - 월별 액션플랜
7. 기대 효과 - 구체적 수치 목표
8. NMG 소개 - 실적 위주 3줄

각 슬라이드는 반드시 아래 JSON 형식으로만 반환 (설명 텍스트 없이 JSON만):
{
  "slides": [
    {
      "index": 1,
      "title": string,
      "subtitle": string,
      "content": string,
      "data": object (차트/인포그래픽용 데이터),
      "layout": "cover"|"data"|"strategy"|"timeline"|"impact"|"profile",
      "notes": string
    }
  ]
}`;

// 한 번에 8장을 요청하면 응답이 길어져 max_tokens에 걸려 JSON이 잘리는 경우가 있어
// 2장씩 4번 나눠 요청한 뒤 합친다.
const SLIDE_GROUPS: { indices: number[]; label: string }[] = [
  { indices: [1, 2], label: "1. 표지 / 2. 현황 진단" },
  { indices: [3, 4], label: "3. 시장 기회 / 4. 전략 방향" },
  { indices: [5, 6], label: "5. 매체 전략 / 6. 실행 타임라인" },
  { indices: [7, 8], label: "7. 기대 효과 / 8. NMG 소개" },
];

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

  const { basicInfo, insights, fileAnalyses } = (await req.json()) as {
    basicInfo: BasicInfo;
    insights: Insight[];
    fileAnalyses: FileAnalysis[];
  };

  const insightBlock = insights.length
    ? insights.map((i) => `- [${i.sourceLabel}] ${i.title}: ${i.summary}`).join("\n")
    : "(선택된 리서치 인사이트 없음)";

  const fileBlock = fileAnalyses.length
    ? fileAnalyses
        .map((f) => `- ${f.fileName}: ${f.summary}\n  핵심포인트: ${f.keyPoints.join(" / ")}`)
        .join("\n")
    : "(업로드된 참고자료 없음)";

  const userMessage = `아래 정보를 바탕으로 제안서 8슬라이드를 작성해 줘.

[광고주] ${basicInfo.clientName}
[업종] ${basicInfo.industry}
[제안 목적] ${basicInfo.goal}
[핵심 KPI] ${basicInfo.kpi}
[월 예산] ${basicInfo.monthlyBudget}
[경쟁사 URL] ${basicInfo.competitorUrls.filter(Boolean).join(", ") || "없음"}

[리서치 인사이트]
${insightBlock}

[참고자료 분석]
${fileBlock}`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const allSlides: Slide[] = [];

  try {
    for (const group of SLIDE_GROUPS) {
      const priorBlock = allSlides.length
        ? allSlides
            .map((s) => `- (${s.index}) ${s.title}: ${s.subtitle}`)
            .join("\n")
        : "(아직 작성된 슬라이드 없음)";

      const groupMessage = `${userMessage}

[지금까지 작성된 슬라이드 요약 - 스토리 흐름을 이어갈 것]
${priorBlock}

이번 요청에서는 아래 슬라이드만 작성해서 JSON으로 반환해줘. 다른 인덱스는 절대 포함하지 마.
- ${group.label}`;

      const msg = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: groupMessage }],
      });

      const text = msg.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { text: string }).text)
        .join("\n");

      let parsed: { slides: Slide[] };
      try {
        parsed = parseJsonResponse<{ slides: Slide[] }>(text);
      } catch (parseError) {
        const detail = parseError instanceof Error ? parseError.message : String(parseError);
        throw new Error(`슬라이드(${group.label}) 생성 응답을 JSON으로 해석하지 못했어요: ${detail}`);
      }

      allSlides.push(...parsed.slides);
    }

    allSlides.sort((a, b) => a.index - b.index);
    return NextResponse.json({ slides: allSlides });
  } catch (e) {
    const message = e instanceof Error ? e.message : "제안서 생성 중 오류가 발생했어요.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
