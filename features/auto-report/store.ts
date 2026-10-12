// 자동 리포트 저장소·생성·발송 — 서버 전용. auto_reports·auto_report_runs는 RLS 정책이 없어 service_role로만 읽고 쓴다
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { CLIENT_MEDIA_COLUMNS, fetchClientCampaigns } from "@/features/correlation/fetchClient";
import { writeComments } from "./ai";
import { computeReport, earliestNeeded } from "./compute";
import { buildNaverSections } from "./naverSections";
import { fetchNaverDetail } from "@/lib/naver-ad/statReport";
import { resolveNaverAdCredentials } from "@/lib/naver-ad/auth";
import { kstToday, rangeLabel, reportPeriod } from "./period";
import { fillVars, renderHtml, renderXlsx } from "./render";
import { DEFAULT_SCHEDULE, NAVER_DETAIL_TYPES, type AutoReport, type ReportOptions, type ReportRun, type ReportSpec, type Schedule } from "./types";

const MISSING = /Could not find the table|relation .* does not exist|column .* does not exist/i;
export function migrationHint(e: { message?: string } | null | undefined): string | null {
  return e?.message && MISSING.test(e.message) ? "자동 리포트 테이블이 없어요. supabase/migrations/0033_auto_reports.sql을 Supabase SQL Editor에서 실행해 주세요." : null;
}

type Row = {
  id: string;
  client_id: string;
  name: string;
  enabled: boolean;
  spec: ReportSpec;
  source: AutoReport["source"];
  schedule: Schedule;
  recipients: string[];
  options: ReportOptions;
  last_run_at: string | null;
  last_status: string | null;
  updated_at: string | null;
  updated_by: string | null;
};

const fromRow = (r: Row): AutoReport => ({
  id: r.id,
  clientId: r.client_id,
  name: r.name,
  enabled: r.enabled,
  spec: r.spec,
  source: r.source,
  schedule: { ...DEFAULT_SCHEDULE, ...r.schedule },
  recipients: r.recipients ?? [],
  options: { ...{ attachXlsx: true, media: [] as string[] }, ...(r.options ?? {}) },
  lastRunAt: r.last_run_at,
  lastStatus: r.last_status,
  updatedAt: r.updated_at,
  updatedBy: r.updated_by,
});

export async function listReports(clientId: string): Promise<AutoReport[]> {
  const { data, error } = await createAdminClient().from("auto_reports").select("*").eq("client_id", clientId).order("created_at");
  if (error) throw new Error(migrationHint(error) ?? error.message);
  return (data as Row[]).map(fromRow);
}

export async function listRuns(clientId: string, limit = 30): Promise<ReportRun[]> {
  const { data, error } = await createAdminClient()
    .from("auto_report_runs")
    .select("id, report_id, trigger, status, period, subject, sent_to, error, created_by, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(migrationHint(error) ?? error.message);
  return (data ?? []).map((r) => ({ id: r.id, reportId: r.report_id, trigger: r.trigger, status: r.status, period: r.period, subject: r.subject, sentTo: r.sent_to, error: r.error, createdBy: r.created_by, createdAt: r.created_at }));
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function cleanRecipients(v: unknown): string[] {
  return [...new Set((Array.isArray(v) ? v : String(v ?? "").split(/[,;\s]+/)).map((x) => String(x).trim().toLowerCase()).filter((x) => EMAIL.test(x)))].slice(0, 30);
}

export async function saveReport(r: AutoReport, by: string): Promise<AutoReport> {
  const row = {
    client_id: r.clientId,
    name: r.name.trim().slice(0, 60) || "자동 리포트",
    enabled: !!r.enabled,
    spec: r.spec,
    source: r.source,
    schedule: r.schedule,
    recipients: cleanRecipients(r.recipients),
    options: r.options,
    updated_by: by,
    updated_at: new Date().toISOString(),
  };
  const db = createAdminClient().from("auto_reports");
  const q = r.id ? db.update(row).eq("id", r.id).eq("client_id", r.clientId).select("*").single() : db.insert({ ...row, created_by: by }).select("*").single();
  const { data, error } = await q;
  if (error) throw new Error(migrationHint(error) ?? error.message);
  return fromRow(data as Row);
}

export async function deleteReport(id: string, clientId: string) {
  const { error } = await createAdminClient().from("auto_reports").delete().eq("id", id).eq("client_id", clientId);
  if (error) throw new Error(migrationHint(error) ?? error.message);
}

export async function getReport(id: string, clientId?: string): Promise<AutoReport | null> {
  let q = createAdminClient().from("auto_reports").select("*").eq("id", id);
  if (clientId) q = q.eq("client_id", clientId);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(migrationHint(error) ?? error.message);
  return data ? fromRow(data as Row) : null;
}

// 연동된 매체 키(학습 프롬프트·화면 표시용)
export async function connectedMedia(clientId: string): Promise<{ name: string; media: string[] }> {
  const { data } = await createAdminClient().from("clients").select(CLIENT_MEDIA_COLUMNS).eq("id", clientId).maybeSingle();
  const c = (data ?? {}) as Record<string, unknown>;
  const media = [
    c.meta_account_id && "meta",
    c.naver_ad_customer_id && "naver",
    c.gfa_customer_id && "gfa",
    c.kakao_ad_account_id && "kakao",
    c.google_ads_customer_id && "google_ads",
  ].filter(Boolean) as string[];
  return { name: String(c.name ?? ""), media };
}

export type Generated = { subject: string; html: string; xlsx: Buffer | null; period: ReportRun["period"]; warnings: string[] };

// 리포트 한 건 생성(발송 X) — 매체 조회는 비교 기간까지 한 번에(호출 수 절약) 받아 날짜로 나눈다
export async function generate(report: AutoReport, today = kstToday()): Promise<Generated> {
  const admin = createAdminClient();
  const { data: client, error } = await admin.from("clients").select(CLIENT_MEDIA_COLUMNS).eq("id", report.clientId).maybeSingle();
  if (error || !client) throw new Error("광고주 정보를 읽지 못했어요.");
  const clientName = String((client as Record<string, unknown>).name ?? "");
  const p = reportPeriod(report.schedule, today);
  const secs = report.spec.sections;
  const weeks = Math.max(0, ...secs.filter((s) => s.type === "weekly_table").map((s) => Math.min(12, Math.max(1, s.weeks ?? 4))));
  const achievement = secs.some((s) => s.type === "achievement");
  const since = earliestNeeded(p.cur, p.prev, { weeks, achievement });
  const row = client as Record<string, unknown>;
  const wantNaver = (secs.some((s) => NAVER_DETAIL_TYPES.includes(s.type)) || !!report.options.naverRaw) && !!row.naver_ad_customer_id && (!report.options.media.length || report.options.media.includes("naver"));
  // 캠페인 일별(전 매체)과 네이버 상세 보고서를 동시에
  const [res, naver] = await Promise.all([
    fetchClientCampaigns(admin, report.clientId, row, since, p.cur.until),
    wantNaver
      ? (async () => {
          const cr = await resolveNaverAdCredentials(row as never);
          return buildNaverSections(cr, await fetchNaverDetail(cr, p.cur.since, p.cur.until), !!report.options.naverRaw);
        })().catch((e: Error) => e)
      : Promise.resolve(null),
  ]);
  const warnings = res.media.filter((m) => m.error).map((m) => `${m.label}: ${m.error}`);
  if (naver instanceof Error) warnings.push(`네이버 SA 상세(키워드·상품·기기): ${naver.message}`);
  else if (naver?.missingDays.length) warnings.push(`네이버 SA 상세: ${naver.missingDays.join(", ")} 보고서를 받지 못해 빠졌어요`);
  const data = computeReport(res.campaigns, p.cur, p.prev, report.options.media, { weeks, achievement });
  if (naver && !(naver instanceof Error)) data.naver = naver;
  const compareLabel = p.prev ? rangeLabel(p.prev) : null;
  const texts = await writeComments({ spec: report.spec, data, clientName, periodLabel: p.label, compareLabel });
  const input = { spec: report.spec, data, clientName, periodLabel: p.label, compareLabel, texts };
  let html = renderHtml(input);
  if (warnings.length) html = `<div style="font-family:sans-serif;font-size:12px;color:#B42318;background:#FEF3F2;padding:8px 12px;margin-bottom:8px">일부 매체를 불러오지 못해 빠졌어요 — ${warnings.map((w) => w.replace(/[<>&]/g, "")).join(" / ")}</div>${html}`;
  return {
    subject: fillVars(report.spec.subject, { client: clientName, period: p.label }),
    html,
    xlsx: report.options.attachXlsx ? renderXlsx(input) : null,
    period: { since: p.cur.since, until: p.cur.until, compareSince: p.prev?.since, compareUntil: p.prev?.until },
    warnings,
  };
}

// touch = 리포트의 최근 실행 시각 갱신(같은 날 자동 발송을 건너뛰는 기준) — 나에게 테스트 발송은 false
export async function logRun(r: { report: AutoReport; trigger: ReportRun["trigger"]; status: ReportRun["status"]; g?: Generated; sentTo?: string[]; error?: string; by: string; touch?: boolean }) {
  const admin = createAdminClient();
  await admin.from("auto_report_runs").insert({
    report_id: r.report.id,
    client_id: r.report.clientId,
    trigger: r.trigger,
    status: r.status,
    period: r.g?.period ?? null,
    subject: r.g?.subject ?? null,
    html: r.trigger === "preview" ? null : r.g?.html ?? null, // 미리보기 본문은 저장하지 않음
    sent_to: r.sentTo ?? null,
    error: r.error ?? null,
    created_by: r.by,
  });
  if (r.trigger !== "preview" && r.touch !== false) await admin.from("auto_reports").update({ last_run_at: new Date().toISOString(), last_status: r.status === "error" ? `오류: ${(r.error ?? "").slice(0, 200)}` : "발송" }).eq("id", r.report.id);
}

export async function sendReport(report: AutoReport, g: Generated, to = report.recipients) {
  if (!to.length) throw new Error("받는 사람이 없어요.");
  const file = `${g.subject.replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 80)}.xlsx`;
  await sendEmail({
    to,
    subject: g.subject,
    html: g.html,
    attachments: g.xlsx ? [{ filename: file, content: g.xlsx.toString("base64") }] : undefined,
  });
}
