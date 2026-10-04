import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOwnerEmail, isWorkspaceEmail } from "@/lib/workspace";
import { MemberList, type Member } from "@/features/admin/MemberList";

export const dynamic = "force-dynamic";

type ProfileRow = { id: string; email: string | null; status: Member["status"]; created_at: string; last_seen_at?: string | null };

// 회원 관리 — 구글 @nmg.co.kr 로그인 기준. 누가 언제 로그인·접속했는지 + 차단.
// 로그인 시각은 auth.users(last_sign_in_at), 최근 활동은 profiles.last_seen_at(0026, 없으면 비움).
export default async function AdminMembersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isOwnerEmail(user.email)) redirect("/");

  const admin = createAdminClient();
  let profiles: ProfileRow[] = [];
  let seenReady = true;
  const withSeen = await admin.from("profiles").select("id, email, status, created_at, last_seen_at");
  if (withSeen.error) {
    seenReady = false;
    profiles = ((await admin.from("profiles").select("id, email, status, created_at")).data ?? []) as ProfileRow[];
  } else {
    profiles = (withSeen.data ?? []) as ProfileRow[];
  }

  // auth 사용자 — 이름·사진(구글 프로필)·마지막 로그인
  const authById = new Map<string, { name?: string; avatar?: string; lastSignIn?: string | null; provider?: string }>();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users.length) break;
    for (const u of data.users) {
      const meta = (u.user_metadata ?? {}) as Record<string, string | undefined>;
      authById.set(u.id, {
        name: meta.full_name || meta.name,
        avatar: meta.avatar_url || meta.picture,
        lastSignIn: u.last_sign_in_at ?? null,
        provider: (u.app_metadata as { provider?: string } | undefined)?.provider,
      });
    }
    if (data.users.length < 200) break;
  }

  const members: Member[] = profiles.map((p) => {
    const a = authById.get(p.id);
    return {
      id: p.id,
      email: p.email,
      name: a?.name ?? null,
      avatar: a?.avatar ?? null,
      status: p.status,
      isOwner: isOwnerEmail(p.email),
      company: isWorkspaceEmail(p.email),
      firstAt: p.created_at,
      lastSignInAt: a?.lastSignIn ?? null,
      lastSeenAt: p.last_seen_at ?? null,
    };
  });

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6">
      <div>
        <h2 className="font-display text-[23px] font-semibold text-ink">회원 관리</h2>
        <p className="mt-1 text-[15px] text-ink-muted">
          회사 구글 계정(@nmg.co.kr)으로 로그인한 사람과 최근 접속을 확인해요. 로그인하면 자동으로 보기 권한을 받고, 저장·수정은 관리자만 할 수 있어요.
        </p>
      </div>
      <MemberList members={members} currentUserId={user.id} seenReady={seenReady} />
    </div>
  );
}
