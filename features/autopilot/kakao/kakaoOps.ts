// 캠페인 오토파일럿 · 카카오모먼트 — 광고계정 읽기와 생성 호출(서버 전용). 본문 모양은 model.ts가 만든다.
// 목록 API는 유형(campaignTypeGoal)을 주지 않아 캠페인 상세를 하나씩 읽는다 → 켜진 캠페인 전부 + 최근 꺼진 캠페인 30개만(르무통 195개)
import { kakaoRequest, type KakaoRequestOptions } from "@/lib/kakao-moment/client";
import type { KakaoCredentials } from "@/lib/kakao-moment/auth";
import { ALL_LOCATIONS, type Freq, type KakaoAdGroupLite, type KakaoCampaignLite, type Profile } from "./model";

const OFF_RECENT = 30;
const CACHE = new Map<string, { at: number; v: unknown }>();
async function cached<T>(key: string, ms: number, fn: () => Promise<T>): Promise<T> {
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.at < ms) return hit.v as T;
  const v = await fn();
  CACHE.set(key, { at: Date.now(), v });
  return v;
}
export const dropCache = (prefix: string) => [...CACHE.keys()].filter((k) => k.startsWith(prefix)).forEach((k) => CACHE.delete(k));

const req = <T>(c: KakaoCredentials, path: string, o: Partial<KakaoRequestOptions> = {}) => kakaoRequest<T>(path, { accessToken: c.accessToken, adAccountId: c.adAccountId, bucket: "list", ...o });
const arr = <T>(j: unknown): T[] => (Array.isArray(j) ? (j as T[]) : (((j as { content?: T[] })?.content ?? []) as T[]));
// 카카오 이미지 주소는 '//t1.kakaocdn.net/…'(프로토콜 생략)로 온다
export const httpsUrl = (u: string | null | undefined) => (!u ? null : u.startsWith("//") ? `https:${u}` : u);

type RawCampaign = {
  id: number;
  name: string;
  config?: string;
  statusDescription?: string;
  campaignTypeGoal?: { campaignType?: string; goal?: string };
  objective?: { type?: string; detailType?: string } | null;
  dailyBudgetAmount?: number | null;
  adAccountId?: number;
};
export type RawAdGroup = Record<string, unknown> & {
  id: number;
  name: string;
  config?: string;
  statusDescription?: string;
  campaign?: { id: number; campaignTypeGoal?: { campaignType?: string; goal?: string } };
  creativeCount?: number;
};

const toCampaign = (c: RawCampaign): KakaoCampaignLite => ({
  id: String(c.id),
  name: c.name,
  on: c.config === "ON",
  statusText: c.statusDescription ?? (c.config === "ON" ? "운영중" : "OFF"),
  type: c.campaignTypeGoal?.campaignType ?? "",
  goal: c.campaignTypeGoal?.goal ?? "",
  objectiveDetail: c.objective?.detailType ?? null,
  dailyBudget: c.dailyBudgetAmount ? Number(c.dailyBudgetAmount) : null,
});

export type KakaoAccountCtx = { adAccountId: string; campaigns: KakaoCampaignLite[]; hiddenOff: number; shared: boolean };

export async function loadAccount(c: KakaoCredentials & { shared: boolean }, fresh = false): Promise<KakaoAccountCtx> {
  if (fresh) dropCache(c.adAccountId);
  return cached(`${c.adAccountId}:account`, 5 * 60_000, async () => {
    const list = arr<RawCampaign>(await req(c, "/campaigns", { query: { config: "ON,OFF" } })).filter((x) => x.config !== "DEL");
    const on = list.filter((x) => x.config === "ON");
    const off = list.filter((x) => x.config !== "ON").sort((a, b) => b.id - a.id);
    const pick = [...on, ...off.slice(0, OFF_RECENT)];
    const details: KakaoCampaignLite[] = [];
    for (const x of pick) {
      try {
        details.push(toCampaign(await getCampaignRaw(c, String(x.id))));
      } catch {
        details.push(toCampaign(x));
      }
    }
    details.sort((a, b) => Number(b.on) - Number(a.on) || Number(b.id) - Number(a.id));
    return { adAccountId: c.adAccountId, campaigns: details, hiddenOff: Math.max(0, off.length - OFF_RECENT), shared: c.shared };
  });
}

export async function getCampaignRaw(c: KakaoCredentials, id: string) {
  return cached(`${c.adAccountId}:campaign:${id}`, 5 * 60_000, () => req<RawCampaign>(c, `/campaigns/${encodeURIComponent(id)}`));
}
// 이 광고계정의 캠페인인지 + 유형
export async function ownCampaign(c: KakaoCredentials, id: unknown): Promise<KakaoCampaignLite> {
  if (!/^\d+$/.test(String(id ?? ""))) throw new Error("캠페인 번호가 잘못됐어요.");
  const raw = await getCampaignRaw(c, String(id));
  if (raw.adAccountId && String(raw.adAccountId) !== c.adAccountId) throw new Error("이 광고계정의 캠페인이 아니에요.");
  return toCampaign(raw);
}
export async function getAdGroupRaw(c: KakaoCredentials, id: string, fresh = false): Promise<RawAdGroup> {
  if (!/^\d+$/.test(id)) throw new Error("광고그룹 번호가 잘못됐어요.");
  const key = `${c.adAccountId}:adgroup:${id}`;
  if (fresh) dropCache(key);
  return cached(key, 2 * 60_000, () => req<RawAdGroup>(c, `/adGroups/${id}`));
}

function summarize(raw: RawAdGroup): KakaoAdGroupLite {
  const t = (raw.targeting ?? {}) as Record<string, unknown>;
  const s = (raw.schedule ?? {}) as Record<string, unknown>;
  const n = (k: string) => (Array.isArray(t[k]) ? (t[k] as unknown[]).length : 0);
  const audience: string[] = [];
  if (t.type === "DISPLAY") audience.push(`오디언스 ${t.id ?? ""}`);
  for (const [k, label] of [
    ["customerDataTargetings", "고객데이터"],
    ["trackerTargetings", "픽셀&SDK"],
    ["cohortTargetings", "광고반응"],
    ["talkChannelTargetings", "채널 친구"],
    ["syncAppTargetings", "카카오 로그인"],
    ["ufoInterests", "관심사"],
    ["ufoBusinessTypes", "업종"],
  ] as const)
    if (n(k)) audience.push(`${label} ${n(k)}`);
  const locs = n("locations") + n("depth2Locations") + n("depth3Locations");
  const target = raw.bidStrategyTarget as { type: string; value: number } | null | undefined;
  return {
    id: String(raw.id),
    name: raw.name,
    on: raw.config === "ON",
    statusText: raw.statusDescription ?? "",
    dailyBudget: raw.dailyBudgetAmount ? Number(raw.dailyBudgetAmount) : null,
    bidStrategy: String(raw.bidStrategy ?? ""),
    pricingType: String(raw.pricingType ?? ""),
    bidAmount: Number(raw.bidAmount ?? 0),
    bidTarget: target?.type ? { type: target.type, value: Number(target.value ?? 0) } : null,
    genders: t.genderType === "NOT_ALL" ? ((t.genders as string[]) ?? []) : [],
    ages: t.ageType === "NOT_ALL" ? [...((t.ages as string[]) ?? [])].sort((a, b) => Number(a) - Number(b)) : [],
    adult: raw.adult === true,
    beginDate: (s.beginDate as string) ?? null,
    endDate: (s.endDate as string) ?? null,
    deviceTypes: (raw.deviceTypes as string[]) ?? [],
    placements: (raw.placements as string[]) ?? [],
    audience,
    locations: t.locationType === "ALL" || (n("locations") >= ALL_LOCATIONS.length - 1 && !n("depth2Locations")) ? "국내 전체" : locs ? `지역 ${locs}곳` : "국내+해외",
    creativeCount: Number(raw.creativeCount ?? 0),
  };
}

// 캠페인의 광고그룹(켜짐·꺼짐) — 상세까지 읽어 템플릿·배지에 쓴다(목록 응답에는 타겟·예산이 없음)
export async function listAdGroups(c: KakaoCredentials, campaignId: string, fresh = false): Promise<KakaoAdGroupLite[]> {
  const key = `${c.adAccountId}:adgroups:${campaignId}`;
  if (fresh) dropCache(key);
  return cached(key, 60_000, async () => {
    const list = arr<RawAdGroup>(await req(c, "/adGroups", { query: { campaignId, config: "ON,OFF" } })).filter((g) => g.config !== "DEL");
    const out: KakaoAdGroupLite[] = [];
    for (const g of list.sort((a, b) => b.id - a.id).slice(0, 60)) {
      try {
        out.push(summarize(await getAdGroupRaw(c, String(g.id), fresh)));
      } catch {
        out.push({ ...summarize(g), statusText: "상세 못 읽음" });
      }
    }
    return out;
  });
}
// 같은 이름 광고그룹이 이미 있는지(캐시 없이) — 화면 목록이 늦게 갱신돼 두 번 만드는 일 방지
export async function findAdGroupByName(c: KakaoCredentials, campaignId: string, name: string): Promise<string | null> {
  const list = arr<RawAdGroup>(await req(c, "/adGroups", { query: { campaignId, config: "ON,OFF" } }));
  return list.find((g) => g.config !== "DEL" && g.name.trim() === name.trim())?.id?.toString() ?? null;
}

// 프로필(네이티브·동영상 소재의 프로필 이미지·이름)과 게재빈도 기본값 — 기존 디스플레이·동영상 소재에서 읽는다(조회 API가 따로 없음)
export type AccountDefaults = { profile: Profile | null; freq: Freq | null; from: string | null };
export async function accountDefaults(c: KakaoCredentials, campaigns: KakaoCampaignLite[]): Promise<AccountDefaults> {
  return cached(`${c.adAccountId}:defaults`, 30 * 60_000, async () => {
    const order = [...campaigns.filter((x) => x.type === "DISPLAY" || x.type === "VIDEO"), ...campaigns.filter((x) => x.type === "TALK_BIZ_BOARD")].slice(0, 8);
    let profile: Profile | null = null;
    let freq: Freq | null = null;
    let from: string | null = null;
    for (const camp of order) {
      const groups = arr<RawAdGroup>(await req(c, "/adGroups", { query: { campaignId: camp.id, config: "ON,OFF" } })).sort((a, b) => b.id - a.id).slice(0, 2);
      for (const g of groups) {
        const crs = arr<{ id: number }>(await req(c, "/creatives", { query: { adGroupId: g.id, config: "ON,OFF" } })).sort((a, b) => b.id - a.id).slice(0, 1);
        for (const cr of crs) {
          const d = await req<{ profileName?: string; profileImage?: { url?: string }; frequencyCapType?: string; frequencyCap?: number; frequencyCapTime?: number; name?: string }>(c, `/creatives/${cr.id}`);
          if (!freq && d.frequencyCapType) freq = d.frequencyCapType === "DAY_IMP" && d.frequencyCap ? { type: "DAY_IMP", cap: Number(d.frequencyCap), hours: Number(d.frequencyCapTime ?? 24) } : { type: "AUTO" };
          if (!profile && d.profileImage?.url) {
            profile = { name: d.profileName ?? "", imageUrl: httpsUrl(d.profileImage.url) };
            from = d.name ?? String(cr.id);
          }
        }
        if (profile && freq) return { profile, freq, from };
      }
    }
    return { profile, freq, from };
  });
}

export async function createAdGroup(c: KakaoCredentials, body: Record<string, unknown>) {
  return req<{ id: number; name?: string }>(c, "/adGroups", { method: "POST", json: body, bucket: "write-adgroup" });
}
export async function createCreative(c: KakaoCredentials, body: Record<string, unknown>) {
  return req<{ id: number; creativeId?: number; reviewStatus?: string; statusDescription?: string }>(c, "/creatives", { method: "POST", json: body, bucket: "write-creative" });
}
export async function setAdGroupConfig(c: KakaoCredentials, id: string, on: boolean) {
  return req<unknown>(c, "/adGroups/onOff", { method: "PUT", json: { id: Number(id), config: on ? "ON" : "OFF" }, bucket: "write-onoff" });
}
export async function setCreativeConfig(c: KakaoCredentials, id: string, on: boolean) {
  return req<unknown>(c, "/creatives/onOff", { method: "PUT", json: { id: Number(id), config: on ? "ON" : "OFF" }, bucket: "write-onoff" });
}
