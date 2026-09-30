import { NextResponse } from "next/server";
import { requireUser } from "@/features/geo-citation/auth";
import { ENGINE_ENV, ENGINE_MODEL, engineReady } from "@/features/geo-citation/engines";
import { API_ENGINES } from "@/features/geo-citation/types";

// 엔진별 키 설정 여부·모델 (값은 내보내지 않음)
export async function GET() {
  if (!(await requireUser())) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  return NextResponse.json({
    engines: API_ENGINES.map((e) => ({ engine: e, ready: engineReady(e), env: ENGINE_ENV[e], model: ENGINE_MODEL[e]() })),
  });
}
