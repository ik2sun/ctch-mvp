import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "./admin";
import type { Role, Status } from "./profile";
import { isOwnerEmail, isWorkspaceEmail } from "@/lib/workspace";

type Profile = { status: Status; role: Role };

// 최근 활동 기록(회원 관리용) — 같은 서버 프로세스에서 사용자당 5분에 한 번만 쓴다.
// last_seen_at 칸(0026)이 없으면 오류를 무시한다. 응답을 기다리지 않음.
const SEEN_INTERVAL_MS = 5 * 60 * 1000;
const lastSeenWrite = new Map<string, number>();
function touchLastSeen(userId: string) {
  const now = Date.now();
  if (now - (lastSeenWrite.get(userId) ?? 0) < SEEN_INTERVAL_MS) return;
  lastSeenWrite.set(userId, now);
  try {
    void createAdminClient()
      .from("profiles")
      .update({ last_seen_at: new Date(now).toISOString() })
      .eq("id", userId)
      .then(() => undefined, () => undefined);
  } catch {
    // SUPABASE_SERVICE_ROLE_KEY 미설정 등
  }
}

// 대시보드 진입 시마다 실행 — profiles 행이 없으면 만든다.
// SUPERADMIN_EMAIL(워크스페이스 소유자)은 최고관리자, 그 밖의 @nmg.co.kr 계정은 자동 승인된 뷰어(읽기 전용).
// 소유자 외 계정에 남아 있던 관리자·매니저 역할은 뷰어로 내린다 — 관리 기능은 소유자만.
// 트리거는 "새 가입"에만 반응하므로, 마이그레이션 이전 계정 등 트리거를 못 탄 유저를 여기서 보정한다.
export async function ensureProfile(
  supabase: SupabaseClient,
  userId: string,
  email: string | null,
): Promise<Profile> {
  const profile = await resolveProfile(supabase, userId, email);
  if (profile.status === "approved") touchLastSeen(userId);
  return profile;
}

async function resolveProfile(supabase: SupabaseClient, userId: string, email: string | null): Promise<Profile> {
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

  // 소유자는 항상 여기서 끝낸다 — 이미 superadmin이어도 아래 '소유자가 아닌 계정' 보정으로 내려가면 뷰어로 강등됐다(요청마다 superadmin↔viewer 반복)
  if (isSuperadmin) {
    if (existing.status !== "approved" || existing.role !== "superadmin") {
      try {
        const admin = createAdminClient();
        await admin.from("profiles").update({ status: "approved", role: "superadmin" }).eq("id", userId);
      } catch {
        // SUPABASE_SERVICE_ROLE_KEY 미설정 등 — 다음 요청에서 재시도됨
      }
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
