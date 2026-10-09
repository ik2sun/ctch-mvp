import { NextResponse } from "next/server";
import { metaAccess } from "@/features/autopilot/meta/access";
import { uploadImage } from "@/features/autopilot/meta/metaOps";

export const maxDuration = 60;

// 캠페인 오토파일럿 · 메타 이미지 업로드 — 파일 1장을 광고계정 이미지 라이브러리에 올리고 해시를 돌려준다(라이브러리 업로드는 광고에 안 쓰면 영향 없음)
// 화면이 4MB 넘는 이미지는 미리 줄여 보낸다(Vercel 본문 4.5MB)
const TYPES = /^image\/(jpeg|png|gif|webp|bmp)$/;

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "업로드 본문을 읽지 못했어요." }, { status: 400 });
  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) return NextResponse.json({ error: "이미지 파일이 없어요." }, { status: 400 });
  if (file.type && !TYPES.test(file.type)) return NextResponse.json({ error: `이미지 형식이 아니에요(${file.type}).` }, { status: 400 });
  try {
    const access = await metaAccess(form.get("clientId"), true);
    if (access instanceof NextResponse) return access;
    return NextResponse.json({ image: await uploadImage(access.act, file, (file as File).name || "image.jpg", access.token) });
  } catch (e) {
    return NextResponse.json({ error: `이미지 업로드 실패 — ${e instanceof Error ? e.message : ""}` }, { status: 502 });
  }
}
