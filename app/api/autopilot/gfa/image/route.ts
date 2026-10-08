import { NextResponse } from "next/server";
import { gfaErrorResponse } from "@/lib/gfa/client";
import { gfaAccess } from "@/features/autopilot/gfa/access";
import { uploadImage } from "@/features/autopilot/gfa/gfaOps";
import { UPLOAD_TEMPLATES } from "@/features/autopilot/gfa/types";

export const maxDuration = 60;

// 캠페인 오토파일럿 · GFA 소재 이미지 업로드(소유자) — 화면이 템플릿 규격으로 잘라 둔 파일 1장을 올리고 이미지 번호를 돌려준다
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "업로드 본문을 읽지 못했어요." }, { status: 400 });
  const templateCode = String(form.get("templateCode") ?? "");
  const file = form.get("file");
  if (!UPLOAD_TEMPLATES.some((t) => t.code === templateCode)) return NextResponse.json({ error: "지원하지 않는 소재 템플릿이에요." }, { status: 400 });
  if (!(file instanceof Blob) || file.size === 0) return NextResponse.json({ error: "이미지 파일이 없어요." }, { status: 400 });
  try {
    const access = await gfaAccess(form.get("clientId"), true);
    if (access instanceof NextResponse) return access;
    const name = (file as File).name || `${templateCode}.jpg`;
    return NextResponse.json({ image: await uploadImage(access.creds, templateCode, file, name) });
  } catch (e) {
    return gfaErrorResponse(e, "이미지 업로드 중 오류가 났어요.");
  }
}
