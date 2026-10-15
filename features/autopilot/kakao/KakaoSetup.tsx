"use client";

// 캠페인 오토파일럿 > 자동 대량 세팅 > 카카오모먼트 — 탭 2개: 엑셀 벌크 업로드(기본, KakaoBulk) / 수동 세팅(한 화면, KakaoQuick)
// 메타와 같이 두 화면을 띄워 두고 숨겨서 탭을 바꿔도 작업 내용이 남는다(수동 세팅은 처음 열 때 띄움 — 계정 조회 중복 방지)
import { useState } from "react";
import { useClients } from "@/features/clients/ClientContext";
import { KakaoBulk } from "./KakaoBulk";
import { KakaoQuick } from "./KakaoQuick";

export function KakaoSetup() {
  const { selected } = useClients();
  const clientId = selected?.id ?? null;
  const [tab, setTab] = useState<"bulk" | "quick">("bulk");
  const [quickSeen, setQuickSeen] = useState(false);
  if (!clientId) return <p className="text-[15px] text-ink-muted">광고주를 먼저 고르세요.</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full bg-white p-1 shadow-[0_1px_2px_rgba(16,24,40,0.05)] ring-1 ring-[#EAECF0]">
          {(
            [
              { key: "bulk", label: "엑셀 벌크 업로드", icon: "file-spreadsheet" },
              { key: "quick", label: "수동 세팅", icon: "adjustments-horizontal" },
            ] as const
          ).map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => {
                setTab(o.key);
                if (o.key === "quick") setQuickSeen(true);
              }}
              aria-pressed={tab === o.key}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-5 py-2 text-[15px] transition ${tab === o.key ? "bg-[#eb6834] font-semibold text-white shadow-[0_1px_3px_rgba(235,104,52,0.4)]" : "text-ink-muted hover:text-ink"}`}
            >
              <i className={`ti ti-${o.icon} text-[16px]`} aria-hidden />
              {o.label}
            </button>
          ))}
        </div>
        <span className="text-[14px] text-ink-muted">
          {tab === "bulk" ? "기존 캠페인을 골라(여러 개·유형 섞어도 됨) 엑셀 한 장 + 소재 파일로 광고그룹·소재를 한 번에" : "엑셀 없이 한 화면에서 — 캠페인 하나에 광고그룹을 만들고 파일을 놓아 소재를 채우기"}
        </span>
      </div>
      <div hidden={tab !== "bulk"}>
        <KakaoBulk key={clientId} clientId={clientId} />
      </div>
      <div hidden={tab !== "quick"}>{quickSeen && <KakaoQuick key={clientId} clientId={clientId} />}</div>
    </div>
  );
}
