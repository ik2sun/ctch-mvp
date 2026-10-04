import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAnalysis, saveVisual } from "@/features/brand-analysis/historyStore";
import { analyzeVisuals } from "@/features/brand-analysis/visualAnalyze";
import type { InstagramProfile } from "@/features/brand-analysis/apifyClient";

export const maxDuration = 180;

// 시각 분석 — 저장된 프로필(없으면 body.profile)의 게시물 이미지를 Claude 비전으로 태깅하고 히스토리에 저장
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { username?: string; profile?: InstagramProfile };
  const profile = body.profile ?? (body.username ? (await getAnalysis(body.username))?.profile : null);
  if (!profile?.posts?.length) return NextResponse.json({ error: "분석할 게시물이 없어요." }, { status: 400 });
  if (profile.isMock) return NextResponse.json({ error: "샘플 데이터는 이미지 분석을 할 수 없어요." }, { status: 400 });
  try {
    const visual = await analyzeVisuals(profile);
    await saveVisual(profile.username, visual);
    return NextResponse.json(visual);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "시각 분석에 실패했어요." }, { status: 500 });
  }
}
