import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dataOwnerId } from "@/lib/workspace";
import { getBrandAccount, setBrandAccount } from "@/features/brand-analysis/historyStore";
import { parseInstagramInput } from "@/features/brand-analysis/apifyClient";

// 광고주별 '내 브랜드 계정'(인스타 분석 퀵 버튼) — GET ?clientId= / POST {clientId, username|null}
// 담당자가 직접 지정하므로 워크스페이스 구성원 누구나 저장(캠페인 매니저 메일 규칙과 같은 방식)
async function ctx(clientId: string | null) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }) };
  if (!clientId) return { error: NextResponse.json({ error: "광고주가 필요해요." }, { status: 400 }) };
  const { data: client } = await supabase.from("clients").select("id").eq("id", clientId).eq("user_id", await dataOwnerId(user)).maybeSingle();
  if (!client) return { error: NextResponse.json({ error: "광고주를 찾을 수 없어요." }, { status: 403 }) };
  return { user };
}

export async function GET(req: Request) {
  const clientId = new URL(req.url).searchParams.get("clientId");
  const c = await ctx(clientId);
  if (c.error) return c.error;
  try {
    return NextResponse.json({ username: await getBrandAccount(clientId!) });
  } catch {
    return NextResponse.json({ username: null });
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { clientId?: string; username?: string | null };
  const c = await ctx(body.clientId ?? null);
  if (c.error) return c.error;
  const username = body.username ? parseInstagramInput(body.username) : null;
  if (body.username && !/^[A-Za-z0-9._]{1,30}$/.test(username ?? "")) return NextResponse.json({ error: "인스타그램 계정명 형식이 아니에요." }, { status: 400 });
  const err = await setBrandAccount(body.clientId!, username, c.user.email ?? null);
  if (err) return NextResponse.json({ error: "저장하지 못했어요. supabase/migrations/0027_insta_analyses.sql을 실행했는지 확인하세요." }, { status: 500 });
  return NextResponse.json({ username: username?.toLowerCase() ?? null });
}
