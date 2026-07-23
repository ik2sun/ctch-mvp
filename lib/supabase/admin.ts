import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// service_role 키를 쓰는 서버 전용 클라이언트 — RLS를 우회하므로
// 절대 클라이언트 컴포넌트나 응답에 노출하지 말 것. 관리자 승인/역할변경 API에서만 사용.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았어요.");
  }
  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
