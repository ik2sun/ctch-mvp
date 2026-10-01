import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveMetaToken } from "@/lib/meta/token";
import { resolveNaverAdCredentials } from "@/lib/naver-ad/auth";
import { metaApply, metaPlan, naverApply, naverPlan, unsupportedPlan } from "@/features/media-mix/sync";
import type { MediaSyncPlan, MediaSyncResult } from "@/features/media-mix/syncTypes";
import type { Role } from "@/lib/supabase/profile";

// 미디어믹스 예산 동기화
//  action=plan  : 매체 일 예산 목표 → 실제 캠페인(광고세트)별 새 일 예산 계획(읽기 전용)
//  action=apply : 같은 계획을 서버에서 다시 만들어, 화면이 확인한 계획(expected)과 같을 때만 실제 예산을 바꾼다
// 뷰어는 실행 불가. 실행 결과는 media_mix_syncs(0018)에 남긴다(테이블이 없으면 기록만 건너뜀).
export const maxDuration = 120;

const LABEL: Record<string, string> = { meta: "메타", naver: "네이버 SA", gfa: "GFA", kakao: "카카오모먼트" };
const APPLY_ROLES: Role[] = ["superadmin", "admin", "manager"];

type Body = {
  action: "plan" | "apply";
  clientId: string;
  targets: Record<string, number>; // 매체 → 일 예산(원)
  expected?: Record<string, { id: string; newDaily: number }[]>;
  context?: Record<string, unknown>; // 기록용(목표·총예산·예측)
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.clientId || !body.targets || !["plan", "apply"].includes(body.action)) {
    return NextResponse.json({ error: "필수 값이 없어요." }, { status: 400 });
  }
  const targets = Object.fromEntries(
    Object.entries(body.targets).filter(([k, v]) => LABEL[k] && Number.isFinite(v) && v >= 0),
  ) as Record<string, number>;
  if (!Object.keys(targets).length) return NextResponse.json({ error: "동기화할 매체가 없어요." }, { status: 400 });

  if (body.action === "apply") {
    const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (!APPLY_ROLES.includes(prof?.role as Role)) {
      return NextResponse.json({ error: "뷰어 권한으로는 실제 예산을 바꿀 수 없어요." }, { status: 403 });
    }
  }

  const { data: client } = await supabase
    .from("clients")
    .select("id, name, meta_account_id, meta_access_token, naver_ad_api_key, naver_ad_secret, naver_ad_customer_id")
    .eq("id", body.clientId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!client) return NextResponse.json({ error: "광고주를 찾을 수 없어요." }, { status: 403 });

  // 계획 — 매체별로 독립(한 매체 실패가 다른 매체를 막지 않음)
  const metaToken = targets.meta != null ? (await resolveMetaToken(client.meta_access_token)).token : null;
  let metaOffset = 1;
  let naverCreds: Awaited<ReturnType<typeof resolveNaverAdCredentials>> | null = null;
  const plans: MediaSyncPlan[] = [];
  for (const [key, target] of Object.entries(targets)) {
    try {
      if (key === "meta") {
        if (!client.meta_account_id || !metaToken) throw new Error("메타 광고계정 또는 토큰이 없어요.");
        const p = await metaPlan(client.meta_account_id, metaToken, target);
        metaOffset = p.offset;
        const { offset: _o, ...plan } = p;
        void _o;
        plans.push(plan);
      } else if (key === "naver") {
        naverCreds = await resolveNaverAdCredentials(client);
        plans.push(await naverPlan(naverCreds, target));
      } else {
        plans.push(unsupportedPlan(key, LABEL[key], target));
      }
    } catch (e) {
      plans.push({ key, label: LABEL[key], supported: true, targetDaily: target, units: [], skipped: [], error: e instanceof Error ? e.message : "계획을 만들지 못했어요." });
    }
  }

  if (body.action === "plan") return NextResponse.json({ plans });

  // 실행 — 화면이 확인한 계획과 다르면(그새 매체에서 예산이 바뀐 경우 등) 멈춘다
  const expected = body.expected ?? {};
  for (const p of plans) {
    if (!p.supported || p.error || !expected[p.key]) continue;
    const exp = expected[p.key];
    const same =
      exp.length === p.units.length &&
      p.units.every((u) => exp.some((e) => e.id === u.id && Math.abs(e.newDaily - u.newDaily) <= Math.max(10, u.newDaily * 0.01)));
    if (!same) {
      return NextResponse.json({ error: `${p.label} 캠페인 예산이 그사이 바뀌었어요. 계획을 다시 확인해 주세요.`, plans }, { status: 409 });
    }
  }

  const results: MediaSyncResult[] = [];
  for (const p of plans) {
    if (!p.supported || p.error || !expected[p.key] || !p.units.length) continue;
    try {
      const r = p.key === "meta" ? await metaApply(p.units, metaToken!, metaOffset) : await naverApply(p.units, naverCreds!);
      results.push({ key: p.key, label: p.label, results: r });
    } catch (e) {
      results.push({ key: p.key, label: p.label, results: [], error: e instanceof Error ? e.message : "실패" });
    }
  }

  const { error: logError } = await supabase.from("media_mix_syncs").insert({
    client_id: client.id,
    user_id: user.id,
    targets,
    context: body.context ?? {},
    results,
  });

  return NextResponse.json({ plans, results, logged: !logError });
}
