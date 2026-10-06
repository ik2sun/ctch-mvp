// 광고주 한 곳의 연동 매체 전체에서 캠페인 단위 일별 지표를 모은다 — 서버 전용.
// 상관관계 분석(/api/correlation/data)과 캠페인 매니저(퍼포먼스 매니저 도구)가 같이 쓴다. 매체별로 독립 조회, 병렬.
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveMetaToken } from "@/lib/meta/token";
import { resolveNaverAdCredentials } from "@/lib/naver-ad/auth";
import { getGfaCredentials } from "@/lib/gfa/auth";
import { ensureKakaoAccessToken, KAKAO_TOKEN_COLUMNS } from "@/lib/kakao-moment/auth";
import { gfaCampaigns, googleAdsCampaigns, kakaoCampaigns, metaCampaigns, naverCampaigns } from "./fetchData";
import { MEDIA_LABEL, type CorrCampaign, type CorrDataRes, type CorrMediaStatus } from "./types";

export const CLIENT_MEDIA_COLUMNS = `name, meta_account_id, meta_access_token, naver_ad_api_key, naver_ad_secret, naver_ad_customer_id, gfa_customer_id, google_ads_customer_id, ${KAKAO_TOKEN_COLUMNS}`;

// client: CLIENT_MEDIA_COLUMNS로 읽은 행(소유 확인은 호출부에서)
export async function fetchClientCampaigns(
  supabase: SupabaseClient,
  clientId: string,
  client: Record<string, unknown>,
  since: string,
  until: string,
): Promise<CorrDataRes> {
  const c = client as Record<string, string | null>;
  type Job = { key: string; run: () => Promise<{ campaigns: CorrCampaign[]; note?: string }> };
  const jobs: Job[] = [];
  const skipped: CorrMediaStatus[] = [];

  if (c.meta_account_id) {
    jobs.push({
      key: "meta",
      run: async () => {
        const { token } = await resolveMetaToken(c.meta_access_token);
        if (!token) throw new Error("메타 액세스 토큰이 없어요.");
        return { campaigns: await metaCampaigns(c.meta_account_id!, token, since, until) };
      },
    });
  } else skipped.push({ key: "meta", label: MEDIA_LABEL.meta, ok: false, campaigns: 0, note: "광고계정 ID 미등록" });

  if (c.naver_ad_customer_id) {
    jobs.push({ key: "naver", run: async () => naverCampaigns(await resolveNaverAdCredentials(c), since, until) });
  } else skipped.push({ key: "naver", label: MEDIA_LABEL.naver, ok: false, campaigns: 0, note: "고객 ID 미등록" });

  if (c.gfa_customer_id) {
    jobs.push({ key: "gfa", run: async () => ({ campaigns: await gfaCampaigns(await getGfaCredentials(c.gfa_customer_id), since, until) }) });
  } else skipped.push({ key: "gfa", label: MEDIA_LABEL.gfa, ok: false, campaigns: 0, note: "광고계정 번호 미등록" });

  if (c.kakao_ad_account_id) {
    jobs.push({
      key: "kakao",
      run: async () => ({ campaigns: await kakaoCampaigns(await ensureKakaoAccessToken(supabase, clientId, client as never), since, until) }),
    });
  } else skipped.push({ key: "kakao", label: MEDIA_LABEL.kakao, ok: false, campaigns: 0, note: "광고계정 ID 미등록" });

  if (c.google_ads_customer_id) {
    jobs.push({ key: "google_ads", run: async () => ({ campaigns: await googleAdsCampaigns(c.google_ads_customer_id!, since, until) }) });
  } else skipped.push({ key: "google_ads", label: MEDIA_LABEL.google_ads, ok: false, campaigns: 0, note: "Customer ID 미등록" });

  const settled = await Promise.allSettled(jobs.map((j) => j.run()));
  const media: CorrMediaStatus[] = [...skipped];
  const campaigns: CorrCampaign[] = [];
  settled.forEach((s, i) => {
    const key = jobs[i].key;
    if (s.status === "fulfilled") {
      const list = s.value.campaigns.filter((x) => x.daily.some((d) => d.cost > 0 || d.impressions > 0));
      campaigns.push(...list);
      media.push({ key, label: MEDIA_LABEL[key], ok: true, campaigns: list.length, note: s.value.note });
    } else {
      media.push({ key, label: MEDIA_LABEL[key], ok: false, campaigns: 0, error: s.reason instanceof Error ? s.reason.message : "조회 실패" });
    }
  });
  const order = ["meta", "naver", "gfa", "kakao", "google_ads"];
  media.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  return { since, until, media, campaigns };
}
