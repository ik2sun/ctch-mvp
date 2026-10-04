import { NextResponse } from "next/server";
import { dataOwnerId } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { naverErrorResponse } from "@/lib/naver-ad/client";
import {
  fetchDistributionBids,
  fetchKeywordStats,
  fetchPerformanceBulk,
  fetchPerformanceLadder,
  fetchPositionBids,
  ladderBids,
  normKeyword,
  resolveEstimateCredentials,
  roundBid,
  type NaverDevice,
} from "@/lib/naver-ad/estimate";

export const maxDuration = 120;

// SA 입찰 시뮬레이터 — 네이버. 읽기 전용(견적 API, 비용 없음). 요청은 네이버 대기열(1초 간격)을 탄다.
// action=analyze {keywords≤20, device}: 검색량·경쟁 + 1~5위 입찰가 + 최소 노출·중간 입찰가 + 추천 입찰가(3위) 예상 실적 + 연관 키워드
// action=plan {items:[{keyword,bid}], device}: 입찰가별 예상 실적(키워드별)
// action=ladder {keyword, device, minBid, topBid}: 입찰가 곡선(최대 41점, 호출 1건)
type Body = {
  clientId?: string;
  action?: "analyze" | "plan" | "ladder";
  device?: NaverDevice;
  keywords?: string[];
  items?: { keyword: string; bid: number }[];
  keyword?: string;
  minBid?: number;
  topBid?: number;
};

const TTL = 30 * 60 * 1000;
const cache = new Map<string, { at: number; body: unknown }>();

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Body;
  const device: NaverDevice = body.device === "PC" ? "PC" : "MOBILE";
  const { data: client } = body.clientId
    ? await supabase.from("clients").select("naver_ad_customer_id, naver_ad_api_key, naver_ad_secret").eq("id", body.clientId).eq("user_id", await dataOwnerId(user)).maybeSingle()
    : { data: null };

  const key = JSON.stringify([body.action, device, body.keywords, body.items, body.keyword, body.minBid, body.topBid]);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return NextResponse.json(hit.body);

  try {
    const creds = await resolveEstimateCredentials(client);
    let out: unknown;

    if (body.action === "analyze") {
      const keywords = [...new Map((body.keywords ?? []).map((k) => [normKeyword(k), k.trim()])).values()].filter(Boolean).slice(0, 20);
      if (!keywords.length) return NextResponse.json({ error: "키워드를 입력하세요." }, { status: 400 });
      const { stats, related } = await fetchKeywordStats(creds, keywords);
      const positions = await fetchPositionBids(creds, device, keywords);
      const minBids = await fetchDistributionBids(creds, device, "exposure-minimum-bid", keywords);
      const medianBids = await fetchDistributionBids(creds, device, "median-bid", keywords);
      const suggested = keywords.map((k) => {
        const n = normKeyword(k);
        return { keyword: k, bid: roundBid(positions.get(n)?.[3] || medianBids.get(n) || minBids.get(n) || 70) };
      });
      const perf = await fetchPerformanceBulk(creds, device, suggested);
      out = {
        device,
        rows: keywords.map((k, i) => {
          const n = normKeyword(k);
          return {
            keyword: k,
            stat: stats.get(n) ?? null,
            positions: positions.get(n) ?? {},
            minBid: minBids.get(n) ?? 0,
            medianBid: medianBids.get(n) ?? 0,
            bid: suggested[i].bid,
            perf: perf.get(n) ?? null,
          };
        }),
        related: related.map((r) => ({ keyword: r.keyword, search: r.pcSearch + r.mobileSearch, competition: r.competition })),
      };
    } else if (body.action === "plan") {
      const items = (body.items ?? []).filter((i) => i.keyword?.trim()).map((i) => ({ keyword: i.keyword.trim(), bid: roundBid(Number(i.bid) || 70) })).slice(0, 200);
      if (!items.length) return NextResponse.json({ error: "키워드가 없어요." }, { status: 400 });
      const perf = await fetchPerformanceBulk(creds, device, items);
      out = { device, perf: Object.fromEntries(items.map((i) => [normKeyword(i.keyword), perf.get(normKeyword(i.keyword)) ?? { bid: i.bid, impressions: 0, clicks: 0, cost: 0 }])) };
    } else if (body.action === "ladder") {
      const keyword = body.keyword?.trim();
      if (!keyword) return NextResponse.json({ error: "키워드가 없어요." }, { status: 400 });
      // 최저가(70원)부터 — 실측상 최소 노출 입찰가보다 낮은 입찰가에서도 노출이 잡히는 키워드가 있다(운동화: 최소 노출가 1,580원, 500원에서 노출 2.9만)
      const points = await fetchPerformanceLadder(creds, device, keyword, ladderBids(70, Math.max(body.topBid || 0, body.minBid || 0)));
      out = { device, keyword, points };
    } else {
      return NextResponse.json({ error: "알 수 없는 동작이에요." }, { status: 400 });
    }

    if (cache.size > 300) cache.clear();
    cache.set(key, { at: Date.now(), body: out });
    return NextResponse.json(out);
  } catch (e) {
    return naverErrorResponse(e, "네이버 견적을 불러오지 못했어요.");
  }
}
