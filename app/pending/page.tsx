import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/supabase/ensureProfile";
import { StatusScreen } from "@/components/layout/StatusScreen";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PendingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await ensureProfile(supabase, user.id, user.email ?? null);
  if (profile.status === "approved") redirect("/");
  if (profile.status === "rejected") redirect("/rejected");

  return <StatusScreen kind="pending" />;
}
