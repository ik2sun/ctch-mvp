import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "./admin";
import type { Role, Status } from "./profile";
import { isOwnerEmail, isWorkspaceEmail } from "@/lib/workspace";

type Profile = { status: Status; role: Role };

// 대시보드 진입 시마다 실행 — profiles 행이 없으면 만든다.
// SUPERADMIN_EMAIL(워크스페이스 소유자)은 최고관리자, 그 밖의 @nmg.co.kr 계정은 자동 승인된 뷰어(읽기 전용).
// 소유자 외 계정에 남아 있던 관리자·매니저 역할은 뷰어로 내린다 — 관리 기능은 소유자만.
// 트리거는 "새 가입"에만 반응하므로, 마이그레이션 이전 계정 등 트리거를 못 탄 유저를 여기서 보정한다.
export async function ensureProfile(
  supabase: SupabaseClient,
  userId: string,
  email: string | null,
): Promise<Profile> {
  const isSuperadmin = isOwnerEmail(email);
  const isMember = isWorkspaceEmail(email);

  const { data: existing } = await supabase
    .from("profiles")
    .select("status, role")
    .eq("id", userId)
    .maybeSingle();

  if (!existing) {
    const status: Status = isSuperadmin || isMember ? "approved" : "rejected";
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

  // 소유자가 아닌 계정 — nmg.co.kr이면 뷰어로 승인(소유자가 회원 관리에서 거절한 계정은 거절 유지), 아니면 거절
  const want: Profile = {
    status: isMember && existing.status !== "rejected" ? "approved" : "rejected",
    role: "viewer",
  };
  if (existing.status !== want.status || existing.role !== want.role) {
    try {
      const admin = createAdminClient();
      await admin.from("profiles").update(want).eq("id", userId);
    } catch {
      // 다음 요청에서 재시도
    }
  }
  return want;
}
