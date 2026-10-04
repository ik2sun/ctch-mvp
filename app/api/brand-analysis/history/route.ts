import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listHistory } from "@/features/brand-analysis/historyStore";

// 인스타 분석 히스토리 목록(워크스페이스 공용) — ?q= 로 자동 완성 검색(핸들·이름 부분 일치)
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? undefined;
  return NextResponse.json(await listHistory(q, q ? 8 : 60));
}
