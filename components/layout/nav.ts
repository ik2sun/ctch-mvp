// 기능 메뉴 — 광고주는 별도 컨텍스트라 여기서 제외 (사이드바 상단 카드로 분리)
export type NavItem = {
  href?: string;          // 상위 카테고리는 href 없이 children만 가질 수 있음
  label: string;
  icon: string;
  desc: string;
  priority?: boolean;
  children?: NavItem[];
};

export const NAV: NavItem[] = [
  { href: "/", label: "대시보드", icon: "layout-dashboard", desc: "전체 요약" },
  { href: "/utm-builder", label: "UTM 자동화", icon: "link", desc: "캠페인 URL을 규칙에 맞게 생성·관리", priority: true },
  {
    label: "AI 리포트",
    icon: "sparkles",
    desc: "매체 성과 분석과 AI 코멘트",
    priority: true,
    children: [
      { href: "/ai-report", label: "실시간 리포트", icon: "plug-connected", desc: "매체 API 연동으로 실시간 성과 분석" },
      { href: "/report-analysis", label: "파일 분석", icon: "file-analytics", desc: "리포트 파일 업로드 후 지표·AI 코멘트" },
    ],
  },
  { href: "/media-mix", label: "미디어믹스 최적화", icon: "chart-pie", desc: "캠페인 목적별 매체 배분 제안" },
  { href: "/correlation", label: "상관관계 분석", icon: "chart-dots", desc: "SOV·GRP·ROAS 지표 상관관계" },
  { href: "/ai-agent", label: "AI 마케팅 에이전트", icon: "message-chatbot", desc: "크리에이티브·미디어 방향성 챗봇" },
  { href: "/sa-simulator", label: "SA 입찰 시뮬레이터", icon: "adjustments", desc: "검색광고 키워드·입찰가 최적화" },
  { href: "/competitor", label: "경쟁사 모니터링", icon: "radar", desc: "추정 트래픽·키워드 현황" },
];

export const CLIENTS_NAV: NavItem = {
  href: "/clients",
  label: "광고주 관리",
  icon: "users",
  desc: "광고주 등록·정보 관리",
};

// 상위·하위를 모두 펼친 목록
export function flatNav(items: NavItem[] = NAV): NavItem[] {
  return items.flatMap((n) => (n.children ? [n, ...n.children] : [n]));
}

export function navByPath(path: string): NavItem {
  if (path === CLIENTS_NAV.href) return CLIENTS_NAV;
  return flatNav().find((n) => n.href === path) ?? NAV[0];
}

// 해당 경로가 이 카테고리 안에 있는지
export function isInCategory(item: NavItem, path: string): boolean {
  return !!item.children?.some((c) => c.href === path);
}
