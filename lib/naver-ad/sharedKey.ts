// 네이버 검색광고 공용 키(대행사 계정 발급) — 서버 전용. 저장소는 lib/sharedKeys.ts(channel=naver, 없으면 .env.local NAVER_AD_*).
import { getShared } from "@/lib/sharedKeys";

export type SharedNaverKey = {
  apiKey: string;
  secretKey: string;
  ownerCustomerId: string | null;
  source: "db" | "env";
};

export async function getSharedNaverKey(): Promise<SharedNaverKey | null> {
  const entry = await getShared("naver");
  const c = entry?.config;
  if (!entry || !c?.api_key || !c?.secret) return null;
  return { apiKey: c.api_key, secretKey: c.secret, ownerCustomerId: c.owner_customer_id || null, source: entry.source };
}
