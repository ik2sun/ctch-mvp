import { createClient } from "@/lib/supabase/client";
import type { Device, PowerLinkAd } from "@/lib/naver-serp/rankChecker";

// null = 수동(자동 체크 안 함), 그 외에는 시간 단위 주기
export type CheckIntervalHours = 6 | 12 | 24 | 168 | null;

export type BrandKeyword = {
  id: string;
  client_id: string;
  keyword: string;
  owner_domain: string;
  alert_email: string;
  memo: string | null;
  check_interval_hours: CheckIntervalHours;
  created_at: string;
};

export type BrandKeywordCheck = {
  id: string;
  keyword_id: string;
  device: Device;
  owner_matched_rank: number | null;
  ads_snapshot: PowerLinkAd[];
  infringing_ads: PowerLinkAd[];
  checked_at: string;
};

export type BrandKeywordAlert = {
  id: string;
  keyword_id: string;
  device: Device;
  infringing_domains: string[];
  recipient: string;
  status: "sent" | "failed";
  error: string | null;
  sent_at: string;
};

const supabase = createClient();

export async function listKeywords(clientId: string): Promise<BrandKeyword[]> {
  const { data } = await supabase
    .from("brand_keywords")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function addKeyword(input: {
  clientId: string;
  keyword: string;
  ownerDomain: string;
  alertEmail: string;
  memo?: string | null;
  checkIntervalHours?: CheckIntervalHours;
}) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다.");

  return supabase
    .from("brand_keywords")
    .insert({
      user_id: user.id,
      client_id: input.clientId,
      keyword: input.keyword,
      owner_domain: input.ownerDomain,
      alert_email: input.alertEmail,
      memo: input.memo ?? null,
      check_interval_hours: input.checkIntervalHours ?? null,
    })
    .select("*")
    .single();
}

export async function deleteKeyword(id: string) {
  return supabase.from("brand_keywords").delete().eq("id", id);
}

export async function updateCheckInterval(id: string, hours: CheckIntervalHours) {
  return supabase.from("brand_keywords").update({ check_interval_hours: hours }).eq("id", id);
}

export async function updateAlertEmail(id: string, alertEmail: string) {
  return supabase.from("brand_keywords").update({ alert_email: alertEmail }).eq("id", id);
}

// 각 키워드별 최신 체크 결과(기기별 1건)만 모아서 반환한다.
export async function listLatestChecks(
  keywordIds: string[],
): Promise<Record<string, Partial<Record<Device, BrandKeywordCheck>>>> {
  if (keywordIds.length === 0) return {};
  const { data } = await supabase
    .from("brand_keyword_checks")
    .select("*")
    .in("keyword_id", keywordIds)
    .order("checked_at", { ascending: false });

  const result: Record<string, Partial<Record<Device, BrandKeywordCheck>>> = {};
  for (const row of (data ?? []) as BrandKeywordCheck[]) {
    const bucket = (result[row.keyword_id] ??= {});
    if (!bucket[row.device]) bucket[row.device] = row;
  }
  return result;
}

// 엑셀 내보내기용 — 특정 키워드들의 체크 이력을 전부(기기별 매 회차) 시간순으로 가져온다.
export async function listCheckHistory(keywordIds: string[]): Promise<BrandKeywordCheck[]> {
  if (keywordIds.length === 0) return [];
  const { data } = await supabase
    .from("brand_keyword_checks")
    .select("*")
    .in("keyword_id", keywordIds)
    .order("checked_at", { ascending: false })
    .limit(5000);
  return (data ?? []) as BrandKeywordCheck[];
}

// 발송된 알림 이력 (담당자가 언제·누구에게·어떤 침해로 메일이 갔는지 확인용)
export async function listAlerts(keywordIds: string[]): Promise<BrandKeywordAlert[]> {
  if (keywordIds.length === 0) return [];
  const { data } = await supabase
    .from("brand_keyword_alerts")
    .select("*")
    .in("keyword_id", keywordIds)
    .order("sent_at", { ascending: false })
    .limit(200);
  return (data ?? []) as BrandKeywordAlert[];
}
