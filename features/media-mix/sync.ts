// 예산 동기화 — 서버 전용. 매체 일 예산 목표를 실제 캠페인(광고세트) 일 예산으로 나눠 반영한다.
// 나누는 방식: 매체 안의 예산 단위들을 같은 배율로 조정(현재 일 예산 비율 유지). 총 예산(lifetime)형·예산 제한 없음은 건드리지 않는다.
// 지원: 메타(CBO 캠페인 daily_budget, ABO 광고세트 daily_budget), 네이버 SA(캠페인 dailyBudget). GFA·카카오는 수동 반영 안내.
import { actOf, graphAll, META_API_VERSION, num } from "@/lib/meta/graph";
import { naverAdRequest } from "@/lib/naver-ad/client";
import type { NaverAdCredentials } from "@/lib/naver-ad/auth";
import type { NaverCampaign } from "@/lib/naver-ad/types";
import type { BudgetUnit, MediaSyncPlan, UnitResult } from "./syncTypes";

// 소수점 없는 통화(메타 금액 단위 = 1). 그 밖은 1/100 단위
const ZERO_DECIMAL = new Set(["KRW", "JPY", "CLP", "COP", "CRC", "HUF", "ISK", "IDR", "PYG", "TWD", "VND"]);

function scaleUnits(units: Omit<BudgetUnit, "newDaily">[], targetDaily: number, roundTo: number, min: number): BudgetUnit[] {
  const sum = units.reduce((s, u) => s + u.currentDaily, 0);
  const k = sum > 0 ? targetDaily / sum : 0;
  return units.map((u) => ({ ...u, newDaily: Math.max(min, Math.round((u.currentDaily * k) / roundTo) * roundTo) }));
}

// ── 메타 ─────────────────────────────────────────────
type MetaCampaign = { id: string; name: string; daily_budget?: string; lifetime_budget?: string };
type MetaAdset = MetaCampaign & { campaign_id: string };

export async function metaPlan(accountId: string, token: string, targetDaily: number): Promise<MediaSyncPlan & { offset: number }> {
  const act = actOf(accountId);
  const acc = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${act}?fields=currency&access_token=${encodeURIComponent(token)}`, { cache: "no-store" }).then((r) => r.json());
  if (acc.error) throw new Error(acc.error.message ?? "메타 계정 조회 실패");
  const currency = String(acc.currency ?? "KRW");
  const offset = ZERO_DECIMAL.has(currency) ? 1 : 100;
  const active = { effective_status: JSON.stringify(["ACTIVE"]) };
  const [campaigns, adsets] = await Promise.all([
    graphAll<MetaCampaign>(`${act}/campaigns`, { fields: "id,name,daily_budget,lifetime_budget", ...active }, token),
    graphAll<MetaAdset>(`${act}/adsets`, { fields: "id,name,campaign_id,daily_budget,lifetime_budget", ...active }, token),
  ]);
  const units: Omit<BudgetUnit, "newDaily">[] = [];
  const skipped: { name: string; reason: string }[] = [];
  const cbo = new Set<string>();
  for (const c of campaigns) {
    if (num(c.daily_budget) > 0) {
      cbo.add(c.id);
      units.push({ id: c.id, name: c.name, level: "campaign", currentDaily: num(c.daily_budget) / offset });
    } else if (num(c.lifetime_budget) > 0) {
      cbo.add(c.id);
      skipped.push({ name: c.name, reason: "총 예산(기간) 캠페인" });
    }
  }
  const activeIds = new Set(campaigns.map((c) => c.id));
  for (const a of adsets) {
    if (cbo.has(a.campaign_id) || !activeIds.has(a.campaign_id)) continue;
    if (num(a.daily_budget) > 0) units.push({ id: a.id, name: a.name, level: "adset", currentDaily: num(a.daily_budget) / offset });
    else if (num(a.lifetime_budget) > 0) skipped.push({ name: a.name, reason: "총 예산(기간) 광고세트" });
  }
  const roundTo = offset === 1 ? 100 : 0.01;
  return {
    key: "meta",
    label: "메타",
    supported: true,
    targetDaily,
    units: scaleUnits(units, targetDaily, roundTo, offset === 1 ? 1000 : 1),
    skipped,
    note: currency !== "KRW" ? `계정 통화 ${currency} 기준 금액이에요` : undefined,
    offset,
  };
}

export async function metaApply(units: BudgetUnit[], token: string, offset: number): Promise<UnitResult[]> {
  const out: UnitResult[] = [];
  for (const u of units) {
    try {
      const body = new URLSearchParams({ daily_budget: String(Math.round(u.newDaily * offset)), access_token: token });
      const res = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${u.id}`, { method: "POST", body, cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (json.error) throw new Error(json.error.error_user_msg || json.error.message || "메타 API 오류");
      out.push({ id: u.id, name: u.name, ok: true, before: u.currentDaily, after: u.newDaily });
    } catch (e) {
      out.push({ id: u.id, name: u.name, ok: false, before: u.currentDaily, after: u.newDaily, error: e instanceof Error ? e.message : "실패" });
    }
  }
  return out;
}

// ── 네이버 SA ────────────────────────────────────────
export async function naverPlan(credentials: NaverAdCredentials, targetDaily: number): Promise<MediaSyncPlan> {
  const all = await naverAdRequest<NaverCampaign[]>("GET", "/ncc/campaigns", credentials);
  const live = all.filter((c) => !c.delFlag && !(c as NaverCampaign & { userLock?: boolean }).userLock);
  const units: Omit<BudgetUnit, "newDaily">[] = [];
  const skipped: { name: string; reason: string }[] = [];
  for (const c of live) {
    if (c.useDailyBudget && c.dailyBudget > 0) units.push({ id: c.nccCampaignId, name: c.name, level: "campaign", currentDaily: c.dailyBudget });
    else skipped.push({ name: c.name, reason: "하루 예산 제한 없음" });
  }
  return {
    key: "naver",
    label: "네이버 SA",
    supported: true,
    targetDaily,
    units: scaleUnits(units, targetDaily, 10, 100),
    skipped,
    note: skipped.length ? "예산 제한 없는 캠페인은 그대로 두고, 제한 있는 캠페인만 조정해요" : undefined,
  };
}

export async function naverApply(units: BudgetUnit[], credentials: NaverAdCredentials): Promise<UnitResult[]> {
  const out: UnitResult[] = [];
  for (const u of units) {
    try {
      await naverAdRequest("PUT", `/ncc/campaigns/${u.id}`, credentials, { fields: "budget" }, {
        nccCampaignId: u.id,
        customerId: Number(credentials.customerId),
        useDailyBudget: true,
        dailyBudget: u.newDaily,
      });
      out.push({ id: u.id, name: u.name, ok: true, before: u.currentDaily, after: u.newDaily });
    } catch (e) {
      out.push({ id: u.id, name: u.name, ok: false, before: u.currentDaily, after: u.newDaily, error: e instanceof Error ? e.message : "실패" });
    }
  }
  return out;
}

export function unsupportedPlan(key: string, label: string, targetDaily: number): MediaSyncPlan {
  return {
    key,
    label,
    supported: false,
    targetDaily,
    units: [],
    skipped: [],
    note: "예산 변경 API 연동 전이에요 — 매체 관리자 화면에서 일 예산을 직접 반영해 주세요",
  };
}
