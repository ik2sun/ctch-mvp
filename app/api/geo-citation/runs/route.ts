import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessClient, requireUser } from "@/features/geo-citation/auth";
import { createRun } from "@/features/geo-citation/runner";
import { API_ENGINES, type ApiEngine } from "@/features/geo-citation/types";

// 측정 회차 생성 — 실행은 화면이 /runs/[id]/execute 를 반복 호출해 진행한다
export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const { clientId, engines } = (await req.json().catch(() => ({}))) as { clientId?: string; engines?: string[] };
  if (!clientId || !(await canAccessClient(auth.supabase, clientId))) {
    return NextResponse.json({ error: "광고주를 찾지 못했어요." }, { status: 404 });
  }
  const picked = (engines ?? []).filter((e): e is ApiEngine => (API_ENGINES as readonly string[]).includes(e));
  try {
    const result = await createRun(createAdminClient(), { clientId, userId: auth.user.id, trigger: "manual", engines: picked });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "측정을 시작하지 못했어요." }, { status: 400 });
  }
}
