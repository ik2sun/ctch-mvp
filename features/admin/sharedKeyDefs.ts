// API 공용 키 관리 — 매체별 입력 항목 정의 (화면·서버 공용, 값 없음)
import type { SharedChannel } from "@/lib/sharedKeys";

export type SharedFieldDef = {
  key: string;
  label: string;
  secret?: boolean; // true면 화면에 마스킹 표시
  digits?: boolean;
  textarea?: boolean;
  optional?: boolean;
};

export type SharedChannelDef = {
  channel: SharedChannel;
  label: string;
  accountLabel: string; // 광고주별로 넣는 값
  fields: SharedFieldDef[];
  oauth?: boolean; // 키 입력 대신 계정 연결(카카오)
  connect?: { href: string; label: string; account: string; color: string }; // 키 저장 후 추가로 계정 연결이 필요한 매체(GFA: 네이버 로그인, GA4: 구글 로그인)
  testable: boolean; // 저장 전 실제 API로 확인하는지
  live: boolean; // 대시보드·리포트에서 실제로 조회하는 매체인지
  steps: string[];
};

export const SHARED_DEFS: SharedChannelDef[] = [
  {
    channel: "meta",
    label: "메타",
    accountLabel: "광고계정 ID",
    fields: [{ key: "access_token", label: "시스템 사용자 액세스 토큰", secret: true }],
    testable: true,
    live: true,
    steps: [
      "비즈니스 설정 → 사용자 → 시스템 사용자(예: nextmediagroup-bot)",
      "자산 추가 → 광고 계정: 관리하는 광고주 계정에 권한 부여",
      "새 토큰 생성 → 만료 '사용 안 함', 권한 ads_read(+read_insights) → 토큰 복사",
    ],
  },
  {
    channel: "naver",
    label: "네이버 검색광고",
    accountLabel: "고객 ID",
    fields: [
      { key: "api_key", label: "엑세스라이선스", secret: true },
      { key: "secret", label: "비밀키", secret: true },
      { key: "owner_customer_id", label: "키를 발급한 대행사 계정 번호 · 키 확인용", digits: true, optional: true },
    ],
    testable: true,
    live: true,
    steps: [
      "searchad.naver.com에 NMG 대행사(관리) 계정으로 로그인 — 개별 광고주 계정 X",
      "도구 → API 사용 관리 → 네이버 검색광고 API 서비스 신청",
      "엑세스라이선스·비밀키 입력 → 테스트 → 저장 (광고주 고객 ID는 여기가 아니라 광고주 관리에서 넣어요)",
    ],
  },
  {
    channel: "kakao",
    label: "카카오모먼트",
    accountLabel: "광고계정 ID",
    fields: [],
    oauth: true,
    testable: true,
    live: true,
    steps: [
      "NMG 공용 카카오계정을 각 광고주 카카오모먼트 광고계정의 멤버로 초대받기",
      "아래 '공용 카카오 계정 연결' → 그 카카오계정으로 로그인·비즈니스 동의",
      "연결되면 멤버로 있는 모든 광고계정을 광고계정 ID만으로 조회",
    ],
  },
  {
    channel: "gfa",
    label: "GFA",
    accountLabel: "광고계정 번호",
    fields: [
      { key: "client_id", label: "Client ID (네이버 개발자센터)" },
      { key: "client_secret", label: "Client Secret", secret: true },
      { key: "manager_account_no", label: "NMG 관리 계정 번호", digits: true, optional: true },
    ],
    connect: { href: "/api/gfa/oauth/start", label: "네이버 계정 연결", account: "네이버 계정", color: "#03C75A" },
    testable: true,
    live: true,
    steps: [
      "네이버 개발자센터 → 애플리케이션 등록: 사용 API '네이버 로그인'(제공 정보 항목은 선택하지 않음), Callback URL에 아래 주소 등록",
      "GFA(ads.naver.com) 대표 관리 계정 → 설정 → API 관리 → 'API 사용 신청'에 Client ID 등록 → 승인 대기(공식 파트너사만 가능)",
      "Client ID·Secret·관리 계정 번호 저장 → '네이버 계정 연결'로 관리 계정 멤버인 네이버 아이디로 로그인·동의",
      "승인 전에 동의했다면 인증 실패(024) — 네이버 내정보 → 이력관리 → 연결된 서비스에서 동의 철회 후 다시 연결",
    ],
  },
  {
    channel: "google_ads",
    label: "구글 Ads",
    accountLabel: "Customer ID",
    fields: [
      { key: "login_customer_id", label: "NMG 관리자(MCC) 계정 ID", digits: true },
      { key: "client_id", label: "OAuth Client ID (ctch 프로젝트)", optional: true },
      { key: "client_secret", label: "OAuth Client Secret", secret: true, optional: true },
    ],
    connect: { href: "/api/google-ads/oauth/start", label: "구글 계정 연결", account: "구글 계정", color: "#1A73E8" },
    testable: true,
    live: true,
    steps: [
      "Developer Token은 2026-09-09 폐지 — API 등급은 GCP 프로젝트에 붙어요. ctch 프로젝트(ctch-503703)는 Explorer(실계정 하루 2,880건)",
      "OAuth 클라이언트는 반드시 ctch 프로젝트 것 — Client ID·Secret을 비우면 'CTCH Gmail 연결' 클라이언트(GMAIL_CLIENT_ID)를 써요. 그 클라이언트의 승인된 리디렉션 URI에 아래 주소 추가",
      "MCC ID(하이픈 없이 10자리) 저장 → '구글 계정 연결' → MCC 사용자인 구글 계정으로 로그인, 'Google Ads 캠페인 관리' 체크",
      "광고주 관리 > 매체 연동 > 구글 Ads에 광고주 Customer ID만 넣기",
    ],
  },
  {
    channel: "ga4",
    label: "GA4",
    accountLabel: "속성 ID",
    fields: [
      { key: "client_id", label: "OAuth Client ID (GCP)", optional: true },
      { key: "client_secret", label: "OAuth Client Secret", secret: true, optional: true },
      { key: "service_account_json", label: "서비스 계정 JSON (예외 · 구글 계정 연결을 안 쓸 때)", secret: true, textarea: true, optional: true },
    ],
    connect: { href: "/api/ga4/oauth/start", label: "구글 계정 연결", account: "구글 계정", color: "#1A73E8" },
    testable: true,
    live: false,
    steps: [
      "GCP 콘솔 → API 및 서비스 → 라이브러리: 'Google Analytics Data API'·'Google Analytics Admin API' 사용 설정",
      "OAuth 동의 화면: 사용자 유형 '내부'(nmg.co.kr 워크스페이스) 권장 — '외부 + 테스트'면 연결이 7일마다 끊기고 테스트 사용자에 본인 계정을 넣어야 해요",
      "사용자 인증 정보 → OAuth 클라이언트 ID(웹 애플리케이션), 승인된 리디렉션 URI에 아래 주소 등록 → Client ID·Secret 저장",
      "'구글 계정 연결' → GA4 속성에 뷰어 이상 권한이 있는 구글 계정으로 로그인, 'Google 애널리틱스 데이터 보기' 체크",
    ],
  },
];
