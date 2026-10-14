import { createAdminClient } from "@/lib/supabase/admin";
import { SerpBlockedError } from "./rankChecker";
import { runKeywordRankCheck } from "./runCheck";

type KeywordRow = {
  id: string;
  user_id: string;
  keyword: string;
  target_domain: string | null;
  target_mall?: string | null;
  collect_sections?: string[] | null;
  check_interval_hours: number | null;
};

export type SweepSummary = { total: number; due: number; succeeded: number; failed: number; blocked?: boolean };

// 스윕은 15분(로컬)·하루 1회(Vercel Hobby 크론) 간격이라, 1시간 주기가 59분째에 걸리면 75분 뒤로 밀린다.
// 주기보다 10분 이르게 돌아와도 '주기가 됐다'고 본다.
const SLACK_HOURS = 10 / 60;

// 자동 체크 주기(check_interval_hours)가 설정되고 일시 중지(auto_paused)가 아닌 키워드 중, 마지막 체크로부터
// 그 시간 이상 지난 것만 골라 다시 확인한다. 로컬 상주 스케줄러(instrumentation.ts)와 Vercel Cron 라우트
// 양쪽에서 공용으로 쓴다. RLS를 우회해야 하므로 service-role 클라이언트를 쓴다.
export async function sweepDueKeywordChecks(): Promise<SweepSummary> {
  const supabase = createAdminClient();

  let { data: keywords, error } = await supabase
    .from("competitor_keywords")
    .select("id, user_id, keyword, target_domain, target_mall, collect_sections, check_interval_hours")
    .not("check_interval_hours", "is", null)
    .eq("auto_paused", false);
  // 0036 마이그레이션 전(collect_sections 없음) = 전부 수집
  if (error) {
    const { data } = await supabase
      .from("competitor_keywords")
      .select("id, user_id, keyword, target_domain, target_mall, check_interval_hours")
      .not("check_interval_hours", "is", null)
      .eq("auto_paused", false);
    keywords = data as typeof keywords;
  }

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
    return elapsedHours >= (k.check_interval_hours ?? 24) - SLACK_HOURS;
  });

  // 네이버 요청은 어차피 한 줄 대기열이라 차례대로 돌리고, 이용 제한이 걸리면 나머지는 다음 스윕으로 미룬다.
  let succeeded = 0;
  let failed = 0;
  let blocked = false;
  for (const k of due) {
    try {
      await runKeywordRankCheck(supabase, k);
      succeeded++;
    } catch (e) {
      failed++;
      if (e instanceof SerpBlockedError) {
        blocked = true;
        break;
      }
    }
  }

  return { total: keywords.length, due: due.length, succeeded, failed, blocked };
}
