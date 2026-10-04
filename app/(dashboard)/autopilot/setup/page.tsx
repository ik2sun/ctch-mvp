"use client";

// 캠페인 오토파일럿 > 자동 세팅 — GFA에서 캠페인만 만들어 두면 광고그룹·타겟·예산·소재·카피·네이밍·UTM을 자동 세팅
import { AutopilotHeader } from "@/features/autopilot/PlannedSection";
import { GfaSetup } from "@/features/autopilot/gfa/GfaSetup";

export default function AutopilotSetupPage() {
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6">
      <AutopilotHeader intro="GFA에서 캠페인만 만들어 두세요. 캠페인을 고르고 브리프·이미지를 넣으면 AI가 광고그룹·타겟·예산·카피를 짜고, 확인 한 번으로 광고그룹·소재 생성까지 끝냅니다." />
      <GfaSetup />
    </div>
  );
}
