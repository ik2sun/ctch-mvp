import { createClient } from "@/lib/supabase/client";
import { parseBudgetInput, formatBudgetInput } from "@/lib/utils/formatNumber";

export { formatBudgetInput };
export { normalizeMetaAccountId } from "./metaAccount";

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
  brand_color?: string | null; // #RRGGBB — 0020 마이그레이션 전이면 없음
};

export type ClientInput = {
  name: string;
  industry: string;
  monthly_budget: string;
  manager: string;
  memo: string;
  brand_color: string;
};

const supabase = createClient();

// 매체 API 키(meta_access_token, naver_ad_*, gfa_*, kakao_ad_*)는 절대 이 목록에 넣지 않는다.
// 브라우저 Supabase 클라이언트로 조회하는 select라 여기 포함되면 그대로 네트워크 응답에 노출된다.
const SAFE_COLUMNS =
  "id, name, industry, monthly_budget, manager, memo, meta_account_id, naver_customer_id, google_customer_id, created_at";

export async function listClients(): Promise<Client[]> {
  // brand_color는 0020 마이그레이션 후에만 있다 — 없으면 빼고 다시 조회(목록이 비지 않게)
  const withColor = await supabase
    .from("clients")
    .select(`${SAFE_COLUMNS}, brand_color`)
    .order("created_at", { ascending: false });
  if (!withColor.error) return (withColor.data ?? []) as Client[];
  const { data } = await supabase.from("clients").select(SAFE_COLUMNS).order("created_at", { ascending: false });
  return data ?? [];
}

// ── 브랜드 색 ─────────────────────────────────────────────
export const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
// 색을 정하지 않은 광고주용 자동 색 — 검증된 범주 팔레트(이름으로 고정 배정, 새로고침해도 같은 색)
const AUTO_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#d55181", "#4a3aa7", "#008300", "#e34948", "#c98500"];
// 브랜드 색 고르기용 추천 견본
export const BRAND_SWATCHES = ["#101828", "#2a78d6", "#4F46E5", "#7C3AED", "#d55181", "#e34948", "#eb6834", "#c98500", "#1baf7a", "#008300", "#0E7490", "#475467"];

export function brandColorOf(c: Pick<Client, "name" | "brand_color"> | null | undefined): string {
  if (c?.brand_color && HEX_RE.test(c.brand_color)) return c.brand_color;
  const name = c?.name ?? "";
  // FNV-1a — 짧은 한글 이름끼리도 고르게 흩어지게
  let h = 0x811c9dc5;
  for (const ch of name) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return AUTO_COLORS[h % AUTO_COLORS.length];
}

// 바탕색 위 글자색 — 밝은 바탕(노랑·연두 등)이면 진한 글자, 아니면 흰 글자
export function onColor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lin = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.4 ? "#101828" : "#FFFFFF";
}

function toRow(input: ClientInput) {
  return {
    name: input.name.trim(),
    industry: input.industry.trim() || null,
    monthly_budget: parseBudgetInput(input.monthly_budget),
    manager: input.manager.trim() || null,
    memo: input.memo.trim() || null,
    brand_color: HEX_RE.test(input.brand_color.trim()) ? input.brand_color.trim().toUpperCase() : null,
    // 메타 광고계정 ID는 매체 연동(/api/clients/[id]/media-keys)에서 형식 검증 후 저장한다.
  };
}

export function toClientInput(c: Client | null): ClientInput {
  return {
    name: c?.name ?? "",
    industry: c?.industry ?? "",
    monthly_budget: c?.monthly_budget != null ? formatBudgetInput(c.monthly_budget.toString()) : "",
    manager: c?.manager ?? "",
    memo: c?.memo ?? "",
    brand_color: c?.brand_color ?? "",
  };
}

// brand_color 칸이 아직 없으면(0020 미실행) 그 값만 빼고 다시 저장
function withoutColor<T extends { brand_color?: unknown }>(row: T) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { brand_color, ...rest } = row;
  return rest;
}
const isMissingColor = (msg?: string) => !!msg && /brand_color/i.test(msg);

// 같은 이름 광고주가 여러 개면 구분용 꼬리표(업종·메타 계정·등록일)를 붙인다.
export function clientLabel(c: Client, all: Client[]): string {
  const dup = all.filter((x) => x.name.trim() === c.name.trim()).length > 1;
  if (!dup) return c.name;
  const tag = [c.industry, c.meta_account_id, `${new Date(c.created_at).toLocaleDateString("ko-KR")} 등록`]
    .filter(Boolean)
    .join(" · ");
  return `${c.name} (${tag})`;
}

export async function createClientRow(input: ClientInput) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다.");
  const row = { user_id: user.id, ...toRow(input) };
  const res = await supabase.from("clients").insert(row).select("id").single();
  if (res.error && isMissingColor(res.error.message)) return supabase.from("clients").insert(withoutColor(row)).select("id").single();
  return res;
}

export async function updateClientRow(id: string, input: ClientInput) {
  const row = toRow(input);
  const res = await supabase.from("clients").update(row).eq("id", id);
  if (res.error && isMissingColor(res.error.message)) return supabase.from("clients").update(withoutColor(row)).eq("id", id);
  return res;
}

export async function deleteClientRow(id: string) {
  return supabase.from("clients").delete().eq("id", id);
}

export function fmtBudget(n: number | null): string {
  if (n == null) return "—";
  return "₩" + n.toLocaleString("ko-KR");
}
