// Vercel Cron 없이 로컬 서버만 상주시켜 배포하는 경우를 위한 대체 스케줄러.
// 서버 프로세스가 켜져 있는 동안에만 동작하며(터미널을 닫거나 PC가 꺼지면 자동 체크도 멈춤),
// Vercel 등에 배포해 크론을 쓸 수 있게 되면 app/api/cron/competitor-rank-check, app/api/cron/brand-keyword-check가
// 같은 로직을 대신한다.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const g = globalThis as unknown as { __competitorSweepStarted?: boolean };
  if (g.__competitorSweepStarted) return;
  g.__competitorSweepStarted = true;

  const SWEEP_INTERVAL_MS = 15 * 60 * 1000; // 15분마다 "체크 주기가 된 키워드가 있는지" 확인

  async function runSweep() {
    try {
      const { sweepDueKeywordChecks } = await import("@/lib/naver-serp/autoCheckSweep");
      const summary = await sweepDueKeywordChecks();
      if (summary.due > 0) {
        console.log(
          `[competitor-monitor] 자동 체크: 대상 ${summary.due}개 중 성공 ${summary.succeeded}개, 실패 ${summary.failed}개`,
        );
      }
    } catch (e) {
      console.error("[competitor-monitor] 자동 체크 스윕 실패:", e);
    }
  }

  async function runBrandSweep() {
    try {
      const { sweepDueBrandKeywordChecks } = await import("@/lib/naver-serp/brandAutoCheckSweep");
      const summary = await sweepDueBrandKeywordChecks();
      if (summary.due > 0) {
        console.log(
          `[brand-keyword-monitor] 자동 체크: 대상 ${summary.due}개 중 성공 ${summary.succeeded}개, 실패 ${summary.failed}개`,
        );
      }
    } catch (e) {
      console.error("[brand-keyword-monitor] 자동 체크 스윕 실패:", e);
    }
  }

  setTimeout(runSweep, 30_000);
  setInterval(runSweep, SWEEP_INTERVAL_MS);
  setTimeout(runBrandSweep, 45_000);
  setInterval(runBrandSweep, SWEEP_INTERVAL_MS);
}
