import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { generateImage, HiggsfieldError } from "@/lib/higgsfield/client";

// prompt가 없고 슬라이드 정보가 주어지면, Claude로 슬라이드 내용을 영어 이미지 프롬프트로 변환한다.
// (Higgsfield 모델은 영어 프롬프트 기준 예시만 문서에 있고, 이미지 안에 텍스트가 들어가면 깨지는 경우가 많아 이를 방지하는 지시를 함께 넣는다.)
async function buildImagePromptFromSlide(params: {
  title: string;
  subtitle?: string;
  content?: string;
  industry?: string;
}): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return [params.title, params.subtitle].filter(Boolean).join(", ");
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-5-5",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `아래 제안서 슬라이드 내용을 바탕으로, AI 이미지 생성 모델에 입력할 영어 프롬프트를 1~2문장으로 작성해줘.
사진 또는 일러스트 스타일의 시각적 묘사만 담고, 이미지 안에 글자·텍스트·숫자·로고가 나오지 않도록 지시하는 문구도 포함할 것.
설명 없이 프롬프트 문장만 반환해.

[업종] ${params.industry ?? "일반"}
[슬라이드 제목] ${params.title}
[부제목] ${params.subtitle ?? ""}
[본문] ${params.content ?? ""}`,
      },
    ],
  });

  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("\n")
    .trim();

  return text || params.title;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = (await req.json()) as {
    prompt?: string;
    slideTitle?: string;
    slideSubtitle?: string;
    slideContent?: string;
    industry?: string;
    aspectRatio?: string;
    resolution?: string;
  };

  try {
    let prompt = body.prompt?.trim();
    if (!prompt) {
      if (!body.slideTitle?.trim()) {
        return NextResponse.json(
          { error: "prompt 또는 슬라이드 정보(slideTitle)가 필요해요." },
          { status: 400 },
        );
      }
      prompt = await buildImagePromptFromSlide({
        title: body.slideTitle,
        subtitle: body.slideSubtitle,
        content: body.slideContent,
        industry: body.industry,
      });
    }

    const { url, requestId } = await generateImage({
      prompt,
      aspectRatio: body.aspectRatio,
      resolution: body.resolution,
    });

    return NextResponse.json({ url, requestId, prompt });
  } catch (e) {
    const message =
      e instanceof HiggsfieldError || e instanceof Error ? e.message : "이미지 생성 중 오류가 발생했어요.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
