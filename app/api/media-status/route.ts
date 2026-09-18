import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchAllCampaigns } from "@/lib/naver-ad/aggregate";
import { resolveNaverAdCredentials } from "@/lib/naver-ad/auth";
import { ensureKakaoAccessToken, KakaoAuthError } from "@/lib/kakao-moment/auth";
import { fetchCampaigns as fetchKakaoCampaigns } from "@/lib/kakao-moment/aggregate";
import { KakaoMomentApiError } from "@/lib/kakao-moment/client";

// 매체 연동 상태 점검 — 광고주별로 저장된 키를 기준으로 가벼운 호출 1회씩 유효성 확인
// (구 app/api/meta-status를 메타 전용에서 메타/네이버/GFA로 확장)
const API_VERSION = "v21.0";

type MediaStatus = {
  key: string;
  label: string;
  connected: boolean;
  status: "ok" | "expired" | "error" | "none";
  detail: string;
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { clientId } = await req.json();
  if (!clientId) return NextResponse.json({ error: "광고주가 필요해요." }, { status: 400 });

  const { data: client } = await supabase
    .from("clients")
    .select(
      "name, meta_account_id, meta_access_token, naver_ad_api_key, naver_ad_secret, naver_ad_customer_id, gfa_api_key, gfa_secret, gfa_customer_id, kakao_ad_account_id, kakao_access_token, kakao_token_expires_at, kakao_refresh_token, kakao_refresh_expires_at, kakao_linked_at, google_ads_customer_id, google_ads_developer_token, ga4_property_id, ga4_service_account_json",
    )
    .eq("id", clientId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!client) return NextResponse.json({ error: "광고주를 찾을 수 없어요." }, { status: 403 });

  const media: MediaStatus[] = [];

  // 메타 — 광고주별 토큰이 없으면 .env.local 고정 토큰을 폴백으로 사용
  const metaToken = client.meta_access_token?.trim() || process.env.META_ACCESS_TOKEN;
  if (!client.meta_account_id) {
    media.push({ key: "meta", label: "메타", connected: false, status: "none", detail: "계정 ID 미등록" });
  } else if (!metaToken) {
    media.push({ key: "meta", label: "메타", connected: false, status: "error", detail: "액세스 토큰 없음" });
  } else {
    const accountId = client.meta_account_id as string;
    const act = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
    try {
      const res = await fetch(
        `https://graph.facebook.com/${API_VERSION}/${act}?fields=name,account_status&access_token=${metaToken}`,
      );
      const json = await res.json();
      if (json.error) {
        const code = json.error.code as number;
        const expired = code === 190;
        media.push({
          key: "meta",
          label: "메타",
          connected: false,
          status: expired ? "expired" : "error",
          detail: expired ? "토큰 만료 — 재발급 필요" : String(json.error.message ?? "연결 실패"),
        });
      } else {
        media.push({ key: "meta", label: "메타", connected: true, status: "ok", detail: (json.name as string) ?? act });
      }
    } catch {
      media.push({ key: "meta", label: "메타", connected: false, status: "error", detail: "연결 확인 실패" });
    }
  }

  // 네이버 SA — 키가 있으면 실제 캠페인 목록 조회로 연동 확인 (메타와 동일 수준의 실검증)
  try {
    const credentials = resolveNaverAdCredentials(client);
    try {
      const campaigns = await fetchAllCampaigns(credentials);
      media.push({
        key: "naver",
        label: "네이버 SA",
        connected: true,
        status: "ok",
        detail: `캠페인 ${campaigns.length.toLocaleString("ko-KR")}개 연동됨`,
      });
    } catch (e) {
      media.push({
        key: "naver",
        label: "네이버 SA",
        connected: false,
        status: "error",
        detail: e instanceof Error ? e.message : "연결 확인 실패",
      });
    }
  } catch {
    media.push({ key: "naver", label: "네이버 SA", connected: false, status: "none", detail: "미등록" });
  }

  // GFA — 아직 실제 조회 API가 없어 키 저장 여부만 확인
  const gfaKeysPresent = !!(client.gfa_api_key && client.gfa_secret && client.gfa_customer_id);
  media.push({
    key: "gfa",
    label: "GFA",
    connected: gfaKeysPresent,
    status: gfaKeysPresent ? "ok" : "none",
    detail: gfaKeysPresent ? "키 저장됨 (연동 API 준비 중)" : "미등록",
  });

  // 카카오모먼트 — OAuth 연결 + 광고계정 선택이 끝났으면 캠페인 목록 조회로 실검증
  if (!client.kakao_refresh_token) {
    media.push({ key: "kakao", label: "카카오모먼트", connected: false, status: "none", detail: "카카오 계정 미연결" });
  } else if (!client.kakao_ad_account_id) {
    media.push({ key: "kakao", label: "카카오모먼트", connected: false, status: "error", detail: "광고계정 미선택 — 광고주 관리에서 선택" });
  } else {
    try {
      const creds = await ensureKakaoAccessToken(supabase, clientId, client);
      const campaigns = await fetchKakaoCampaigns(creds);
      media.push({ key: "kakao", label: "카카오모먼트", connected: true, status: "ok", detail: `광고계정 ${creds.adAccountId} · 캠페인 ${campaigns.length.toLocaleString("ko-KR")}개 연동됨` });
    } catch (e) {
      const expired = (e instanceof KakaoAuthError && e.code === "REFRESH_EXPIRED") || (e instanceof KakaoMomentApiError && e.code === "UNAUTHORIZED");
      media.push({ key: "kakao", label: "카카오모먼트", connected: false, status: expired ? "expired" : "error", detail: expired ? "카카오 연결 만료 — 재연결 필요" : e instanceof Error ? e.message : "연결 확인 실패" });
    }
  }

  // 구글 Ads — 아직 실제 조회 API가 없어 키 저장 여부만 확인
  const googleAdsKeysPresent = !!(client.google_ads_customer_id && client.google_ads_developer_token);
  media.push({
    key: "google_ads",
    label: "구글 Ads",
    connected: googleAdsKeysPresent,
    status: googleAdsKeysPresent ? "ok" : "none",
    detail: googleAdsKeysPresent ? "키 저장됨 (연동 API 준비 중)" : "미등록",
  });

  // GA (Google Analytics) — 아직 실제 조회 API가 없어 키 저장 여부만 확인
  const ga4KeysPresent = !!(client.ga4_property_id && client.ga4_service_account_json);
  media.push({
    key: "ga4",
    label: "GA (Google Analytics)",
    connected: ga4KeysPresent,
    status: ga4KeysPresent ? "ok" : "none",
    detail: ga4KeysPresent ? "키 저장됨 (연동 API 준비 중)" : "미등록",
  });

  return NextResponse.json({ media, clientName: client.name });
}
