import { dataOwnerId, ownerOnly } from "@/lib/workspace";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runKeywordRankCheck } from "@/lib/naver-serp/runCheck";
import { SerpBlockedError } from "@/lib/naver-serp/rankChecker";

// 특정 키워드의 네이버 파워링크·가격비교·플러스 스토어를 PC·모바일 둘 다 실시간으로 확인하고 이력에 저장한다.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const denied = ownerOnly(user);
  if (denied) return denied;

  const { keywordId } = await req.json();
  if (!keywordId) return NextResponse.json({ error: "keywordId가 필요해요." }, { status: 400 });

  const ownerId = await dataOwnerId(user);
  let { data: kw, error } = await supabase
    .from("competitor_keywords")
    .select("id, keyword, target_domain, target_mall, collect_sections")
    .eq("id", keywordId)
    .eq("user_id", ownerId)
    .maybeSingle();
  if (error) {
    // 0036 마이그레이션 전(collect_sections 없음) = 전부 수집
    const { data } = await supabase
      .from("competitor_keywords")
      .select("id, keyword, target_domain, target_mall")
      .eq("id", keywordId)
      .eq("user_id", ownerId)
      .maybeSingle();
    kw = data as typeof kw;
  }
  if (!kw) return NextResponse.json({ error: "키워드를 찾을 수 없어요." }, { status: 403 });

  try {
    const { pc, mobile, sections } = await runKeywordRankCheck(supabase, { ...kw, user_id: ownerId });
    return NextResponse.json({ pc, mobile, sections });
  } catch (e) {
    const message = e instanceof Error ? e.message : "순위 확인 중 오류가 발생했어요.";
    return NextResponse.json({ error: message, blocked: e instanceof SerpBlockedError }, { status: e instanceof SerpBlockedError ? 429 : 502 });
  }
}
