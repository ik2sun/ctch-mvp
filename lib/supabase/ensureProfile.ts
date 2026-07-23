import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "./admin";
import type { Role, Status } from "./profile";

type Profile = { status: Status; role: Role };

// 대시보드 진입 시마다 실행 — 로그인 방식(비밀번호/구글/이메일 링크)과 무관하게
// profiles 행이 없으면 만들고, SUPERADMIN_EMAIL과 일치하면 자동 승인한다.
// 트리거는 "새 가입"에만 반응하므로, 마이그레이션 이전 계정 등 트리거를 못 탄 유저를 여기서 보정한다.
export async function ensureProfile(
  supabase: SupabaseClient,
  userId: string,
  email: string | null,
): Promise<Profile> {
  const superadminEmail = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();
  const isSuperadmin = !!superadminEmail && email?.trim().toLowerCase() === superadminEmail;

  const { data: existing } = await supabase
    .from("profiles")
    .select("status, role")
    .eq("id", userId)
    .maybeSingle();

  if (!existing) {
    const status: Status = isSuperadmin ? "approved" : "pending";
    const role: Role = isSuperadmin ? "superadmin" : "viewer";
    try {
      const admin = createAdminClient();
      await admin.from("profiles").upsert({ id: userId, email, status, role }, { onConflict: "id" });
    } catch {
      // SUPABASE_SERVICE_ROLE_KEY 미설정 등 — 다음 요청에서 재시도됨
    }
    return { status, role };
  }

  if (isSuperadmin && (existing.status !== "approved" || existing.role !== "superadmin")) {
    try {
      const admin = createAdminClient();
      await admin.from("profiles").update({ status: "approved", role: "superadmin" }).eq("id", userId);
    } catch {
      // SUPABASE_SERVICE_ROLE_KEY 미설정 등 — 다음 요청에서 재시도됨
    }
    return { status: "approved", role: "superadmin" };
  }

  return existing as Profile;
}
