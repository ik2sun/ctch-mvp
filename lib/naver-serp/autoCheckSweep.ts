import { createAdminClient } from "@/lib/supabase/admin";
import { runKeywordRankCheck } from "./runCheck";

type KeywordRow = {
  id: string;
  user_id: string;
  keyword: string;
  target_domain: string;
  check_interval_hours: number | null;
};

export type SweepSummary = { total: number; due: number; succeeded: number; failed: number };

// 자동 체크 주기(check_interval_hours)가 설정된 키워드 중, 마지막 체크로부터 그 시간 이상
// 지난 것만 골라 다시 확인한다. 로컬 상주 스케줄러(instrumentation.ts)와 Vercel Cron 라우트
// 양쪽에서 공용으로 쓴다. RLS를 우회해야 하므로 service-role 클라이언트를 쓴다.
export async function sweepDueKeywordChecks(): Promise<SweepSummary> {
  const supabase = createAdminClient();

  const { data: keywords } = await supabase
    .from("competitor_keywords")
    .select("id, user_id, keyword, target_domain, check_interval_hours")
    .not("check_interval_hours", "is", null);

  if (!keywords || keywords.length === 0) {
    return { total: 0, due: 0, succeeded: 0, failed: 0 };
  }

  const { data: lastChecks } = await supabase
    .from("competitor_rank_checks")
    .select("keyword_id, checked_at")
    .in("keyword_id", keywords.map((k) => k.id))
    .order("checked_at", { ascending: false });

  const lastCheckedAt = new Map<string, string>();
  for (const row of lastChecks ?? []) {
    if (!lastCheckedAt.has(row.keyword_id)) lastCheckedAt.set(row.keyword_id, row.checked_at);
  }

  const now = Date.now();
  const due = (keywords as KeywordRow[]).filter((k) => {
    const last = lastCheckedAt.get(k.id);
    if (!last) return true;
    const elapsedHours = (now - new Date(last).getTime()) / 3_600_000;
    return elapsedHours >= (k.check_interval_hours ?? 24);
  });

  const outcomes = await Promise.allSettled(due.map((k) => runKeywordRankCheck(supabase, k)));
  const succeeded = outcomes.filter((o) => o.status === "fulfilled").length;
  const failed = outcomes.length - succeeded;

  return { total: keywords.length, due: due.length, succeeded, failed };
}
