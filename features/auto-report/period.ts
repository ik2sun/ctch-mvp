// 자동 리포트 — 기간 계산·발송일 판정(순수, 한국 날짜 기준)
import type { CompareKey, PeriodKey, Schedule } from "./types";

export type Range = { since: string; until: string };
export type ReportPeriod = { cur: Range; prev: Range | null; label: string };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const add = (s: string, n: number) => {
  const d = day(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
const daysBetween = (a: string, b: string) => Math.round((day(b).getTime() - day(a).getTime()) / 86_400_000);
const lastDayOfMonth = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();

// 한국 날짜 'YYYY-MM-DD'
export function kstToday(now = new Date()): string {
  return iso(new Date(now.getTime() + 9 * 3600_000));
}
// 1=월 … 7=일
export function weekdayOf(s: string): number {
  const w = day(s).getUTCDay();
  return w === 0 ? 7 : w;
}

export function periodRange(period: PeriodKey, today: string): Range {
  const y = add(today, -1);
  switch (period) {
    case "yesterday":
      return { since: y, until: y };
    case "last7":
      return { since: add(today, -7), until: y };
    case "last_week": {
      const mon = add(today, -(weekdayOf(today) - 1) - 7);
      return { since: mon, until: add(mon, 6) };
    }
    case "this_month": {
      // 1일에 실행하면 이번 달 데이터가 없으니 지난달 전체
      if (today.endsWith("-01")) return periodRange("last_month", today);
      return { since: `${today.slice(0, 8)}01`, until: y };
    }
    case "last_month": {
      const d = day(today);
      const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
      const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0));
      return { since: iso(first), until: iso(last) };
    }
  }
}

export function compareRange(cur: Range, period: PeriodKey, compare: CompareKey): Range | null {
  if (compare === "none") return null;
  if (compare === "week_ago") return { since: add(cur.since, -7), until: add(cur.until, -7) };
  // 직전 같은 기간 — 월 단위는 전월 같은 날짜 범위(말일 보정)
  if (period === "last_month" || period === "this_month") {
    const s = day(cur.since);
    const pm = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() - 1, 1));
    const pLast = lastDayOfMonth(pm.getUTCFullYear(), pm.getUTCMonth());
    const e = day(cur.until);
    const untilDay = Math.min(e.getUTCDate(), pLast);
    const fullMonth = period === "last_month";
    return { since: iso(pm), until: iso(new Date(Date.UTC(pm.getUTCFullYear(), pm.getUTCMonth(), fullMonth ? pLast : untilDay))) };
  }
  const n = daysBetween(cur.since, cur.until) + 1;
  return { since: add(cur.since, -n), until: add(cur.since, -1) };
}

const md = (s: string) => `${Number(s.slice(5, 7))}.${Number(s.slice(8, 10))}`;
export function rangeLabel(r: Range): string {
  return r.since === r.until ? `${r.since.slice(0, 4)}.${md(r.since)}` : `${r.since.slice(0, 4)}.${md(r.since)}~${md(r.until)}`;
}

export function reportPeriod(s: Pick<Schedule, "period" | "compare">, today: string): ReportPeriod {
  const cur = periodRange(s.period, today);
  return { cur, prev: compareRange(cur, s.period, s.compare), label: rangeLabel(cur) };
}

// 오늘(한국 날짜) 보내는 날인지
export function isDue(s: Schedule, today: string): boolean {
  if (s.frequency === "daily") return true;
  if (s.frequency === "weekly") return weekdayOf(today) === (s.weekday || 1);
  const d = day(today);
  const want = Math.min(Math.max(1, s.monthDay || 1), lastDayOfMonth(d.getUTCFullYear(), d.getUTCMonth()));
  return d.getUTCDate() === want;
}

const WEEKDAYS = ["", "월", "화", "수", "목", "금", "토", "일"];
export function scheduleText(s: Schedule): string {
  const when = s.frequency === "daily" ? "매일" : s.frequency === "weekly" ? `매주 ${WEEKDAYS[s.weekday || 1]}요일` : `매월 ${s.monthDay || 1}일`;
  return `${when} 오전 8~9시`; // Vercel 크론(하루 1회, 23:00 UTC)은 그 시간대 안에서 실행
}
