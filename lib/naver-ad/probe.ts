// 네이버 검색광고 접근 확인 — 캠페인 목록 조회 1회로 키·고객 ID 조합이 실제로 통하는지 본다. 서버 전용.
import type { NaverAdCredentials } from "./auth";
import { fetchAllCampaigns } from "./aggregate";

export type NaverProbe =
  | { ok: true; customerId: string; campaigns: number; sample: string[] }
  | { ok: false; customerId: string; error: string };

export async function probeNaverCustomer(credentials: NaverAdCredentials): Promise<NaverProbe> {
  try {
    const campaigns = await fetchAllCampaigns(credentials);
    return {
      ok: true,
      customerId: credentials.customerId,
      campaigns: campaigns.length,
      sample: campaigns.slice(0, 3).map((c) => c.name),
    };
  } catch (e) {
    return { ok: false, customerId: credentials.customerId, error: e instanceof Error ? e.message : "조회 실패" };
  }
}
