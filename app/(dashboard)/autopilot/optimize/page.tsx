"use client";

// 캠페인 오토파일럿 > 자동 최적화
import { PlannedSection } from "@/features/autopilot/PlannedSection";

export default function AutopilotOptimizePage() {
  return (
    <PlannedSection
      intro="운영 규칙과 AI 판단으로 예산 증감, 소재 ON/OFF, 입찰 조정을 제안하고, 승인 방식에 따라 실행합니다."
      steps={[
        { title: "성과 수집", detail: "정해진 주기마다 GFA API로 캠페인·광고그룹·소재 성과를 가져옵니다." },
        { title: "판정", detail: "목표 ROAS·CPA 대비 통계 구간으로 키우기·지켜보기·끄기·예산 못 받음을 판정합니다(소재 분석 판정 엔진)." },
        { title: "조치안", detail: "예산 단위(캠페인·광고그룹)로 묶어 증액·감액·소재 정리·입찰 조정안을 만들고, 운영 규칙의 한도를 넘지 않게 자릅니다." },
        { title: "승인·실행", detail: "담당자가 조치안을 확인·승인한 것만 실행합니다. 완성도가 확인되면 조치 종류별로 완전 자동으로 전환합니다." },
        { title: "기록", detail: "바꾼 내용·근거·이전 값을 실행 기록에 남기고, 이후 성과를 추적합니다." },
      ]}
      reuse={[
        { label: "소재 분석 — 판정 엔진", href: "/creative-analysis", note: "decide·adsetActions, 이번 주 결정 저장·지난 결정 추적" },
        { label: "미디어믹스 최적화 — 예산 동기화", href: "/media-mix", note: "메타 CBO/ABO·네이버 SA 일 예산 변경(plan/apply, 계획 불일치 시 409)" },
        { label: "입찰 시뮬레이터", href: "/sa-simulator", note: "네이버·구글 키워드 입찰가별 예상 클릭·비용" },
      ]}
      open={[
        "실행 주기 — Vercel Hobby는 크론 하루 1회라 시간 단위 운영은 Pro 전환 필요",
        "GFA 예산·상태 변경 API는 실계정 쓰기 미검증 — 소액 테스트 계정으로 먼저 확인",
      ]}
    />
  );
}
