"use client";

// 메타 빠른 세팅 — 위 광고계정 바: 계정·통화·최소 예산 / 페이지(→ 연결 인스타 자동) / 픽셀 / UTM·AI 보정 옵션. 한 줄, 클릭 없이 기본값이 채워진다
import type { Dispatch, SetStateAction } from "react";
import { DEFAULT_URL_TAGS, type Defaults, type MetaAccountCtx } from "./model";

const SEL = "max-w-[220px] truncate rounded-lg border border-line bg-white py-1.5 pl-2.5 pr-7 text-[14px] text-ink outline-none focus:border-[#eb6834]";
const STATUS: Record<number, string> = { 1: "활성", 2: "비활성", 3: "미결제", 7: "검토 중", 8: "정산 대기", 9: "유예", 100: "종료 대기", 101: "종료" };

export function AccountBar({ acc, loading, defaults: d, setDefaults, onRefresh }: { acc: MetaAccountCtx | null; loading: boolean; defaults: Defaults; setDefaults: Dispatch<SetStateAction<Defaults>>; onRefresh: () => void }) {
  const set = (p: Partial<Defaults>) => setDefaults((x) => ({ ...x, ...p }));
  const page = acc?.pages.find((p) => p.id === d.pageId);
  return (
    <section className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-[#EAECF0] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EBF3FF] text-[#1877F2]">
          <i className="ti ti-brand-meta text-[20px]" aria-hidden />
        </span>
        {acc ? (
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold text-ink" title={acc.name}>
              {acc.name}
            </p>
            <p className="text-[12px] tabular-nums text-ink-muted">
              {acc.act} · {acc.currency} · 최소 일 예산 {acc.minDailyBudget.toLocaleString("ko-KR")}원
              {acc.accountStatus !== 1 && <span className="ml-1 font-semibold text-bad">· 계정 {STATUS[acc.accountStatus] ?? acc.accountStatus}</span>}
            </p>
          </div>
        ) : (
          <div className="h-9 w-48 animate-pulse rounded-lg bg-[#F2F4F7]" />
        )}
      </div>

      <span className="hidden h-8 w-px bg-line md:block" />

      <label className="flex items-center gap-1.5 text-[13px] text-ink-muted" id="meta-defaults">
        페이지
        <select
          className={SEL}
          value={d.pageId}
          disabled={!acc}
          onChange={(e) => {
            const p = acc?.pages.find((x) => x.id === e.target.value);
            set({ pageId: e.target.value, igId: p?.igId ?? "" });
          }}
        >
          {!acc?.pages.length && <option value="">{acc ? "홍보 가능한 페이지 없음" : "…"}</option>}
          {acc?.pages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <span className="flex items-center gap-1.5 text-[13px] text-ink-muted" title="페이지에 연결된 인스타그램 비즈니스 계정 — 인스타 지면에 이 계정 이름으로 나갑니다">
        <i className="ti ti-brand-instagram text-[16px]" aria-hidden />
        {page?.igUsername ? (
          <label className="flex items-center gap-1">
            <input type="checkbox" className="accent-[#eb6834]" checked={!!d.igId} onChange={(e) => set({ igId: e.target.checked ? page.igId ?? "" : "" })} />
            <b className="font-semibold text-ink">@{page.igUsername}</b>
          </label>
        ) : (
          <span>{acc ? "연결 없음(페이지 이름으로 게재)" : "…"}</span>
        )}
      </span>
      <label className="flex items-center gap-1.5 text-[13px] text-ink-muted">
        픽셀
        <select className={SEL} value={d.pixelId} disabled={!acc} onChange={(e) => set({ pixelId: e.target.value })}>
          <option value="">{acc?.pixels.length ? "선택 안 함" : "픽셀 없음"}</option>
          {acc?.pixels.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.lastFired ? ` · ${p.lastFired.slice(5, 10)} 수신` : " · 수신 기록 없음"}
            </option>
          ))}
        </select>
      </label>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Toggle on={d.useUtm} onClick={() => set({ useUtm: !d.useUtm })} label="UTM 자동" title={`랜딩에 utm_이 없으면 메타가 붙임: ${d.urlTags || DEFAULT_URL_TAGS}`} />
        <Toggle on={d.aiEnhance} onClick={() => set({ aiEnhance: !d.aiEnhance })} label="AI 보정" title="메타 Advantage+ 크리에이티브(밝기·템플릿·문구 바꾸기 등). 끄면 소재가 올린 그대로 나갑니다(르무통 실소재와 같음)" />
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          title="광고계정·캠페인 새로고침"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-white text-ink-soft hover:text-ink disabled:opacity-50"
        >
          <i className={`ti ti-refresh text-[15px] ${loading ? "animate-spin" : ""}`} aria-hidden />
        </button>
      </div>
      {d.useUtm && (
        <label className="flex w-full items-center gap-2 text-[13px] text-ink-muted">
          UTM 꼬리표
          <input className="min-w-0 flex-1 rounded-lg border border-line px-2.5 py-1 font-mono text-[13px] text-ink outline-none focus:border-[#eb6834]" value={d.urlTags} onChange={(e) => set({ urlTags: e.target.value })} />
          <button type="button" className="text-[12px] text-ink-soft underline" onClick={() => set({ urlTags: DEFAULT_URL_TAGS })}>
            기본값
          </button>
        </label>
      )}
    </section>
  );
}

export function Toggle({ on, onClick, label, title }: { on: boolean; onClick: () => void; label: string; title?: string }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-pressed={on} className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-[13px] transition ${on ? "border-[#eb6834] bg-[#FFF4EE] font-semibold text-[#C2410C]" : "border-line bg-white text-ink-muted hover:text-ink"}`}>
      <span className={`relative h-3.5 w-6 rounded-full transition ${on ? "bg-[#eb6834]" : "bg-[#D0D5DD]"}`}>
        <span className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all ${on ? "left-3" : "left-0.5"}`} />
      </span>
      {label}
    </button>
  );
}
