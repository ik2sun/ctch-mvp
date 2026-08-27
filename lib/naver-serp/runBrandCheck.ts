import type { SupabaseClient } from "@supabase/supabase-js";
import { checkPowerLinkRank, domainMatches, type Device, type PowerLinkAd } from "./rankChecker";
import { sendBrandInfringementAlert } from "./brandAlertMail";
import { parseEmailList } from "@/lib/utils/email";

const DEVICES: Device[] = ["pc", "mobile"];

export type CheckableBrandKeyword = {
  id: string;
  user_id: string;
  client_id: string;
  keyword: string;
  owner_domain: string;
  alert_email: string;
};

function infringingDomainsOf(ads: PowerLinkAd[], ownerDomain: string): string[] {
  const seen = new Set<string>();
  for (const ad of ads) {
    if (!domainMatches(ad.domain, ownerDomain)) seen.add(ad.domain);
  }
  return Array.from(seen);
}

export type BrandCheckResult = {
  device: Device;
  ownerMatchedRank: number | null;
  ads: PowerLinkAd[];
  infringingAds: PowerLinkAd[];
  checkedAt: string;
};

// 브랜드 키워드 하나를 PC·모바일 둘 다 체크하고, 소유 도메인이 아닌 타사 노출(침해)을 감지한다.
// 직전 체크와 비교해 "새로 등장한" 타사 도메인이 있을 때만 담당자 메일을 보낸다(동일 침해 반복 알림 방지).
// DB에 저장한 판정(domainMatches 기반)을 그대로 응답으로 돌려준다 — 호출부(클라이언트)가 같은 로직을
// 다시 구현해 판정이 어긋나는 일이 없도록 한다.
export async function runBrandKeywordCheck(
  supabase: SupabaseClient,
  kw: CheckableBrandKeyword,
): Promise<{ pc: BrandCheckResult; mobile: BrandCheckResult }> {
  const results = await Promise.all(
    DEVICES.map((device) => checkPowerLinkRank(kw.keyword, kw.owner_domain, device)),
  );

  const rows = results.map((r) => ({
    keyword_id: kw.id,
    user_id: kw.user_id,
    device: r.device,
    owner_matched_rank: r.matchedRank,
    ads_snapshot: r.ads,
    infringing_ads: r.ads.filter((ad) => !domainMatches(ad.domain, kw.owner_domain)),
    checked_at: r.checkedAt,
  }));

  const { data: inserted, error } = await supabase
    .from("brand_keyword_checks")
    .insert(rows)
    .select("id, device, owner_matched_rank, ads_snapshot, infringing_ads, checked_at");
  if (error) throw new Error(error.message);

  await Promise.allSettled(
    (inserted ?? []).map((row) => maybeAlert(supabase, kw, row as InsertedCheckRow)),
  );

  const byDevice = new Map((inserted ?? []).map((row) => [row.device, row as InsertedCheckRow]));
  const toResult = (device: Device): BrandCheckResult => {
    const row = byDevice.get(device)!;
    return {
      device,
      ownerMatchedRank: row.owner_matched_rank,
      ads: row.ads_snapshot,
      infringingAds: row.infringing_ads,
      checkedAt: row.checked_at,
    };
  };
  return { pc: toResult("pc"), mobile: toResult("mobile") };
}

type InsertedCheckRow = {
  id: string;
  device: Device;
  owner_matched_rank: number | null;
  ads_snapshot: PowerLinkAd[];
  infringing_ads: PowerLinkAd[];
  checked_at: string;
};

async function maybeAlert(
  supabase: SupabaseClient,
  kw: CheckableBrandKeyword,
  check: InsertedCheckRow,
): Promise<void> {
  if (check.infringing_ads.length === 0) return;

  const currentDomains = infringingDomainsOf(check.infringing_ads, kw.owner_domain);

  // 가장 최근에 이 키워드·기기로 보낸 알림에 없던 도메인만 "새 침해"로 취급한다.
  const { data: lastAlert } = await supabase
    .from("brand_keyword_alerts")
    .select("infringing_domains")
    .eq("keyword_id", kw.id)
    .eq("device", check.device)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const previouslyAlerted = new Set<string>((lastAlert?.infringing_domains as string[] | null) ?? []);
  const hasNewDomain = currentDomains.some((d) => !previouslyAlerted.has(d));
  if (!hasNewDomain) return;

  const { data: client } = await supabase
    .from("clients")
    .select("name")
    .eq("id", kw.client_id)
    .maybeSingle();

  // 담당자 메일은 "a@b.com, c@d.com"처럼 콤마로 여러 명 등록될 수 있어 배열로 분리해서 보낸다.
  const recipients = parseEmailList(kw.alert_email) ?? [kw.alert_email];

  try {
    await sendBrandInfringementAlert({
      to: recipients,
      clientName: client?.name ?? "광고주",
      keyword: kw.keyword,
      ownerDomain: kw.owner_domain,
      device: check.device,
      infringingAds: check.infringing_ads,
      checkedAt: check.checked_at,
    });
    await supabase.from("brand_keyword_alerts").insert({
      keyword_id: kw.id,
      check_id: check.id,
      user_id: kw.user_id,
      device: check.device,
      infringing_domains: currentDomains,
      recipient: kw.alert_email,
      status: "sent",
    });
  } catch (e) {
    await supabase.from("brand_keyword_alerts").insert({
      keyword_id: kw.id,
      check_id: check.id,
      user_id: kw.user_id,
      device: check.device,
      infringing_domains: currentDomains,
      recipient: kw.alert_email,
      status: "failed",
      error: e instanceof Error ? e.message : "메일 발송 실패",
    });
  }
}
