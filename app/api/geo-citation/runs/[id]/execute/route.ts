import { NextResponse } from "next/server";
import { canAccessRun, requireUser } from "@/features/geo-citation/auth";
import { executeRun } from "@/features/geo-citation/runner";

export const maxDuration = 300;

// 회차의 남은 질의를 시간 제한 안에서 처리하고 진행 상황을 돌려준다. finished가 false면 화면이 다시 호출한다.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const startedAt = Date.now();
  const auth = await requireUser();
  if (!auth) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const { id } = await params;
  if (!(await canAccessRun(auth.supabase, id))) return NextResponse.json({ error: "측정 회차를 찾지 못했어요." }, { status: 404 });
  try {
    return NextResponse.json(await executeRun(id, startedAt + 280_000));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "측정 중 오류가 발생했어요." }, { status: 500 });
  }
}
