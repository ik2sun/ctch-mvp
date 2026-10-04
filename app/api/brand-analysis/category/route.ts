import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { setCategory } from "@/features/brand-analysis/historyStore";
import { CATEGORIES } from "@/features/brand-analysis/visualTypes";

// 계정 카테고리 지정(동일 카테고리 벤치마크용) — 워크스페이스 구성원 누구나
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const { username, category } = (await req.json().catch(() => ({}))) as { username?: string; category?: string | null };
  if (!username) return NextResponse.json({ error: "계정이 필요해요." }, { status: 400 });
  if (category && !(CATEGORIES as readonly string[]).includes(category)) return NextResponse.json({ error: "알 수 없는 카테고리예요." }, { status: 400 });
  const err = await setCategory(username, category || null);
  if (err) return NextResponse.json({ error: "저장하지 못했어요. supabase/migrations/0028_insta_visual_category.sql을 실행했는지 확인하세요." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
