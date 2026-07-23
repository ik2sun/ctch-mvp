import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// 대시보드용 경량 요약 — 계정 레벨만 조회 (현재기간 일별 + 직전기간 + 전월 동기간)
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

async function fetchAccount(
  act: string,
  token: string,
  since: string,
  until: string,
  daily: boolean,
) {
  const params = new URLSearchParams({
    access_token: token,
    level: "account",
    time_range: JSON.stringify({ since, until }),
    fields: ["impressions", "clicks", "spend", "actions", "action_values"].join(","),
    limit: "200",
  });
  if (daily) params.set("time_increment", "1");
  const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${act}/insights?${params}`);
  const json = await res.json();
  if (json.error) {
    const err = json.error as { message?: string; code?: number };
    const e = new Error(err.message ?? "오류") as Error & { code?: number };
    e.code = err.code;
    throw e;
  }
  return (json.data ?? []) as Record<string, unknown>[];
}

type Totals = { impressions: number; clicks: number; cost: number; conversions: number; revenue: number };

function agg(rows: Record<string, unknown>[]): Totals {
  return rows.reduce(
    (a: Totals, r) => ({
      impressions: a.impressions + n(r.impressions),
      clicks: a.clicks + n(r.clicks),
      cost: a.cost + n(r.spend),
      conversions: a.conversions + pickAction(r.actions as ActionItem[] | undefined, PURCHASE_TYPES),
      revenue: a.revenue + pickAction(r.action_values as ActionItem[] | undefined, PURCHASE_TYPES),
    }),
    { impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0 },
  );
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return NextResponse.json({ error: "META_ACCESS_TOKEN이 없어요." }, { status: 500 });

  const { clientId, since, until } = await req.json();
  if (!clientId || !since || !until) {
    return NextResponse.json({ error: "필수 값이 없어요." }, { status: 400 });
  }

  const { data: client } = await supabase
    .from("clients")
    .select("name, meta_account_id")
    .eq("id", clientId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!client?.meta_account_id) {
    return NextResponse.json({ error: "메타 계정이 연결되지 않았어요." }, { status: 400 });
  }
  const accountId = client.meta_account_id as string;
  const act = accountId.startsWith("act_") ? accountId : `act_${accountId}`;

  // 기간 길이만큼 앞선 직전 기간 / 한 달 전 동일 기간
  const days = Math.max(
    1,
    Math.round((new Date(until).getTime() - new Date(since).getTime()) / 86400000) + 1,
  );
  const prevSince = shift(since, -days);
  const prevUntil = shift(until, -days);
  const monthSince = shiftMonth(since, -1);
  const monthUntil = shiftMonth(until, -1);

  try {
    const [curDaily, prevRows, monthRows] = await Promise.all([
      fetchAccount(act, token, since, until, true),
      fetchAccount(act, token, prevSince, prevUntil, false),
      fetchAccount(act, token, monthSince, monthUntil, false),
    ]);

    const daily = curDaily
      .map((r) => ({
        date: (r.date_start as string) ?? "",
        impressions: n(r.impressions),
        clicks: n(r.clicks),
        cost: n(r.spend),
        conversions: pickAction(r.actions as ActionItem[] | undefined, PURCHASE_TYPES),
        revenue: pickAction(r.action_values as ActionItem[] | undefined, PURCHASE_TYPES),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      current: agg(curDaily),
      previous: agg(prevRows),
      lastMonth: agg(monthRows),
      daily,
      period: { since, until },
      prevPeriod: { since: prevSince, until: prevUntil },
      monthPeriod: { since: monthSince, until: monthUntil },
      clientName: client.name,
    });
  } catch (e) {
    const err = e as Error & { code?: number };
    const isLimit =
      err.code === 4 || err.code === 17 || /request limit|rate limit/i.test(err.message ?? "");
    return NextResponse.json(
      {
        error: isLimit
          ? "메타 API 호출 한도에 도달했어요. 잠시 후 다시 시도해 주세요."
          : `메타 API 오류: ${err.message}`,
      },
      { status: isLimit ? 429 : 400 },
    );
  }
}
