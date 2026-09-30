import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveNaverAdCredentials, NaverAdNotConfiguredError } from "@/lib/naver-ad/auth";
import { probeNaverCustomer } from "@/lib/naver-ad/probe";

// 광고주 관리 > 네이버 SA "확인" — 저장 전에 고객 ID가 공용 키(또는 이 광고주 전용 키)로 조회되는지 확인한다.
// 키 값은 받지도 돌려주지도 않는다.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { clientId, customerId } = (await req.json().catch(() => ({}))) as { clientId?: string; customerId?: string };
  const cid = String(customerId ?? "").trim();
  if (!/^\d{3,12}$/.test(cid)) return NextResponse.json({ error: "고객 ID는 숫자만 입력하세요." }, { status: 400 });

  let row: { naver_ad_api_key?: string | null; naver_ad_secret?: string | null } | null = null;
  if (clientId) {
    const { data } = await supabase
      .from("clients")
      .select("naver_ad_api_key, naver_ad_secret")
      .eq("id", clientId)
      .eq("user_id", user.id)
      .maybeSingle();
    row = data;
  }

  try {
    const creds = await resolveNaverAdCredentials({ ...row, naver_ad_customer_id: cid });
    const probe = await probeNaverCustomer(creds);
    return NextResponse.json({ ...probe, sharedKey: creds.sharedKey });
  } catch (e) {
    const msg = e instanceof NaverAdNotConfiguredError ? e.message : "확인 중 오류가 발생했어요.";
    return NextResponse.json({ ok: false, customerId: cid, error: msg, sharedKey: true });
  }
}
