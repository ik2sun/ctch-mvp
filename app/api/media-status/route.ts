import { dataOwnerId, ownerOnly } from "@/lib/workspace";
import { NextResponse } from "next/server";
import { resolveMetaToken } from "@/lib/meta/token";
import { createClient } from "@/lib/supabase/server";
import { fetchAllCampaigns } from "@/lib/naver-ad/aggregate";
import { resolveNaverAdCredentials, NaverAdNotConfiguredError } from "@/lib/naver-ad/auth";
import { ensureKakaoAccessToken } from "@/lib/kakao-moment/auth";
import { fetchCampaigns as fetchKakaoCampaigns } from "@/lib/kakao-moment/aggregate";
import { KakaoMomentApiError } from "@/lib/kakao-moment/client";
import { normalizeMetaAccountId } from "@/features/clients/metaAccount";
import { getGfaCredentials, GfaAuthError } from "@/lib/gfa/auth";
import { fetchAdAccount as fetchGfaAdAccount, fetchCampaigns as fetchGfaCampaigns } from "@/lib/gfa/aggregate";
import { GfaApiError } from "@/lib/gfa/client";
import { getGa4Credentials, Ga4AuthError } from "@/lib/ga4/auth";
import { probeProperty, Ga4ApiError } from "@/lib/ga4/client";
import { getGoogleAdsCredentials, GoogleAdsAuthError } from "@/lib/google-ads/auth";
import { probeCustomer } from "@/lib/google-ads/aggregate";
import { GoogleAdsApiError } from "@/lib/google-ads/client";

// 매체 연동 상태 점검 — 광고주별로 저장된 키를 기준으로 가벼운 호출 1회씩 유효성 확인
// (구 app/api/meta-status를 메타 전용에서 전 매체로 확장)
const API_VERSION = "v21.0";

type MediaStatus = {
  key: string;
  label: string;
  connected: boolean;
  status: "ok" | "expired" | "error" | "none";
  detail: string;
  warning?: string;
  ownToken?: boolean; // 메타: 광고주 전용 토큰 저장 여부(없으면 공용 토큰 사용)
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
      "name, meta_account_id, meta_access_token, naver_ad_api_key, naver_ad_secret, naver_ad_customer_id, gfa_customer_id, kakao_ad_account_id, kakao_access_token, kakao_token_expires_at, kakao_refresh_token, kakao_refresh_expires_at, kakao_linked_at, google_ads_customer_id, google_ads_developer_token, ga4_property_id, ga4_service_account_json",
    )
    .eq("id", clientId)
    .eq("user_id", await dataOwnerId(user))
    .maybeSingle();
  if (!client) return NextResponse.json({ error: "광고주를 찾을 수 없어요." }, { status: 403 });

  const media: MediaStatus[] = [];

  // 메타 — 광고주별 토큰이 없으면 .env.local 고정 토큰을 폴백으로 사용
  const ownMetaToken = client.meta_access_token?.trim();
  const { token: metaToken } = await resolveMetaToken(client.meta_access_token);
  const tokenSource = ownMetaToken ? "광고주 전용 토큰" : "공용 토큰";
  const metaIdCheck = client.meta_account_id ? normalizeMetaAccountId(client.meta_account_id) : null;
  if (!client.meta_account_id) {
    media.push({ key: "meta", label: "메타", connected: false, status: "none", detail: "계정 ID 미등록", ownToken: !!ownMetaToken });
  } else if (metaIdCheck && !metaIdCheck.ok) {
    media.push({ key: "meta", label: "메타", connected: false, status: "error", detail: `광고계정 ID 형식 오류(${client.meta_account_id}) — 숫자로 다시 입력`, ownToken: !!ownMetaToken });
  } else if (!metaToken) {
    media.push({ key: "meta", label: "메타", connected: false, status: "error", detail: "액세스 토큰 없음" });
  } else {
    const act = metaIdCheck?.ok && metaIdCheck.value ? metaIdCheck.value : (client.meta_account_id as string);
    const tk = encodeURIComponent(metaToken);
    try {
      const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${act}?fields=name,account_status&access_token=${tk}`);
      const json = await res.json();
      if (json.error) {
        const code = json.error.code as number;
        const expired = code === 190 && !/parse/i.test(String(json.error.message));
        media.push({
          key: "meta",
          label: "메타",
          connected: false,
          status: expired ? "expired" : "error",
          detail: expired
            ? `${tokenSource} 만료 — 재발급 필요`
            : code === 190
              ? `${tokenSource} 형식 오류 — 토큰을 다시 입력하거나 삭제해 공용 토큰 사용`
              : String(json.error.message ?? "연결 실패"),
          ownToken: !!ownMetaToken,
        });
      } else {
        // 계정은 맞지만 집행이 없는 계정을 잘못 고른 경우를 잡기 위해 최근 30일 지출을 확인
        let warning: string | undefined;
        try {
          const ins = await (await fetch(`https://graph.facebook.com/${API_VERSION}/${act}/insights?fields=spend&date_preset=last_30d&access_token=${tk}`)).json();
          if (!ins.error && !(Number(ins.data?.[0]?.spend) > 0)) warning = "최근 30일 집행 내역이 없어요. 광고계정이 맞는지 확인하세요.";
        } catch {
          /* 경고 확인 실패는 무시 */
        }
        if (json.account_status !== 1) warning = `광고계정이 활성 상태가 아니에요(상태 코드 ${json.account_status}).`;
        media.push({
          key: "meta",
          label: "메타",
          connected: true,
          status: "ok",
          detail: `${(json.name as string) ?? act} · ${act.replace("act_", "")} · ${tokenSource}`,
          warning,
          ownToken: !!ownMetaToken,
        });
      }
    } catch {
      media.push({ key: "meta", label: "메타", connected: false, status: "error", detail: "연결 확인 실패" });
    }
  }

  // 네이버 SA — 키가 있으면 실제 캠페인 목록 조회로 연동 확인 (메타와 동일 수준의 실검증)
  try {
    const credentials = await resolveNaverAdCredentials(client);
    try {
      const campaigns = await fetchAllCampaigns(credentials);
      media.push({
        key: "naver",
        label: "네이버 SA",
        connected: true,
        status: "ok",
        detail: `고객 ID ${credentials.customerId} · 캠페인 ${campaigns.length.toLocaleString("ko-KR")}개 · ${credentials.sharedKey ? "공용 API 키" : "광고주 전용 API 키"}`,
        warning: campaigns.length === 0 ? "캠페인이 없는 계정이에요. 고객 ID가 맞는지 확인하세요." : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "연결 확인 실패";
      media.push({
        key: "naver",
        label: "네이버 SA",
        connected: false,
        status: "error",
        detail: credentials.sharedKey
          ? `고객 ID ${credentials.customerId} — 공용 API 키로 접근할 수 없어요. 이 광고주의 API 키·Secret을 함께 등록하세요. (${msg})`
          : `고객 ID ${credentials.customerId} — ${msg}`,
      });
    }
  } catch (e) {
    media.push({ key: "naver", label: "네이버 SA", connected: false, status: "none", detail: e instanceof NaverAdNotConfiguredError ? "고객 ID 미등록" : "미등록" });
  }

  // GFA — 광고계정 번호 + 공용 네이버 계정 연결(관리 계정 헤더)로 계정·캠페인 조회 실검증
  const gfaNo = client.gfa_customer_id?.trim();
  if (!gfaNo) {
    media.push({ key: "gfa", label: "GFA", connected: false, status: "none", detail: "광고계정 번호 미등록" });
  } else if (!/^\d+$/.test(gfaNo)) {
    media.push({ key: "gfa", label: "GFA", connected: false, status: "error", detail: `광고계정 번호 형식 오류(${gfaNo}) — 숫자로 다시 입력` });
  } else {
    try {
      const creds = await getGfaCredentials(gfaNo);
      const [account, campaigns] = await Promise.all([fetchGfaAdAccount(creds).catch(() => null), fetchGfaCampaigns(creds, 1)]);
      media.push({
        key: "gfa",
        label: "GFA",
        connected: true,
        status: "ok",
        detail: `${account?.name ? `${account.name} · ` : ""}광고계정 ${gfaNo} · 캠페인 ${campaigns.length >= 100 ? "100개 이상" : `${campaigns.length}개`} · 공용 연결`,
        warning: campaigns.length === 0 ? "캠페인이 없는 계정이에요. 광고계정 번호가 맞는지 확인하세요." : account?.disabled ? "비활성화된 광고계정이에요." : undefined,
      });
    } catch (e) {
      const expired = e instanceof GfaApiError && e.code === "UNAUTHORIZED";
      media.push({
        key: "gfa",
        label: "GFA",
        connected: false,
        status: expired ? "expired" : "error",
        detail: e instanceof GfaAuthError
          ? `광고계정 ${gfaNo} — ${e.message}`
          : expired
          ? "GFA 인증 실패 — 관리자가 API 공용 키 관리에서 네이버 계정을 다시 연결해야 해요"
          : e instanceof GfaApiError && e.code === "FORBIDDEN"
            ? `광고계정 ${gfaNo}에 권한이 없어요 — 관리 계정 하위도 아니고 연결한 네이버 아이디가 직접 멤버인 계정도 아니에요`
            : `광고계정 ${gfaNo} — ${e instanceof Error ? e.message : "연결 확인 실패"}`,
      });
    }
  }

  // 카카오모먼트 — 광고계정 ID + (개별 연결 또는 공용 카카오 계정)으로 캠페인 목록 조회 실검증
  if (!client.kakao_ad_account_id) {
    media.push({ key: "kakao", label: "카카오모먼트", connected: false, status: "none", detail: "광고계정 ID 미등록" });
  } else {
    try {
      const creds = await ensureKakaoAccessToken(supabase, clientId, client);
      const campaigns = await fetchKakaoCampaigns(creds);
      media.push({
        key: "kakao",
        label: "카카오모먼트",
        connected: true,
        status: "ok",
        detail: `광고계정 ${creds.adAccountId} · 캠페인 ${campaigns.length.toLocaleString("ko-KR")}개 · ${creds.shared ? "공용 카카오 계정" : "개별 연결"}`,
      });
    } catch (e) {
      const expired = e instanceof KakaoMomentApiError && e.code === "UNAUTHORIZED";
      const forbidden = e instanceof KakaoMomentApiError && e.code === "FORBIDDEN";
      media.push({
        key: "kakao",
        label: "카카오모먼트",
        connected: false,
        status: expired ? "expired" : "error",
        detail: expired
          ? "카카오 연결 만료 — 다시 연결 필요"
          : forbidden
            ? `광고계정 ${client.kakao_ad_account_id}에 권한이 없어요 — 연결한 카카오 계정을 이 광고계정 멤버로 초대하거나 개별 연결하세요`
            : e instanceof Error
              ? e.message
              : "연결 확인 실패",
      });
    }
  }

  // 구글 Ads — Customer ID + 공용 구글 계정 연결로 계정 정보·활성 캠페인 수 조회 실검증(호출 2건)
  const gadsId = client.google_ads_customer_id?.replace(/\D/g, "");
  if (!gadsId) {
    media.push({ key: "google_ads", label: "구글 Ads", connected: false, status: "none", detail: "Customer ID 미등록" });
  } else {
    try {
      const creds = await getGoogleAdsCredentials(client);
      const p = await probeCustomer(creds);
      media.push({
        key: "google_ads",
        label: "구글 Ads",
        connected: true,
        status: "ok",
        detail: `Customer ID ${gadsId}${p.name ? ` (${p.name})` : ""} · 활성 캠페인 ${p.campaigns}개${p.currency && p.currency !== "KRW" ? ` · 통화 ${p.currency}` : ""}`,
      });
    } catch (e) {
      const expired = (e instanceof GoogleAdsAuthError && e.code === "NOT_LINKED" && /만료/.test(e.message)) || (e instanceof GoogleAdsApiError && e.code === "UNAUTHORIZED");
      media.push({
        key: "google_ads",
        label: "구글 Ads",
        connected: false,
        status: expired ? "expired" : "error",
        detail: `Customer ID ${gadsId} — ${e instanceof Error ? e.message : "연결 확인 실패"}`,
      });
    }
  }

  // GA4 — 속성 ID + (개별 서비스 계정 또는 공용 구글 계정 연결)로 최근 7일 세션 조회 실검증
  if (!client.ga4_property_id?.trim()) {
    media.push({ key: "ga4", label: "GA4", connected: false, status: "none", detail: "속성 ID 미등록" });
  } else {
    const pid = client.ga4_property_id.trim();
    try {
      const creds = await getGa4Credentials(client);
      const p = await probeProperty(creds.accessToken, creds.propertyId);
      const via = creds.source === "own_sa" ? "개별 서비스 계정" : creds.source === "shared_oauth" ? `공용 구글 계정${creds.account ? `(${creds.account})` : ""}` : "공용 서비스 계정";
      media.push({ key: "ga4", label: "GA4", connected: true, status: "ok", detail: `속성 ID ${creds.propertyId} · 최근 7일 세션 ${p.sessions.toLocaleString("ko-KR")} · ${via}` });
    } catch (e) {
      const expired = (e instanceof Ga4AuthError && e.code === "NOT_LINKED" && /만료/.test(e.message)) || (e instanceof Ga4ApiError && e.code === "UNAUTHORIZED");
      media.push({
        key: "ga4",
        label: "GA4",
        connected: false,
        status: expired ? "expired" : "error",
        detail:
          e instanceof Ga4ApiError && e.code === "FORBIDDEN"
            ? `속성 ${pid}에 권한이 없어요 — 연결한 구글 계정(또는 서비스 계정)을 이 GA4 속성에 뷰어로 추가하세요`
            : e instanceof Ga4ApiError && e.code === "NOT_FOUND"
              ? `속성 ${pid}을(를) 찾을 수 없어요 — 속성 ID(숫자)를 확인하세요`
              : `속성 ${pid} — ${e instanceof Error ? e.message : "연결 확인 실패"}`,
      });
    }
  }

  return NextResponse.json({ media, clientName: client.name });
}
