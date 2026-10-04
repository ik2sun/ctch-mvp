// 캠페인 오토파일럿 · GFA 호출(서버 전용). 읽기: 캠페인·샘플·유형·광고그룹, 쓰기: 광고그룹·이미지·소재·켜기/끄기
import { gfaRequest } from "@/lib/gfa/client";
import type { GfaCredentials } from "@/lib/gfa/auth";
import {
  AGE_BANDS,
  type GfaAdSetSample,
  type GfaCampaignLite,
  type GfaContext,
  type GfaTypeInfo,
  type PlanAdSet,
  type RawTemplate,
} from "./types";

type Page<T> = { content?: T[]; totalPages?: number; last?: boolean };
const opt = (c: GfaCredentials) => ({ accessToken: c.accessToken, managerAccountNo: c.managerAccountNo });
const base = (c: GfaCredentials) => `/adAccounts/${c.adAccountNo}`;

type RawCampaign = { no: number; name: string; objective: string; activated: boolean; cboActivated?: boolean; status: string; deleted?: boolean };

export async function listCampaigns(c: GfaCredentials): Promise<GfaCampaignLite[]> {
  const out: GfaCampaignLite[] = [];
  for (let page = 0; page < 5; page++) {
    const p = await gfaRequest<Page<RawCampaign>>(`${base(c)}/campaigns`, { ...opt(c), query: { page, size: 100 } });
    for (const x of p.content ?? []) {
      if (x.deleted) continue;
      out.push({ no: x.no, name: x.name, objective: x.objective, activated: x.activated, cbo: !!x.cboActivated, status: x.status });
    }
    if (p.last !== false || (p.totalPages ?? 1) <= page + 1) break;
  }
  return out;
}

export async function loadContext(c: GfaCredentials, campaignNo: number): Promise<GfaContext> {
  const [campaigns, sample, types, sets] = await Promise.all([
    listCampaigns(c),
    gfaRequest<GfaAdSetSample>(`${base(c)}/adSets/sampleByCampaignNo`, { ...opt(c), query: { campaignNo } }),
    gfaRequest<GfaTypeInfo>(`${base(c)}/adSets/typeInfoByCampaignNo`, { ...opt(c), query: { campaignNo } }),
    gfaRequest<Page<{ no: number; name: string }>>(`${base(c)}/adSets`, { ...opt(c), query: { campaignNo, page: 0, size: 100 } }),
  ]);
  const campaign = campaigns.find((x) => x.no === campaignNo);
  if (!campaign) throw new Error("이 광고계정에서 캠페인을 찾지 못했어요.");
  return { campaign, sample, types, existingAdSets: (sets.content ?? []).map((s) => ({ no: s.no, name: s.name })) };
}

// 광고그룹 생성 본문 — GFA 샘플(캠페인 목적에 맞는 입찰·예산 기본값)에 세팅안의 이름·타겟·예산·시작을 덮는다.
// 샘플에 딸려 오는 고객파일 타겟(adidLibraries)은 세팅안이 고르지 않았으므로 뺀다.
export function adSetBody(sample: GfaAdSetSample, types: GfaTypeInfo, a: PlanAdSet, name: string, startTime: string | null) {
  const { adidLibraries: _a, adidLibraryParams: _b, no: _n, ...rest } = sample as GfaAdSetSample & { adidLibraryParams?: unknown; no?: unknown };
  const devices = a.device === "MOBILE" ? ["MOBILE"] : (types.deviceTypes?.length ? types.deviceTypes : ["DESKTOP", "MOBILE"]);
  return {
    ...rest,
    campaignNo: sample.campaignNo,
    name: name.slice(0, 128),
    adidLibraries: [],
    genders: a.genders,
    ageRanges: AGE_BANDS.filter((b) => a.ages.includes(b.key)).map((b) => ({ from: b.from, to: b.to })),
    allDevice: a.device === "ALL",
    devices,
    platforms: ["IOS", "ANDROID"], // 실계정 광고그룹(전체 기기)도 IOS·ANDROID로 저장돼 있음
    allPlacementGroup: true,
    placementGroupCodes: types.placementGroupCodes ?? [],
    budgetType: "DAILY",
    budgetAmount: a.budget,
    startTime: startTime ?? sample.startTime ?? null,
  };
}

export async function createAdSet(c: GfaCredentials, body: Record<string, unknown>): Promise<{ no: number; name: string }> {
  const res = await gfaRequest<{ no?: number; name?: string }>(`${base(c)}/adSets`, { ...opt(c), method: "POST", json: body });
  if (!res?.no) throw new Error("광고그룹은 요청했지만 응답에 번호가 없어요. GFA 화면에서 생성 여부를 확인하세요.");
  return { no: res.no, name: res.name ?? String(body.name) };
}

export async function getAdSet(c: GfaCredentials, adSetNo: number): Promise<{ no: number; name: string; campaignNo: number; creativeTemplates: RawTemplate[] }> {
  const d = await gfaRequest<{ no: number; name: string; campaignNo: number; creativeTemplates?: RawTemplate[] }>(`${base(c)}/adSets/${adSetNo}`, {
    ...opt(c),
    query: { includeCreativeTemplates: true },
  });
  return { no: d.no, name: d.name, campaignNo: d.campaignNo, creativeTemplates: d.creativeTemplates ?? [] };
}

export async function adSetTemplates(c: GfaCredentials, adSetNo: number): Promise<RawTemplate[]> {
  return (await getAdSet(c, adSetNo)).creativeTemplates;
}

export async function callToActions(c: GfaCredentials, adSetNo: number): Promise<string[]> {
  const list = await gfaRequest<{ value: string }[]>(`${base(c)}/creatives/callToActions`, { ...opt(c), query: { adSetNo } });
  return (list ?? []).map((x) => x.value);
}

export async function uploadImage(c: GfaCredentials, templateCode: string, file: Blob, filename: string): Promise<{ no: number; width?: number; height?: number }> {
  const form = new FormData();
  form.set("creativeTemplateCode", templateCode);
  form.set("file", file, filename);
  const res = await gfaRequest<{ no?: number; width?: number; height?: number }>(`${base(c)}/creatives/image`, { ...opt(c), method: "POST", form });
  if (!res?.no) throw new Error("이미지 업로드 응답에 번호가 없어요.");
  return { no: res.no, width: res.width, height: res.height };
}

export type SingleImageCreative = {
  adSetNo: number;
  creativeTemplateCode: string;
  imageNo: number;
  name: string;
  message: string;
  linkTitle: string;
  linkDescription: string;
  linkUrl: string;
  ctaCode: string;
};

export async function createSingleImageCreative(c: GfaCredentials, body: SingleImageCreative): Promise<{ no: number; status?: string }> {
  const res = await gfaRequest<{ no?: number; status?: string }>(`${base(c)}/creatives/SINGLE_IMAGE`, { ...opt(c), method: "POST", json: body });
  if (!res?.no) throw new Error("소재는 요청했지만 응답에 번호가 없어요.");
  return { no: res.no, status: res.status };
}

export async function activateAdSets(c: GfaCredentials, adSetNos: number[], activated: boolean) {
  return gfaRequest(`${base(c)}/adSets/activate`, { ...opt(c), method: "POST", query: { adSetNos: adSetNos.join(","), activated } });
}
