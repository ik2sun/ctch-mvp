import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { crawlWebsites } from "@/features/proposal/apifyCrawler";
import { parseJsonResponse } from "@/features/proposal/parseJsonResponse";
import type { Insight } from "@/features/proposal/types";

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

  const { competitorUrls, industry, kpi } = (await req.json()) as {
    competitorUrls: string[];
    industry: string;
    kpi: string;
  };

  const urls = (competitorUrls ?? []).map((u) => u.trim()).filter(Boolean).slice(0, 3);
  const sites = await crawlWebsites(urls);

  const competitorBlock = sites.length
    ? sites
        .map((s, i) => `${i + 1}. ${s.url} (${s.title})\n${s.text}`)
        .join("\n\n")
    : "(입력된 경쟁사 URL이 없거나 크롤링에 실패했습니다.)";

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `당신은 퍼포먼스 마케팅 리서치 애널리스트입니다. 아래 정보를 바탕으로 제안서에 쓸 인사이트 카드를 만들어 주세요.

[업종] ${industry}
[핵심 KPI] ${kpi}

[경쟁사 웹페이지 크롤링 결과]
${competitorBlock}

작성 규칙:
- "competitor" 소스: 크롤링된 경쟁사별로 핵심 인사이트 1~2개씩. sourceLabel에는 해당 경쟁사 URL을 넣을 것.
- "trend" 소스: 업종·KPI와 관련된 시장/광고 트렌드 인사이트 3~5개. 실시간 데이터가 아니라 일반적인 업계 지식 기반 합성이라는 점을 감안해 과도하게 구체적인 수치를 단정하지 말 것. sourceLabel은 "업종 트렌드"로 통일.
- 각 인사이트는 제목 1줄 + 2~3문장 요약.
- 반드시 아래 JSON 형식으로만 반환:
{
  "insights": [
    { "title": string, "summary": string, "source": "competitor" | "trend", "sourceLabel": string }
  ]
}`;

  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const text = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n");

    const parsed = parseJsonResponse<{ insights: Omit<Insight, "id">[] }>(text);
    const insights: Insight[] = parsed.insights.map((i, idx) => ({
      id: `insight-${idx}-${Date.now()}`,
      ...i,
    }));

    return NextResponse.json({ insights });
  } catch (e) {
    const message = e instanceof Error ? e.message : "리서치 중 오류가 발생했어요.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
