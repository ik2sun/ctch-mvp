import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessRun, requireUser } from "@/features/geo-citation/auth";
import { detectMentions, finalizeCitations, normalizeDomain } from "@/features/geo-citation/analyze";

// 네이버 AI 브리핑 수동 입력 — 직접 검색한 결과의 답변 원문과 출처 URL을 회차의 질문에 붙인다.
// 글로벌 엔진과 합산하지 않도록 engine='naver'로 따로 저장한다.
export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { runId?: string; promptId?: string; answer?: string; urls?: string };
  if (!body.runId || !body.promptId) return NextResponse.json({ error: "회차와 질문을 지정해 주세요." }, { status: 400 });
  const run = await canAccessRun(auth.supabase, body.runId);
  if (!run) return NextResponse.json({ error: "측정 회차를 찾지 못했어요." }, { status: 404 });
  const answer = (body.answer ?? "").trim();
  if (!answer) return NextResponse.json({ error: "답변 원문을 붙여 넣어 주세요." }, { status: 400 });

  const db = createAdminClient();
  const [{ data: runRow }, { data: prompt }] = await Promise.all([
    db.from("geo_runs").select("settings_snapshot").eq("id", body.runId).single(),
    db.from("geo_prompts").select("id, query, stage").eq("id", body.promptId).eq("client_id", run.client_id).maybeSingle(),
  ]);
  if (!prompt) return NextResponse.json({ error: "질문을 찾지 못했어요." }, { status: 404 });
  const snap = runRow?.settings_snapshot ?? {};
  const settings = { own_domains: snap.own_domains ?? [], brand_terms: snap.brand_terms ?? [], competitors: snap.competitors ?? [] };

  const urls = (body.urls ?? "")
    .split(/\s+/)
    .map((u) => u.trim())
    .filter((u) => /^https?:\/\//.test(u));
  const citations = finalizeCitations(urls.map((url) => ({ url })), settings.own_domains.map(normalizeDomain));
  const m = detectMentions(answer, settings);
  const ownFirst = citations.find((c) => c.own);
  const row = {
    run_id: body.runId,
    prompt_id: prompt.id,
    client_id: run.client_id,
    user_id: auth.user.id,
    engine: "naver",
    model: "manual",
    query: prompt.query,
    stage: prompt.stage,
    status: "done",
    answer,
    citations,
    mentioned: m.mentioned,
    mention_order: m.mentionOrder,
    mention_override: null,
    competitors_mentioned: m.competitorsMentioned,
    own_cited: Boolean(ownFirst),
    own_cite_rank: ownFirst?.rank ?? null,
    manual: true,
    answered_at: new Date().toISOString(),
  };

  const { data: existing } = await db
    .from("geo_answers")
    .select("id")
    .eq("run_id", body.runId)
    .eq("prompt_id", prompt.id)
    .eq("engine", "naver")
    .maybeSingle();
  const { error } = existing
    ? await db.from("geo_answers").update(row).eq("id", existing.id)
    : await db.from("geo_answers").insert(row);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
