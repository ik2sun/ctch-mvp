// 메타 액세스 토큰 결정 — 광고주 개별 토큰 → API 공용 키(channel=meta) → .env.local META_ACCESS_TOKEN. 서버 전용.
import { getShared } from "@/lib/sharedKeys";

export async function resolveMetaToken(ownToken: string | null | undefined): Promise<{ token: string | null; shared: boolean }> {
  const own = ownToken?.trim();
  if (own) return { token: own, shared: false };
  const entry = await getShared("meta");
  return { token: entry?.config.access_token || null, shared: true };
}
