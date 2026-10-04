import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dataOwnerId } from "@/lib/workspace";

// 광고주별 목표 ROAS(%) — GET: { targetRoas, rules, saved } (없으면 기본 500) / POST { targetRoas, rules }: 저장(50~5000%)
// rules = 캠페인 유형별 목표 {promo, ongoing, brand}(선택, 비우면 기본 목표를 따름). 0029 마이그레이션 필요.
// 소재 판정 기준이라 담당자가 직접 고치도록 워크스페이스 구성원 누구나 저장(캠페인 매니저 설정과 같은 방식).
const DEFAULT_TARGET_ROAS = 500; // route 파일은 핸들러 외 export 금지(Next 빌드 오류)
const KINDS = ["promo", "ongoing", "brand"] as const;

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

const valid = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 50 && n <= 5000 ? n : null;
};
function cleanRules(r: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (r && typeof r === "object") for (const k of KINDS) {
    const v = valid((r as Record<string, unknown>)[k]);
    if (v != null) out[k] = v;
  }
  return out;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await ctx(id);
  if (c.error) return c.error;
  const admin = createAdminClient();
  const first = await admin.from("clients").select("target_roas, target_roas_rules").eq("id", id).maybeSingle();
  // 0029 일부만 실행된 경우(target_roas_rules 없음) 대비
  const res = first.error ? await admin.from("clients").select("target_roas").eq("id", id).maybeSingle() : first;
  const error = res.error;
  const row = (res.data ?? {}) as { target_roas?: number | null; target_roas_rules?: unknown };
  const v = !error && row.target_roas != null ? Number(row.target_roas) : null;
  return NextResponse.json({ targetRoas: v ?? DEFAULT_TARGET_ROAS, rules: cleanRules(row.target_roas_rules), saved: v != null, ready: !error });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await ctx(id);
  if (c.error) return c.error;
  const body = (await req.json().catch(() => ({}))) as { targetRoas?: number | null; rules?: Record<string, number | null> };
  const v = body.targetRoas == null ? null : valid(body.targetRoas);
  if (body.targetRoas != null && v == null) return NextResponse.json({ error: "목표 ROAS는 50%~5,000% 사이로 넣어 주세요." }, { status: 400 });
  const rules = cleanRules(body.rules);
  const admin = createAdminClient();
  let { error } = await admin.from("clients").update({ target_roas: v, target_roas_rules: Object.keys(rules).length ? rules : null }).eq("id", id);
  if (error && !Object.keys(rules).length) ({ error } = await admin.from("clients").update({ target_roas: v }).eq("id", id));
  if (error) return NextResponse.json({ error: "저장하지 못했어요. supabase/migrations/0029_client_target_roas.sql을 실행했는지 확인하세요." }, { status: 500 });
  return NextResponse.json({ targetRoas: v ?? DEFAULT_TARGET_ROAS, rules, saved: v != null });
}
