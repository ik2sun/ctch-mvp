import { NextResponse } from "next/server";
import { dataOwnerId } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { getGoogleAdsCredentials, digitsOnly } from "@/lib/google-ads/auth";
import { googleAdsErrorResponse } from "@/lib/google-ads/client";
import { fetchForecast, fetchForecastLadder, fetchKeywordIdeas, PlannerLockedError } from "@/lib/google-ads/keywordPlanner";

export const maxDuration = 120;

// SA 입찰 시뮬레이터 — 구글. 읽기 전용(키워드 플래너, 비용 없음 — API 호출 건수만 씀).
// action=analyze {keywords≤20}: 검색량·경쟁·상단 노출 입찰가 + 추천 입찰가(범위 중간) 합계 예측 + 연관 키워드 (호출 2건)
// action=plan {items}: 입찰가 조합 합계 예측(구글은 키워드별이 아니라 묶음 합계만, 호출 1건)
// action=ladder {keyword, lowBid, highBid}: 입찰가 곡선 8점(호출 8건)
// 조회 계정: 선택 광고주의 Customer ID, 없으면 NMG MCC.
type Body = {
  clientId?: string;
  action?: "analyze" | "plan" | "ladder";
  keywords?: string[];
  items?: { keyword: string; bid: number }[];
  keyword?: string;
  lowBid?: number;
  highBid?: number;
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
  const { data: client } = body.clientId
    ? await supabase.from("clients").select("google_ads_customer_id").eq("id", body.clientId).eq("user_id", await dataOwnerId(user)).maybeSingle()
    : { data: null };

  const key = JSON.stringify([body.action, body.keywords, body.items, body.keyword, body.lowBid, body.highBid]);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return NextResponse.json(hit.body);

  try {
    const base = await getGoogleAdsCredentials(client, false);
    const creds = { ...base, customerId: base.customerId || digitsOnly(base.loginCustomerId) };
    let out: unknown;

    if (body.action === "analyze") {
      const keywords = [...new Set((body.keywords ?? []).map((k) => k.trim()).filter(Boolean))].slice(0, 20);
      if (!keywords.length) return NextResponse.json({ error: "키워드를 입력하세요." }, { status: 400 });
      const { stats, related } = await fetchKeywordIdeas(creds, keywords);
      const rows = keywords.map((k) => {
        const s = stats.get(k.replace(/\s+/g, "").toLowerCase()) ?? null;
        const bid = s ? Math.max(10, Math.round(((s.lowBid + s.highBid) / 2 || s.highBid || s.lowBid || 500) / 10) * 10) : 500;
        return { keyword: k, stat: s, bid };
      });
      const total = await fetchForecast(creds, rows.map((r) => ({ keyword: r.keyword, bid: r.bid })));
      out = { rows, total, related: related.map((r) => ({ keyword: r.keyword, search: r.monthlySearch, competition: r.competition })) };
    } else if (body.action === "plan") {
      const items = (body.items ?? []).filter((i) => i.keyword?.trim()).map((i) => ({ keyword: i.keyword.trim(), bid: Math.max(10, Number(i.bid) || 10) })).slice(0, 200);
      if (!items.length) return NextResponse.json({ error: "키워드가 없어요." }, { status: 400 });
      out = { total: await fetchForecast(creds, items) };
    } else if (body.action === "ladder") {
      const keyword = body.keyword?.trim();
      if (!keyword) return NextResponse.json({ error: "키워드가 없어요." }, { status: 400 });
      out = { keyword, points: await fetchForecastLadder(creds, keyword, body.lowBid ?? 0, body.highBid ?? 0) };
    } else {
      return NextResponse.json({ error: "알 수 없는 동작이에요." }, { status: 400 });
    }

    if (cache.size > 300) cache.clear();
    cache.set(key, { at: Date.now(), body: out });
    return NextResponse.json(out);
  } catch (e) {
    if (e instanceof PlannerLockedError) return NextResponse.json({ error: e.message, code: "PLANNER_LOCKED" }, { status: 403 });
    return googleAdsErrorResponse(e, "구글 키워드 플래너를 불러오지 못했어요.");
  }
}
