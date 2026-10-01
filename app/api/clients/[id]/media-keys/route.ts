import { dataOwnerId, ownerOnly } from "@/lib/workspace";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { MediaChannel } from "@/features/clients/mediaKeys";
import { normalizeMetaAccountId } from "@/features/clients/metaAccount";

// 채널별로 실제 업데이트를 허용할 컬럼 화이트리스트 — 임의 컬럼 업데이트 방지
const CHANNEL_COLUMNS: Record<MediaChannel, string[]> = {
  meta: ["meta_account_id", "meta_access_token"],
  naver: ["naver_ad_api_key", "naver_ad_secret", "naver_ad_customer_id"],
  gfa: ["gfa_customer_id"], // 광고계정 번호만 — 인증은 API 공용 키 관리의 네이버 계정 연결(구 gfa_api_key·gfa_secret 미사용)
  kakao: ["kakao_ad_account_id"], // 토큰은 OAuth 콜백(/api/kakao-moment/oauth/callback)에서만 저장
  google_ads: ["google_ads_customer_id", "google_ads_developer_token"],
  ga4: ["ga4_property_id", "ga4_service_account_json"],
};

// 매체 API 키 저장 전용 — 응답에 값을 절대 되돌려주지 않는다.
// keys: 빈 값은 무시(기존 값 유지). clear: 명시한 컬럼만 null로 비운다(예: 전용 토큰 삭제 → 공용 토큰 사용).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const denied = ownerOnly(user);
  if (denied) return denied;

  const { channel, keys, clear } = (await req.json()) as {
    channel?: MediaChannel;
    keys?: Record<string, string>;
    clear?: string[];
  };
  const allowedColumns = channel ? CHANNEL_COLUMNS[channel] : undefined;
  if (!allowedColumns) {
    return NextResponse.json({ error: "지원하지 않는 매체예요." }, { status: 400 });
  }

  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("user_id", await dataOwnerId(user))
    .maybeSingle();
  if (!client) return NextResponse.json({ error: "광고주를 찾을 수 없어요." }, { status: 403 });

  // 빈 값은 무시 — 일부 필드만 바꿀 때 나머지 값이 지워지지 않게 한다.
  const update: Record<string, string | null> = {};
  for (const col of allowedColumns) {
    const value = keys?.[col];
    if (typeof value === "string" && value.trim()) update[col] = value.trim();
  }
  for (const col of clear ?? []) {
    if (allowedColumns.includes(col)) update[col] = null;
  }

  // 메타 광고계정 ID 형식 검증 — 브라우저 자동완성으로 이메일이 들어가는 사고 방지
  if (typeof update.meta_account_id === "string") {
    const r = normalizeMetaAccountId(update.meta_account_id);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    update.meta_account_id = r.value;
  }
  if (typeof update.gfa_customer_id === "string" && !/^\d+$/.test(update.gfa_customer_id)) {
    return NextResponse.json({ error: "GFA 광고계정 번호는 숫자만 입력하세요." }, { status: 400 });
  }
  // 메타 토큰은 EAA… 형태의 긴 문자열 — 비밀번호 등 짧은 값이 들어가면 거절
  if (typeof update.meta_access_token === "string" && (update.meta_access_token.length < 50 || /\s/.test(update.meta_access_token))) {
    return NextResponse.json({ error: "메타 액세스 토큰 형식이 아니에요. EAA로 시작하는 긴 문자열을 붙여넣으세요." }, { status: 400 });
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase.from("clients").update(update).eq("id", clientId).eq("user_id", await dataOwnerId(user));
  if (error) return NextResponse.json({ error: "저장 중 오류가 발생했어요." }, { status: 500 });

  return NextResponse.json({ ok: true });
}
