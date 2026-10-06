import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dataOwnerId } from "@/lib/workspace";
import { cleanRules } from "@/features/creative-analysis/namingRules";

// 광고주별 소재 분석 규칙(소재명 사전 + UTM 값 사전) — GET: { rules | null, ready } / POST { rules | null }: 저장(null = 기본 규칙으로)
// 0032 마이그레이션 필요. 목표 ROAS와 같이 담당자가 직접 고치도록 워크스페이스 구성원 누구나 저장.
async function ctx(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }) };
  const { data: client } = await supabase.from("clients").select("id").eq("id", id).eq("user_id", await dataOwnerId(user)).maybeSingle();
  if (!client) return { error: NextResponse.json({ error: "광고주를 찾을 수 없어요." }, { status: 403 }) };
  return {};
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await ctx(id);
  if (c.error) return c.error;
  const { data, error } = await createAdminClient().from("clients").select("naming_rules").eq("id", id).maybeSingle();
  return NextResponse.json({ rules: error ? null : cleanRules((data as { naming_rules?: unknown } | null)?.naming_rules), ready: !error });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await ctx(id);
  if (c.error) return c.error;
  const body = (await req.json().catch(() => ({}))) as { rules?: unknown };
  const rules = body.rules == null ? null : cleanRules(body.rules);
  if (body.rules != null && !rules) return NextResponse.json({ error: "규칙 형식이 올바르지 않아요." }, { status: 400 });
  const saved = rules ? { ...rules, updatedAt: new Date().toISOString() } : null;
  const { error } = await createAdminClient().from("clients").update({ naming_rules: saved }).eq("id", id);
  if (error) return NextResponse.json({ error: "저장하지 못했어요. supabase/migrations/0032_client_naming_rules.sql을 실행했는지 확인하세요." }, { status: 500 });
  return NextResponse.json({ rules: saved });
}
