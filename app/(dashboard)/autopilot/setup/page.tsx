"use client";

// 캠페인 오토파일럿 > 자동 대량 세팅 — 매체 탭(GFA · 메타)
//  · GFA: 캠페인·광고그룹·소재를 한 화면에서(수동 세팅) 또는 엑셀 한 장으로(벌크 업로드)
//  · 메타: 엑셀 벌크 업로드(기본) · 빠른 세팅(한 화면) — 2026-10-09 추가
import { useEffect, useState } from "react";
import { AutopilotHeader, type AutopilotMediaKey } from "@/features/autopilot/PlannedSection";
import { GfaSetup } from "@/features/autopilot/gfa/GfaSetup";
import { MetaSetup } from "@/features/autopilot/meta/MetaSetup";

const LS = "ctch_autopilot_media";
const INTRO: Record<AutopilotMediaKey, string> = {
  gfa: "캠페인·광고그룹·소재를 한 화면에서 GFA 항목 그대로 채우거나(수동 세팅), 엑셀 한 장과 이미지로 한 번에 올리세요(벌크 업로드). 확인 한 번으로 GFA에 만들어집니다.",
  meta: "엑셀 한 장(광고·광고세트)과 소재 파일로 여러 캠페인에 광고를 한 번에 올리세요. 피드(1:1·4:5)와 스토리·릴스(9:16)는 파일명으로 한 광고에 묶이고, 광고세트는 기존 세트 행을 복사해 이름만 바꾸면 같은 타겟으로 새로 만들어집니다. 확인 한 번으로 메타에 반영됩니다.",
};

export default function AutopilotSetupPage() {
  const [media, setMedia] = useState<AutopilotMediaKey>("gfa");
  useEffect(() => {
    try {
      const v = localStorage.getItem(LS);
      if (v === "meta" || v === "gfa") setMedia(v);
    } catch {
      /* 기본 GFA */
    }
  }, []);
  const pick = (m: AutopilotMediaKey) => {
    setMedia(m);
    try {
      localStorage.setItem(LS, m);
    } catch {
      /* 저장 못 해도 동작 */
    }
  };

  return (
    // 흰 카드가 돋보이게 오프화이트 바탕을 main 여백까지 채운다
    <div className="-m-6 min-h-[calc(100%+3rem)] bg-[#F6F7F9] p-6 2xl:-mx-8 2xl:px-8">
      <div className="mx-auto w-full max-w-[1600px] space-y-5">
        <AutopilotHeader intro={INTRO[media]} media={media} />
        <div role="tablist" aria-label="매체" className="flex items-center gap-1 border-b border-[#EAECF0]">
          {(
            [
              { key: "gfa", label: "GFA", sub: "네이버 성과형 디스플레이", icon: "letter-n" },
              { key: "meta", label: "메타", sub: "페이스북·인스타그램", icon: "brand-meta" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={media === t.key}
              onClick={() => pick(t.key)}
              className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-[15px] transition ${media === t.key ? "border-[#eb6834] font-bold text-ink" : "border-transparent text-ink-muted hover:text-ink"}`}
            >
              <i className={`ti ti-${t.icon} text-[18px] ${media === t.key ? (t.key === "meta" ? "text-[#1877F2]" : "text-[#03C75A]") : ""}`} aria-hidden />
              {t.label}
              <span className="hidden text-[13px] font-normal text-ink-muted sm:inline">{t.sub}</span>
            </button>
          ))}
        </div>
        {media === "gfa" ? <GfaSetup /> : <MetaSetup />}
      </div>
    </div>
  );
}
