"use client";

// 캠페인 오토파일럿 > 자동 대량 세팅 — 매체 탭(GFA · 메타)
//  · GFA: 캠페인·광고그룹·소재를 한 화면에서(수동 세팅) 또는 엑셀 한 장으로(벌크 업로드)
//  · 메타: 엑셀 벌크 업로드(기본) · 빠른 세팅(한 화면) — 2026-10-09 추가
//  · 카카오모먼트: 엑셀 벌크 업로드(기본) · 수동 세팅 — 2026-10-15 추가(비즈보드·디스플레이·동영상)
import { useEffect, useState } from "react";
import { AutopilotHeader, type AutopilotMediaKey } from "@/features/autopilot/PlannedSection";
import { GfaSetup } from "@/features/autopilot/gfa/GfaSetup";
import { MetaSetup } from "@/features/autopilot/meta/MetaSetup";
import { KakaoSetup } from "@/features/autopilot/kakao/KakaoSetup";

const LS = "ctch_autopilot_media";
const INTRO: Record<AutopilotMediaKey, string> = {
  gfa: "캠페인·광고그룹·소재를 한 화면에서 GFA 항목 그대로 채우거나(수동 세팅), 엑셀 한 장과 이미지로 한 번에 올리세요(벌크 업로드). 확인 한 번으로 GFA에 만들어집니다.",
  kakao: "엑셀 한 장(소재·광고그룹)과 소재 파일로 비즈보드·디스플레이·동영상 캠페인에 광고그룹·소재를 한 번에 올리세요. 소재 형식은 캠페인 유형이 정하고(비즈보드 1029×258 배너 · 네이티브 이미지 · 동영상), 이미지는 규격에 맞게 자르고 용량을 맞춥니다. 광고그룹은 기존 그룹 행을 복사해 이름만 바꾸면 같은 지면·타겟·입찰로 새로 만들어집니다.",
  meta: "엑셀 한 장(광고·광고세트)과 소재 파일로 여러 캠페인에 광고를 한 번에 올리세요. 피드(1:1·4:5)와 스토리·릴스(9:16)는 파일명으로 한 광고에 묶이고, 광고세트는 기존 세트 행을 복사해 이름만 바꾸면 같은 타겟으로 새로 만들어집니다. 확인 한 번으로 메타에 반영됩니다.",
};

export default function AutopilotSetupPage() {
  const [media, setMedia] = useState<AutopilotMediaKey>("gfa");
  useEffect(() => {
    try {
      const v = localStorage.getItem(LS);
      if (v === "meta" || v === "gfa" || v === "kakao") setMedia(v);
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
              { key: "gfa", label: "GFA", sub: "네이버 성과형 디스플레이" },
              { key: "meta", label: "메타", sub: "페이스북·인스타그램" },
              { key: "kakao", label: "카카오", sub: "카카오모먼트" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={media === t.key}
              onClick={() => pick(t.key)}
              className={`-mb-px flex h-11 items-center gap-2 border-b-2 px-4 text-[15px] leading-none transition ${media === t.key ? "border-[#eb6834] font-bold text-ink" : "border-transparent text-ink-muted hover:text-ink"}`}
            >
              {/* 로고·매체명·상품명을 같은 높이 상자에 넣어 세로 가운데를 맞춘다(아이콘 폰트·글자 크기마다 기준선이 달라 어긋났음) */}
              <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                <MediaLogo media={t.key} active={media === t.key} />
              </span>
              <span className="flex h-5 items-center">{t.label}</span>
              <span className="hidden h-5 items-center text-[13px] font-normal text-ink-muted sm:flex">{t.sub}</span>
            </button>
          ))}
        </div>
        {media === "gfa" ? <GfaSetup /> : media === "meta" ? <MetaSetup /> : <KakaoSetup />}
      </div>
    </div>
  );
}

// 매체 로고 — 네이버는 검색창의 굵은 N(Tabler letter-n은 선이 얇아 직접 그림), 카카오는 노란 바탕 말풍선(Tabler에 아이콘 없음), 메타는 Tabler.
// 고르지 않은 탭은 회색으로 낮춘다
function MediaLogo({ media, active }: { media: AutopilotMediaKey; active: boolean }) {
  const dim = active ? "" : "opacity-50 grayscale";
  if (media === "meta") return <i className={`ti ti-brand-meta block text-[18px] leading-none ${active ? "text-[#1877F2]" : ""}`} aria-hidden />;
  if (media === "gfa")
    return (
      <svg viewBox="0 0 20 20" className={`block h-[16px] w-[16px] ${dim}`} aria-hidden>
        <path fill="#03C75A" d="M2 2h5.4l5.3 7.9V2H18v16h-5.4L7.3 10.1V18H2z" />
      </svg>
    );
  return (
    <svg viewBox="0 0 20 20" className={`block h-[18px] w-[18px] ${dim}`} aria-hidden>
      <rect width="20" height="20" rx="5" fill="#FEE500" />
      <path fill="#3C1E1E" d="M10 4.6c-3.6 0-6.4 2.2-6.4 5 0 1.8 1.2 3.4 3 4.3l-.6 2.3c-.1.2.2.4.4.3l2.7-1.8c.3 0 .6.1.9.1 3.6 0 6.4-2.3 6.4-5.1S13.6 4.6 10 4.6z" />
    </svg>
  );
}
