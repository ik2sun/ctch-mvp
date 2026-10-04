import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAnalysis } from "@/features/brand-analysis/historyStore";

// 저장된 리포트 다시 열기 — Apify를 다시 부르지 않는다(비용·시간 0)
export async function GET(_req: Request, { params }: { params: Promise<{ username: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const { username } = await params;
  const row = await getAnalysis(decodeURIComponent(username));
  if (!row) return NextResponse.json({ error: "저장된 리포트가 없어요. 새로 분석해 주세요." }, { status: 404 });
  return NextResponse.json(row);
}
