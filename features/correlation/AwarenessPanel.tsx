"use client";

// 인지·영상 캠페인 판단 근거 — ROAS 대신 전달 효율·주목도·하위 퍼널 신호로 본다(계산은 awareness.ts).
import { useState } from "react";
import { Card } from "@/features/dashboard/ui";
import { MEDIA_COLORS } from "@/features/dashboard/analysis";
import { fmtValue } from "./charts";
import { AWARENESS_ROLES, type AwarenessRow, type Level, type RoleSignal } from "./awareness";
import { MEDIA_LABEL, ROLE_META } from "./types";

const LEVEL: Record<Level, { cls: string; word: string }> = {
  good: { cls: "text-good", word: "좋음" },
  bad: { cls: "text-bad", word: "낮음" },
  neutral: { cls: "text-ink-soft", word: "보통" },
  unknown: { cls: "text-ink-muted", word: "—" },
};
const TONE: Record<AwarenessRow["verdict"]["tone"], string> = {
  good: "border-good/25 bg-good/10 text-good",
  warn: "border-warn/25 bg-warn/10 text-warn",
  bad: "border-bad/25 bg-bad/10 text-bad",
  muted: "border-line bg-canvas text-ink-soft",
};

const pct = (v: number | null, d = 1) => (v == null ? "—" : `${(v * 100).toFixed(d)}%`);
const ratio = (v: number | null) => (v == null ? null : `${v >= 1 ? "+" : "−"}${Math.abs(Math.round((v - 1) * 100))}%`);

function VsPeer({ v, level, inverse }: { v: number | null; level: Level; inverse?: boolean }) {
  if (v == null) return <span className="text-[12px] text-ink-muted">비교 없음</span>;
  return (
    <span className={`text-[12px] font-medium ${LEVEL[level].cls}`} title={inverse ? "비교 그룹 중앙값 대비(낮을수록 저렴)" : "비교 그룹 중앙값 대비"}>
      {ratio(v)} {level !== "unknown" && level !== "neutral" ? `· ${inverse ? (level === "good" ? "저렴" : "비쌈") : LEVEL[level].word}` : ""}
    </span>
  );
}

function SignalLine({ s, unitWord }: { s: RoleSignal; unitWord: string }) {
  const when = s.lag === 0 ? "같은 날" : `${s.lag}일 뒤`;
  const tone = s.positive ? "text-good" : s.negative ? "text-warn" : "text-ink-muted";
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-line/60 py-1.5 last:border-0">
      <span className="text-ink-soft">{s.outcomeLabel}</span>
      <span className={`tabular-nums ${tone}`}>
        {s.r == null ? "—" : s.positive ? `${when} 함께 늘어남 (r ${s.r.toFixed(2)})` : s.negative ? `${when} 반대로 (r ${s.r.toFixed(2)})` : "뚜렷한 관계 없음"}
        {s.confirmed && s.perUnit != null && <span className="ml-1.5 font-semibold">· {unitWord}당 +{fmtValue(s.perUnit, s.unit, s.noun)}</span>}
        {s.onOffPct != null && (
          <span className={`ml-1.5 ${s.onOffSig ? "font-medium text-ink" : "text-ink-muted"}`}>
            · 집행일 {s.onOffPct >= 0 ? "+" : "−"}
            {Math.abs(Math.round(s.onOffPct * 100))}%
          </span>
        )}
      </span>
    </li>
  );
}

export function AwarenessPanel({ rows, signals, driverKeys, unitWord }: { rows: AwarenessRow[]; signals: Record<string, RoleSignal[]>; driverKeys: Set<string>; unitWord: string }) {
  const [showAll, setShowAll] = useState(false);
  if (!rows.length) return null;
  const list = showAll ? rows : rows.slice(0, 10);
  const roles = AWARENESS_ROLES.filter((r) => rows.some((x) => x.role === r));

  return (
    <Card title="인지·영상 캠페인 판단 근거" sub="인지 캠페인은 자기 ROAS로 평가하지 않아요 — ① 전달 효율 ② 주목도 ③ 하위 퍼널 신호, 세 가지로 봐요">
      <div className="mb-4 grid grid-cols-1 gap-2 text-[13px] leading-relaxed md:grid-cols-3">
        <div className="rounded-lg bg-canvas px-3.5 py-2.5">
          <b className="text-ink">① 전달 효율 · ② 주목도</b>
          <p className="text-ink-soft">CPM·도달·빈도와 재생률을 보고, 판단은 종합 효율로 해요 — 영상은 조회 1회당 비용, 도달·인지는 도달 1천 명당 비용. 비교 그룹 중앙값의 80% 이하 = 효율 좋음, 125% 이상 = 비쌈</p>
        </div>
        <div className="rounded-lg bg-canvas px-3.5 py-2.5">
          <b className="text-ink">비교 그룹</b>
          <p className="text-ink-soft">같은 매체 × 같은 역할 × 같은 매체 목표(구글은 채널 유형)끼리만 비교해요. 범퍼·VRC·디맨드젠·VVC는 단가가 원래 달라서 섞지 않아요</p>
        </div>
        <div className="rounded-lg bg-canvas px-3.5 py-2.5">
          <b className="text-ink">③ 하위 퍼널 신호</b>
          <p className="text-ink-soft">그 역할 광고비가 늘고 며칠 뒤 브랜드검색·검색 클릭, 성과 캠페인 전환이 함께 늘었는지(위 분석과 같은 방법)</p>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {roles.map((r) => (
          <div key={r} className="rounded-lg border border-line px-4 py-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-[15px] font-semibold text-ink">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: ROLE_META[r].color }} aria-hidden />
              {ROLE_META[r].label} 캠페인 → 하위 퍼널
            </p>
            {!driverKeys.has(r) ? (
              <p className="text-[13px] text-ink-muted">집행일이 5일 미만이라 시계열 비교를 못 해요. 기간을 늘려 주세요.</p>
            ) : !signals[r]?.length ? (
              <p className="text-[13px] text-ink-muted">결과 지표(검색·전환 캠페인)가 없어 비교할 수 없어요.</p>
            ) : (
              <ul className="text-[13px]">
                {signals[r].map((s) => (
                  <SignalLine key={s.outcomeKey} s={s} unitWord={unitWord} />
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      <div className="overflow-x-auto [contain:paint]">
        <table className="w-full min-w-[1280px] text-[13px] [&_td:not(:first-child):not(:last-child)]:whitespace-nowrap [&_th]:whitespace-nowrap">
          <thead>
            <tr className="border-b border-line text-left text-[12px] text-ink-muted">
              <th className="py-2 pr-3 font-medium">캠페인</th>
              <th className="py-2 pr-3 text-right font-medium">광고비</th>
              <th className="py-2 pr-3 text-right font-medium">① CPM</th>
              <th className="py-2 pr-3 text-right font-medium">도달 · 빈도</th>
              <th className="py-2 pr-3 text-right font-medium">② 재생률</th>
              <th className="py-2 pr-3 text-right font-medium">종합 효율</th>
              <th className="py-2 pr-3 text-right font-medium">③ 하위 퍼널</th>
              <th className="py-2 pr-3 text-right font-medium" title="인지 캠페인 자체 전환 — 판단에는 쓰지 않아요">직접 ROAS (참고)</th>
              <th className="min-w-[280px] py-2 font-medium">판단</th>
            </tr>
          </thead>
          <tbody>
            {list.map((x) => (
              <tr key={x.id} className="border-b border-line/60 align-top">
                <td className="max-w-[280px] py-2 pr-3">
                  <span className="flex items-center gap-1.5 text-[12px] text-ink-muted">
                    <span className="h-2 w-2 rounded-full" style={{ background: MEDIA_COLORS[x.media] }} aria-hidden />
                    {MEDIA_LABEL[x.media] ?? x.media} · {ROLE_META[x.role].label} · {x.days}일
                  </span>
                  <span className="block truncate text-ink" title={x.name}>
                    {x.name}
                  </span>
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-ink">{fmtValue(x.cost, "won")}</td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  <span className="block text-ink">{x.cpm == null ? "—" : `${Math.round(x.cpm).toLocaleString("ko-KR")}원`}</span>
                  <VsPeer v={x.cpmVsPeer} level={x.delivery} inverse />
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {x.reach ? (
                    <>
                      <span className="block text-ink">{Math.round(x.reach).toLocaleString("ko-KR")}명</span>
                      <span className={`text-[12px] ${x.weeklyFreq != null && x.weeklyFreq >= 3 ? "font-medium text-warn" : "text-ink-muted"}`}>
                        빈도 {x.frequency?.toFixed(1)} · 1천 명당 {x.costPerReach1k ? `${Math.round(x.costPerReach1k).toLocaleString("ko-KR")}원` : "—"}
                      </span>
                    </>
                  ) : (
                    <span className="text-[12px] text-ink-muted">{x.media === "meta" ? "—" : "매체 미제공"}</span>
                  )}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  <span className="block text-ink">
                    {pct(x.viewRate)}
                    {x.thruRate != null && <span className="ml-1 text-[12px] text-ink-muted">ThruPlay {pct(x.thruRate)}</span>}
                  </span>
                  {x.viewRate == null ? (
                    <span className="text-[12px] text-ink-muted">{x.media === "kakao" ? "미수집" : "조회 없음"}</span>
                  ) : (
                    <>
                      {x.media === "google_ads" && <span className="block text-[12px] text-ink-muted">TrueView 조회율</span>}
                      <VsPeer v={x.viewVsPeer} level={x.attention} />
                    </>
                  )}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  <span className="block text-[12px] text-ink-muted">{x.effLabel}</span>
                  <span className="block font-semibold text-ink">{x.eff == null ? "—" : `${Math.round(x.eff).toLocaleString("ko-KR")}원`}</span>
                  {x.peers > 0 ? <VsPeer v={x.effVsPeer} level={x.efficiency} inverse /> : <span className="text-[12px] text-ink-muted">비교 그룹 없음</span>}
                </td>
                <td className={`py-2 pr-3 text-right text-[13px] font-medium ${LEVEL[x.signal].cls}`}>
                  {x.signal === "good" ? "신호 있음" : x.signal === "bad" ? "반대 신호" : x.signal === "neutral" ? "신호 없음" : "판단 보류"}
                  <span className="block text-[12px] font-normal text-ink-muted">역할 합계 기준</span>
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-ink-muted">{x.cost > 0 && x.revenue > 0 ? `${Math.round((x.revenue / x.cost) * 100).toLocaleString("ko-KR")}%` : "—"}</td>
                <td className="py-2">
                  <span className={`inline-flex whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[12px] font-medium ${TONE[x.verdict.tone]}`}>{x.verdict.label}</span>
                  <p className="mt-1 leading-relaxed text-ink-soft">{x.verdict.text}</p>
                  {x.notes.map((n) => (
                    <p key={n} className="mt-0.5 text-[12px] leading-relaxed text-ink-muted">
                      · {n}
                    </p>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 10 && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-2 text-[13px] text-ink-muted underline underline-offset-2 hover:text-ink">
          {showAll ? "접기" : `캠페인 ${rows.length - 10}개 더 보기`}
        </button>
      )}
      <p className="mt-3 text-[12px] leading-relaxed text-ink-muted">
        비교 기준은 이 광고주의 같은 매체·역할·목표 캠페인끼리예요(업계 평균 아님). 하위 퍼널 신호는 역할 합계 광고비로 계산해 캠페인별로는 나누지 못해요 — 캠페인 하나의 효과를 확실히 보려면 지역·기간을 나눈
        켰다 끄기(홀드아웃) 테스트나 매체의 브랜드 리프트 조사가 필요해요. 도달·빈도·ThruPlay는 메타만 받아요. 재생률은 메타 3초 재생·GFA 재생·구글 TrueView 조회(30초 이상 또는 끝까지)라 매체끼리 직접 비교하지 않아요.
      </p>
    </Card>
  );
}
