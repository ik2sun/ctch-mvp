"use client";

// 캠페인 오토파일럿 > 운영 규칙
import { PlannedSection } from "@/features/autopilot/PlannedSection";

export default function AutopilotRulesPage() {
  return (
    <PlannedSection
      intro="광고주별로 AI가 지켜야 할 목표와 한도를 정합니다. 자동 세팅·자동 최적화는 모두 이 규칙 안에서만 움직입니다."
      steps={[
        { title: "목표", detail: "목표 ROAS(기본·프로모션·상시·브랜딩/TVC), 목표 CPA, 트래픽 캠페인 CTR 기준." },
        { title: "한도", detail: "1회 예산 증감 폭(예: +20% / −30%), 하루 총 변경 금액, 일 예산 하한·상한, 소재 최소 유지 개수." },
        { title: "실행 조건", detail: "판정 최소 전환 수, 학습 기간 중 변경 금지, 실행 시간대, 프로모션 기간 예외." },
        { title: "승인 방식", detail: "지금은 모든 조치가 승인 후 실행입니다. 완성도가 확인되면 조치 종류별로 완전 자동을 켤 수 있게 합니다." },
        { title: "알림", detail: "실행·보류·한도 초과를 담당자에게 알립니다." },
      ]}
      reuse={[
        { label: "광고주 관리", href: "/clients", note: "clients.target_roas·target_roas_rules(소재 분석에서 쓰는 목표 ROAS)" },
      ]}
      open={[
        "규칙 저장 테이블(autopilot_rules) 마이그레이션 — 광고주당 1행 jsonb로 시작",
        "규칙 수정 권한 — 소유자만 / 구성원 누구나",
      ]}
    />
  );
}
