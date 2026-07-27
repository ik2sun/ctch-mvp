import crypto from "crypto";

export type NaverAdCredentials = {
  apiKey: string;
  secretKey: string;
  customerId: string;
};

export type NaverAdCredentialRow = {
  naver_ad_api_key?: string | null;
  naver_ad_secret?: string | null;
  naver_ad_customer_id?: string | null;
} | null | undefined;

// 광고주(clients) 테이블에 저장된 키를 우선 쓰고, 없으면 .env.local의 고정 키를 폴백으로 쓴다.
export function resolveNaverAdCredentials(row: NaverAdCredentialRow): NaverAdCredentials {
  const apiKey = row?.naver_ad_api_key?.trim() || process.env.NAVER_AD_API_KEY;
  const secretKey = row?.naver_ad_secret?.trim() || process.env.NAVER_AD_SECRET;
  const customerId = row?.naver_ad_customer_id?.trim() || process.env.NAVER_AD_CUSTOMER_ID;
  if (!apiKey || !secretKey || !customerId) {
    throw new Error("이 광고주에 네이버 검색광고 키가 없어요. 광고주 관리에서 등록해 주세요.");
  }
  return { apiKey, secretKey, customerId };
}

// 네이버 검색광고 API 서명 규칙: base64(HMAC-SHA256(`${timestamp}.${method}.${path}`, secretKey))
// path는 쿼리스트링을 제외한 경로만 사용한다 (예: /ncc/campaigns).
export function signNaverAdRequest(
  timestamp: string,
  method: string,
  path: string,
  secretKey: string,
): string {
  return crypto
    .createHmac("sha256", secretKey)
    .update(`${timestamp}.${method}.${path}`)
    .digest("base64");
}

export function buildNaverAdHeaders(
  method: string,
  path: string,
  credentials: NaverAdCredentials,
): Record<string, string> {
  const timestamp = Date.now().toString();
  return {
    "Content-Type": "application/json; charset=UTF-8",
    "X-Timestamp": timestamp,
    "X-API-KEY": credentials.apiKey,
    "X-Customer": credentials.customerId,
    "X-Signature": signNaverAdRequest(timestamp, method, path, credentials.secretKey),
  };
}
