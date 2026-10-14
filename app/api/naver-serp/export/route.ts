import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dataOwnerId } from "@/lib/workspace";
import type { PowerLinkAd } from "@/lib/naver-serp/rankChecker";
import { buildTrendBlocks, injectTrendCharts, writeTrendSheet } from "@/lib/naver-serp/rankTrendSheet";
import { SHOP_KIND_LABEL, snapshotHas, type ShopItem, type ShoppingSnapshot } from "@/lib/naver-serp/shopping";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// 경쟁사 모니터링 엑셀 — 고른 키워드만, 고른 기간만. 가격비교·플러스 스토어 상품 이미지는 셀에 넣는다
// (브라우저에서는 네이버 이미지 CORS 때문에 못 넣어 서버에서 만든다).

type Keyword = { id: string; keyword: string; target_domain: string | null; target_mall?: string | null };
type Check = {
  keyword_id: string;
  device: "pc" | "mobile";
  matched_rank: number | null;
  ads_snapshot: PowerLinkAd[];
  shopping_snapshot?: ShoppingSnapshot | null;
  checked_at: string;
};

const DEVICE_LABEL = { pc: "PC", mobile: "모바일" } as const;
const MAX_IMAGES = 400; // 파일이 너무 커지지 않게 — 최근 확인부터 채운다
const THUMB = 64; // px

const HEAD_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF344054" } };

function fmt(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function sheetWith(wb: ExcelJS.Workbook, name: string, cols: { header: string; width: number }[]) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = cols.map((c) => ({ header: c.header, width: c.width }));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = HEAD_FILL;
  head.height = 22;
  head.alignment = { vertical: "middle" };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  return ws;
}

// 네이버 이미지 서버(pstatic.net)만 받는다 — 임의 주소 요청 방지
async function fetchThumb(url: string): Promise<{ buffer: Buffer; extension: "jpeg" | "png" } | null> {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || !u.hostname.endsWith("pstatic.net")) return null;
    const tries = [`${url}${url.includes("?") ? "&" : "?"}type=f300`, url];
    for (const t of tries) {
      const res = await fetch(t, { signal: AbortSignal.timeout(8000), headers: { Referer: "https://search.naver.com/" } });
      if (!res.ok) continue;
      const type = res.headers.get("content-type") ?? "";
      const extension = type.includes("png") ? "png" : type.includes("jpeg") || type.includes("jpg") ? "jpeg" : null;
      if (!extension) continue; // webp·gif는 엑셀이 못 넣음
      return { buffer: Buffer.from(await res.arrayBuffer()), extension };
    }
  } catch {
    // 이미지 하나 실패는 URL 칸으로 대신
  }
  return null;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { keywordIds?: string[]; days?: number | null; clientName?: string };
  const ids = (body.keywordIds ?? []).filter((x) => typeof x === "string").slice(0, 500);
  if (ids.length === 0) return NextResponse.json({ error: "내보낼 키워드를 골라 주세요." }, { status: 400 });
  const days = body.days && body.days > 0 ? Math.min(body.days, 365) : null;
  const ownerId = await dataOwnerId(user);

  let { data: kwData, error: kwErr } = await supabase
    .from("competitor_keywords")
    .select("id, keyword, target_domain, target_mall")
    .in("id", ids)
    .eq("user_id", ownerId);
  if (kwErr) {
    const { data } = await supabase.from("competitor_keywords").select("id, keyword, target_domain").in("id", ids).eq("user_id", ownerId);
    kwData = data as typeof kwData;
  }
  const keywords = (kwData ?? []) as Keyword[];
  if (keywords.length === 0) return NextResponse.json({ error: "키워드를 찾을 수 없어요." }, { status: 404 });
  const byId = new Map(keywords.map((k) => [k.id, k]));

  // 이력(최신순). 1시간 주기면 행이 많아 1,000건씩 끝까지
  const checks: Check[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    let q = supabase
      .from("competitor_rank_checks")
      .select("*")
      .in("keyword_id", keywords.map((k) => k.id))
      .order("checked_at", { ascending: false })
      .range(from, from + 999);
    if (days) q = q.gte("checked_at", new Date(Date.now() - days * 86_400_000).toISOString());
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    checks.push(...((data ?? []) as Check[]));
    if (!data || data.length < 1000) break;
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "CTCH";

  // ① 요약 — 키워드 × 기기 최신 1건
  const summary = sheetWith(wb, "요약", [
    { header: "키워드", width: 20 },
    { header: "타겟 도메인", width: 22 },
    { header: "타겟 몰·브랜드", width: 18 },
    { header: "기기", width: 8 },
    { header: "파워링크 순위", width: 13 },
    { header: "가격비교 순위", width: 13 },
    { header: "플러스 스토어 순위", width: 16 },
    { header: "마지막 확인", width: 18 },
  ]);
  const seen = new Set<string>();
  for (const c of checks) {
    const key = `${c.keyword_id}|${c.device}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const k = byId.get(c.keyword_id)!;
    const shop = c.shopping_snapshot;
    const rankText = (has: boolean, r: number | null | undefined) => (!has ? "타겟 없음" : r ? `${r}위` : "순위 밖");
    const anyTarget = !!(k.target_domain || k.target_mall);
    summary.addRow([
      k.keyword,
      k.target_domain ?? "",
      k.target_mall ?? "",
      DEVICE_LABEL[c.device],
      snapshotHas(shop, "powerlink") ? rankText(!!k.target_domain, c.matched_rank) : "수집 안 함",
      snapshotHas(shop, "price") ? rankText(anyTarget, shop?.priceRank) : "수집 안 함",
      snapshotHas(shop, "store") ? rankText(anyTarget, shop?.storeRank) : "수집 안 함",
      fmt(c.checked_at),
    ]);
  }

  // ①-2 순위 추이 — 업체별 × 시간대별 순위 표 + 꺾은선 차트(차트는 파일을 쓴 뒤 넣는다)
  const trendSpecs = writeTrendSheet(wb, buildTrendBlocks(keywords, checks));

  // ② 파워링크 — 기기별 시트(예전 형식 유지)
  for (const device of ["pc", "mobile"] as const) {
    const ws = sheetWith(wb, `파워링크_${DEVICE_LABEL[device]}`, [
      { header: "확인일시", width: 18 },
      { header: "키워드", width: 18 },
      { header: "타겟 도메인", width: 20 },
      { header: "순위", width: 6 },
      { header: "업체명", width: 20 },
      { header: "도메인", width: 22 },
      { header: "광고문구", width: 50 },
      { header: "랜딩 URL", width: 40 },
      { header: "타겟 매칭", width: 9 },
    ]);
    for (const c of checks) {
      if (c.device !== device || !snapshotHas(c.shopping_snapshot, "powerlink")) continue;
      const k = byId.get(c.keyword_id)!;
      const at = fmt(c.checked_at);
      if (!c.ads_snapshot?.length) {
        ws.addRow([at, k.keyword, k.target_domain ?? "", "", "", "", "노출된 파워링크 없음", "", ""]);
        continue;
      }
      for (const ad of c.ads_snapshot) {
        ws.addRow([at, k.keyword, k.target_domain ?? "", ad.rank, ad.business || ad.title || "", ad.domain, ad.description || ad.title || "", ad.landingUrl ?? "", ad.rank === c.matched_rank ? "O" : ""]);
      }
    }
  }

  // ③ 가격비교·플러스 스토어 — 이미지 칸 포함
  type Pending = { ws: ExcelJS.Worksheet; row: number; url: string };
  const pending: Pending[] = [];
  for (const [section, name] of [["price", "네이버 가격비교"], ["store", "네이버플러스 스토어"]] as const) {
    const ws = sheetWith(wb, name, [
      { header: "확인일시", width: 18 },
      { header: "키워드", width: 18 },
      { header: "기기", width: 8 },
      { header: "노출 순서", width: 9 },
      { header: "이미지", width: 11 },
      { header: "구분", width: 9 },
      { header: "상품명", width: 46 },
      { header: "판매처", width: 18 },
      { header: "판매가", width: 12 },
      { header: "할인 전", width: 12 },
      { header: "리뷰 평점", width: 9 },
      { header: "리뷰 수", width: 10 },
      { header: "상품 URL", width: 40 },
      { header: "이미지 URL", width: 40 },
      { header: "타겟 매칭", width: 9 },
    ]);
    for (const c of checks) {
      const shop = c.shopping_snapshot;
      if (!shop || !snapshotHas(shop, section)) continue;
      const k = byId.get(c.keyword_id)!;
      const items: ShopItem[] = shop[section] ?? [];
      const myRank = (section === "price" ? shop.priceRank : shop.storeRank) ?? null;
      const at = fmt(c.checked_at);
      if (items.length === 0) {
        ws.addRow([at, k.keyword, DEVICE_LABEL[c.device], "", "", "", `${name} 영역 없음`]);
        continue;
      }
      for (const it of items) {
        const row = ws.addRow([
          at,
          k.keyword,
          DEVICE_LABEL[c.device],
          it.position,
          "",
          SHOP_KIND_LABEL[it.kind],
          it.title,
          it.mall,
          it.price,
          it.originalPrice,
          it.reviewScore,
          it.reviewCount,
          it.url,
          it.imageUrl,
          it.position === myRank ? "O" : "",
        ]);
        row.getCell(9).numFmt = "#,##0";
        row.getCell(10).numFmt = "#,##0";
        row.alignment = { vertical: "middle" };
        if (it.imageUrl && pending.length < MAX_IMAGES) pending.push({ ws, row: row.number, url: it.imageUrl });
      }
    }
  }

  // 같은 이미지는 한 번만 받는다
  const uniq = [...new Set(pending.map((p) => p.url))];
  const fetched = await mapLimit(uniq, 8, fetchThumb);
  const imageIds = new Map<string, number>();
  uniq.forEach((u, i) => {
    const f = fetched[i];
    if (f) imageIds.set(u, wb.addImage({ buffer: f.buffer as unknown as ExcelJS.Buffer, extension: f.extension }));
  });
  for (const p of pending) {
    const id = imageIds.get(p.url);
    if (id === undefined) continue;
    p.ws.getRow(p.row).height = THUMB * 0.75 + 6; // px → pt
    p.ws.addImage(id, { tl: { col: 4.1, row: p.row - 1 + 0.05 }, ext: { width: THUMB, height: THUMB }, editAs: "oneCell" });
  }

  // ④ 안내
  const info = wb.addWorksheet("안내");
  info.columns = [{ width: 18 }, { width: 90 }];
  [
    ["광고주", body.clientName ?? ""],
    ["기간", days ? `최근 ${days}일` : "전체"],
    ["키워드", keywords.map((k) => k.keyword).join(", ")],
    ["확인 회차", `${checks.length}건(기기별)`],
    ["순위 추이", "키워드 × 기기 × 영역마다 업체별 노출 회차·평균·최고 순위·3위 내 노출률(전체 회차 중 3위 안에 든 비율)과 시간대별 순위, 꺾은선 차트(위 = 1위, 상위 8곳). 최근 168회차까지"],
    ["이미지", `상품 이미지는 최근 확인부터 최대 ${MAX_IMAGES}개까지 셀에 넣고, 나머지는 '이미지 URL' 칸을 보세요.`],
    ["가격비교 구분", "광고 = 쇼핑검색 광고, 가격비교 = 여러 판매처를 묶은 상품(판매처 수 표시), 일반 = 개별 판매처 상품, 슈퍼적립 = 네이버 적립 프로모션"],
    ["모바일 가격비교", "모바일은 옆으로 넘기는 여러 페이지가 함께 오는데, 첫 화면(1페이지)만 기록합니다."],
  ].forEach((r) => info.addRow(r));
  info.getColumn(1).font = { bold: true };

  const buf = await injectTrendCharts((await wb.xlsx.writeBuffer()) as ArrayBuffer, trendSpecs);
  const date = new Date().toISOString().slice(0, 10);
  const koreanName = `CTCH_경쟁사모니터링${body.clientName ? `_${body.clientName}` : ""}_${date}.xlsx`;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="competitor_${date}.xlsx"; filename*=UTF-8''${encodeURIComponent(koreanName)}`,
    },
  });
}
