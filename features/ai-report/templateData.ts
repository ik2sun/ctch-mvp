import { createClient } from "@/lib/supabase/client";
import type { MetricKey } from "./calcMetrics";

const supabase = createClient();

// 지표 → 이 광고주가 쓰는 라벨
export type LabelMap = Partial<Record<MetricKey, string>>;

export async function getTemplate(clientId: string): Promise<LabelMap | null> {
  const { data } = await supabase
    .from("report_templates")
    .select("label_map")
    .eq("client_id", clientId)
    .maybeSingle();
  return (data?.label_map as LabelMap) ?? null;
}

export async function saveTemplate(clientId: string, labelMap: LabelMap) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다.");
  // 광고주당 1개(unique) — 있으면 덮어쓰기(upsert)
  return supabase.from("report_templates").upsert(
    {
      user_id: user.id,
      client_id: clientId,
      label_map: labelMap,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "client_id" },
  );
}

export async function deleteTemplate(clientId: string) {
  return supabase.from("report_templates").delete().eq("client_id", clientId);
}
