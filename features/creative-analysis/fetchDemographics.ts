// 소재별 실제 성별·연령대 성과(메타 인사이트 breakdowns=age,gender) — 서버 전용, 읽기 전용.
// 광고 관리자 '분석 기준 > 연령 및 성별'과 같은 데이터. 연령은 메타 고정 구간(18-24…65+), 성별 male/female/unknown.
// 주의: 타겟을 열어 두면 메타가 잘 사는 층에 노출을 몰아주므로 구간별 효율은 '그 층 반응 + 메타의 선별'이 섞인 값.
// 개인정보 기준·추정 전환 때문에 구간 합이 소재 합계와 조금 다를 수 있다. 소재 분석 화면에서 성별·연령대를 쓸 때만 따로 부른다.
import { actOf, graphAll, num, pickAction, PURCHASE_TYPES } from "@/lib/meta/graph";

type Raw = Record<string, unknown>;
export type DemoGender = "남성" | "여성" | "성별 미상";
export type DemoRow = { adId: string; age: string; gender: DemoGender; impressions: number; linkClicks: number; cost: number; conversions: number; revenue: number };
export type DemographicsRes = { period: { since: string; until: string }; rows: DemoRow[]; fetchedAt: string };

const GENDER: Record<string, DemoGender> = { male: "남성", female: "여성", unknown: "성별 미상" };
// 같은 프로세스 서버 메모리 캐시(30분) — 메타 앱 호출 한도 보호
const CACHE = new Map<string, { at: number; res: DemographicsRes }>();
const TTL = 30 * 60 * 1000;

const CHUNK = 50; // 광고 50개씩 나눠 동시에 — 한 번에 받으면 르무통 14일 3,749행·8페이지 순차라 62초(실측), 큰 limit은 메타가 거절
const PARALLEL = 4;

export async function fetchMetaDemographics(accountId: string, token: string, since: string, until: string, adIds?: string[]): Promise<DemographicsRes> {
  const act = actOf(accountId);
  const ids = [...new Set((adIds ?? []).filter((x) => /^\d+$/.test(x)))].sort();
  const key = `${act}|${since}|${until}|${ids.length ? ids.join(",") : "all"}`;
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.res;
  const base = { level: "ad", time_range: JSON.stringify({ since, until }), breakdowns: "age,gender", fields: "ad_id,impressions,inline_link_clicks,spend,actions,action_values" };
  let raw: Raw[];
  if (!ids.length) raw = await graphAll<Raw>(`${act}/insights`, base, token, 60);
  else {
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
    const parts: Raw[][] = new Array(chunks.length);
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(PARALLEL, chunks.length) }, async () => {
        while (next < chunks.length) {
          const i = next++;
          parts[i] = await graphAll<Raw>(`${act}/insights`, { ...base, filtering: JSON.stringify([{ field: "ad.id", operator: "IN", value: chunks[i] }]) }, token, 20);
        }
      }),
    );
    raw = parts.flat();
  }
  const rows: DemoRow[] = raw
    .filter((r) => num(r.impressions) > 0 || num(r.spend) > 0)
    .map((r) => ({
      adId: String(r.ad_id ?? ""),
      age: String(r.age ?? "Unknown") === "Unknown" ? "연령 미상" : String(r.age),
      gender: GENDER[String(r.gender ?? "unknown")] ?? "성별 미상",
      impressions: num(r.impressions),
      linkClicks: num(r.inline_link_clicks),
      cost: num(r.spend),
      conversions: pickAction(r.actions, PURCHASE_TYPES),
      revenue: pickAction(r.action_values, PURCHASE_TYPES),
    }));
  const res: DemographicsRes = { period: { since, until }, rows, fetchedAt: new Date().toISOString() };
  CACHE.set(key, { at: Date.now(), res });
  return res;
}
