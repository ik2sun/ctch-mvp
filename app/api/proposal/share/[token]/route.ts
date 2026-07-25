import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 로그인 없이 접근하는 공개 공유 뷰어용 — service-role로 share_token만 매칭해 조회(RLS 우회)
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "서버 설정 오류로 공유 링크를 열 수 없어요." }, { status: 500 });
  }

  const { data, error } = await admin
    .from("proposals")
    .select("client_name, industry, theme, brand_colors, slides, created_at")
    .eq("share_token", token)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "존재하지 않거나 만료된 공유 링크예요." }, { status: 404 });
  }

  return NextResponse.json({
    clientName: data.client_name,
    industry: data.industry,
    theme: data.theme,
    brandColors: data.brand_colors,
    slides: data.slides,
    createdAt: data.created_at,
  });
}
