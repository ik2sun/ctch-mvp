import { createClient } from "@/lib/supabase/client";

export type Client = {
  id: string;
  name: string;
  industry: string | null;
  monthly_budget: number | null;
  manager: string | null;
  memo: string | null;
  meta_account_id: string | null;
  naver_customer_id: string | null;
  google_customer_id: string | null;
  created_at: string;
};

export type ClientInput = {
  name: string;
  industry: string;
  monthly_budget: string;
  manager: string;
  memo: string;
  meta_account_id: string;
};

const supabase = createClient();

export async function listClients(): Promise<Client[]> {
  const { data } = await supabase
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false });
  return data ?? [];
}

function toRow(input: ClientInput) {
  return {
    name: input.name.trim(),
    industry: input.industry.trim() || null,
    monthly_budget: input.monthly_budget ? Number(input.monthly_budget.replace(/,/g, "")) : null,
    manager: input.manager.trim() || null,
    memo: input.memo.trim() || null,
    // act_ 접두어 자동 보정
    meta_account_id: input.meta_account_id.trim()
      ? input.meta_account_id.trim().startsWith("act_")
        ? input.meta_account_id.trim()
        : `act_${input.meta_account_id.trim()}`
      : null,
  };
}

export async function createClientRow(input: ClientInput) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다.");
  return supabase.from("clients").insert({ user_id: user.id, ...toRow(input) });
}

export async function updateClientRow(id: string, input: ClientInput) {
  return supabase.from("clients").update(toRow(input)).eq("id", id);
}

export async function deleteClientRow(id: string) {
  return supabase.from("clients").delete().eq("id", id);
}

export function fmtBudget(n: number | null): string {
  if (n == null) return "—";
  return "₩" + n.toLocaleString("ko-KR");
}
