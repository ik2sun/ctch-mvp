"use client";

// 소재명·UTM 기반 위젯 — 태그 칩 / 소재 유형별 성과 맵(버블) / A/B 테스트 그룹 / UTM 고급 필터 사이드바.
// 차트 규칙(ctch-dataviz): 강조 1색(signal), 평균 기준선, 버블 크기=광고비, 툴팁·목록으로 값을 글자로도 읽게.
import { CartesianGrid, ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import type { TooltipContentProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import type { Enriched } from "./analyze";
import type { NamingDict } from "./naming";
import { abKey, facetValue, FACETS, matches, NONE, objectiveCode, type AbGroup, type FacetKey, type FacetSel, type ThemeStat } from "./groups";
import { Thumb } from "./CreativeGallery";

const won = (v: number) => (v >= 1e8 ? `${(v / 1e8).toFixed(1)}억` : v >= 1e4 ? `${Math.round(v / 1e4).toLocaleString("ko-KR")}만` : Math.round(v).toLocaleString("ko-KR"));
const pct = (v: number | null, d = 0) => (v == null ? "—" : `${(v * 100).toFixed(d)}%`);
const OBJ_ICON: Record<string, string> = { cv: "🎯", tr: "🔗", eg: "💬", bd: "✨", ba: "📣" };

// ── ① 태그 칩 ─────────────────────────────
export function ParsedTags({ row, dict, max = 4 }: { row: Enriched; dict: NamingDict; max?: number }) {
  const p = row.parsed;
  const code = objectiveCode(row, dict);
  const obj = code ? `${OBJ_ICON[code] ?? "🎯"} ${dict.objectives[code] ?? code}(${code.toUpperCase()})` : null;
  const theme = p.tvc ?? p.theme ?? (p.influencer ? `@${p.influencer}` : null);
  const product = p.products[0] ?? null;
  const ab = abKey(row.name);
  const serial = p.serial ?? ab?.variant ?? null;
  const chips: { t: string; cls: string }[] = [
    obj ? { t: obj, cls: "bg-signal-soft text-signal" } : null,
    theme ? { t: `👟 ${theme}`, cls: "bg-[#FFF3EF] text-[#9A3412]" } : null,
    product && product !== theme ? { t: `🏷️ ${product}`, cls: "bg-canvas text-ink-soft" } : null,
    p.model && p.model !== theme ? { t: `👤 ${p.model}`, cls: "bg-canvas text-ink-soft" } : null,
    serial ? { t: `📷 소재 ${serial}`, cls: "bg-canvas text-ink-muted" } : null,
  ].filter((x): x is { t: string; cls: string } => !!x);
  return (
    <div className="flex flex-wrap gap-1" title={row.name}>
      {chips.slice(0, max).map((c) => (
        <span key={c.t} className={`max-w-full truncate whitespace-nowrap rounded-md px-1.5 py-0.5 text-[12px] font-medium ${c.cls}`}>
          {c.t}
        </span>
      ))}
      {chips.length === 0 && <span className="truncate font-mono text-[12px] text-ink-muted">{row.name}</span>}
    </div>
  );
}

// ── ② 소재 유형별 성과 맵 — 4사분면 매트릭스(2026-10-04 2차) ─────────────────────────────
// 가로 = 광고비(로그 눈금 — 테마별 광고비 차이가 수십 배라), 세로 = ROAS(TR 탭은 CTR), 버블 = 테마(크기 = 소재 수).
// 십자선 = 테마 평균 광고비 × 전체 ROAS → 우상 위너 / 좌상 증액 기회 / 좌하 성과 저조 / 우하 중단 검토.
// 색: 평균 위 = 브랜드 오렌지, 아래 = 회색(80% 불투명 + 흰 테두리, 버블 안에 테마명).
const ORANGE = "#F45B35";
const GRAY = "#A7ACB4";
type Quad = "winner" | "grow" | "low" | "stop";
const QUAD: Record<Quad, { title: string; icon: string; desc: string; card: string; head: string; tint: string }> = {
  winner: { title: "위너", icon: "🏆", desc: "고효율 · 고비용 — 지금처럼 유지·확장", card: "border-[#F45B35]/40 bg-[#FFF3EF]", head: "text-[#C2410C]", tint: "rgba(244,91,53,0.06)" },
  grow: { title: "예산 증액 기회", icon: "📈", desc: "고효율 · 저비용 — 예산을 늘려 볼 후보", card: "border-[#F45B35]/25 bg-[#FFF8F5]", head: "text-[#C2410C]", tint: "rgba(244,91,53,0.03)" },
  low: { title: "성과 저조", icon: "💤", desc: "저효율 · 저비용 — 소재 교체·정리", card: "border-line bg-canvas", head: "text-ink-soft", tint: "rgba(167,172,180,0.05)" },
  stop: { title: "즉시 중단 검토", icon: "⛔", desc: "저효율 · 고비용 — 예산 축소·중단 우선", card: "border-bad/30 bg-bad/[0.04]", head: "text-bad", tint: "rgba(220,38,38,0.04)" },
};

export function ThemeMap({ stats, avg, metric, onPick, adsManagerUrl, baseLabel = "평균" }: { stats: ThemeStat[]; avg: number | null; metric: "roas" | "ctr"; onPick?: (keys: string[], label: string) => void; adsManagerUrl?: string | null; baseLabel?: string }) {
  // 광고비가 최대 테마의 1/300도 안 되는 테마는 로그 축을 늘리기만 해서 차트에서 빼고 개수만 표기
  const maxCost = Math.max(0, ...stats.map((s) => s.cost));
  const visible = stats.filter((s) => s.cost > 0 && s.key !== "rest" && s.cost >= maxCost / 300);
  const hidden = stats.filter((s) => s.key !== "rest" && s.cost > 0 && s.cost < maxCost / 300).length;
  const data = visible.map((s) => ({ ...s, x: s.cost, y: (metric === "roas" ? s.roas : s.ctr) ?? 0 }));
  if (data.length < 2 || avg == null) return <p className="py-10 text-center text-[15px] text-ink-muted">비교할 소재 유형이 2개 이상 있어야 해요.</p>;
  const fmtY = (v: number) => (metric === "roas" ? `${Math.round(v * 100)}%` : `${(v * 100).toFixed(2)}%`);
  const avgCost = data.reduce((s, d) => s + d.x, 0) / data.length;
  const quadOf = (d: { x: number; y: number }): Quad => (d.y >= avg ? (d.x >= avgCost ? "winner" : "grow") : d.x >= avgCost ? "stop" : "low");
  const xs = data.map((d) => d.x);
  const ys = data.map((d) => d.y);
  const xMin = Math.min(...xs) / 1.8;
  const xMax = Math.max(...xs) * 2.2; // 오른쪽 끝 큰 버블·이름이 잘리지 않게 여유
  const yMax = Math.max(...ys, avg) * 1.15;
  const groups = (["winner", "grow", "stop", "low"] as Quad[]).map((q) => ({ q, items: data.filter((d) => quadOf(d) === q).sort((a, b) => b.x - a.x) }));

  const Tip = ({ active, payload }: TooltipContentProps<ValueType, NameType>) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload as (typeof data)[number];
    const q = QUAD[quadOf(d)];
    return (
      <div className="min-w-[210px] rounded-lg border border-line bg-surface px-3 py-2.5 text-[13px] shadow-[0_4px_16px_rgba(21,24,30,0.08)]">
        <p className="font-medium text-ink">{d.label}</p>
        <p className={`mb-1.5 text-[12px] ${q.head}`}>{q.icon} {q.title}</p>
        <ul className="space-y-0.5 tabular-nums">
          <li className="flex justify-between gap-4"><span className="text-ink-muted">광고비</span><span>₩{Math.round(d.cost).toLocaleString("ko-KR")} ({pct(d.share)})</span></li>
          <li className="flex justify-between gap-4"><span className="text-ink-muted">{metric === "roas" ? "ROAS" : "CTR"}</span><span className="font-semibold">{fmtY(d.y)}</span></li>
          <li className="flex justify-between gap-4"><span className="text-ink-muted">소재 수</span><span>{d.n}개</span></li>
        </ul>
        <p className="mt-1.5 border-t border-line pt-1.5 text-[12px] text-ink-muted">누르면 아래 갤러리에서 이 테마 소재만 보여요</p>
      </div>
    );
  };

  // 버블 — 원 + 가로 테마명(작은 원은 오른쪽에)
  const Bubble = (props: { cx?: number; cy?: number; size?: number; payload?: (typeof data)[number] }) => {
    const { cx = 0, cy = 0, size = 100, payload } = props;
    if (!payload) return <g />;
    const r = Math.sqrt(size / Math.PI);
    const good = payload.y >= avg;
    const name = payload.label.length > 12 ? `${payload.label.slice(0, 11)}…` : payload.label;
    return (
      <g style={{ cursor: onPick ? "pointer" : undefined }} onClick={() => onPick?.([payload.key], payload.label)}>
        <circle cx={cx} cy={cy} r={r} fill={good ? ORANGE : GRAY} fillOpacity={0.8} stroke="#FFFFFF" strokeWidth={1.5} />
        {/* 이름은 버블 오른쪽, 흰 테두리 글자(겹쳐도 읽히게) */}
        <text x={cx + r + 4} y={cy} dy="0.35em" fontSize={12} fontWeight={600} fill="#1D2939" stroke="#FFFFFF" strokeWidth={3} paintOrder="stroke" style={{ pointerEvents: "none" }}>
          {name}
        </text>
      </g>
    );
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        <div className="h-[380px]">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 12, right: 20, bottom: 24, left: 4 }}>
              {/* 사분면 바탕 — 패널 카드와 같은 색 계열 */}
              <ReferenceArea x1={avgCost} x2={xMax} y1={avg} y2={yMax} fill={QUAD.winner.tint} strokeOpacity={0} ifOverflow="hidden" />
              <ReferenceArea x1={xMin} x2={avgCost} y1={avg} y2={yMax} fill={QUAD.grow.tint} strokeOpacity={0} ifOverflow="hidden" />
              <ReferenceArea x1={xMin} x2={avgCost} y1={0} y2={avg} fill={QUAD.low.tint} strokeOpacity={0} ifOverflow="hidden" />
              <ReferenceArea x1={avgCost} x2={xMax} y1={0} y2={avg} fill={QUAD.stop.tint} strokeOpacity={0} ifOverflow="hidden" />
              <CartesianGrid stroke="#EEEEEA" />
              <XAxis dataKey="x" type="number" scale="log" domain={[xMin, xMax]} allowDataOverflow tick={{ fontSize: 13, fill: "#4A4F58", fontWeight: 500 }} tickFormatter={won} tickLine={false} axisLine={{ stroke: "#D9D9D4" }} label={{ value: "광고비 →", position: "insideBottomRight", offset: -12, fill: "#475467", fontSize: 12 }} />
              <YAxis dataKey="y" type="number" domain={[0, yMax]} tick={{ fontSize: 13, fill: "#4A4F58", fontWeight: 500 }} tickFormatter={fmtY} tickLine={false} axisLine={false} width={62} />
              <ZAxis dataKey="n" type="number" range={[90, 1100]} />
              <Tooltip content={Tip} cursor={false} />
              <ReferenceLine y={avg} stroke="#344054" strokeWidth={1} label={{ value: `${baseLabel} ${fmtY(avg)}`, position: "insideBottomLeft", fill: "#344054", fontSize: 12 }} />
              <ReferenceLine x={avgCost} stroke="#344054" strokeWidth={1} label={{ value: `평균 광고비 ${won(avgCost)}`, position: "insideTopLeft", fill: "#344054", fontSize: 12 }} />
              <Scatter data={data} shape={Bubble} isAnimationActive={false} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-muted">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: ORANGE }} aria-hidden /> {baseLabel} {metric === "roas" ? "ROAS" : "CTR"} 이상</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: GRAY }} aria-hidden /> {baseLabel} 미만</span>
          <span>세로 {metric === "roas" ? "ROAS" : "CTR"} · 가로 광고비(로그 눈금) · 원 크기 = 소재 수 · 십자선 = 테마 평균 광고비 × {baseLabel === "평균" ? "전체" : baseLabel} {metric === "roas" ? "ROAS" : "CTR"}{hidden ? ` · 광고비가 아주 적은 ${hidden}개 테마는 제외` : ""}</span>
        </div>
      </div>

      {/* 사분면 액션 패널 — 차트 사분면과 같은 색 */}
      <div className="grid grid-cols-2 gap-2.5 self-start xl:grid-cols-1">
        {groups.map(({ q, items }) => {
          const m = QUAD[q];
          return (
            <div key={q} className={`rounded-lg border px-3 py-2.5 ${m.card}`}>
              <div className="flex items-baseline justify-between gap-2">
                <p className={`text-[13px] font-semibold ${m.head}`}>{m.icon} {m.title} <span className="font-normal text-ink-muted">{items.length}</span></p>
                <p className="hidden text-[11px] text-ink-muted 2xl:block">{m.desc.split(" — ")[0]}</p>
              </div>
              {items.length === 0 ? (
                <p className="mt-1 text-[12px] text-ink-muted">해당 테마 없음</p>
              ) : (
                <>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink">
                    {items.slice(0, 3).map((d, i) => (
                      <span key={d.key}>
                        {i > 0 && " · "}
                        {d.label} <span className="text-ink-muted tabular-nums">{fmtY(d.y)}</span>
                      </span>
                    ))}
                    {items.length > 3 && <span className="text-ink-muted"> 외 {items.length - 3}</span>}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {onPick && (
                      <button type="button" onClick={() => onPick(items.map((d) => d.key), `${m.icon} ${m.title}`)} className="rounded-md border border-line bg-surface px-2 py-1 text-[12px] font-medium text-ink-soft hover:border-ink-faint hover:text-ink">
                        상세 소재 보기
                      </button>
                    )}
                    {(q === "grow" || q === "stop") && adsManagerUrl && (
                      <a href={adsManagerUrl} target="_blank" rel="noreferrer" className={`rounded-md px-2 py-1 text-[12px] font-medium text-white ${q === "grow" ? "bg-[#F45B35] hover:brightness-95" : "bg-bad hover:brightness-95"}`}>
                        {q === "grow" ? "예산 늘리기 ↗" : "예산 줄이기 ↗"}
                      </a>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
        {adsManagerUrl && <p className="col-span-2 text-[11px] text-ink-muted xl:col-span-1">예산 버튼은 메타 광고 관리자를 열어요(소재 단위 예산은 광고세트·캠페인에서 조정).</p>}
      </div>
    </div>
  );
}

// ── ③ A/B 테스트 그룹 ─────────────────────────────
export function AbTestPanel({ groups, onOpen }: { groups: AbGroup[]; onOpen: (r: Enriched) => void }) {
  if (!groups.length) return <p className="py-6 text-center text-[15px] text-ink-muted">이름 앞부분(날짜_목표_콘텐츠)이 같고 번호만 다른 소재가 없어요.</p>;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {groups.slice(0, 8).map((g) => {
        const v = (r: Enriched) => (g.metric === "roas" ? r.roas : r.ctr);
        const max = Math.max(0.0001, ...g.rows.map((r) => v(r) ?? 0));
        return (
          <div key={g.prefix} className="rounded-lg border border-line p-3.5">
            <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
              <p className="truncate font-mono text-[13px] text-ink-soft" title={g.prefix}>{g.prefix}_*</p>
              <p className="text-[12px] text-ink-muted">
                {g.rows.length}개 변형 · {g.metric === "roas" ? "ROAS" : "CTR"} 기준
                {g.lift != null && <span className="ml-1 font-semibold text-good">위너 +{Math.round(g.lift * 100)}%</span>}
              </p>
            </div>
            <ul className="space-y-1.5">
              {g.rows.map((r) => {
                const win = r.id === g.winnerId;
                const val = v(r);
                return (
                  <li key={r.id}>
                    <button type="button" onClick={() => onOpen(r)} className="flex w-full items-center gap-2.5 text-left">
                      <Thumb row={r} fit="cover" className="h-10 w-8 flex-shrink-0 rounded" />
                      <span className={`w-16 flex-shrink-0 truncate text-[13px] ${win ? "font-semibold text-ink" : "text-ink-soft"}`}>
                        {win && <span aria-label="위너">👑 </span>}
                        {abKey(r.name)?.variant ?? "—"}
                      </span>
                      <span className="h-2 flex-1 rounded bg-canvas">
                        <span className={`block h-2 rounded ${win ? "bg-signal" : "bg-[#C9CDD4]"}`} style={{ width: `${((val ?? 0) / max) * 100}%` }} />
                      </span>
                      <span className={`w-16 text-right text-[13px] tabular-nums ${win ? "font-semibold text-ink" : "text-ink-soft"}`}>
                        {!r.judged ? <span className="text-ink-faint">보류</span> : g.metric === "roas" ? pct(val) : pct(val, 2)}
                      </span>
                      <span className="w-14 text-right text-[12px] tabular-nums text-ink-muted">{won(r.cost)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

// ── ④ UTM 고급 필터 — 옅은 회색 패널(#F8F9FA) + 둥근 칩(선택 = 오렌지 틴트) ─────────────────────────────
export function UtmSidebar({ rows, sel, onChange }: { rows: Enriched[]; sel: FacetSel; onChange: (s: FacetSel) => void }) {
  const hasUtm = rows.some((r) => r.utm);
  const active = (Object.values(sel) as string[][]).reduce((n, v) => n + (v?.length ?? 0), 0);
  return (
    <aside className="space-y-5 rounded-card border border-line bg-[#F8F9FA] p-4 xl:sticky xl:top-4 xl:self-start">
      <div className="flex items-center justify-between">
        <p className="text-[15px] font-semibold text-ink">고급 필터 <span className="text-[12px] font-normal text-ink-muted">UTM</span></p>
        {active > 0 ? (
          <button type="button" onClick={() => onChange({})} className="rounded-full bg-[#FFF3EF] px-2.5 py-0.5 text-[12px] font-medium text-[#C2410C] hover:brightness-95">
            {active}개 선택 · 초기화
          </button>
        ) : (
          <span className="text-[12px] text-ink-muted">전체</span>
        )}
      </div>
      {!hasUtm ? (
        <p className="text-[13px] leading-relaxed text-ink-muted">이 기간 소재에서 UTM을 찾지 못했어요. 랜딩 URL이나 메타 ‘URL 매개변수’에 utm_source·utm_campaign을 넣으면 여기서 교차로 좁혀 볼 수 있어요.</p>
      ) : (
        FACETS.map((f) => {
          const pool = rows.filter((r) => matches(r, sel, f.key)); // 다른 필터만 적용한 상태의 개수(교차)
          const counts = new Map<string, { n: number; cost: number }>();
          for (const r of pool) {
            const v = facetValue(r, f.key);
            const c = counts.get(v) ?? { n: 0, cost: 0 };
            counts.set(v, { n: c.n + 1, cost: c.cost + r.cost });
          }
          const values = [...counts.entries()].sort((a, b) => (a[0] === NONE ? 1 : b[0] === NONE ? -1 : b[1].cost - a[1].cost));
          if (values.length <= 1 && values[0]?.[0] === NONE) return null;
          const picked = sel[f.key] ?? [];
          return (
            <div key={f.key} role="group" aria-label={f.label}>
              <p className="mb-2 text-[12px] font-semibold text-ink-soft" title={f.hint}>
                {f.label} <span className="font-normal text-ink-faint">{f.hint.split(" ")[0]}</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {values.map(([v, c]) => {
                  const on = picked.includes(v);
                  return (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={on}
                      onClick={() => onChange({ ...sel, [f.key]: on ? picked.filter((x) => x !== v) : [...picked, v] })}
                      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px] transition ${
                        on ? "border-[#F45B35]/50 bg-[#FFF3EF] font-semibold text-[#C2410C]" : v === NONE ? "border-transparent bg-surface text-ink-muted hover:border-line" : "border-line bg-surface text-ink hover:border-ink-faint"
                      }`}
                    >
                      {on && <span aria-hidden>✓</span>}
                      {v}
                      <span className={`tabular-nums text-[12px] ${on ? "text-[#C2410C]/80" : "text-ink-muted"}`}>{c.n}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
      <p className="border-t border-line pt-3 text-[11px] leading-relaxed text-ink-muted">숫자는 다른 필터를 적용한 상태의 소재 수예요. 같은 묶음 안에서 여러 개를 고르면 ‘또는’, 묶음끼리는 ‘그리고’로 좁혀요.</p>
    </aside>
  );
}

export type { FacetKey, FacetSel };
