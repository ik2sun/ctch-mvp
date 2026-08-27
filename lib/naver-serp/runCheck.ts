import type { SupabaseClient } from "@supabase/supabase-js";
import { checkPowerLinkRank, type Device, type RankCheckResult } from "./rankChecker";

const DEVICES: Device[] = ["pc", "mobile"];

export type CheckableKeyword = {
  id: string;
  user_id: string;
  keyword: string;
  target_domain: string;
};

// 키워드 하나를 PC·모바일 둘 다 체크하고 이력 테이블에 저장한다.
// 수동 확인 API와 자동(cron) 체크 양쪽에서 공용으로 쓴다.
export async function runKeywordRankCheck(
  supabase: SupabaseClient,
  kw: CheckableKeyword,
): Promise<{ pc: RankCheckResult; mobile: RankCheckResult }> {
  const results = await Promise.all(
    DEVICES.map((device) => checkPowerLinkRank(kw.keyword, kw.target_domain, device)),
  );

  const rows = results.map((r) => ({
    keyword_id: kw.id,
    user_id: kw.user_id,
    device: r.device,
    matched_rank: r.matchedRank,
    ads_snapshot: r.ads,
    checked_at: r.checkedAt,
  }));
  const { error } = await supabase.from("competitor_rank_checks").insert(rows);
  if (error) throw new Error(error.message);

  const [pc, mobile] = results;
  return { pc, mobile };
}
