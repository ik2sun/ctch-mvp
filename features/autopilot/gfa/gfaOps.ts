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
import type { GfaAdSetDetail, GfaCodeBook } from "./adSetSheet";

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
    listAdSets(c, campaignNo),
  ]);
  const campaign = campaigns.find((x) => x.no === campaignNo);
  if (!campaign) throw new Error("이 광고계정에서 캠페인을 찾지 못했어요.");
  return { campaign, sample, types, existingAdSets: sets };
}

// 캠페인의 광고그룹 전부(100개씩, 최대 1,000개) — 벌크 템플릿 미리 채우기·기존 광고그룹 재사용 판정에 쓴다
async function listAdSets(c: GfaCredentials, campaignNo: number): Promise<GfaContext["existingAdSets"]> {
  const out: GfaContext["existingAdSets"] = [];
  for (let page = 0; page < 10; page++) {
    const p = await gfaRequest<Page<{ no: number; name: string; deleted?: boolean; activated?: boolean; status?: string }>>(`${base(c)}/adSets`, {
      ...opt(c),
      query: { campaignNo, page, size: 100 },
    });
    for (const s of p.content ?? []) if (!s.deleted) out.push({ no: s.no, name: s.name, activated: s.activated, status: s.status });
    if (p.last !== false || (p.totalPages ?? 1) <= page + 1) break;
  }
  return out;
}

// 광고그룹 상세(타겟팅·입찰·일정 전 항목) — 목록 응답에는 타겟팅이 없어 하나씩 조회. 동시 4건
export async function getAdSetDetails(c: GfaCredentials, campaignNo: number, nos: number[]): Promise<GfaAdSetDetail[]> {
  const out: GfaAdSetDetail[] = [];
  for (let i = 0; i < nos.length; i += 4) {
    const batch = await Promise.all(nos.slice(i, i + 4).map((no) => gfaRequest<GfaAdSetDetail>(`${base(c)}/adSets/${no}`, opt(c))));
    out.push(...batch.filter((d) => Number(d.campaignNo) === campaignNo));
  }
  return out;
}

// 코드표(관심사·구매 의도·지역·확장 데모·게재 위치 = 계정 무관, 고객 파일 = 광고계정별) — 서버 메모리 12시간
type Tree = { code: number; keyword: string; depth: number; children?: Tree[] };
type LocTree = { rcode: string; location: string; childLocations?: LocTree[] };
let COMMON_BOOK: { at: number; book: Omit<GfaCodeBook, "adidLibraries"> } | null = null;

export async function loadCodeBook(c: GfaCredentials): Promise<GfaCodeBook> {
  if (!COMMON_BOOK || Date.now() - COMMON_BOOK.at > 12 * 3600_000) {
    const [interests, purchase, locations, extDemo, placements] = await Promise.all([
      gfaRequest<Tree[]>(`/targetings/interests`, opt(c)),
      gfaRequest<Tree[]>(`/targetings/purchaseIntent`, opt(c)),
      gfaRequest<LocTree[]>(`/targetings/locations`, opt(c)),
      gfaRequest<Record<string, { code: number; keyword: string }[]>>(`/targetings/extendedDemo`, opt(c)),
      gfaRequest<{ value: string; name: string }[]>(`/targetings/placementGroupCodes`, opt(c)),
    ]);
    const flatTree = (list: Tree[], key: (t: Tree) => string) => {
      const m: Record<string, string> = {};
      const walk = (t: Tree, path: string[]) => {
        const p = [...path, t.keyword];
        m[key(t)] = p.join(" > ");
        (t.children ?? []).forEach((x) => walk(x, p));
      };
      list.forEach((t) => walk(t, []));
      return m;
    };
    const loc: Record<string, string> = {};
    const walkLoc = (t: LocTree, path: string[]) => {
      const p = [...path, t.location];
      loc[t.rcode] = p.join(" ");
      (t.childLocations ?? []).forEach((x) => walkLoc(x, p));
    };
    (locations ?? []).forEach((t) => walkLoc(t, []));
    COMMON_BOOK = {
      at: Date.now(),
      book: {
        interests: flatTree(interests ?? [], (t) => `${t.depth}-${t.code}`),
        purchase: flatTree(purchase ?? [], (t) => String(t.code)),
        locations: loc,
        extDemo: Object.fromEntries(Object.values(extDemo ?? {}).flat().map((x) => [String(x.code), x.keyword])),
        placements: Object.fromEntries((placements ?? []).map((x) => [x.value, x.name])),
      },
    };
  }
  const libs = await gfaRequest<Page<{ no: number; name: string }>>(`${base(c)}/customTargets/adidLibraries`, { ...opt(c), query: { page: 0, size: 100 } }).catch(() => ({ content: [] }));
  return { ...COMMON_BOOK.book, adidLibraries: Object.fromEntries((libs.content ?? []).map((x) => [String(x.no), x.name])) };
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

// 광고계정 프로필 — 생성 API에는 프로필 칸이 없어 계정 프로필(GFA 광고 계정 관리 > 프로필 관리)이 붙는다.
// 프로필 조회 API도 없어서 기존 네이티브·컬렉션·동영상 소재 상세의 profile로 읽는다(목록 응답엔 없음). 없으면 null
const PROFILE_CACHE = new Map<string, { at: number; v: { name: string; imageUrl?: string } | null }>();
export async function accountProfile(c: GfaCredentials): Promise<{ name: string; imageUrl?: string } | null> {
  const hit = PROFILE_CACHE.get(c.adAccountNo);
  if (hit && Date.now() - hit.at < 30 * 60 * 1000) return hit.v;
  let v: { name: string; imageUrl?: string } | null = null;
  let tried = 0;
  outer: for (let page = 0; page < 3; page++) {
    const p = await gfaRequest<Page<{ no: number; creativeType?: string }>>(`${base(c)}/creatives`, { ...opt(c), query: { page, size: 100 } });
    for (const x of p.content ?? []) {
      if (!["SINGLE_IMAGE", "MULTIPLE_IMAGE", "SINGLE_VIDEO"].includes(x.creativeType ?? "")) continue;
      const d = await gfaRequest<{ profile?: { name?: string; image?: { imageUrl?: string } } }>(`${base(c)}/creatives/${x.no}`, opt(c)).catch(() => null);
      if (d?.profile?.name) {
        v = { name: d.profile.name, imageUrl: d.profile.image?.imageUrl };
        break outer;
      }
      if (++tried >= 3) break outer;
    }
    if (p.last !== false) break;
  }
  PROFILE_CACHE.set(c.adAccountNo, { at: Date.now(), v });
  return v;
}

export type SingleImageCreative = {
  adSetNo: number;
  creativeTemplateCode: string;
  imageNo: number;
  name: string;
  // 문구 칸은 템플릿마다 다르다(types.ts COPY_RULES) — 템플릿이 안 받는 칸·빈 칸은 보내지 않는다
  message?: string;
  linkTitle?: string;
  linkDescription?: string;
  linkText3rd?: string;
  linkText4th?: string;
  linkText5th?: string;
  adviceMessage?: string;
  linkUrl: string;
  ctaCode: string;
};

export async function createSingleImageCreative(c: GfaCredentials, body: SingleImageCreative): Promise<{ no: number; status?: string }> {
  const res = await gfaRequest<{ no?: number; status?: string }>(`${base(c)}/creatives/SINGLE_IMAGE`, {
    ...opt(c),
    method: "POST",
    json: Object.fromEntries(Object.entries(body).filter(([, v]) => !(typeof v === "string" && !v.trim()))),
  });
  if (!res?.no) throw new Error("소재는 요청했지만 응답에 번호가 없어요.");
  return { no: res.no, status: res.status };
}

// 이미지 컬렉션 — 공식 스펙 OpenCreativeOfMultipleImageParam: name·message(2~65)·FEED_MULTIPLE_IMAGE·ctaCode·ctaUrl·imageMedias 4~10장 {imageNo, linkUrl, linkTitle 2~28}
export type MultipleImageCreative = {
  adSetNo: number;
  name: string;
  message: string;
  creativeTemplateCode: string;
  ctaCode: string;
  ctaUrl: string;
  imageMedias: { imageNo: number; linkUrl: string; linkTitle: string }[];
};

export async function createMultipleImageCreative(c: GfaCredentials, body: MultipleImageCreative): Promise<{ no: number; status?: string }> {
  const res = await gfaRequest<{ no?: number; status?: string }>(`${base(c)}/creatives/MULTIPLE_IMAGE`, { ...opt(c), method: "POST", json: body });
  if (!res?.no) throw new Error("소재는 요청했지만 응답에 번호가 없어요.");
  return { no: res.no, status: res.status };
}

// 이미지 배너(스마트채널·배너 지면) — 공식 스펙 OpenCreativeOfImageBannerParam: adSetNo·name·creativeTemplateCode·imageNo·url·altMessage
export type ImageBannerCreative = { adSetNo: number; creativeTemplateCode: string; imageNo: number; name: string; url: string; altMessage: string };

export async function createImageBannerCreative(c: GfaCredentials, body: ImageBannerCreative): Promise<{ no: number; status?: string }> {
  const res = await gfaRequest<{ no?: number; status?: string }>(`${base(c)}/creatives/IMAGE_BANNER`, { ...opt(c), method: "POST", json: body });
  if (!res?.no) throw new Error("소재는 요청했지만 응답에 번호가 없어요.");
  return { no: res.no, status: res.status };
}

export async function activateAdSets(c: GfaCredentials, adSetNos: number[], activated: boolean) {
  return gfaRequest(`${base(c)}/adSets/activate`, { ...opt(c), method: "POST", query: { adSetNos: adSetNos.join(","), activated } });
}
