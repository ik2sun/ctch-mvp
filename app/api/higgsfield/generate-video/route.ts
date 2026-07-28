import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateVideo, HiggsfieldError } from "@/lib/higgsfield/client";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { imageUrl, prompt, durationSeconds } = (await req.json()) as {
    imageUrl?: string;
    prompt?: string;
    durationSeconds?: number;
  };

  if (!imageUrl?.trim() || !prompt?.trim()) {
    return NextResponse.json({ error: "imageUrl과 prompt가 모두 필요해요." }, { status: 400 });
  }

  try {
    const { url, requestId } = await generateVideo({
      imageUrl: imageUrl.trim(),
      prompt: prompt.trim(),
      durationSeconds,
    });
    return NextResponse.json({ url, requestId });
  } catch (e) {
    const message =
      e instanceof HiggsfieldError || e instanceof Error ? e.message : "영상 생성 중 오류가 발생했어요.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
