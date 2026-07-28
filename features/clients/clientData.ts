import { createClient } from "@/lib/supabase/client";
import { parseBudgetInput } from "@/lib/utils/formatNumber";

export { formatBudgetInput } from "@/lib/utils/formatNumber";

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

// 매체 API 키(meta_access_token, naver_ad_*, gfa_*, kakao_ad_*)는 절대 이 목록에 넣지 않는다.
// 브라우저 Supabase 클라이언트로 조회하는 select라 여기 포함되면 그대로 네트워크 응답에 노출된다.
const SAFE_COLUMNS =
  "id, name, industry, monthly_budget, manager, memo, meta_account_id, naver_customer_id, google_customer_id, created_at";

export async function listClients(): Promise<Client[]> {
  const { data } = await supabase
    .from("clients")
    .select(SAFE_COLUMNS)
    .order("created_at", { ascending: false });
  return data ?? [];
}

function toRow(input: ClientInput) {
  return {
    name: input.name.trim(),
    industry: input.industry.trim() || null,
    monthly_budget: parseBudgetInput(input.monthly_budget),
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
  return supabase
    .from("clients")
    .insert({ user_id: user.id, ...toRow(input) })
    .select("id")
    .single();
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
