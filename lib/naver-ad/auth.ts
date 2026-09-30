import crypto from "crypto";
import { getSharedNaverKey } from "./sharedKey";

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

export class NaverAdNotConfiguredError extends Error {}

// 키 우선순위: 광고주 전용 키(clients.naver_ad_api_key/secret) → 공용 키(대행사 계정, lib/naver-ad/sharedKey.ts).
// 고객 ID는 폴백하지 않는다 — 공용 고객 ID(자생한방병원 323391)로 폴백하면 모든 광고주에 같은 계정 데이터가 나오던 문제(2026-09-28).
// 공용 키가 그 고객 ID에 관리 권한이 없으면 네이버가 403을 주므로 잘못된 데이터 대신 오류가 보인다.
export async function resolveNaverAdCredentials(row: NaverAdCredentialRow): Promise<NaverAdCredentials & { sharedKey: boolean }> {
  const customerId = row?.naver_ad_customer_id?.trim();
  if (!customerId) {
    throw new NaverAdNotConfiguredError("이 광고주에 네이버 검색광고 고객 ID가 없어요. 광고주 관리 > 매체 연동 > 네이버 SA에서 등록해 주세요.");
  }
  const ownKey = row?.naver_ad_api_key?.trim();
  const ownSecret = row?.naver_ad_secret?.trim();
  if (ownKey && ownSecret) return { apiKey: ownKey, secretKey: ownSecret, customerId, sharedKey: false };

  const shared = await getSharedNaverKey();
  if (!shared) {
    throw new NaverAdNotConfiguredError("네이버 공용 API 키가 등록되지 않았어요. 최고관리자 > 공용 매체 키에서 등록해 주세요.");
  }
  return { apiKey: shared.apiKey, secretKey: shared.secretKey, customerId, sharedKey: true };
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
