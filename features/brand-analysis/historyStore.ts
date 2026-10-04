// 인스타 분석 히스토리 저장소 — 서버 전용(service_role). 테이블은 0027_insta_analyses.sql.
// 테이블이 없으면 저장은 조용히 건너뛰고, 목록은 ready:false로 알린다(분석 자체는 그대로 동작).
import { createAdminClient } from "@/lib/supabase/admin";
import type { InstagramProfile } from "./apifyClient";
import { computeAccountMetrics } from "./postMetrics";
import type { Diagnosis } from "./diagnosisTypes";

export type HistoryRow = {
  username: string;
  full_name: string | null;
  avatar: string | null;
  followers: number | null;
  posts_count: number | null;
  median_er: number | null;
  posts_per_week: number | null;
  reel_view_rate: number | null;
  is_mock: boolean;
  analyzed_by: string | null;
  analyzed_at: string;
  diagnosed_at: string | null;
};

const LIST_COLS = "username, full_name, avatar, followers, posts_count, median_er, posts_per_week, reel_view_rate, is_mock, analyzed_by, analyzed_at, diagnosed_at";
export const normHandle = (u: string) => u.trim().replace(/^@/, "").toLowerCase();

// 인스타 CDN 사진을 내려받아 data URL로(최대 80KB) — 실패하면 null
async function avatarData(url: string): Promise<string | null> {
  if (!url || !/^https?:\/\//.test(url)) return null;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0" }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 80_000) return null;
    return `data:${res.headers.get("content-type") || "image/jpeg"};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function saveAnalysis(profile: InstagramProfile, by: string | null): Promise<string | null> {
  try {
    const m = computeAccountMetrics(profile);
    const { error } = await createAdminClient()
      .from("insta_analyses")
      .upsert({
        username: normHandle(profile.username),
        full_name: profile.fullName || null,
        avatar: await avatarData(profile.profilePicUrl),
        followers: profile.followersCount ?? null,
        posts_count: profile.postsCount ?? null,
        median_er: m.medianEr ?? null,
        posts_per_week: m.postsPerWeek ?? null,
        reel_view_rate: m.avgReelViewRate ?? null,
        is_mock: !!profile.isMock,
        profile,
        diagnosis: null, // 새 데이터엔 이전 진단이 맞지 않으므로 비운다
        diagnosed_at: null,
        analyzed_by: by,
        analyzed_at: new Date().toISOString(),
      });
    return error ? error.message : null;
  } catch (e) {
    return e instanceof Error ? e.message : "저장 실패";
  }
}

export async function saveDiagnosis(username: string, diagnosis: Diagnosis) {
  try {
    await createAdminClient().from("insta_analyses").update({ diagnosis, diagnosed_at: new Date().toISOString() }).eq("username", normHandle(username));
  } catch {
    /* 테이블 없음 등 */
  }
}

export async function listHistory(q?: string, limit = 60): Promise<{ ready: boolean; rows: HistoryRow[] }> {
  let query = createAdminClient().from("insta_analyses").select(LIST_COLS).order("analyzed_at", { ascending: false }).limit(limit);
  const term = q ? normHandle(q).replace(/[%_,()]/g, "") : "";
  if (term) query = query.or(`username.ilike.%${term}%,full_name.ilike.%${term}%`);
  const { data, error } = await query;
  if (error) return { ready: false, rows: [] };
  return { ready: true, rows: (data ?? []) as HistoryRow[] };
}

export async function getAnalysis(username: string): Promise<{ profile: InstagramProfile; diagnosis: Diagnosis | null; analyzed_at: string } | null> {
  const { data } = await createAdminClient().from("insta_analyses").select("profile, diagnosis, analyzed_at").eq("username", normHandle(username)).maybeSingle();
  return data ? { profile: data.profile as InstagramProfile, diagnosis: (data.diagnosis as Diagnosis | null) ?? null, analyzed_at: data.analyzed_at } : null;
}

export async function getBrandAccount(clientId: string): Promise<string | null> {
  const { data } = await createAdminClient().from("insta_brand_accounts").select("username").eq("client_id", clientId).maybeSingle();
  return data?.username ?? null;
}

export async function setBrandAccount(clientId: string, username: string | null, by: string | null): Promise<string | null> {
  const admin = createAdminClient();
  const { error } = username
    ? await admin.from("insta_brand_accounts").upsert({ client_id: clientId, username: normHandle(username), updated_by: by, updated_at: new Date().toISOString() })
    : await admin.from("insta_brand_accounts").delete().eq("client_id", clientId);
  return error ? error.message : null;
}
