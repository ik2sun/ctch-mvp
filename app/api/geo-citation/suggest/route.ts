import { NextResponse } from "next/server";
import { requireUser } from "@/features/geo-citation/auth";
import { suggestPrompts } from "@/features/geo-citation/suggest";
import { describeApiError } from "@/features/seo-analysis/diagnose";

export const maxDuration = 300;

// 페이지 URL → 비브랜드 질문 초안(여정 단계·추출 근거 포함). 저장은 화면에서 고른 뒤 한다.
export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "서버에 ANTHROPIC_API_KEY가 없어요." }, { status: 500 });
  const body = (await req.json().catch(() => ({}))) as { url?: string; brandTerms?: string[]; count?: number; existing?: string[] };
  if (!body.url?.trim()) return NextResponse.json({ error: "페이지 URL을 입력해 주세요." }, { status: 400 });
  try {
    const prompts = await suggestPrompts({
      url: body.url.trim(),
      brandTerms: (body.brandTerms ?? []).slice(0, 20),
      count: Math.min(Math.max(body.count ?? 10, 4), 20),
      existing: (body.existing ?? []).slice(0, 100),
    });
    return NextResponse.json({ prompts });
  } catch (e) {
    return NextResponse.json({ error: describeApiError(e) }, { status: 500 });
  }
}
