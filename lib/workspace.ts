// 워크스페이스 — @nmg.co.kr 구성원은 모두 소유자(SUPERADMIN_EMAIL = k2s@nmg.co.kr)의 데이터를 읽기만,
// 저장·수정·삭제는 소유자만. DB 쪽은 0021_workspace_sharing.sql RLS가 같은 규칙을 강제한다.
// 서버 전용(service_role로 소유자 id를 찾는다).
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export { WORKSPACE_DOMAIN, ownerEmail, isOwnerEmail, isWorkspaceEmail } from "@/lib/workspaceEmail";
import { ownerEmail, isOwnerEmail } from "@/lib/workspaceEmail";

let cachedOwnerId: { id: string; at: number } | null = null;

// 소유자 user id — profiles.email로 찾고 10분 캐시. 못 찾으면 null
export async function workspaceOwnerId(): Promise<string | null> {
  if (cachedOwnerId && Date.now() - cachedOwnerId.at < 10 * 60 * 1000) return cachedOwnerId.id;
  const email = ownerEmail();
  if (!email) return null;
  try {
    const { data } = await createAdminClient().from("profiles").select("id").ilike("email", email).maybeSingle();
    if (!data?.id) return null;
    cachedOwnerId = { id: data.id as string, at: Date.now() };
    return cachedOwnerId.id;
  } catch {
    return null;
  }
}

type WorkspaceUser = { id: string; email?: string | null };

// 읽기용 — 이 사용자가 볼 데이터의 user_id(소유자). 소유자를 못 찾으면 본인 id
export async function dataOwnerId(user: WorkspaceUser): Promise<string> {
  if (isOwnerEmail(user.email)) return user.id;
  return (await workspaceOwnerId()) ?? user.id;
}

// 쓰기 라우트 첫 줄에서 — 소유자가 아니면 403 응답을 돌려준다
export function ownerOnly(user: WorkspaceUser): NextResponse | null {
  if (isOwnerEmail(user.email)) return null;
  return NextResponse.json({ error: "보기 전용 계정이에요. 저장·수정·삭제는 관리자(k2s)만 할 수 있어요." }, { status: 403 });
}
