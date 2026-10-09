"use client";

// 캠페인 오토파일럿 > 실행 기록 — 자동 세팅이 GFA·메타에 만든 것(autopilot_actions). 메타는 번호 대신 ID(id), 광고 수(ads)가 더 있다
import { useEffect, useState } from "react";
import { useClients } from "@/features/clients/ClientContext";
import { Card } from "@/features/dashboard/ui";
import { AutopilotHeader } from "@/features/autopilot/PlannedSection";

type Row = {
  id: string;
  media: string;
  ad_account_no: string | null;
  campaign_no: number | string | null;
  kind: string;
  summary: { campaignName?: string; adSets?: number; copiedAdSets?: number; creatives?: number; ads?: number; errors?: number; activated?: boolean; dailyBudget?: number } | null;
  detail: { adSets?: { no?: number; id?: string; name: string }[]; creatives?: { no?: number; id?: string; name: string }[]; errors?: string[] } | null;
  created_by: string | null;
  created_at: string;
};

export default function AutopilotLogsPage() {
  const { selected } = useClients();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!selected?.id) return;
    setRows(null);
    setNotice(null);
    fetch(`/api/autopilot/logs?clientId=${selected.id}`)
      .then((r) => r.json())
      .then((j) => {
        setRows(j.rows ?? []);
        setNotice(j.notice ?? j.error ?? null);
      })
      .catch(() => setNotice("기록을 불러오지 못했어요."));
  }, [selected?.id]);

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6">
      <AutopilotHeader media="all" intro="자동 세팅이 GFA·메타에 무엇을 언제 만들었는지 모아 봅니다. 자동 최적화가 붙으면 바꾼 내용과 이후 성과도 여기에 쌓입니다." />
      <Card title="실행 기록" sub="최근 50건">
        {notice && <p className="mb-3 text-[14px] text-warn">{notice}</p>}
        {!rows && !notice && <p className="text-[15px] text-ink-muted">불러오는 중…</p>}
        {rows && rows.length === 0 && !notice && <p className="text-[15px] text-ink-muted">아직 실행한 세팅이 없어요.</p>}
        <ul className="divide-y divide-line">
          {rows?.map((r) => (
            <li key={r.id} className="py-3">
              <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 text-left">
                <span className="tabular-nums text-[14px] text-ink-muted">{new Date(r.created_at).toLocaleString("ko-KR")}</span>
                <span className="rounded-full border border-line px-2 py-0.5 text-[12px] text-ink-soft">{r.media === "meta" ? "메타" : r.media.toUpperCase()} · {r.kind === "setup" ? "자동 대량 세팅" : r.kind}</span>
                <span className="text-[15px] font-semibold text-ink">{r.summary?.campaignName ?? `캠페인 #${r.campaign_no}`}</span>
                <span className="text-[14px] text-ink-soft">
                  {r.media === "meta" ? `광고세트 ${(r.summary?.adSets ?? 0) + (r.summary?.copiedAdSets ?? 0)} · 소재 ${r.summary?.creatives ?? 0} · 광고 ${r.summary?.ads ?? 0}` : `광고그룹 ${r.summary?.adSets ?? 0} · 소재 ${r.summary?.creatives ?? 0}`}
                  {r.summary?.dailyBudget ? ` · 일 ${r.summary.dailyBudget.toLocaleString("ko-KR")}원` : ""} · {r.summary?.activated ? "켜짐" : "꺼진 상태로 생성"}
                </span>
                {!!r.summary?.errors && <span className="text-[14px] text-bad">오류 {r.summary.errors}</span>}
                <span className="ml-auto text-[13px] text-ink-muted">{r.created_by}</span>
              </button>
              {open === r.id && (
                <div className="mt-3 grid gap-4 rounded-lg bg-canvas p-4 text-[13px] lg:grid-cols-3">
                  <div>
                    <p className="mb-1 font-semibold text-ink-soft">{r.media === "meta" ? "광고세트" : "광고그룹"}</p>
                    {r.detail?.adSets?.map((a) => <p key={a.no ?? a.id} className="font-mono">#{a.no ?? a.id} {a.name}</p>)}
                  </div>
                  <div>
                    <p className="mb-1 font-semibold text-ink-soft">소재</p>
                    <div className="max-h-[240px] overflow-y-auto">{r.detail?.creatives?.map((c) => <p key={c.no ?? c.id} className="font-mono">#{c.no ?? c.id} {c.name}</p>)}</div>
                  </div>
                  <div>
                    <p className="mb-1 font-semibold text-ink-soft">오류</p>
                    {r.detail?.errors?.length ? r.detail.errors.map((e, i) => <p key={i} className="text-bad">{e}</p>) : <p className="text-ink-muted">없음</p>}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
