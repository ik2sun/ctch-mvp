"use client";

// 캠페인 오토파일럿 > 자동 대량 세팅 — GFA에서 캠페인만 만들어 두면 광고그룹·타겟·예산·소재·카피·네이밍·UTM을 자동 세팅
import { AutopilotHeader } from "@/features/autopilot/PlannedSection";
import { GfaSetup } from "@/features/autopilot/gfa/GfaSetup";

export default function AutopilotSetupPage() {
  return (
    // 흰 카드가 돋보이게 오프화이트 바탕을 main 여백까지 채운다
    <div className="-m-6 min-h-[calc(100%+3rem)] bg-[#F6F7F9] p-6 2xl:-mx-8 2xl:px-8">
      <div className="mx-auto w-full max-w-[1600px] space-y-6">
        <AutopilotHeader intro="GFA에서 캠페인만 만들어 두세요. 캠페인을 고르고 엑셀·이미지(또는 브리프)를 넣으면 광고그룹·타겟·예산·카피를 짜고, 확인 한 번으로 광고그룹·소재 생성까지 끝냅니다." />
        <GfaSetup />
      </div>
    </div>
  );
}
