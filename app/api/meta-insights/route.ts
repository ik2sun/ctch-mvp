import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// 메타 Marketing API — 3계층 + 일별 추세 조회 (서버 전용)
const API_VERSION = "v21.0";

type ActionItem = { action_type: string; value: string };
const PURCHASE_TYPES = ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"];

function pickAction(arr: ActionItem[] | undefined, types: string[]): number {
  if (!arr) return 0;
  for (const t of types) {
    const hit = arr.find((a) => a.action_type === t);
    if (hit) return parseFloat(hit.value) || 0;
  }
  return 0;
}

function n(v: unknown): number {
  const x = parseFloat(String(v ?? "0"));
  return isNaN(x) ? 0 : x;
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}
function shift(dateStr: string, days: number) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return iso(d);
}
function shiftMonth(dateStr: string, months: number) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return iso(d);
}

type Level = "account" | "campaign" | "adset" | "ad";

const LEVEL_FIELDS: Record<Level, string[]> = {
  account: [],
  campaign: ["campaign_id", "campaign_name"],
  adset: ["campaign_id", "campaign_name", "adset_id", "adset_name"],
  ad: ["campaign_id", "campaign_name", "adset_id", "adset_name", "ad_id", "ad_name"],
};

const COMMON = ["impressions", "clicks", "spend", "reach", "frequency", "actions", "action_values"];

async function callInsights(
  act: string,
  token: string,
  level: Level,
  since: string,
  until: string,
  daily: boolean,
) {
  const params = new URLSearchParams({
    access_token: token,
    level,
    time_range: JSON.stringify({ since, until }),
    fields: [...LEVEL_FIELDS[level], ...COMMON].join(","),
    limit: "500",
  });
  if (daily) params.set("time_increment", "1");

  const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${act}/insights?${params}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return (json.data ?? []) as Record<string, unknown>[];
}

function baseMetrics(r: Record<string, unknown>) {
  return {
    impressions: n(r.impressions),
    clicks: n(r.clicks),
    cost: n(r.spend),
    reach: n(r.reach),
    frequency: n(r.frequency),
    conversions: pickAction(r.actions as ActionItem[] | undefined, PURCHASE_TYPES),
    revenue: pickAction(r.action_values as ActionItem[] | undefined, PURCHASE_TYPES),
  };
}

type Totals = {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;
  reach: number;
  frequency: number;
};

function agg(rows: Record<string, unknown>[]): Totals {
  return rows.reduce(
    (a: Totals, r) => {
      const m = baseMetrics(r);
      return {
        impressions: a.impressions + m.impressions,
        clicks: a.clicks + m.clicks,
        cost: a.cost + m.cost,
        conversions: a.conversions + m.conversions,
        revenue: a.revenue + m.revenue,
        reach: a.reach + m.reach,
        frequency: a.frequency + m.frequency,
      };
    },
    { impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0, reach: 0, frequency: 0 },
  );
}

function toRow(r: Record<string, unknown>, level: "campaign" | "adset" | "ad") {
  const name =
    level === "campaign"
      ? (r.campaign_name as string)
      : level === "adset"
        ? (r.adset_name as string)
        : (r.ad_name as string);
  const id =
    level === "campaign"
      ? (r.campaign_id as string)
      : level === "adset"
        ? (r.adset_id as string)
        : (r.ad_id as string);
  return {
    id: id ?? name ?? Math.random().toString(36).slice(2),
    level,
    name: name ?? "이름 없음",
    campaignId: (r.campaign_id as string) ?? null,
    campaignName: (r.campaign_name as string) ?? null,
    adsetId: (r.adset_id as string) ?? null,
    adsetName: (r.adset_name as string) ?? null,
    ...baseMetrics(r),
  };
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const token = process.env.META_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "서버에 META_ACCESS_TOKEN이 설정되지 않았어요." },
      { status: 500 },
    );
  }

  const { since, until, clientId } = await req.json();
  if (!since || !until) return NextResponse.json({ error: "조회 기간을 지정해 주세요." }, { status: 400 });
  if (!clientId) return NextResponse.json({ error: "광고주를 먼저 선택해 주세요." }, { status: 400 });

  const { data: client } = await supabase
    .from("clients")
    .select("name, meta_account_id")
    .eq("id", clientId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!client) return NextResponse.json({ error: "광고주를 찾을 수 없어요." }, { status: 403 });
  if (!client.meta_account_id) {
    return NextResponse.json(
      { error: `'${client.name}'에 메타 광고계정 ID가 등록되지 않았어요.` },
      { status: 400 },
    );
  }

  const accountId = client.meta_account_id as string;
  const act = accountId.startsWith("act_") ? accountId : `act_${accountId}`;

  // 기간 길이만큼 앞선 직전 기간 / 한 달 전 동일 기간 (요약 카드 비교용)
  const days = Math.max(
    1,
    Math.round((new Date(until).getTime() - new Date(since).getTime()) / 86400000) + 1,
  );
  const prevSince = shift(since, -days);
  const prevUntil = shift(until, -days);
  const monthSince = shiftMonth(since, -1);
  const monthUntil = shiftMonth(until, -1);

  try {
    const [campRaw, adsetRaw, adRaw, accDailyRaw, campDailyRaw, prevRaw, monthRaw] = await Promise.all([
      callInsights(act, token, "campaign", since, until, false),
      callInsights(act, token, "adset", since, until, false),
      callInsights(act, token, "ad", since, until, false),
      callInsights(act, token, "account", since, until, true),
      callInsights(act, token, "campaign", since, until, true),
      callInsights(act, token, "account", prevSince, prevUntil, false),
      callInsights(act, token, "account", monthSince, monthUntil, false),
    ]);

    const campaigns = campRaw.map((r) => toRow(r, "campaign"));
    const adsets = adsetRaw.map((r) => toRow(r, "adset"));
    const ads = adRaw.map((r) => toRow(r, "ad"));

    // 계정 일별 (메인 차트)
    const daily = accDailyRaw
      .map((r) => ({ date: (r.date_start as string) ?? "", ...baseMetrics(r) }))
      .map(({ date, impressions, clicks, cost, conversions, revenue }) => ({
        date,
        impressions,
        clicks,
        cost,
        conversions,
        revenue,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // 캠페인 일별 → 각 캠페인에 스파크라인용으로 병합
    const byCampaign = new Map<string, typeof daily>();
    campDailyRaw.forEach((r) => {
      const cid = (r.campaign_id as string) ?? "";
      const m = baseMetrics(r);
      const point = {
        date: (r.date_start as string) ?? "",
        impressions: m.impressions,
        clicks: m.clicks,
        cost: m.cost,
        conversions: m.conversions,
        revenue: m.revenue,
      };
      if (!byCampaign.has(cid)) byCampaign.set(cid, []);
      byCampaign.get(cid)!.push(point);
    });
    campaigns.forEach((c) => {
      const d = byCampaign.get(c.id);
      if (d) (c as { daily?: typeof daily }).daily = d.sort((a, b) => a.date.localeCompare(b.date));
    });

    return NextResponse.json({
      campaigns,
      adsets,
      ads,
      daily,
      clientName: client.name,
      period: { since, until },
      compare: { previous: agg(prevRaw), lastMonth: agg(monthRaw) },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "메타 데이터를 불러오지 못했어요.";
    return NextResponse.json({ error: `메타 API 오류: ${message}` }, { status: 400 });
  }
}
