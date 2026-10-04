import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dataOwnerId } from "@/lib/workspace";

// 캠페인 오토파일럿 실행 기록 목록(구성원 읽기) — ?clientId=
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const clientId = new URL(req.url).searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId가 필요해요." }, { status: 400 });
  const { data: client } = await supabase.from("clients").select("id").eq("id", clientId).eq("user_id", await dataOwnerId(user)).maybeSingle();
  if (!client) return NextResponse.json({ error: "광고주를 찾을 수 없어요." }, { status: 403 });
  const { data, error } = await createAdminClient()
    .from("autopilot_actions")
    .select("id, media, ad_account_no, campaign_no, kind, summary, detail, created_by, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ rows: [], notice: "실행 기록 테이블이 아직 없어요. Supabase SQL Editor에서 0031_autopilot_actions.sql을 실행하세요." });
  return NextResponse.json({ rows: data ?? [] });
}
