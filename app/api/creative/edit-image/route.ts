import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { buildEditPrompt } from "@/features/creative/editPrompt";
import { EDIT_TOOL_BY_ID, type EditToolId } from "@/features/creative/editTools";
import { editWith, fetchSourceImage } from "@/features/creative/imageGenerate";
import { IMAGE_METHOD_BY_ID } from "@/features/creative/imageMethods";

export const maxDuration = 300;

const BUCKET = "shortform"; // images/ 접두사
const CLAUDE_IMAGE_MAX = 3.5 * 1048576; // base64 로 5MB 를 넘지 않게. 넘으면 URL 로 넘긴다

// 이미지 수정 — action=prompt: 원본 + 요청 → 도구별 수정 프롬프트(Claude) / action=apply: 편집 API로 바로 수정(옵션, 종량제)
// 원본은 임의 URL 이 아니라 creatives 행(id)에서 찾는다 (본인 행만 RLS 로 보인다).
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const body = (await req.json()) as {
    action?: "prompt" | "apply";
    creativeId?: string;
    request?: string;
    tool?: string;
    aspectRatio?: string;
    prompt?: string;
  };
  const { data: creative } = await supabase.from("creatives").select("id, image_url, client_id").eq("id", body.creativeId ?? "").maybeSingle();
  if (!creative?.image_url) return NextResponse.json({ error: "원본 이미지를 찾지 못했어요." }, { status: 404 });
  const tool = EDIT_TOOL_BY_ID[body.tool ?? ""] ?? EDIT_TOOL_BY_ID.general;
  const aspectRatio = String(body.aspectRatio ?? "원본");

  try {
    if (body.action === "apply") {
      if (!tool.api) return NextResponse.json({ error: `${tool.name}은 API로 바로 수정할 수 없어요.` }, { status: 400 });
      const prompt = String(body.prompt ?? "").trim().slice(0, 4000);
      if (!prompt) return NextResponse.json({ error: "프롬프트가 비어 있어요." }, { status: 400 });
      const source = await fetchSourceImage(creative.image_url);
      const result = await editWith(tool.api, source, prompt, aspectRatio);
      let url: string;
      if ("url" in result) url = result.url;
      else {
        const ext = result.mimeType === "image/jpeg" ? "jpg" : result.mimeType === "image/webp" ? "webp" : "png";
        const path = `images/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, result.data, { contentType: result.mimeType });
        if (error) throw new Error(`수정은 됐지만 저장에 실패했어요: ${error.message}`);
        url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      }
      const m = IMAGE_METHOD_BY_ID[tool.api];
      return NextResponse.json({ url, model: `${m.id}:${m.model}` });
    }

    if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "서버에 ANTHROPIC_API_KEY가 없어요." }, { status: 500 });
    const source = await fetchSourceImage(creative.image_url);
    const result = await buildEditPrompt({
      image: source.data.length <= CLAUDE_IMAGE_MAX && source.mimeType !== "image/gif" ? source : { url: creative.image_url },
      request: String(body.request ?? "").slice(0, 2000),
      tool: tool.id as EditToolId,
      aspectRatio,
    });
    return NextResponse.json({ result });
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    const message =
      /credit balance/i.test(raw)
        ? "Anthropic API 크레딧이 부족해요. console.anthropic.com에서 충전한 뒤 다시 시도해 주세요."
        : e instanceof Anthropic.APIError
          ? `Anthropic API 오류(${e.status ?? "?"}): ${raw.slice(0, 200)}`
          : raw || "이미지 수정 중 오류가 발생했어요.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
