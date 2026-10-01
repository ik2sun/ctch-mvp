import { dataOwnerId, ownerOnly } from "@/lib/workspace";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureKakaoAccessToken, KAKAO_TOKEN_COLUMNS } from "@/lib/kakao-moment/auth";
import {
  dailyFromRows,
  daysBetween,
  displayName,
  fetchAccountReport,
  fetchAdGroupReport,
  fetchAdGroups,
  fetchCampaignReport,
  fetchCampaigns,
  fetchCreatives,
  groupByDimension,
  shiftDays,
  shiftMonths,
  sumRows,
} from "@/lib/kakao-moment/aggregate";
import { kakaoErrorResponse } from "@/lib/kakao-moment/client";
import { EMPTY_KAKAO_METRICS, type KakaoAdGroup, type KakaoCampaign, type KakaoMetrics } from "@/lib/kakao-moment/types";

export const maxDuration = 120;

// 실시간 리포트(계층형 트리)용 — 메타 /api/meta-insights, 네이버 /api/naver-ad/insights와 동일한 응답 모양(MetaHierarchy)
type Row = {
  id: string;
  level: "campaign" | "adset" | "ad";
  name: string;
  campaignId: string | null;
  campaignName: string | null;
  adsetId: string | null;
  adsetName: string | null;
  impressions: number;
  clicks: number;
  cost: number;
  reach: number;
  frequency: number;
  conversions: number;
  revenue: number;
};
type Totals = { impressions: number; clicks: number; cost: number; conversions: number; revenue: number; reach: number; frequency: number };

// 요청 제한(캠페인 보고서 5초/1회·최대 5개, 광고그룹 보고서 1초/1회·최대 40개) 때문에
// 광고그룹은 지출 상위 5개 캠페인, 소재는 지출 상위 40개 광고그룹만 조회하고 소재 이름은 상위 10개 그룹만 붙인다.
const ADGROUP_TOP_CAMPAIGNS = 5;
const CREATIVE_TOP_ADGROUPS = 40;
const CREATIVE_NAME_TOP_ADGROUPS = 10;

function withFreq(m: KakaoMetrics): Totals {
  return { ...m, frequency: m.reach > 0 ? m.impressions / m.reach : 0 };
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");
  const since = searchParams.get("since");
  const until = searchParams.get("until");
  if (!clientId) return NextResponse.json({ error: "clientId가 필요해요." }, { status: 400 });
  if (!since || !until) return NextResponse.json({ error: "since, until 쿼리 파라미터가 필요해요." }, { status: 400 });

  const { data: client } = await supabase.from("clients").select(`name, ${KAKAO_TOKEN_COLUMNS}`).eq("id", clientId).eq("user_id", await dataOwnerId(user)).maybeSingle();
  if (!client) return NextResponse.json({ error: "광고주를 찾을 수 없어요." }, { status: 403 });

  const days = daysBetween(since, until);
  const prevSince = shiftDays(since, -days);
  const prevUntil = shiftDays(until, -days);
  const monthSince = shiftMonths(since, -1);
  const monthUntil = shiftMonths(until, -1);

  try {
    const creds = await ensureKakaoAccessToken(supabase, clientId, client);

    // 목록(제한 없음)과 계정 보고서(5초 간격 대기열)를 병렬로
    const [campaigns, campaignRowsRaw, dailyRows, prevRows, monthRows] = await Promise.all([
      fetchCampaigns(creds),
      fetchAccountReport(creds, { since, until, timeUnit: "ALL", level: "CAMPAIGN" }),
      fetchAccountReport(creds, { since, until, timeUnit: "DAY" }),
      fetchAccountReport(creds, { since: prevSince, until: prevUntil, timeUnit: "ALL" }),
      fetchAccountReport(creds, { since: monthSince, until: monthUntil, timeUnit: "ALL" }),
    ]);

    const campaignById = new Map<string, KakaoCampaign>(campaigns.map((c) => [String(c.id), c]));
    const campaignMetrics = groupByDimension(campaignRowsRaw, "campaign_id", "campaignId");
    // 보고서에만 있고 목록에 없는 캠페인(삭제 등)도 행으로 남긴다
    const campaignIds = Array.from(new Set([...campaigns.map((c) => String(c.id)), ...campaignMetrics.keys()]));

    const campaignRows: Row[] = campaignIds.map((id) => {
      const c = campaignById.get(id);
      const m = campaignMetrics.get(id) ?? EMPTY_KAKAO_METRICS;
      return { id, level: "campaign", name: c?.name ?? `캠페인 ${id}`, campaignId: id, campaignName: c?.name ?? `캠페인 ${id}`, adsetId: null, adsetName: null, ...withFreq(m) };
    });

    // 광고그룹: 지출 상위 캠페인만
    const topCampaignIds = [...campaignMetrics.entries()]
      .sort((a, b) => b[1].cost - a[1].cost)
      .slice(0, ADGROUP_TOP_CAMPAIGNS)
      .map(([id]) => Number(id))
      .filter((n) => Number.isFinite(n));

    const [adGroupRowsRaw, adGroupLists] = await Promise.all([
      topCampaignIds.length ? fetchCampaignReport(creds, topCampaignIds, { since, until, timeUnit: "ALL", level: "AD_GROUP" }) : Promise.resolve([]),
      Promise.all(topCampaignIds.map((cid) => fetchAdGroups(creds, cid).catch(() => [] as KakaoAdGroup[]))),
    ]);
    const adGroups = adGroupLists.flat();
    const adGroupById = new Map<string, KakaoAdGroup>(adGroups.map((g) => [String(g.id), g]));
    const adGroupMetrics = groupByDimension(adGroupRowsRaw, "ad_group_id", "adGroup_id", "adgroup_id", "adGroupId");
    const adGroupIds = Array.from(new Set([...adGroups.map((g) => String(g.id)), ...adGroupMetrics.keys()]));

    const adsetRows: Row[] = adGroupIds.map((id) => {
      const g = adGroupById.get(id);
      const cid = g ? String(g.campaignId) : null;
      const c = cid ? campaignById.get(cid) : undefined;
      const m = adGroupMetrics.get(id) ?? EMPTY_KAKAO_METRICS;
      return { id, level: "adset", name: g?.name ?? `광고그룹 ${id}`, campaignId: cid, campaignName: c?.name ?? null, adsetId: id, adsetName: g?.name ?? `광고그룹 ${id}`, ...withFreq(m) };
    });

    // 소재: 지출 상위 광고그룹만
    const topAdGroupIds = [...adGroupMetrics.entries()]
      .sort((a, b) => b[1].cost - a[1].cost)
      .slice(0, CREATIVE_TOP_ADGROUPS)
      .map(([id]) => Number(id))
      .filter((n) => Number.isFinite(n));
    const [creativeRowsRaw, creativeLists] = await Promise.all([
      topAdGroupIds.length ? fetchAdGroupReport(creds, topAdGroupIds, { since, until, timeUnit: "ALL", level: "CREATIVE" }) : Promise.resolve([]),
      Promise.all(topAdGroupIds.slice(0, CREATIVE_NAME_TOP_ADGROUPS).map((gid) => fetchCreatives(creds, gid).catch(() => []))),
    ]);
    const creatives = creativeLists.flat();
    const creativeById = new Map(creatives.map((cr) => [String(cr.id), cr]));
    const creativeMetrics = groupByDimension(creativeRowsRaw, "creative_id", "creativeId");
    const creativeIds = Array.from(new Set([...creatives.map((cr) => String(cr.id)), ...creativeMetrics.keys()]));

    const adRows: Row[] = creativeIds.map((id) => {
      const cr = creativeById.get(id);
      const gid = cr ? String(cr.adGroupId) : null;
      const g = gid ? adGroupById.get(gid) : undefined;
      const cid = g ? String(g.campaignId) : null;
      const c = cid ? campaignById.get(cid) : undefined;
      const m = creativeMetrics.get(id) ?? EMPTY_KAKAO_METRICS;
      return { id, level: "ad", name: cr ? displayName(cr) : `소재 ${id}`, campaignId: cid, campaignName: c?.name ?? null, adsetId: gid, adsetName: g?.name ?? null, ...withFreq(m) };
    });

    return NextResponse.json({
      campaigns: campaignRows,
      adsets: adsetRows,
      ads: adRows,
      daily: dailyFromRows(dailyRows, since, until),
      clientName: client.name,
      period: { since, until },
      compare: { previous: withFreq(sumRows(prevRows)), lastMonth: withFreq(sumRows(monthRows)) },
      scopeNote: `카카오모먼트 요청 제한 때문에 광고그룹은 지출 상위 ${ADGROUP_TOP_CAMPAIGNS}개 캠페인, 소재는 지출 상위 ${CREATIVE_TOP_ADGROUPS}개 광고그룹만 표시돼요. 전환·매출은 픽셀&SDK '구매'(7일 기여) 기준.`,
    });
  } catch (e) {
    return kakaoErrorResponse(e, "카카오모먼트 데이터를 불러오지 못했어요.");
  }
}
