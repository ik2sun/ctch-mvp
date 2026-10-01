import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveMetaToken } from "@/lib/meta/token";
import { resolveNaverAdCredentials } from "@/lib/naver-ad/auth";
import { getGfaCredentials } from "@/lib/gfa/auth";
import { ensureKakaoAccessToken, KAKAO_TOKEN_COLUMNS } from "@/lib/kakao-moment/auth";
import { gfaCampaigns, kakaoCampaigns, metaCampaigns, naverCampaigns } from "@/features/correlation/fetchData";
import { MEDIA_LABEL, type CorrCampaign, type CorrDataRes, type CorrMediaStatus } from "@/features/correlation/types";

// 상관관계 분석 — 연동된 매체의 캠페인 단위 일별 지표(목표 포함). 매체별로 독립 조회, 병렬.
export const maxDuration = 180;

const MAX_DAYS = 180;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { clientId, since, until } = (await req.json().catch(() => ({}))) as { clientId?: string; since?: string; until?: string };
  if (!clientId || !since || !until) return NextResponse.json({ error: "필수 값이 없어요." }, { status: 400 });
  const days = Math.round((new Date(until).getTime() - new Date(since).getTime()) / 86400000) + 1;
  if (!(days > 0 && days <= MAX_DAYS)) return NextResponse.json({ error: `기간은 1~${MAX_DAYS}일만 가능해요.` }, { status: 400 });

  const { data: client } = await supabase
    .from("clients")
    .select(`name, meta_account_id, meta_access_token, naver_ad_api_key, naver_ad_secret, naver_ad_customer_id, gfa_customer_id, ${KAKAO_TOKEN_COLUMNS}`)
    .eq("id", clientId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!client) return NextResponse.json({ error: "광고주를 찾을 수 없어요." }, { status: 403 });
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
  const order = ["meta", "naver", "gfa", "kakao"];
  media.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));

  const body: CorrDataRes = { since, until, media, campaigns };
  return NextResponse.json(body);
}
