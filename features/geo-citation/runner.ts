// 서버 전용 — 측정 회차 생성·실행. 수동 실행(화면이 execute를 반복 호출)과 크론이 같은 경로를 쓴다.
// 서버리스 시간 제한(300초) 안에서 끊어 처리하고, 남은 pending은 다음 호출이 이어받는다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { detectMentions, finalizeCitations, normalizeDomain } from "./analyze";
import { askEngine, engineReady } from "./engines";
import { API_ENGINES, inAutoPeriod, type ApiEngine, type GeoSettings } from "./types";

const CONCURRENCY = 6;
const STALE_RUNNING_MS = 5 * 60 * 1000; // 이보다 오래 running이면 중단된 것으로 보고 다시 처리

export async function loadSettings(db: SupabaseClient, clientId: string): Promise<GeoSettings | null> {
  const { data } = await db.from("geo_settings").select("*").eq("client_id", clientId).maybeSingle();
  return (data as GeoSettings) ?? null;
}

export async function createRun(
  db: SupabaseClient,
  opts: { clientId: string; userId: string; trigger: "manual" | "cron"; engines?: ApiEngine[] },
): Promise<{ runId: string; total: number; skipped: ApiEngine[] }> {
  const settings = await loadSettings(db, opts.clientId);
  if (!settings || settings.own_domains.length === 0) throw new Error("먼저 자사 도메인을 설정해 주세요.");
  if (settings.measure_mode === "off") throw new Error("설정에서 '측정 안 함'으로 되어 있어요. 측정하려면 설정을 바꿔 주세요.");
  const wanted = (opts.engines?.length ? opts.engines : settings.engines).filter((e) => API_ENGINES.includes(e));
  const engines = wanted.filter(engineReady);
  const skipped = wanted.filter((e) => !engineReady(e));
  if (engines.length === 0) throw new Error("사용할 수 있는 엔진이 없어요. API 키를 확인해 주세요.");

  const { data: prompts } = await db
    .from("geo_prompts")
    .select("id, query, stage")
    .eq("client_id", opts.clientId)
    .eq("active", true)
    .order("created_at");
  if (!prompts?.length) throw new Error("측정할 질문이 없어요. 질문 세트를 먼저 등록해 주세요.");

  const snapshot = {
    own_domains: settings.own_domains,
    brand_terms: settings.brand_terms,
    competitors: settings.competitors,
  };
  const { data: run, error } = await db
    .from("geo_runs")
    .insert({
      client_id: opts.clientId,
      user_id: opts.userId,
      trigger: opts.trigger,
      engines,
      total: prompts.length * engines.length,
      settings_snapshot: snapshot,
    })
    .select("id")
    .single();
  if (error || !run) throw new Error(`측정 회차를 만들지 못했어요: ${error?.message ?? ""}`);

  const rows = prompts.flatMap((p) =>
    engines.map((engine) => ({
      run_id: run.id,
      prompt_id: p.id,
      client_id: opts.clientId,
      user_id: opts.userId,
      engine,
      query: p.query,
      stage: p.stage,
    })),
  );
  const { error: insErr } = await db.from("geo_answers").insert(rows);
  if (insErr) throw new Error(`응답 행을 만들지 못했어요: ${insErr.message}`);
  return { runId: run.id, total: rows.length, skipped };
}

type Pending = { id: string; engine: ApiEngine; query: string };

async function processOne(db: SupabaseClient, row: Pending, settings: Pick<GeoSettings, "own_domains" | "brand_terms" | "competitors">) {
  // 선점 — 화면의 execute 호출과 크론이 같은 행을 동시에 처리하지 않도록 pending일 때만 가져간다
  const { data: claimed } = await db
    .from("geo_answers")
    .update({ status: "running", created_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("status", "pending")
    .select("id");
  if (!claimed?.length) return;
  try {
    const r = await askEngine(row.engine, row.query);
    const own = settings.own_domains.map(normalizeDomain).filter(Boolean);
    const citations = finalizeCitations(r.citations, own);
    const sources = finalizeCitations(r.sources, own);
    const m = detectMentions(r.answer, settings);
    const ownFirst = citations.find((c) => c.own);
    await db
      .from("geo_answers")
      .update({
        status: "done",
        model: r.model,
        answer: r.answer,
        citations,
        sources,
        mentioned: m.mentioned,
        mention_order: m.mentionOrder,
        competitors_mentioned: m.competitorsMentioned,
        own_cited: Boolean(ownFirst),
        own_cite_rank: ownFirst?.rank ?? null,
        usage: r.usage,
        cost_usd: r.costUsd,
        error: null,
        answered_at: new Date().toISOString(),
      })
      .eq("id", row.id);
  } catch (e) {
    await db
      .from("geo_answers")
      .update({ status: "error", error: e instanceof Error ? e.message : String(e), answered_at: new Date().toISOString() })
      .eq("id", row.id);
  }
}

// 회차의 pending 응답을 마감 시각까지 처리하고 진행 상황을 갱신한다
export async function executeRun(runId: string, deadlineMs: number) {
  const db = createAdminClient();
  const { data: run } = await db.from("geo_runs").select("id, client_id, status, settings_snapshot").eq("id", runId).single();
  if (!run) throw new Error("측정 회차를 찾지 못했어요.");

  // 도중에 '측정 안 함'으로 바꿨으면 남은 질의를 호출하지 않고 회차를 닫는다
  const current = await loadSettings(db, run.client_id);
  if (current?.measure_mode === "off") {
    await db
      .from("geo_answers")
      .update({ status: "error", error: "'측정 안 함' 설정으로 중단", answered_at: new Date().toISOString() })
      .eq("run_id", runId)
      .eq("status", "pending");
    return refreshRunProgress(runId);
  }
  const settings = {
    own_domains: run.settings_snapshot?.own_domains ?? [],
    brand_terms: run.settings_snapshot?.brand_terms ?? [],
    competitors: run.settings_snapshot?.competitors ?? [],
  };

  // 오래 멈춰 있는 running(이전 호출이 시간 제한에 걸린 경우)은 다시 pending으로
  await db
    .from("geo_answers")
    .update({ status: "pending" })
    .eq("run_id", runId)
    .eq("status", "running")
    .lt("created_at", new Date(Date.now() - STALE_RUNNING_MS).toISOString());

  const { data: pending } = await db
    .from("geo_answers")
    .select("id, engine, query")
    .eq("run_id", runId)
    .eq("status", "pending")
    .order("created_at");
  const queue = [...((pending ?? []) as Pending[])];

  // 엔진이 섞이도록 동시에 처리 — 한 호출은 최대 150초라 마감 150초 전까지만 새 작업을 꺼낸다
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length && Date.now() < deadlineMs - 150_000) {
      const row = queue.shift()!;
      await processOne(db, row, settings);
    }
  });
  await Promise.all(workers);
  return refreshRunProgress(runId);
}

export async function refreshRunProgress(runId: string) {
  const db = createAdminClient();
  const { data: rows } = await db.from("geo_answers").select("status, cost_usd, manual").eq("run_id", runId);
  const auto = (rows ?? []).filter((r) => !r.manual);
  const completed = auto.filter((r) => r.status === "done" || r.status === "error").length;
  const cost = auto.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
  const finished = completed >= auto.length;
  const allFailed = finished && auto.length > 0 && auto.every((r) => r.status === "error");
  await db
    .from("geo_runs")
    .update({
      completed,
      cost_usd: cost,
      status: finished ? (allFailed ? "failed" : "done") : "running",
      finished_at: finished ? new Date().toISOString() : null,
    })
    .eq("id", runId);
  return { completed, total: auto.length, finished, costUsd: cost };
}

// 자동 측정 — measure_mode='auto'이고 오늘이 자동 기간(auto_start~auto_end, 한국 날짜) 안이며
// 마지막 회차 후 interval_days가 지난 광고주만 새 회차를 만들고, 끝나지 않은 회차는 이어서 처리한다.
// 크론(/api/cron/geo-citation-check, 매시)과 로컬 상주 타이머가 공용으로 쓴다.
const INTERVAL_SLACK_MS = 60 * 60 * 1000; // 매시 크론 시각이 조금씩 밀려도 하루씩 늦어지지 않도록

export async function sweepGeoAuto(deadlineMs: number) {
  const db = createAdminClient();
  const summary = { created: 0, continued: 0, errors: [] as string[] };

  const { data: open } = await db.from("geo_runs").select("id").eq("status", "running").order("started_at");
  for (const r of open ?? []) {
    if (Date.now() > deadlineMs - 160_000) break;
    await executeRun(r.id, deadlineMs);
    summary.continued += 1;
  }

  const { data: targets } = await db
    .from("geo_settings")
    .select("client_id, user_id, interval_days, auto_start, auto_end")
    .eq("measure_mode", "auto");
  for (const t of targets ?? []) {
    if (Date.now() > deadlineMs - 160_000) break;
    if (!inAutoPeriod(t)) continue;
    const { data: last } = await db
      .from("geo_runs")
      .select("started_at")
      .eq("client_id", t.client_id)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const intervalMs = (t.interval_days ?? 7) * 24 * 3_600_000 - INTERVAL_SLACK_MS;
    if (last && Date.now() - new Date(last.started_at).getTime() < intervalMs) continue;
    try {
      const { runId } = await createRun(db, { clientId: t.client_id, userId: t.user_id, trigger: "cron" });
      summary.created += 1;
      await executeRun(runId, deadlineMs);
    } catch (e) {
      summary.errors.push(`${t.client_id}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return summary;
}
