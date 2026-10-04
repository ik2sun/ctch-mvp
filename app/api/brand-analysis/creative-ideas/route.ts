import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAnalysis } from "@/features/brand-analysis/historyStore";
import { computeAccountMetrics } from "@/features/brand-analysis/postMetrics";
import { postScores } from "@/features/brand-analysis/insights";
import { generateCreativeIdeas } from "@/features/brand-analysis/creativeIdeas";
import type { InstagramProfile } from "@/features/brand-analysis/apifyClient";

export const maxDuration = 120;

// AI 소재 추천 — 게시물 하나 → 숏폼 스크립트·메타 광고·DA 카피·촬영 체크리스트(저장 안 함)
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { username?: string; postId?: string; profile?: InstagramProfile };
  const saved = body.username ? await getAnalysis(body.username) : null;
  const profile = saved?.profile ?? body.profile;
  if (!profile) return NextResponse.json({ error: "분석 데이터가 없어요." }, { status: 400 });
  const metrics = computeAccountMetrics(profile);
  const scores = postScores(metrics);
  const m = metrics.posts.find((p) => p.post.id === body.postId);
  if (!m) return NextResponse.json({ error: "게시물을 찾지 못했어요." }, { status: 404 });
  try {
    const ideas = await generateCreativeIdeas({
      brand: profile.fullName || profile.username,
      post: m.post,
      score: { mode: scores.mode, value: scores.score.get(m.post.id) ?? null },
      viewRate: m.viewRate,
      tag: saved?.diagnosis?.posts.find((t) => t.id === m.post.id) ?? null,
      visual: saved?.visual?.posts.find((v) => v.id === m.post.id) ?? null,
    });
    return NextResponse.json(ideas);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "소재 추천에 실패했어요." }, { status: 500 });
  }
}
