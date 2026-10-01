import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listBriefs, refreshBriefs } from "@/features/perf-manager/briefs";
import type { Role } from "@/lib/supabase/profile";

// 최신 정보 카드 — GET 목록(시드+DB), POST 웹 검색으로 새 소식 추가(뷰어 불가, 1회 약 $0.3~1)
export const maxDuration = 300;

async function currentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return { id: user.id, role: (data?.role ?? "viewer") as Role };
}

export async function GET() {
  if (!(await currentUser())) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  return NextResponse.json(await listBriefs());
}

export async function POST() {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (me.role === "viewer") return NextResponse.json({ error: "뷰어 권한으로는 업데이트할 수 없어요." }, { status: 403 });
  try {
    const r = await refreshBriefs();
    return NextResponse.json({ ...r, ...(await listBriefs()) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "업데이트 실패" }, { status: 500 });
  }
}
