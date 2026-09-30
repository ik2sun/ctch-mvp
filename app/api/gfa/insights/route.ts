import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGfaCredentials } from "@/lib/gfa/auth";
import {
  dailyFromRows,
  daysBetween,
  fetchAdSets,
  fetchCampaigns,
  fetchCreatives,
  fetchPastPerformance,
  groupBy,
  shiftDays,
  shiftMonths,
  sumRows,
  type GfaAdSet,
  type GfaCreative,
  type GfaMetrics,
} from "@/lib/gfa/aggregate";
import { gfaErrorResponse } from "@/lib/gfa/client";

export const maxDuration = 120;

// 실시간 리포트(계층형 트리)용 — 메타 /api/meta-insights, 카카오 /api/kakao-moment/insights와 같은 응답 모양(MetaHierarchy)
type Row = {
  id: string;
  level: "campaign" | "adset" | "ad";
  name: string;
  campaignId: string | null;
  campaignName: string | null;
  adsetId: string | null;
  adsetName: string | null;
} & GfaMetrics & { frequency: number };

const withFreq = (m: GfaMetrics) => ({ ...m, frequency: 0 });

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

  const { data: client } = await supabase.from("clients").select("name, gfa_customer_id").eq("id", clientId).eq("user_id", user.id).maybeSingle();
  if (!client) return NextResponse.json({ error: "광고주를 찾을 수 없어요." }, { status: 403 });

  const days = daysBetween(since, until);
  const prevSince = shiftDays(since, -days);
  const prevUntil = shiftDays(until, -days);
  const monthSince = shiftMonths(since, -1);
  const monthUntil = shiftMonths(until, -1);

  try {
    const creds = await getGfaCredentials(client.gfa_customer_id);
    // 캠페인 단위(ADV쇼핑 포함 전체 합계·일별)와 소재 단위(광고그룹·소재 행)를 따로 받는다. 이름은 목록 API로 붙인다.
    const [campaignPerf, creativePerf, prevRows, monthRows, campaigns, adSets, creatives] = await Promise.all([
      fetchPastPerformance(creds, "campaigns", since, until),
      fetchPastPerformance(creds, "creatives", since, until),
      fetchPastPerformance(creds, "campaigns", prevSince, prevUntil),
      fetchPastPerformance(creds, "campaigns", monthSince, monthUntil),
      fetchCampaigns(creds),
      fetchAdSets(creds).catch(() => [] as GfaAdSet[]),
      fetchCreatives(creds).catch(() => [] as GfaCreative[]),
    ]);

    const campaignName = new Map(campaigns.map((c) => [String(c.no), c.name]));
    const adSetById = new Map(adSets.map((g) => [String(g.no), g]));
    const creativeById = new Map(creatives.map((cr) => [String(cr.no), cr]));
    for (const g of adSets) if (g.campaignName && !campaignName.has(String(g.campaignNo))) campaignName.set(String(g.campaignNo), g.campaignName);

    // 성과가 있는 행만 — 목록 전체를 넣으면 꺼진 캠페인·소재가 0으로 잔뜩 붙는다
    const campaignRows: Row[] = [...groupBy(campaignPerf, "campaignNo").entries()].map(([id, m]) => {
      const name = campaignName.get(id) ?? `캠페인 ${id}`;
      return { id, level: "campaign", name, campaignId: id, campaignName: name, adsetId: null, adsetName: null, ...withFreq(m) };
    });

    // 소재 행에서 광고그룹의 소속 캠페인을 얻는다(목록에 없는 삭제 그룹 대비)
    const adSetCampaign = new Map<string, string>();
    for (const r of creativePerf) if (r.adSetNo != null && r.campaignNo != null) adSetCampaign.set(String(r.adSetNo), String(r.campaignNo));

    const adsetRows: Row[] = [...groupBy(creativePerf, "adSetNo").entries()].map(([id, m]) => {
      const g = adSetById.get(id);
      const cid = g ? String(g.campaignNo) : (adSetCampaign.get(id) ?? null);
      const name = g?.name ?? `광고그룹 ${id}`;
      return { id, level: "adset", name, campaignId: cid, campaignName: cid ? (campaignName.get(cid) ?? null) : null, adsetId: id, adsetName: name, ...withFreq(m) };
    });

    const creativeParent = new Map<string, { adSetNo?: number; campaignNo?: number }>();
    for (const r of creativePerf) if (r.creativeNo != null) creativeParent.set(String(r.creativeNo), { adSetNo: r.adSetNo, campaignNo: r.campaignNo });

    const adRows: Row[] = [...groupBy(creativePerf, "creativeNo").entries()].map(([id, m]) => {
      const cr = creativeById.get(id);
      const p = creativeParent.get(id);
      const gid = cr ? String(cr.adSetNo) : p?.adSetNo != null ? String(p.adSetNo) : null;
      const cid = p?.campaignNo != null ? String(p.campaignNo) : gid ? (adSetById.get(gid) ? String(adSetById.get(gid)!.campaignNo) : null) : null;
      return {
        id,
        level: "ad",
        name: cr?.name?.trim() || `소재 ${id}`,
        campaignId: cid,
        campaignName: cid ? (campaignName.get(cid) ?? null) : null,
        adsetId: gid,
        adsetName: gid ? (adSetById.get(gid)?.name ?? null) : null,
        ...withFreq(m),
      };
    });

    const creativeCost = adRows.reduce((a, r) => a + r.cost, 0);
    const totalCost = sumRows(campaignPerf).cost;
    const assetGroupOnly = totalCost - creativeCost > 1;

    return NextResponse.json({
      campaigns: campaignRows,
      adsets: adsetRows,
      ads: adRows,
      daily: dailyFromRows(campaignPerf, since, until),
      clientName: client.name,
      period: { since, until },
      compare: { previous: withFreq(sumRows(prevRows)), lastMonth: withFreq(sumRows(monthRows)) },
      scopeNote: `GFA 과거 성과 기준. 도달·빈도는 API에서 제공하지 않아요. 전환·매출은 전 전환 유형 합계.${
        assetGroupOnly ? " ADV쇼핑(애셋 그룹) 캠페인 성과는 캠페인 행에만 있고 광고그룹·소재 탭에는 없어요." : ""
      }`,
    });
  } catch (e) {
    return gfaErrorResponse(e, "GFA 데이터를 불러오지 못했어요.");
  }
}
