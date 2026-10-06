import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveMetaToken } from "@/lib/meta/token";
import { MetaGraphError } from "@/lib/meta/graph";
import { fetchMetaDemographics } from "@/features/creative-analysis/fetchDemographics";

// 소재 분석(메타) — 소재별 실제 성별·연령대 성과(breakdowns=age,gender). 성별·연령대 항목을 쓸 때만 화면이 따로 부른다. 읽기 전용.
export const maxDuration = 120; // 광고 50개씩 4개 동시 조회(르무통 14일 실측은 아래 CLAUDE.md)

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { clientId, since, until, adIds } = (await req.json().catch(() => ({}))) as { clientId?: string; since?: string; until?: string; adIds?: string[] };
  if (adIds && (!Array.isArray(adIds) || adIds.length > 2000)) return NextResponse.json({ error: "adIds는 2,000개까지예요." }, { status: 400 });
  if (!clientId || !since || !until) return NextResponse.json({ error: "clientId, since, until이 필요해요." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || !/^\d{4}-\d{2}-\d{2}$/.test(until)) return NextResponse.json({ error: "날짜 형식이 맞지 않아요." }, { status: 400 });

  const { data: client } = await supabase.from("clients").select("name, meta_account_id, meta_access_token").eq("id", clientId).maybeSingle();
  if (!client) return NextResponse.json({ error: "광고주를 찾을 수 없어요." }, { status: 403 });
  if (!client.meta_account_id) return NextResponse.json({ error: `${client.name}에 메타 광고계정 ID가 없어요. 광고주 관리에서 등록해 주세요.` }, { status: 400 });
  const { token } = await resolveMetaToken(client.meta_access_token);
  if (!token) return NextResponse.json({ error: "메타 액세스 토큰이 없어요." }, { status: 400 });

  try {
    return NextResponse.json(await fetchMetaDemographics(client.meta_account_id, token, since, until, adIds));
  } catch (e) {
    const msg = e instanceof MetaGraphError ? e.message : e instanceof Error ? e.message : "메타 조회 실패";
    return NextResponse.json({ error: `메타 성별·연령 리포트 조회 실패 — ${msg}` }, { status: 502 });
  }
}
