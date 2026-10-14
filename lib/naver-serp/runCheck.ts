import type { SupabaseClient } from "@supabase/supabase-js";
import { checkPowerLinkRank, type Device, type RankCheckResult } from "./rankChecker";
import { normalizeSections, type ShoppingSnapshot } from "./shopping";

const DEVICES: Device[] = ["pc", "mobile"];

export type CheckableKeyword = {
  id: string;
  user_id: string;
  keyword: string;
  target_domain: string | null;
  target_mall?: string | null;
  collect_sections?: string[] | null;
};

// 키워드 하나를 PC·모바일 둘 다 체크하고 이력 테이블에 저장한다.
// 한 번 받은 검색 결과에서 키워드에 고른 영역(파워링크·네이버 가격비교·네이버플러스 스토어)만 읽어 저장한다.
// 수동 확인 API와 자동(cron) 체크 양쪽에서 공용으로 쓴다.
export async function runKeywordRankCheck(
  supabase: SupabaseClient,
  kw: CheckableKeyword,
): Promise<{ pc: RankCheckResult; mobile: RankCheckResult; sections: string[] }> {
  const sections = normalizeSections(kw.collect_sections);
  const wantPl = sections.includes("powerlink");
  const wantPrice = sections.includes("price");
  const wantStore = sections.includes("store");

  const results = await Promise.all(
    DEVICES.map(async (device) => {
      const r = await checkPowerLinkRank(kw.keyword, kw.target_domain, device, {
        withShopping: wantPrice || wantStore,
        targetMall: kw.target_mall ?? null,
      });
      // 고르지 않은 영역은 저장·응답에서 뺀다
      if (!wantPl) {
        r.ads = [];
        r.matchedRank = null;
      }
      if (r.shopping) {
        if (!wantPrice) {
          r.shopping.price = [];
          r.shopping.priceRank = null;
        }
        if (!wantStore) {
          r.shopping.store = [];
          r.shopping.storeRank = null;
        }
      }
      return r;
    }),
  );

  const snapshotOf = (r: RankCheckResult): ShoppingSnapshot => ({
    sections,
    ...(wantPrice && r.shopping ? { price: r.shopping.price, priceRank: r.shopping.priceRank } : {}),
    ...(wantStore && r.shopping ? { store: r.shopping.store, storeRank: r.shopping.storeRank } : {}),
  });

  const rows = results.map((r) => ({
    keyword_id: kw.id,
    user_id: kw.user_id,
    device: r.device,
    matched_rank: r.matchedRank,
    ads_snapshot: r.ads,
    shopping_snapshot: snapshotOf(r),
    checked_at: r.checkedAt,
  }));
  const { error } = await supabase.from("competitor_rank_checks").insert(rows);
  if (error) throw new Error(error.message);

  const [pc, mobile] = results;
  return { pc, mobile, sections };
}
