import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MemberList, type Member } from "@/features/admin/MemberList";

export default async function AdminMembersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: caller } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (caller?.role !== "superadmin") redirect("/");

  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, email, status, role, created_at")
    .order("created_at", { ascending: false });
  const members = (data ?? []) as Member[];

  const pending = members.filter((m) => m.status === "pending");
  const approved = members.filter((m) => m.status === "approved");
  const rejected = members.filter((m) => m.status === "rejected");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="font-display text-[23px] font-semibold text-ink">회원 관리</h2>
        <p className="mt-1 text-[13px] text-ink-muted">가입 승인·거절과 역할을 관리해요.</p>
      </div>

      <MemberList pending={pending} approved={approved} rejected={rejected} currentUserId={user.id} />
    </div>
  );
}
