import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { BrandColors, Slide, ThemeId } from "@/features/proposal/types";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { clientId, clientName, industry, theme, brandColors, slides } = (await req.json()) as {
    clientId: string | null;
    clientName: string;
    industry: string | null;
    theme: ThemeId;
    brandColors: BrandColors;
    slides: Slide[];
  };

  if (!clientName?.trim() || !slides?.length) {
    return NextResponse.json({ error: "광고주명과 슬라이드가 필요합니다." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("proposals")
    .insert({
      user_id: user.id,
      client_id: clientId,
      client_name: clientName,
      industry,
      theme,
      brand_colors: brandColors,
      slides,
    })
    .select("id, share_token")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "제안서 저장 중 오류가 발생했어요." },
      { status: 500 },
    );
  }

  return NextResponse.json({ id: data.id, shareToken: data.share_token });
}
