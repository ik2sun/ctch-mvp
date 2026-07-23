import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

// Claude 호출은 서버에서만 — API 키가 브라우저에 노출되지 않음
export async function POST(req: Request) {
  // 로그인한 유저만 사용 가능
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

  const { summary, context } = await req.json();

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `당신은 퍼포먼스 마케팅 데이터를 해석하는 시니어 광고 AE입니다.
아래는 매체 리포트를 집계한 결과입니다. 광고주에게 전달할 수준의 한글 코멘트를 작성해 주세요.

[집계 결과]
${JSON.stringify(summary, null, 2)}

${context ? `[추가 컨텍스트]\n${context}\n` : ""}

작성 규칙:
- 마크다운 헤더(#) 없이, 3~4개 문단의 자연스러운 실무 코멘트로.
- 반드시 포함: (1) 전반적인 성과 진단, (2) 눈에 띄는 효율 지표 해석(ROAS/CPA/CTR 등 실제 수치 인용), (3) 다음 액션 제안 1~2가지.
- 데이터로 확인되지 않는 내용은 단정하지 말 것. 감지 안 된 지표가 있으면 그 한계를 짧게 언급.
- 과장 없이 담백하게. 한국어로.`;

  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    });

    const text = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n");

    return NextResponse.json({ comment: text });
  } catch (e) {
    const message = e instanceof Error ? e.message : "AI 호출 중 오류가 발생했어요.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
