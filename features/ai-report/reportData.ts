import { createClient } from "@/lib/supabase/client";
import type { MetricSummary } from "./calcMetrics";

const supabase = createClient();

export type SavedReport = {
  id: string;
  client_id: string;
  title: string;
  report_date: string | null;
  sheet_name: string | null;
  summary: MetricSummary;
  ai_comment: string | null;
  created_at: string;
};

export type SaveReportInput = {
  clientId: string;
  title: string;
  reportDate: string | null;
  sheetName: string | null;
  summary: MetricSummary;
  aiComment: string | null;
};

export async function saveReport(input: SaveReportInput) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다.");
  return supabase.from("reports").insert({
    user_id: user.id,
    client_id: input.clientId,
    title: input.title,
    report_date: input.reportDate,
    sheet_name: input.sheetName,
    summary: input.summary,
    ai_comment: input.aiComment,
  });
}

// 특정 광고주의 저장된 리포트 목록
export async function listReports(clientId: string): Promise<SavedReport[]> {
  const { data } = await supabase
    .from("reports")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  return (data ?? []) as SavedReport[];
}

export async function deleteReport(id: string) {
  return supabase.from("reports").delete().eq("id", id);
}
