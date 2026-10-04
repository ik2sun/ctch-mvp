import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dataOwnerId } from "@/lib/workspace";

// 소재 판정 기록 — GET ?clientId=: 가장 최근 스냅숏 1회분 / POST {clientId, since, until, target, items}: 스냅숏 저장(신규 제외 판정만)
// 0030 마이그레이션 필요(없으면 GET은 ready:false). 담당자가 직접 남기도록 워크스페이스 구성원 누구나 저장.
type Item = { ad_id: string; ad_name?: string; adset_id?: string; status: string; reason?: string; roas?: number | null; conversions?: number; cost?: number };

async function ctx(clientId: string | null) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }) };
  if (!clientId) return { error: NextResponse.json({ error: "광고주가 필요해요." }, { status: 400 }) };
  const { data: client } = await supabase.from("clients").select("id").eq("id", clientId).eq("user_id", await dataOwnerId(user)).maybeSingle();
  if (!client) return { error: NextResponse.json({ error: "광고주를 찾을 수 없어요." }, { status: 403 }) };
  return { user };
}

export async function GET(req: Request) {
  const clientId = new URL(req.url).searchParams.get("clientId");
  const c = await ctx(clientId);
  if (c.error) return c.error;
  const admin = createAdminClient();
  const last = await admin.from("creative_decisions").select("snapshot_at").eq("client_id", clientId!).order("snapshot_at", { ascending: false }).limit(1);
  if (last.error) return NextResponse.json({ ready: false, snapshot: null, items: [] });
  const at = last.data?.[0]?.snapshot_at;
  if (!at) return NextResponse.json({ ready: true, snapshot: null, items: [] });
  const { data } = await admin.from("creative_decisions").select("*").eq("client_id", clientId!).eq("snapshot_at", at);
  const first = data?.[0];
  return NextResponse.json({
    ready: true,
    snapshot: first ? { at, since: first.period_since, until: first.period_until, target: first.target_roas, by: first.decided_by } : null,
    items: data ?? [],
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { clientId?: string; since?: string; until?: string; target?: number; items?: Item[] };
  const c = await ctx(body.clientId ?? null);
  if (c.error) return c.error;
  const items = (body.items ?? []).filter((i) => i.ad_id && i.status && i.status !== "new").slice(0, 1000);
  if (!items.length) return NextResponse.json({ error: "저장할 판정이 없어요." }, { status: 400 });
  const at = new Date().toISOString();
  const { error } = await createAdminClient()
    .from("creative_decisions")
    .insert(
      items.map((i) => ({
        client_id: body.clientId,
        snapshot_at: at,
        period_since: body.since ?? null,
        period_until: body.until ?? null,
        target_roas: body.target ?? null,
        ad_id: i.ad_id,
        ad_name: i.ad_name ?? null,
        adset_id: i.adset_id ?? null,
        status: i.status,
        reason: i.reason ?? null,
        roas: i.roas ?? null,
        conversions: i.conversions ?? null,
        cost: i.cost ?? null,
        decided_by: c.user!.email ?? null,
      })),
    );
  if (error) return NextResponse.json({ error: "저장하지 못했어요. supabase/migrations/0030_creative_decisions.sql을 실행했는지 확인하세요." }, { status: 500 });
  return NextResponse.json({ ok: true, at, count: items.length });
}
