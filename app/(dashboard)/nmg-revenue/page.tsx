"use client";

import { useEffect, useState } from "react";
import { DeptSummaryChart } from "@/features/nmg-revenue/DeptSummaryChart";
import { DeptSummaryTable } from "@/features/nmg-revenue/DeptSummaryTable";
import { TeamComparisonChart } from "@/features/nmg-revenue/TeamComparisonChart";
import { ClientTableView } from "@/features/nmg-revenue/ClientTableView";
import type { MetricSeries } from "@/lib/google-sheets/parseDeptSummary";
import type { TeamSeries } from "@/lib/google-sheets/parseTeamComparison";
import type { ClientSeries } from "@/lib/google-sheets/parseClientPivot";
import type { SheetTab } from "@/lib/google-sheets/client";

type ViewTab = "dept" | "teams" | "tab";

const VIEW_TABS: { key: ViewTab; label: string }[] = [
  { key: "dept", label: "부서 전체" },
  { key: "teams", label: "팀별 비교" },
  { key: "tab", label: "탭 직접 선택" },
];

export default function NmgRevenuePage() {
  const [viewTab, setViewTab] = useState<ViewTab>("dept");

  const [dept, setDept] = useState<MetricSeries[] | null>(null);
  const [deptLoading, setDeptLoading] = useState(false);
  const [deptError, setDeptError] = useState<string | null>(null);

  const [teams, setTeams] = useState<TeamSeries[] | null>(null);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamsError, setTeamsError] = useState<string | null>(null);

  const [tabList, setTabList] = useState<SheetTab[] | null>(null);
  const [tabListLoading, setTabListLoading] = useState(false);
  const [tabListError, setTabListError] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState("");
  const [tabClients, setTabClients] = useState<ClientSeries[] | null>(null);
  const [tabLoading, setTabLoading] = useState(false);
  const [tabError, setTabError] = useState<string | null>(null);

  async function loadDept() {
    setDeptLoading(true);
    setDeptError(null);
    try {
      const res = await fetch("/api/nmg-revenue/summary");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "불러오기 실패");
      setDept(json.metrics);
    } catch (e) {
      setDeptError(e instanceof Error ? e.message : "오류가 발생했어요.");
    } finally {
      setDeptLoading(false);
    }
  }

  async function loadTeams() {
    setTeamsLoading(true);
    setTeamsError(null);
    try {
      const res = await fetch("/api/nmg-revenue/teams");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "불러오기 실패");
      setTeams(json.teams);
    } catch (e) {
      setTeamsError(e instanceof Error ? e.message : "오류가 발생했어요.");
    } finally {
      setTeamsLoading(false);
    }
  }

  async function loadTabList() {
    setTabListLoading(true);
    setTabListError(null);
    try {
      const res = await fetch("/api/nmg-revenue/tabs");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "불러오기 실패");
      setTabList(json.tabs);
    } catch (e) {
      setTabListError(e instanceof Error ? e.message : "오류가 발생했어요.");
    } finally {
      setTabListLoading(false);
    }
  }

  async function loadTabDetail(name: string) {
    setSelectedTab(name);
    setTabClients(null);
    setTabLoading(true);
    setTabError(null);
    try {
      const res = await fetch(`/api/nmg-revenue/tab?name=${encodeURIComponent(name)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "불러오기 실패");
      setTabClients(json.clients);
    } catch (e) {
      setTabError(e instanceof Error ? e.message : "오류가 발생했어요.");
    } finally {
      setTabLoading(false);
    }
  }

  useEffect(() => {
    if (viewTab === "dept" && !dept && !deptLoading && !deptError) loadDept();
    if (viewTab === "teams" && !teams && !teamsLoading && !teamsError) loadTeams();
    if (viewTab === "tab" && !tabList && !tabListLoading && !tabListError) loadTabList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewTab]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h2 className="font-display text-[23px] font-semibold text-ink">NMG 매출</h2>
        <p className="mt-1 text-[13px] text-ink-muted">부서·팀·광고주별 매출 현황 (구글 시트 실시간 연동)</p>
      </div>

      <div className="flex items-center gap-1.5">
        {VIEW_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setViewTab(t.key)}
            className={`rounded-lg border px-3 py-1.5 text-[13px] transition ${
              viewTab === t.key
                ? "border-signal bg-signal-soft font-medium text-signal"
                : "border-line text-ink-soft hover:border-ink-faint"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {viewTab === "dept" && (
        <div className="rounded-card border border-line bg-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-[14px] font-semibold text-ink">부서 전체 월별 현황</span>
            <button
              onClick={loadDept}
              disabled={deptLoading}
              className="rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-ink-soft transition hover:border-signal hover:text-signal"
            >
              <i className={`ti ${deptLoading ? "ti-loader-2 animate-spin" : "ti-refresh"} text-[13px]`} aria-hidden />
            </button>
          </div>
          {deptError ? (
            <p className="rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2.5 text-[13px] text-bad">{deptError}</p>
          ) : deptLoading && !dept ? (
            <p className="py-8 text-center text-[13px] text-ink-muted">불러오는 중…</p>
          ) : dept ? (
            <div className="space-y-5">
              <DeptSummaryChart metrics={dept} />
              <DeptSummaryTable metrics={dept} />
            </div>
          ) : null}
        </div>
      )}

      {viewTab === "teams" && (
        <div className="rounded-card border border-line bg-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-[14px] font-semibold text-ink">팀별 취급고 · 순매출 비교</span>
            <button
              onClick={loadTeams}
              disabled={teamsLoading}
              className="rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-ink-soft transition hover:border-signal hover:text-signal"
            >
              <i className={`ti ${teamsLoading ? "ti-loader-2 animate-spin" : "ti-refresh"} text-[13px]`} aria-hidden />
            </button>
          </div>
          {teamsError ? (
            <p className="rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2.5 text-[13px] text-bad">{teamsError}</p>
          ) : teamsLoading && !teams ? (
            <p className="py-8 text-center text-[13px] text-ink-muted">불러오는 중…</p>
          ) : teams ? (
            <TeamComparisonChart teams={teams} />
          ) : null}
        </div>
      )}

      {viewTab === "tab" && (
        <div className="rounded-card border border-line bg-surface p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[14px] font-semibold text-ink">탭 직접 선택</span>
            {tabListLoading ? (
              <span className="text-[12px] text-ink-muted">탭 목록 불러오는 중…</span>
            ) : tabListError ? (
              <span className="text-[12px] text-bad">{tabListError}</span>
            ) : tabList ? (
              <select
                value={selectedTab}
                onChange={(e) => loadTabDetail(e.target.value)}
                className="h-9 rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink-soft outline-none focus:border-signal"
              >
                <option value="" disabled>
                  탭을 선택하세요
                </option>
                {tabList.map((t) => (
                  <option key={t.sheetId} value={t.title}>{t.title}</option>
                ))}
              </select>
            ) : null}
          </div>

          {!selectedTab ? (
            <p className="py-8 text-center text-[13px] text-ink-muted">위에서 탭을 선택하면 광고주별 상세가 표시돼요.</p>
          ) : tabError ? (
            <p className="rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2.5 text-[13px] text-bad">{tabError}</p>
          ) : tabLoading && !tabClients ? (
            <p className="py-8 text-center text-[13px] text-ink-muted">불러오는 중…</p>
          ) : tabClients ? (
            <ClientTableView clients={tabClients} />
          ) : null}
        </div>
      )}
    </div>
  );
}
