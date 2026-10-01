import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/supabase/ensureProfile";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { ClientProvider } from "@/features/clients/ClientContext";
import { WorkspaceProvider } from "@/features/workspace/WorkspaceContext";
import { isOwnerEmail } from "@/lib/workspaceEmail";

// 승인 상태를 매 요청마다 반드시 새로 확인 — 정적/캐시 렌더링을 절대 허용하지 않음
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const profile = await ensureProfile(supabase, user.id, user.email ?? null);

  if (profile.status === "pending") redirect("/pending");
  if (profile.status === "rejected") redirect("/rejected");

  const role = profile.role;
  const canEdit = isOwnerEmail(user.email); // 저장·수정·삭제는 워크스페이스 소유자만

  return (
    <>
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.24.0/dist/tabler-icons.min.css"
      />
      <WorkspaceProvider canEdit={canEdit}>
      <ClientProvider>
        <div className="flex h-screen overflow-hidden bg-surface">
          <Sidebar email={user.email ?? "user"} role={role} />
          <div className="flex flex-1 flex-col overflow-hidden">
            <Header />
            <main className="flex-1 overflow-y-auto p-6 2xl:px-8">{children}</main>
          </div>
        </div>
      </ClientProvider>
      </WorkspaceProvider>
    </>
  );
}
