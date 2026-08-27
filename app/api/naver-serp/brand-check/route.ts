import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runBrandKeywordCheck } from "@/lib/naver-serp/runBrandCheck";

// 특정 브랜드 키워드의 네이버 파워링크를 PC·모바일 둘 다 실시간으로 확인하고,
// 소유 도메인이 아닌 타사 노출(침해)이 새로 발견되면 담당자 메일도 함께 보낸다.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { keywordId } = await req.json();
  if (!keywordId) return NextResponse.json({ error: "keywordId가 필요해요." }, { status: 400 });

  const { data: kw } = await supabase
    .from("brand_keywords")
    .select("id, client_id, keyword, owner_domain, alert_email")
    .eq("id", keywordId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!kw) return NextResponse.json({ error: "키워드를 찾을 수 없어요." }, { status: 403 });

  try {
    const { pc, mobile } = await runBrandKeywordCheck(supabase, { ...kw, user_id: user.id });
    return NextResponse.json({ pc, mobile });
  } catch (e) {
    const message = e instanceof Error ? e.message : "순위 확인 중 오류가 발생했어요.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
