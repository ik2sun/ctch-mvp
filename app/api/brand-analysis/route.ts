import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchInstagramProfile } from "@/features/brand-analysis/apifyClient";
import { saveAnalysis } from "@/features/brand-analysis/historyStore";

export const maxDuration = 120;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { input } = await req.json();
  if (!input || !String(input).trim()) {
    return NextResponse.json({ error: "인스타그램 URL 또는 @계정명을 입력해 주세요." }, { status: 400 });
  }

  try {
    const profile = await fetchInstagramProfile(String(input));
    // 히스토리 저장(0027 미실행이면 건너뜀) — 실패해도 분석 결과는 그대로 돌려준다
    const saveError = await saveAnalysis(profile, user.email ?? null);
    return NextResponse.json({ ...profile, saved: !saveError });
  } catch (e) {
    const message = e instanceof Error ? e.message : "계정 분석에 실패했어요.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
