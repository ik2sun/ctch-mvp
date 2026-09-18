import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { collectImages } from "@/features/creative/collectImages";

export const maxDuration = 120;

// 제품 상세/브랜드 페이지 URL에서 숏폼용 사진 후보를 수집한다 (인증·검증만 하고 collectImages 에 위임).
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { url, keywords, limit } = (await req.json()) as { url?: string; keywords?: string[]; limit?: number };
  if (!url?.trim()) return NextResponse.json({ error: "페이지 주소를 입력해 주세요." }, { status: 400 });

  try {
    const result = await collectImages(url, {
      keywords: Array.isArray(keywords) ? keywords.slice(0, 12).map(String) : [],
      limit,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "사진을 가져오지 못했어요." }, { status: 500 });
  }
}
