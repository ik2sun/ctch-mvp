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

  // GEO 인용 자동 측정 — 1시간마다 "주기가 된 광고주·끝나지 않은 회차"가 있는지 확인
  async function runGeoSweep() {
    try {
      // if 블록 안에서 import해야 webpack이 edge 번들에서 뺀다(Anthropic SDK가 node:fs를 씀)
      if (process.env.NEXT_RUNTIME === "nodejs") {
        const { sweepGeoAuto } = await import("@/features/geo-citation/runner");
        const summary = await sweepGeoAuto(Date.now() + 50 * 60 * 1000);
        if (summary.created > 0 || summary.continued > 0 || summary.errors.length > 0) {
          console.log(`[geo-citation] 자동 측정: 새 회차 ${summary.created}개, 이어서 처리 ${summary.continued}개`, summary.errors);
        }
      }
    } catch (e) {
      console.error("[geo-citation] 자동 측정 스윕 실패:", e);
    }
  }

  setTimeout(runSweep, 30_000);
  setTimeout(runGeoSweep, 60_000);
  setInterval(runGeoSweep, 60 * 60 * 1000);
  setInterval(runSweep, SWEEP_INTERVAL_MS);
  setTimeout(runBrandSweep, 45_000);
  setInterval(runBrandSweep, SWEEP_INTERVAL_MS);
}
