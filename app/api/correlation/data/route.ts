import { dataOwnerId } from "@/lib/workspace";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CLIENT_MEDIA_COLUMNS, fetchClientCampaigns } from "@/features/correlation/fetchClient";

// 상관관계 분석 — 연동된 매체의 캠페인 단위 일별 지표(목표 포함). 매체별로 독립 조회, 병렬.
export const maxDuration = 180;

const MAX_DAYS = 180;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { clientId, since, until } = (await req.json().catch(() => ({}))) as { clientId?: string; since?: string; until?: string };
  if (!clientId || !since || !until) return NextResponse.json({ error: "필수 값이 없어요." }, { status: 400 });
  const days = Math.round((new Date(until).getTime() - new Date(since).getTime()) / 86400000) + 1;
  if (!(days > 0 && days <= MAX_DAYS)) return NextResponse.json({ error: `기간은 1~${MAX_DAYS}일만 가능해요.` }, { status: 400 });

  const { data: client } = await supabase
    .from("clients")
    .select(CLIENT_MEDIA_COLUMNS)
    .eq("id", clientId)
    .eq("user_id", await dataOwnerId(user))
    .maybeSingle();
  if (!client) return NextResponse.json({ error: "광고주를 찾을 수 없어요." }, { status: 403 });

  return NextResponse.json(await fetchClientCampaigns(supabase, clientId, client as Record<string, unknown>, since, until));
}
