import { redirect } from "next/navigation";
import { getKeyManager } from "@/lib/supabase/requireKeyManager";
import { ApiKeysPanel } from "@/features/admin/ApiKeysPanel";

export default async function ApiKeysPage() {
  if (!(await getKeyManager())) redirect("/");
  return <ApiKeysPanel />;
}
