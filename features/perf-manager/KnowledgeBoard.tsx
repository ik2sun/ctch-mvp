"use client";

// 퍼포먼스 매니저 대시보드 — 정리 콘텐츠(퍼널 KPI·분해식·원칙·매체 플레이북·측정) + 최신 정보·세미나 자료 피드
import { useMemo, useState } from "react";
import { Card, Segmented } from "@/features/dashboard/ui";
import { FORMULAS, FUNNEL, MEASUREMENT, PLAYBOOKS, PRINCIPLES } from "./knowledge";
import { KIND_LABEL, PLATFORM_META, type Brief, type BriefKind, type BriefPlatform } from "./types";

export function KnowledgeBoard({
  briefs,
  loading,
  refreshing,
  lastRefreshed,
  canRefresh,
  refreshMsg,
  onRefresh,
  onAsk,
}: {
  briefs: Brief[];
  loading: boolean;
  refreshing: boolean;
  lastRefreshed: string | null;
  canRefresh: boolean;
  refreshMsg: string | null;
  onRefresh: () => void;
  onAsk: (q: string) => void;
}) {
  const [platform, setPlatform] = useState<BriefPlatform | "all">("all");
  const [kind, setKind] = useState<BriefKind | "all">("all");
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => briefs.filter((b) => (platform === "all" || b.platform === platform) && (kind === "all" || b.kind === kind)), [briefs, platform, kind]);
  const seminars = useMemo(() => briefs.filter((b) => b.kind === "seminar").slice(0, 6), [briefs]);
  const list = showAll ? filtered : filtered.slice(0, 8);
  const newest = briefs[0]?.date;

  return (
    <div className="space-y-5">
      {/* 최신 정보 */}
      <Card
        title="최신 정보"
        sub={`메타·구글·네이버·카카오 공식 발표·세미나 정리 · 최신 ${newest ?? "—"}${lastRefreshed ? ` · 마지막 업데이트 ${lastRefreshed.slice(0, 10)}` : ""}`}
        right={
          canRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              title="웹 검색으로 최근 소식을 찾아 추가해요(1~3분, 회당 API 비용 발생)"
              className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[13px] text-ink-soft hover:border-ink/30 hover:text-ink disabled:opacity-50"
            >
              <i className={`ti ${refreshing ? "ti-loader-2 animate-spin" : "ti-refresh"} text-[15px]`} aria-hidden />
              {refreshing ? "최신 소식 찾는 중… (1~3분)" : "최신 정보 업데이트"}
            </button>
          ) : null
        }
      >
        {refreshMsg && <p className="mb-3 rounded-lg bg-canvas px-3 py-2 text-[13px] text-ink-soft">{refreshMsg}</p>}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {(["all", ...Object.keys(PLATFORM_META)] as (BriefPlatform | "all")[]).map((p) => {
              const on = platform === p;
              const n = p === "all" ? briefs.length : briefs.filter((b) => b.platform === p).length;
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPlatform(p)}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] transition ${on ? "border-ink/15 bg-surface font-medium text-ink shadow-[0_1px_2px_rgba(21,24,30,0.06)]" : "border-line bg-canvas text-ink-muted hover:text-ink"}`}
                >
                  {p !== "all" && <span className="h-2 w-2 rounded-full" style={{ background: PLATFORM_META[p].color }} aria-hidden />}
                  {p === "all" ? "전체" : PLATFORM_META[p].label}
                  <span className="text-[12px] text-ink-muted">{n}</span>
                </button>
              );
            })}
          </div>
          <Segmented
            value={kind}
            options={[{ key: "all", label: "전체" }, ...(Object.keys(KIND_LABEL) as BriefKind[]).map((k) => ({ key: k, label: KIND_LABEL[k] }))] as { key: BriefKind | "all"; label: string }[]}
            onChange={setKind}
          />
        </div>
        {loading ? (
          <p className="py-10 text-center text-[15px] text-ink-muted">불러오는 중…</p>
        ) : list.length === 0 ? (
          <p className="py-10 text-center text-[15px] text-ink-muted">해당하는 소식이 없어요.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {list.map((b) => (
              <BriefCard key={b.id} b={b} onAsk={onAsk} />
            ))}
          </div>
        )}
        {filtered.length > 8 && (
          <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-3 text-[13px] text-ink-muted underline underline-offset-2 hover:text-ink">
            {showAll ? "접기" : `${filtered.length - 8}개 더 보기`}
          </button>
        )}
      </Card>

      {/* 세미나·공식 자료 */}
      {seminars.length > 0 && (
        <Card title="세미나·공식 행사 자료" sub="원문 링크로 발표 자료·다시보기를 확인하세요">
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {seminars.map((b) => (
              <li key={b.id}>
                <a href={b.source.url} target="_blank" rel="noreferrer" className="group flex items-start gap-3 rounded-lg border border-line px-3.5 py-3 transition hover:border-ink/30">
                  <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg" style={{ background: `${PLATFORM_META[b.platform].color}1f`, color: PLATFORM_META[b.platform].color }}>
                    <i className="ti ti-presentation text-[17px]" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-medium leading-snug text-ink group-hover:underline">{b.title}</span>
                    <span className="mt-0.5 block text-[12px] text-ink-muted">
                      {PLATFORM_META[b.platform].label} · {b.date} · {b.source.name}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* 퍼널 KPI */}
      <Card title="퍼널별 핵심 지표" sub="단계마다 평가 기준이 다르다 — 인지 캠페인을 CPA로 평가하지 않는다">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {FUNNEL.map((f, i) => (
            <div key={f.stage} className="rounded-lg border border-line p-3.5">
              <p className="flex items-center gap-1.5 text-[15px] font-semibold text-ink">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[12px] text-white">{i + 1}</span>
                {f.stage}
              </p>
              <p className="mt-1 text-[13px] text-ink-muted">{f.goal}</p>
              <div className="mt-2.5 flex flex-wrap gap-1">
                {f.kpis.map((k) => (
                  <span key={k} className="rounded-md bg-canvas px-1.5 py-0.5 text-[12px] text-ink-soft">
                    {k}
                  </span>
                ))}
              </div>
              <p className="mt-2.5 text-[12px] leading-relaxed text-ink-muted">
                <b className="font-medium text-ink-soft">매체</b> {f.media}
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
                <b className="font-medium text-ink-soft">주의</b> {f.watch}
              </p>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card title="성과 분해식" sub="결과 지표가 움직이면 어느 항이 변했는지부터">
          <ul className="space-y-2.5">
            {FORMULAS.map((f) => (
              <li key={f.left} className="rounded-lg bg-canvas px-3.5 py-2.5">
                <p className="text-[15px] tabular-nums text-ink">
                  <b className="font-semibold">{f.left}</b> <span className="text-ink-muted">=</span> {f.right}
                </p>
                <p className="mt-0.5 text-[12px] text-ink-muted">{f.note}</p>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="측정 도구 3가지" sub="서로 다른 질문에 답한다 — 섞어 쓰고 서로 보정">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[12px] text-ink-muted">
                  <th className="py-1.5 pr-2 font-medium">도구</th>
                  <th className="py-1.5 pr-2 font-medium">답하는 질문</th>
                  <th className="py-1.5 pr-2 font-medium">속도</th>
                  <th className="py-1.5 font-medium">쓰임</th>
                </tr>
              </thead>
              <tbody>
                {MEASUREMENT.map((m) => (
                  <tr key={m.name} className="border-b border-line/60 align-top">
                    <td className="py-2 pr-2 font-medium text-ink">{m.name}</td>
                    <td className="py-2 pr-2 text-ink-soft">
                      {m.q}
                      <span className="block text-[12px] text-ink-muted">{m.bias}</span>
                    </td>
                    <td className="py-2 pr-2 text-ink-muted">{m.speed}</td>
                    <td className="py-2 text-ink-muted">{m.use}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card title="운영 원칙" sub="수치 기준은 업계 경험칙 — 계정 상황에 맞춰 조정">
        <ol className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
          {PRINCIPLES.map((p, i) => (
            <li key={p.title} className="flex gap-3">
              <span className="font-mono text-[15px] font-semibold text-ink-muted">{String(i + 1).padStart(2, "0")}</span>
              <span>
                <span className="block text-[15px] font-semibold text-ink">{p.title}</span>
                <span className="block text-[13px] leading-relaxed text-ink-soft">{p.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </Card>

      <Card title="매체별 플레이북" sub="핵심만 — 자세한 건 퍼포먼스 매니저에게 물어보세요">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {PLAYBOOKS.map((p) => (
            <div key={p.key} className="flex flex-col rounded-lg border border-line p-3.5">
              <p className="flex items-center gap-1.5 text-[15px] font-semibold text-ink">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} aria-hidden />
                {p.title}
              </p>
              <ul className="mt-2 flex-1 space-y-1.5">
                {p.points.map((t) => (
                  <li key={t} className="flex gap-1.5 text-[13px] leading-snug text-ink-soft">
                    <i className="ti ti-point-filled mt-[3px] text-[12px] text-ink-muted" aria-hidden />
                    {t}
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => onAsk(p.ask)} className="mt-3 flex items-center gap-1 self-start text-[13px] font-medium text-signal hover:underline">
                <i className="ti ti-message-chatbot text-[15px]" aria-hidden />
                자세히 묻기
              </button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function BriefCard({ b, onAsk }: { b: Brief; onAsk: (q: string) => void }) {
  const pm = PLATFORM_META[b.platform];
  return (
    <article className="flex flex-col rounded-lg border border-line p-3.5">
      <div className="flex items-center justify-between gap-2 text-[12px]">
        <span className="flex items-center gap-1.5">
          <span className="flex items-center gap-1 rounded-md bg-canvas px-1.5 py-0.5 font-medium text-ink-soft">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: pm.color }} aria-hidden />
            {pm.label}
          </span>
          <span className="text-ink-muted">{KIND_LABEL[b.kind]}</span>
        </span>
        <time className="font-mono tabular-nums text-ink-muted">{b.date}</time>
      </div>
      <h4 className="mt-2 text-[15px] font-semibold leading-snug text-ink">{b.title}</h4>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">{b.summary}</p>
      {b.takeaways.length > 0 && (
        <ul className="mt-2 space-y-1">
          {b.takeaways.map((t) => (
            <li key={t} className="flex gap-1.5 text-[13px] leading-snug text-ink">
              <i className="ti ti-arrow-right mt-[2px] text-[13px] text-good" aria-hidden />
              {t}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-[12px]">
        <a href={b.source.url} target="_blank" rel="noreferrer" className="truncate text-ink-muted underline-offset-2 hover:text-ink hover:underline" title={b.source.url}>
          {b.source.name} ↗
        </a>
        <button type="button" onClick={() => onAsk(`"${b.title}" (${b.date}, ${b.source.url}) — 이게 우리 광고 운영에 어떤 영향이 있고, 지금 뭘 해야 하는지 정리해 줘.`)} className="flex-shrink-0 font-medium text-signal hover:underline">
          우리한테 적용하면?
        </button>
      </div>
    </article>
  );
}
