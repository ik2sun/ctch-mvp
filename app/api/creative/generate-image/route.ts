import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { IMAGE_METHODS, IMAGE_METHOD_BY_ID, type ImageMethodId } from "@/features/creative/imageMethods";
import { generateWith, methodReady } from "@/features/creative/imageGenerate";

export const maxDuration = 180;

const BUCKET = "shortform"; // 공용 public 버킷 (images/ 접두사). png·jpeg·webp 허용

// 방법별 서버 키 설정 여부 — 화면에서 '키 필요' 표시용
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  return NextResponse.json({ ready: Object.fromEntries(IMAGE_METHODS.map((m) => [m.id, methodReady(m.id)])) });
}

// 이미지 생성 — 인증·검증 후 features/creative/imageGenerate.ts 에 위임. base64 결과는 storage 에 올려 공개 URL 로 돌려준다.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const body = (await req.json()) as { method?: string; prompt?: string; aspectRatio?: string };
  const method = IMAGE_METHOD_BY_ID[body.method ?? ""];
  if (!method || method.mode !== "api") return NextResponse.json({ error: "지원하지 않는 생성 방법이에요." }, { status: 400 });
  const prompt = String(body.prompt ?? "").trim().slice(0, 4000);
  if (!prompt) return NextResponse.json({ error: "프롬프트를 입력해 주세요." }, { status: 400 });

  try {
    const result = await generateWith(method.id as ImageMethodId, prompt, String(body.aspectRatio ?? "1:1"));
    if ("url" in result) return NextResponse.json({ url: result.url, model: `${method.id}:${method.model}` });

    const ext = result.mimeType === "image/jpeg" ? "jpg" : result.mimeType === "image/webp" ? "webp" : "png";
    const path = `images/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, result.data, { contentType: result.mimeType, upsert: false });
    if (error) throw new Error(`생성은 됐지만 저장에 실패했어요: ${error.message}`);
    const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    return NextResponse.json({ url, path, model: `${method.id}:${method.model}` });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "이미지 생성 중 오류가 발생했어요." }, { status: 500 });
  }
}
