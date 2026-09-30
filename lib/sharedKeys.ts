// API 공용 키 저장소 — 서버 전용(service_role). 화면은 /admin/api-keys, 테이블은 shared_media_keys(0015).
// 매체 조회 시 키 우선순위: 광고주 행의 개별 키 → 여기 공용 키 → .env.local 폴백(메타·네이버만).
import { createAdminClient } from "@/lib/supabase/admin";

export type SharedChannel = "meta" | "naver" | "kakao" | "gfa" | "google_ads" | "ga4";
export const SHARED_CHANNELS: SharedChannel[] = ["meta", "naver", "kakao", "gfa", "google_ads", "ga4"];

export type SharedConfig = Record<string, string>;
export type SharedEntry = { config: SharedConfig; source: "db" | "env"; updatedAt: string | null };

const TTL_MS = 60 * 1000;
let cache: { at: number; rows: Map<string, { config: SharedConfig; updatedAt: string | null }>; tableReady: boolean } | null = null;

export function clearSharedKeyCache() {
  cache = null;
}

async function loadAll() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  const rows = new Map<string, { config: SharedConfig; updatedAt: string | null }>();
  let tableReady = true;
  try {
    const { data, error } = await createAdminClient().from("shared_media_keys").select("channel, config, updated_at");
    if (error) tableReady = false;
    for (const r of data ?? []) rows.set(r.channel, { config: (r.config ?? {}) as SharedConfig, updatedAt: r.updated_at ?? null });
  } catch {
    tableReady = false; // 0015 미실행 등 — env 폴백만
  }
  cache = { at: Date.now(), rows, tableReady };
  return cache;
}

// 예전부터 .env.local에 두던 공용 값 — DB에 없을 때만 쓴다
function envFallback(channel: SharedChannel): SharedConfig | null {
  if (channel === "meta" && process.env.META_ACCESS_TOKEN) return { access_token: process.env.META_ACCESS_TOKEN };
  if (channel === "naver" && process.env.NAVER_AD_API_KEY && process.env.NAVER_AD_SECRET) {
    return {
      api_key: process.env.NAVER_AD_API_KEY,
      secret: process.env.NAVER_AD_SECRET,
      ...(process.env.NAVER_AD_CUSTOMER_ID ? { owner_customer_id: process.env.NAVER_AD_CUSTOMER_ID } : {}),
    };
  }
  return null;
}

export async function getShared(channel: SharedChannel): Promise<SharedEntry | null> {
  const { rows } = await loadAll();
  const row = rows.get(channel);
  if (row && Object.keys(row.config).length > 0) return { config: row.config, source: "db", updatedAt: row.updatedAt };
  const env = envFallback(channel);
  return env ? { config: env, source: "env", updatedAt: null } : null;
}

export async function sharedTableReady(): Promise<boolean> {
  return (await loadAll()).tableReady;
}

export async function saveShared(channel: SharedChannel, config: SharedConfig, userId: string) {
  const { error } = await createAdminClient()
    .from("shared_media_keys")
    .upsert({ channel, config, updated_at: new Date().toISOString(), updated_by: userId });
  clearSharedKeyCache();
  return error;
}

// 기존 config에 값만 덮어쓴다(수정자 유지) — 토큰 자동 갱신처럼 사람이 아닌 서버가 쓰는 경우
export async function patchShared(channel: SharedChannel, patch: SharedConfig) {
  const admin = createAdminClient();
  const { data } = await admin.from("shared_media_keys").select("config").eq("channel", channel).maybeSingle();
  const config = { ...((data?.config ?? {}) as SharedConfig), ...patch };
  const { error } = await admin.from("shared_media_keys").upsert({ channel, config, updated_at: new Date().toISOString() });
  clearSharedKeyCache();
  return error;
}

export async function deleteShared(channel: SharedChannel) {
  const { error } = await createAdminClient().from("shared_media_keys").delete().eq("channel", channel);
  clearSharedKeyCache();
  return error;
}

export function maskKey(v: string | null | undefined): string {
  if (!v) return "";
  return v.length <= 8 ? "••••" : `${v.slice(0, 4)}…${v.slice(-4)}`;
}
