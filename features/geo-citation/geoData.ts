// 브라우저용 데이터 접근 — 설정·질문은 RLS(본인 행)로 직접 읽고 쓰고, 측정 실행·수동 입력은 API를 거친다.
import { createClient } from "@/lib/supabase/client";
import type { GeoAnswer, GeoPrompt, GeoRun, GeoSettings, JourneyStage } from "./types";

const supabase = createClient();

export async function getSettings(clientId: string): Promise<GeoSettings | null> {
  const { data } = await supabase.from("geo_settings").select("*").eq("client_id", clientId).maybeSingle();
  return (data as GeoSettings) ?? null;
}

export async function saveSettings(s: GeoSettings): Promise<string | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return "로그인이 필요합니다.";
  const { error } = await supabase
    .from("geo_settings")
    .upsert({ ...s, user_id: auth.user.id, updated_at: new Date().toISOString() });
  return error ? error.message : null;
}

export async function listPrompts(clientId: string): Promise<GeoPrompt[]> {
  const { data } = await supabase.from("geo_prompts").select("*").eq("client_id", clientId).order("created_at");
  return (data as GeoPrompt[]) ?? [];
}

export async function addPrompts(clientId: string, items: { query: string; stage: JourneyStage; evidence?: string | null }[]) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return "로그인이 필요합니다.";
  const rows = items.map((i) => ({ client_id: clientId, user_id: auth.user!.id, query: i.query.trim(), stage: i.stage, evidence: i.evidence ?? null }));
  const { error } = await supabase.from("geo_prompts").upsert(rows, { onConflict: "client_id,query", ignoreDuplicates: true });
  return error ? error.message : null;
}

export async function updatePrompt(id: string, patch: Partial<Pick<GeoPrompt, "query" | "stage" | "active" | "evidence">>) {
  const { error } = await supabase.from("geo_prompts").update(patch).eq("id", id);
  return error ? error.message : null;
}

export async function deletePrompt(id: string) {
  const { error } = await supabase.from("geo_prompts").delete().eq("id", id);
  return error ? error.message : null;
}

export async function listRuns(clientId: string, limit = 20): Promise<GeoRun[]> {
  const { data } = await supabase
    .from("geo_runs")
    .select("*")
    .eq("client_id", clientId)
    .order("started_at", { ascending: false })
    .limit(limit);
  return (data as GeoRun[]) ?? [];
}

export async function listAnswers(runIds: string[]): Promise<GeoAnswer[]> {
  if (runIds.length === 0) return [];
  const { data } = await supabase
    .from("geo_answers")
    .select(
      "id, run_id, prompt_id, engine, model, query, stage, status, answer, citations, sources, mentioned, mention_order, mention_override, own_cited, own_cite_rank, competitors_mentioned, manual, cost_usd, error, answered_at",
    )
    .in("run_id", runIds);
  return (data as GeoAnswer[]) ?? [];
}

// 추이 그래프용 — 원문 없이 판정 값만
export type AnswerLite = Pick<GeoAnswer, "run_id" | "engine" | "status" | "mentioned" | "mention_override" | "own_cited">;
export async function listAnswerStats(runIds: string[]): Promise<AnswerLite[]> {
  if (runIds.length === 0) return [];
  const { data } = await supabase
    .from("geo_answers")
    .select("run_id, engine, status, mentioned, mention_override, own_cited")
    .in("run_id", runIds);
  return (data as AnswerLite[]) ?? [];
}

export async function setMentionOverride(answerId: string, value: boolean | null) {
  const { error } = await supabase.from("geo_answers").update({ mention_override: value }).eq("id", answerId);
  return error ? error.message : null;
}
