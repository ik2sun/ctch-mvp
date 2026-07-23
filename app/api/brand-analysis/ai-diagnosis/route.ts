import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

type Post = { likes: number; comments: number; caption: string };

const SYSTEM = `당신은 인스타그램 브랜드 계정 분석 전문 AI입니다.
주어진 프로필·최근 게시물 데이터를 바탕으로 브랜드를 진단합니다.

반드시 아래 스키마의 JSON만 출력하세요. 마크다운 코드펜스나 인사말, 설명 문장을 절대 붙이지 마세요.

{
  "toneAndManner": "브랜드 톤앤매너 분석 2~3문장",
  "contentPattern": "콘텐츠 패턴(주제·포맷·업로드 경향) 분석 2~3문장",
  "engagementLevel": "인게이지먼트 수준 평가 2~3문장 (수치 근거 포함)",
  "suggestions": ["개선 제안 1", "개선 제안 2", "개선 제안 3"]
}

작성 규칙:
- 데이터로 확인 불가한 내용은 추측하지 말 것
- engagementLevel은 팔로워 수 대비 평균 인게이지먼트율을 반드시 언급
- suggestions는 실행 가능한 구체적 액션으로 2~4개`;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "서버에 ANTHROPIC_API_KEY가 없어요." }, { status: 500 });
  }

  const { profile } = await req.json();
  if (!profile) return NextResponse.json({ error: "분석할 프로필 데이터가 없어요." }, { status: 400 });

  const payload = {
    계정: profile.username,
    팔로워: profile.followersCount,
    팔로잉: profile.followingCount,
    게시물수: profile.postsCount,
    평균인게이지먼트율: `${((profile.avgEngagementRate ?? 0) * 100).toFixed(2)}%`,
    최근게시물: ((profile.posts ?? []) as Post[]).slice(0, 12).map((p) => ({
      좋아요: p.likes,
      댓글: p.comments,
      캡션: (p.caption ?? "").slice(0, 200),
    })),
  };

  try {
    const parsed = await anthropicCall(payload);
    return NextResponse.json(parsed);
  } catch (e) {
    const message = e instanceof Error ? e.message : "AI 진단 중 오류가 발생했어요.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function anthropicCall(payload: unknown) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1500,
    system: SYSTEM,
    messages: [{ role: "user", content: `${JSON.stringify(payload, null, 1)}\n\n위 스키마의 JSON만 출력하세요.` }],
  });

  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("\n")
    .trim();

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
