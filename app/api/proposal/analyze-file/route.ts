import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { createClient } from "@/lib/supabase/server";
import { parseJsonResponse } from "@/features/proposal/parseJsonResponse";

const INSTRUCTION = `당신은 마케팅 제안서 작성을 돕는 애널리스트입니다. 첨부/제공된 자료를 분석해서 제안서에 바로 활용할 수 있는 핵심 인사이트를 요약해 주세요.
- 광고주 관점에서 중요한 내용 위주로, 담백하고 구체적으로.
- 반드시 아래 JSON 형식으로만 반환:
{ "summary": string, "keyPoints": string[] }`;

type Body =
  | { type: "excel"; fileName: string; data: unknown }
  | { type: "word"; fileName: string; text: string }
  | { type: "pdf"; fileName: string; base64: string }
  | { type: "image"; fileName: string; base64: string; mediaType: string };

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

  const body = (await req.json()) as Body;
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let content: MessageParam["content"];

  if (body.type === "excel") {
    content = `${INSTRUCTION}\n\n[파일명] ${body.fileName}\n[엑셀 데이터(JSON)]\n${JSON.stringify(body.data).slice(0, 12000)}`;
  } else if (body.type === "word") {
    content = `${INSTRUCTION}\n\n[파일명] ${body.fileName}\n[문서 텍스트]\n${body.text.slice(0, 12000)}`;
  } else if (body.type === "pdf") {
    content = [
      { type: "text", text: `${INSTRUCTION}\n\n[파일명] ${body.fileName}` },
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: body.base64 },
      },
    ];
  } else if (body.type === "image") {
    const mediaType = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
      body.mediaType,
    )
      ? (body.mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif")
      : "image/png";
    content = [
      { type: "text", text: `${INSTRUCTION}\n\n[파일명] ${body.fileName}` },
      {
        type: "image",
        source: { type: "base64", media_type: mediaType, data: body.base64 },
      },
    ];
  } else {
    return NextResponse.json({ error: "지원하지 않는 파일 형식이에요." }, { status: 400 });
  }

  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1500,
      messages: [{ role: "user", content }],
    });

    const text = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n");

    const parsed = parseJsonResponse<{ summary: string; keyPoints: string[] }>(text);
    return NextResponse.json({ fileName: body.fileName, ...parsed });
  } catch (e) {
    const message = e instanceof Error ? e.message : "파일 분석 중 오류가 발생했어요.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
