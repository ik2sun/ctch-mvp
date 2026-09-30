// 서버 전용 — GEO 인용 추적 라우트 공용 인증: 로그인 사용자 + 그 사용자가 볼 수 있는 광고주(RLS)
import { createClient } from "@/lib/supabase/server";

export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

export async function canAccessClient(supabase: Awaited<ReturnType<typeof createClient>>, clientId: string) {
  const { data } = await supabase.from("clients").select("id").eq("id", clientId).maybeSingle();
  return Boolean(data);
}

// 본인 회차인지 (RLS로 보이는지) 확인
export async function canAccessRun(supabase: Awaited<ReturnType<typeof createClient>>, runId: string) {
  const { data } = await supabase.from("geo_runs").select("id, client_id").eq("id", runId).maybeSingle();
  return data as { id: string; client_id: string } | null;
}
