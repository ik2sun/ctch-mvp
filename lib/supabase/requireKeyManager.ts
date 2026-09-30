// API 공용 키 관리 권한 — 최고관리자·관리자만. (서버 라우트·페이지에서 사용)
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/supabase/profile";

export const KEY_MANAGER_ROLES: Role[] = ["superadmin", "admin"];

export async function getKeyManager(): Promise<{ userId: string; role: Role } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = data?.role as Role | undefined;
  return role && KEY_MANAGER_ROLES.includes(role) ? { userId: user.id, role } : null;
}
