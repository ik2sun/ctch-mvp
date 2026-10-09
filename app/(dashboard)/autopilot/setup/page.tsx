"use client";

// 캠페인 오토파일럿 > 자동 대량 세팅 — GFA 캠페인·광고그룹·소재를 한 화면에서(수동 세팅) 또는 엑셀 한 장으로(벌크 업로드)
import { AutopilotHeader } from "@/features/autopilot/PlannedSection";
import { GfaSetup } from "@/features/autopilot/gfa/GfaSetup";

export default function AutopilotSetupPage() {
  return (
    // 흰 카드가 돋보이게 오프화이트 바탕을 main 여백까지 채운다
    <div className="-m-6 min-h-[calc(100%+3rem)] bg-[#F6F7F9] p-6 2xl:-mx-8 2xl:px-8">
      <div className="mx-auto w-full max-w-[1600px] space-y-6">
        <AutopilotHeader intro="캠페인·광고그룹·소재를 한 화면에서 GFA 항목 그대로 채우거나(수동 세팅), 엑셀 한 장과 이미지로 한 번에 올리세요(벌크 업로드). 확인 한 번으로 GFA에 만들어집니다." />
        <GfaSetup />
      </div>
    </div>
  );
}
