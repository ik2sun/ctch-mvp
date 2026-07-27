import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { MediaChannel } from "@/features/clients/mediaKeys";

// 채널별로 실제 업데이트를 허용할 컬럼 화이트리스트 — 임의 컬럼 업데이트 방지
const CHANNEL_COLUMNS: Record<MediaChannel, string[]> = {
  meta: ["meta_access_token"],
  naver: ["naver_ad_api_key", "naver_ad_secret", "naver_ad_customer_id"],
  gfa: ["gfa_api_key", "gfa_secret", "gfa_customer_id"],
  kakao: ["kakao_ad_api_key", "kakao_ad_secret"],
};

// 매체 API 키 저장 전용 — 응답에 값을 절대 되돌려주지 않는다.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { channel, keys } = (await req.json()) as { channel?: MediaChannel; keys?: Record<string, string> };
  const allowedColumns = channel ? CHANNEL_COLUMNS[channel] : undefined;
  if (!allowedColumns) {
    return NextResponse.json({ error: "지원하지 않는 매체예요." }, { status: 400 });
  }

  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!client) return NextResponse.json({ error: "광고주를 찾을 수 없어요." }, { status: 403 });

  // 빈 값은 무시 — 일부 필드만 바꿀 때 나머지 값이 지워지지 않게 한다.
  const update: Record<string, string> = {};
  for (const col of allowedColumns) {
    const value = keys?.[col];
    if (typeof value === "string" && value.trim()) update[col] = value.trim();
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase.from("clients").update(update).eq("id", clientId).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "저장 중 오류가 발생했어요." }, { status: 500 });

  return NextResponse.json({ ok: true });
}
