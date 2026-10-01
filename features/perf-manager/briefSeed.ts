// 최신 정보 시드 — 2026-10-01 웹 조사(출처 URL 확인분만). 화면의 "최신 정보 업데이트"로 새 항목이 DB에 쌓이면 함께 보인다.
import type { Brief } from "./types";

export const BRIEF_SEED_DATE = "2026-10-01";

export const BRIEF_SEED: Brief[] = [
  {
    id: "meta-2026-09-enterprise-platform",
    platform: "meta",
    kind: "update",
    title: "메타, 기업용 AI 사업부 'Meta Enterprise Platform' 출범",
    date: "2026-09-28",
    summary:
      "메타가 기업의 AI 활용을 돕는 새 사업 축으로 Meta Enterprise Platform을 출범했다. Muse agent, Meta Business Agent, Muse API, Muse Code 등을 묶었고, 전 MongoDB CEO CJ Desai가 총괄을 맡는다. 광고 외 영역까지 메타 AI를 기업 운영 도구로 넓히겠다는 신호다.",
    takeaways: [
      "대형 광고주에게 메타 광고와 Business Agent·Muse 계열 도구를 묶은 운영 제안이 들어올 수 있으니 구성 요소를 미리 파악해 둔다",
      "국내 제공 범위와 시점은 아직 공개되지 않았으므로 확정 전 제안서에 기능을 약속하지 않는다",
    ],
    source: { name: "Meta Newsroom", url: "https://about.fb.com/news/2026/09/launching-meta-enterprise-platform" },
  },
  {
    id: "google-2026-09-demand-gen-drop",
    platform: "google",
    kind: "update",
    title: "Demand Gen 9월 업데이트: YouTube 광고용 Business Agent, Shorts 원클릭 이미지 광고",
    date: "2026-09-24",
    summary:
      "구글이 연말 시즌을 앞두고 Demand Gen 업데이트를 묶어 발표했다. 상품 피드가 연결된 YouTube 동영상 광고 옆에서 대화형 AI가 답하는 Business Agent, Shorts·Gmail 이미지 광고의 원탭 랜딩, 구글 지도 제휴 위치 확장(Promoted pins)이 포함됐다. 구글은 Gmail 이미지 소재에서 같은 ROI에 전환이 평균 40% 늘었다고 밝혔다.",
    takeaways: [
      "Demand Gen에 Merchant Center 피드를 연결하고 Shorts용 9:16 이미지 소재를 별도로 준비한다",
      "연말 캠페인에서 Gmail 이미지 소재를 포함한 Demand Gen 실험을 1개 이상 돌려 본다",
    ],
    source: { name: "Google Ads & Commerce Blog", url: "https://blog.google/products/ads-commerce/demand-gen-drop-september-2026/" },
  },
  {
    id: "industry-2026-09-iab-ad-spend-forecast",
    platform: "industry",
    kind: "guide",
    title: "IAB, 2026년 미국 광고비 성장 전망 +12.3%로 상향",
    date: "2026-09-10",
    summary:
      "IAB가 2026년 미국 광고비 성장률 전망을 1월의 9.5%에서 12.3%로 올렸다. 채널별로는 소셜 16.5%, CTV 15.6%, 커머스 미디어 13.6%, 검색 8.1% 순이다. 바이어의 86%가 1년 안에 대화형 AI 때문에 성과 측정 방식을 바꿀 계획이라고 답했다.",
    takeaways: [
      "광고주 연간 계획에서 소셜·CTV·커머스 미디어 비중 확대 논리를 이 수치로 뒷받침한다",
      "AI 검색 유입을 별도로 보는 지표(브랜드 검색, 직접 유입 등)를 리포트에 추가할지 검토한다",
    ],
    source: { name: "IAB", url: "https://www.iab.com/news/iab-raises-2026-u-s-ad-spend-forecast/" },
  },
  {
    id: "meta-2026-09-ai-ads-results",
    platform: "meta",
    kind: "guide",
    title: "메타, AI 기반 광고 성과 사례 정리(Advantage+·생성형 소재·파트너십 광고)",
    date: "2026-09-03",
    summary:
      "메타가 Advantage+ 판매 캠페인, 생성형 AI 소재, 크리에이터 파트너십 광고, Business Agent의 성과 사례를 모아 공개했다. Advantage+ 판매 캠페인 도입 후 구매 13% 증가, 생성형 AI 소재로 구매당 비용 64% 절감 등의 사례가 포함됐다. 자동화 도구를 우선 쓰라는 메시지가 일관된다.",
    takeaways: [
      "자동화 전환을 망설이는 광고주에게 업종이 비슷한 사례를 골라 근거로 제시한다",
      "생성형 소재와 파트너십 광고를 기존 소재와 같은 캠페인에서 비교 테스트한다",
    ],
    source: { name: "Meta for Business", url: "https://www.facebook.com/business/news/businesses-driving-results-with-meta-ai-ads" },
  },
  {
    id: "kakao-2026-08-brand-message-results",
    platform: "kakao",
    kind: "guide",
    title: "카카오 브랜드메시지 성과 분석: 발송비 1원당 약 5원 매출",
    date: "2026-08-25",
    summary:
      "카카오가 수신 동의 기반 광고 메시지인 브랜드메시지의 효과 분석을 공개했다. 발송 후 매출 46.2%, 재구매 30.7%, 방문자 16.9%가 늘었고, 발송비 1원당 약 5원의 매출 효과가 나타났다. 소규모 파트너는 1원당 11.1원으로 효과가 더 컸다.",
    takeaways: [
      "기존 친구톡 운영 광고주는 브랜드메시지 기준으로 발송 대상·빈도·성과 지표를 다시 짠다",
      "메시지 성과를 발송비 대비 매출(ROAS)로 따로 집계해 다른 채널과 비교한다",
    ],
    source: { name: "카카오 보도자료", url: "https://www.kakaocorp.com/page/detail/12120?lang=ENG" },
  },
  {
    id: "naver-2026-07-growth-summit",
    platform: "naver",
    kind: "seminar",
    title: "2026 네이버 그로스 서밋: AI 최적화 광고 전략과 ADVoost 공개",
    date: "2026-07-14",
    summary:
      "네이버가 7월 14~15일 조선팰리스 강남에서 광고주 대상 '2026 NAVER Growth Summit'을 열고 AI 시대 브랜드 성장 3단계, 네이버 광고로 브랜드 자산 쌓기 등을 발표했다. 검색 점유율이 8년 만의 최고치를 기록했고, AI 브리핑의 롱테일 질의가 전년 대비 2.5배 이상 늘었다고 밝혔다. AI 기반 광고 솔루션 ADVoost를 7월 21일부터 적용한다고 소개했다.",
    takeaways: [
      "네이버 검색 예산 계획에 AI 브리핑·대화형 검색에서 늘어나는 롱테일 질의를 반영한다",
      "ADVoost 적용 후 파워링크 성과 변화를 7월 21일 전후로 나눠 비교한다",
    ],
    source: { name: "NAVER Corp. 보도자료", url: "https://www.navercorp.com/media/pressReleasesDetail?seq=10034483" },
  },
  {
    id: "meta-2026-06-cannes-ai-creative",
    platform: "meta",
    kind: "seminar",
    title: "칸 라이언즈 2026: 메타, 생성형 소재 통합 워크플로와 Brand Memory 발표",
    date: "2026-06-23",
    summary:
      "메타가 칸 라이언즈에서 생성·테스트·번역을 한 흐름으로 묶은 AI 소재 솔루션을 발표했다. 기존 광고에서 브랜드 톤을 학습하는 Brand Memory, 캠페인 인사이트를 다음 소재 결정으로 연결하는 Creative Strategy Hub, 소재 승인 워크플로, 페이스북·인스타그램 크리에이터를 합친 Creator Marketing Hub가 포함됐다. 메타는 광고비 1달러당 평균 4.13달러 매출(2022년 대비 25% 증가)을 제시했다.",
    takeaways: [
      "브랜드 가이드에 맞는 기존 성과 소재를 정리해 두고 Brand Memory 테스트 대상 여부를 확인한다",
      "크리에이터 파트너십 광고를 Creator Marketing Hub 기준으로 후보 발굴부터 다시 정리한다",
    ],
    source: { name: "Meta for Business", url: "https://www.facebook.com/business/news/cannes-2026-cross-ai-threshold" },
  },
  {
    id: "kakao-2026-06-commerce-catalog-ads",
    platform: "kakao",
    kind: "update",
    title: "카카오, 선물하기·톡스토어 판매자용 '커머스 카탈로그 광고' 출시",
    date: "2026-06-23",
    summary:
      "카카오가 선물하기·톡스토어 판매자의 상품 정보를 카카오모먼트와 연동해 별도 소재 제작 없이 집행하는 커머스 카탈로그 광고를 출시했다. 카카오톡, 선물하기, 톡딜 지면에 AI 추천 로직으로 개인화 노출된다. 9월 30일까지 카탈로그 연동을 마친 판매자에게 비즈쿠폰을 지원했다.",
    takeaways: [
      "카카오 커머스에 입점한 광고주는 판매자센터에서 카탈로그를 연동하고 상품 정보 품질을 점검한다",
      "카탈로그 광고와 기존 비즈보드·디스플레이 성과를 상품 단위로 비교한다",
    ],
    source: { name: "카카오 보도자료", url: "https://www.kakaocorp.com/page/detail/12069" },
  },
  {
    id: "naver-2026-06-ai-briefing-ads",
    platform: "naver",
    kind: "update",
    title: "네이버 AI 브리핑 광고 7월 21일 출시 — AI가 광고 선정과 문구 작성",
    date: "2026-06-18",
    summary:
      "네이버가 5월 7일부터 약 8주간 테스트한 AI 브리핑 광고를 7월 21일 정식 출시한다고 보도됐다. 첫 단계는 검색광고(파워링크) 기반이며, AI가 검색 맥락에 맞춰 광고를 고르고 문구를 만든다. 광고주가 광고 선정과 문구를 직접 통제하기 어려워 상품·서비스 정보의 품질이 중요해진다.",
    takeaways: [
      "랜딩 페이지와 상품 정보에 특장점·리뷰·셀링 포인트를 구조적으로 정리해 AI가 인용할 재료를 늘린다",
      "AI 브리핑 지면 노출분을 별도 리포트로 분리해 기존 파워링크 성과와 섞이지 않게 본다",
    ],
    source: { name: "전자신문", url: "https://www.etnews.com/20260618000242" },
  },
  {
    id: "meta-2026-06-cannes-product-data",
    platform: "meta",
    kind: "update",
    title: "메타, 모든 판매 캠페인에서 상품 데이터를 기본 입력값으로 사용",
    date: "2026-06-17",
    summary:
      "메타가 칸 라이언즈 커머스 발표에서 올여름부터 상품 데이터를 모든 판매 캠페인의 기본 입력값으로 쓰겠다고 밝혔다. 광고주가 형식을 고르지 않아도 AI가 실시간으로 맞는 상품과 사용자를 연결한다. 라이브 쇼핑 광고, 가상 카드 결제, 어필리에이트 파트너 확대도 함께 발표됐다.",
    takeaways: [
      "판매 캠페인 광고주는 카탈로그(상품 피드)를 연결하고 이미지·가격·재고 정보 오류를 정리한다",
      "카탈로그가 없는 광고주는 피드 구축을 우선 과제로 잡는다",
    ],
    source: { name: "Meta for Business", url: "https://www.facebook.com/business/news/cannes-2026-discovery-into-purchase" },
  },
  {
    id: "meta-2026-06-marketing-summit-korea",
    platform: "meta",
    kind: "seminar",
    title: "메타 마케팅 서밋 2026(서울): 'AI가 여는 성장, 메타가 여는 미래'",
    date: "2026-06-16",
    summary:
      "메타코리아가 서울 코엑스 오디토리움에서 약 1,000명이 참석한 연례 행사를 열었다. 연령 기반 타기팅보다 관심사 기반 개인화, 커머스 성과의 기반으로서 카탈로그, 크리에이터 활용을 강조했고 스킨1004의 크로스보더 사례를 공유했다. 메타 AI의 5월 한국어 출시와 광고 관리자 내 메타 AI 도입도 소개됐다.",
    takeaways: [
      "국내 광고주 제안서에서 연령·성별 세분화 대신 넓은 타기팅과 소재 다양화 구조를 기본안으로 둔다",
      "크로스보더 광고주에게 카탈로그 기반 해외 판매 캠페인을 제안한다",
    ],
    source: { name: "헬로티", url: "https://www.hellot.net/news/article.html?no=113258" },
  },
  {
    id: "google-2026-06-dsa-ai-max-timeline",
    platform: "google",
    kind: "update",
    title: "DSA의 AI Max 자동 전환 2027년 2월로 연기 — ACA·캠페인 단위 확장검색은 2026년 9월 전환",
    date: "2026-06-11",
    summary:
      "구글은 4월 동적 검색 광고(DSA), 자동 생성 애셋(ACA), 캠페인 단위 확장검색을 AI Max로 자동 전환한다고 발표했다. 6월 11일 공지에서 DSA 전환은 2027년 2월로 미뤘고, ACA와 캠페인 단위 확장검색은 2026년 9월 전환을 유지했다. AI Max는 검색어 매칭, 텍스트 맞춤설정, 최종 URL 확장으로 구성된다.",
    takeaways: [
      "ACA·캠페인 단위 확장검색을 쓰던 계정은 자동 전환 이후 검색어 보고서와 랜딩 URL을 매주 점검한다",
      "DSA 계정은 2027년 2월 전에 업그레이드 도구로 표준 광고그룹 전환을 테스트한다",
    ],
    source: { name: "Google Ads Developer Blog", url: "https://ads-developers.googleblog.com/2026/06/dynamic-search-ads-dsa-automigration.html" },
  },
  {
    id: "google-2026-05-gml-2026",
    platform: "google",
    kind: "seminar",
    title: "Google Marketing Live 2026 발표 모음",
    date: "2026-05-20",
    summary:
      "구글이 GML 2026에서 AI 시대 검색 광고 형식, 크로스 제품 AI 에이전트 Ask Advisor, Meridian을 통합한 GA360, Asset Studio, Demand Gen 업데이트, 쇼핑·결제(UCP) 확장을 발표했다. 신규 검색 광고 형식은 AI Max for Search·AI Max for Shopping·Performance Max를 통해 활용하도록 안내했다. 한국 광고주용 하이라이트와 자료는 Accelerate with Google 한국 페이지에 정리돼 있다.",
    takeaways: [
      "발표 항목별로 국내(한국어) 적용 시점을 확인해 광고주 공지 일정을 잡는다",
      "검색 캠페인을 AI Max 또는 Performance Max로 운영할 준비가 됐는지 계정별로 점검한다",
    ],
    source: { name: "Google Blog", url: "https://blog.google/products/ads-commerce/google-marketing-live-2026-collection/" },
  },
  {
    id: "google-2026-05-ai-search-ad-formats",
    platform: "google",
    kind: "update",
    title: "AI Mode 시대 검색 광고 형식: 대화형 광고, Business Agent for Leads, Direct Offers 확장",
    date: "2026-05-20",
    summary:
      "구글이 Gemini 기반 검색 광고 형식을 테스트한다고 발표했다. 사용자 질문에 맞춘 대화형 광고, AI Mode 추천 목록 안의 광고, 상품별 추천 이유를 생성하는 AI 쇼핑 광고, 리드 양식 대신 챗봇이 답하는 Business Agent for Leads가 포함됐다. 1월 시작한 Direct Offers 파일럿은 번들·네이티브 결제·여행 딜로 확장된다.",
    takeaways: [
      "새 형식은 AI Max·Performance Max 캠페인에서만 노출되므로 핵심 검색 캠페인의 AI Max 테스트 계획을 세운다",
      "리드 업종 광고주는 FAQ·상품 정보를 정리해 대화형 리드 형식 도입에 대비한다",
    ],
    source: { name: "Google Ads & Commerce Blog", url: "https://blog.google/products/ads-commerce/google-marketing-live-search-ads" },
  },
  {
    id: "google-2026-05-ask-advisor",
    platform: "google",
    kind: "update",
    title: "Ask Advisor: Google Ads·Analytics·Merchant Center를 잇는 AI 에이전트(베타)",
    date: "2026-05-20",
    summary:
      "구글이 Google Ads, Analytics, Merchant Center 데이터를 연결해 추천과 작업 자동화를 수행하는 크로스 제품 AI 에이전트 Ask Advisor를 발표했다. 자연어 요청으로 상품 정보를 불러와 캠페인 생성까지 진행한다. 현재 영어 계정 대상 베타다.",
    takeaways: [
      "영어 인터페이스 계정에서 반복 작업(보고서 요약, 캠페인 초안) 시험 사용을 검토한다",
      "에이전트가 만든 변경은 적용 전 사람이 검수하는 절차를 운영 규칙에 넣는다",
    ],
    source: { name: "Google Ads & Commerce Blog", url: "https://blog.google/products/ads-commerce/ask-advisor" },
  },
  {
    id: "measurement-2026-05-meridian-ga360",
    platform: "measurement",
    kind: "update",
    title: "Meridian, Google Analytics 360에 통합 — Qualified Future Conversions 도입",
    date: "2026-05-20",
    summary:
      "구글이 오픈소스 MMM Meridian을 GA360에 통합해 데이터 통합, 성과 기여 분석, 시나리오 기반 예산 계획을 한 곳에서 하도록 했다. Gemini 기반 Qualified Future Conversions는 브랜드 검색 같은 신호로 상위 퍼널 활동과 미래 매출을 연결한다. 이 지표는 이후 Meridian과도 연결될 예정이다.",
    takeaways: [
      "GA360 광고주는 MMM 입력용 채널별 비용·매출 데이터를 주 단위로 정리해 둔다",
      "상위 퍼널 캠페인 보고에 브랜드 검색량 변화를 보조 지표로 넣는다",
    ],
    source: { name: "Google Marketing Platform Blog", url: "https://blog.google/products/marketingplatform/analytics/meridian-google-analytics-360" },
  },
  {
    id: "google-2026-05-bidding-budgeting",
    platform: "google",
    kind: "update",
    title: "GML 2026 입찰·예산 업데이트: Smart Bidding Exploration을 PMax·쇼핑으로 확대",
    date: "2026-05",
    summary:
      "구글이 검색에서 쓰던 Smart Bidding Exploration을 Performance Max와 쇼핑 캠페인으로 넓힌다고 밝혔다. 검색 캠페인은 평균 27% 더 많은 고유 전환 사용자를 얻었다. 비입찰 전환까지 학습하는 Journey-Aware Bidding(베타), 월 예산 안에서 수요에 맞춰 일 지출을 조정하는 Demand-Led Pacing, 캠페인 총예산도 소개됐다.",
    takeaways: [
      "프로모션 기간 캠페인은 일 예산 대신 캠페인 총예산 설정을 테스트한다",
      "리드 광고주는 전화·폼 등 비입찰 전환도 정확히 수집되는지 전환 설정을 점검한다",
    ],
    source: { name: "Google Ads & Commerce Blog", url: "https://blog.google/products/ads-commerce/bidding-budgeting-google-marketing-live-2026/" },
  },
  {
    id: "measurement-2026-05-meridian-geox-studio",
    platform: "measurement",
    kind: "update",
    title: "Meridian GeoX·Meridian Studio 발표, Google tag gateway 전환 14% 개선",
    date: "2026-05-05",
    summary:
      "구글이 지역 단위 증분 실험 도구 Meridian GeoX(연내 테스트 시작 예정)와 대규모 MMM 관리용 엔터프라이즈 플랫폼 Meridian Studio를 발표했다. Google tag gateway를 쓰는 광고주는 평균 14%의 전환 증가를 봤다고 밝혔다. 측정 기반을 정비하라는 GML 2026의 핵심 메시지다.",
    takeaways: [
      "주요 광고주 사이트에 Google tag gateway 적용 가능 여부를 점검한다",
      "MMM 결과를 지역 실험으로 검증하는 연간 측정 계획을 제안한다",
    ],
    source: { name: "Google Ads & Commerce Blog", url: "https://blog.google/products/ads-commerce/google-marketing-live-2026-turn-your-data-into-decisions/" },
  },
  {
    id: "google-2026-04-ai-max-shopping-ai-brief",
    platform: "google",
    kind: "update",
    title: "AI Max 1주년: AI Max for Shopping, 여행 확장, AI Brief 공개",
    date: "2026-04-30",
    summary:
      "구글이 AI Max를 쇼핑과 여행으로 넓혔다. AI Max for Shopping은 Merchant Center 피드로 텍스트 맞춤설정, 최종 URL 확장, 텍스트·쇼핑 형식 자동 선택을 제공하며 기존 쇼핑 캠페인에서 원클릭으로 업그레이드된다. Gemini 기반 AI Brief로 메시지·매칭·잠재고객 가이드라인을 자연어로 지시할 수 있고, 규제 업종용 텍스트 고지 기능도 추가됐다.",
    takeaways: [
      "쇼핑 캠페인 일부를 AI Max for Shopping으로 업그레이드해 대조군과 비교한다",
      "AI Brief 국내 지원 전까지는 제외 키워드·브랜드 제외·URL 제외로 통제 범위를 정해 둔다",
    ],
    source: { name: "Google Ads & Commerce Blog", url: "https://blog.google/products/ads-commerce/ai-max-new-features/" },
  },
  {
    id: "kakao-2026-04-the-moment-conference",
    platform: "kakao",
    kind: "seminar",
    title: "카카오 광고 컨퍼런스 'Kakao: The Moment' — 메시지·디스플레이·커머스·AI 통합 전략",
    date: "2026-04-23",
    summary:
      "카카오가 광고주·대행사·미디어 파트너 약 1,000명이 참석한 광고 컨퍼런스를 열고 메시지, 디스플레이, 커머스, AI를 잇는 통합 광고 플랫폼 확장 전략을 발표했다. 캠페인 기획, 타깃 설정, 소재 관리 전반의 AI 자동화를 소개했다. 이용자 동의 기반 데이터 활용 원칙도 강조했다.",
    takeaways: [
      "카카오 광고를 메시지(브랜드메시지)·디스플레이(비즈보드)·커머스 광고로 나눠 퍼널별 역할을 다시 정의한다",
      "모먼트 AI 자동화 기능의 적용 시점을 확인해 운영 리소스 계획에 반영한다",
    ],
    source: { name: "카카오 보도자료", url: "https://www.kakaocorp.com/page/detail/12006" },
  },
  {
    id: "naver-2026-03-unified-ad-platform",
    platform: "naver",
    kind: "update",
    title: "네이버, 검색·디스플레이 통합 신규 광고 플랫폼 도입",
    date: "2026-03-25",
    summary:
      "네이버가 따로 운영되던 검색광고와 디스플레이 광고 시스템을 하나의 플랫폼으로 통합했다. 통합 대시보드, 클릭 기반 기여 전환 지표, 기간 비교 기능을 제공하고, 추천·운영·프로모션 인사이트를 주는 AI 기능을 베타로 넣었다. 주로 직접 운영하는 중소 광고주를 겨냥했다.",
    takeaways: [
      "검색·GFA 성과를 통합 대시보드 기준으로 다시 보고 기여 전환 지표 정의를 광고주와 맞춘다",
      "AI 추천 인사이트는 적용 전 기존 운영 기준과 충돌하는지 검토한다",
    ],
    source: { name: "NAVER Corp. 보도자료", url: "https://navercorp.com/media/pressReleasesDetail?seq=34440" },
  },
  {
    id: "measurement-2026-03-iab-mmm-webinar",
    platform: "measurement",
    kind: "seminar",
    title: "IAB 웨비나: AI로 MMM·어트리뷰션·증분 측정 현대화",
    date: "2026-03-09",
    summary:
      "IAB가 State of Data 2026 보고서를 바탕으로 MMM, 멀티터치 어트리뷰션, 증분 측정을 AI로 개선하는 방법을 다룬 온라인 웨비나를 열었다. 개인정보 규제와 플랫폼 분절로 측정 체계가 흔들리는 상황에서 향후 1~2년의 실무 전략을 논의했다.",
    takeaways: [
      "광고주 측정 체계를 어트리뷰션·증분 실험·MMM 3단으로 나눠 현재 수준을 진단한다",
    ],
    source: { name: "IAB", url: "https://www.iab.com/events/modernizing-mmm-attribution-incrementality-ai/" },
  },
  {
    id: "meta-2026-03-click-attribution",
    platform: "meta",
    kind: "update",
    title: "메타, 클릭 후 기여를 링크 클릭으로 한정 — 참여 후 기여(engage-through) 신설",
    date: "2026-03-03",
    summary:
      "메타가 웹사이트·매장 전환의 클릭 후 기여를 링크 클릭만 포함하도록 바꿨다. 공유·저장 등 링크가 아닌 상호작용 후 전환은 이름을 바꾼 참여 후 기여로 옮겨지고, 동영상 참여 조회 기준은 10초에서 5초로 줄었다. GA 등 외부 도구와 수치 차이를 줄이려는 변경이며 과금 방식은 바뀌지 않는다.",
    takeaways: [
      "변경 시점 전후로 메타 클릭 기여 전환 수가 줄 수 있음을 광고주에게 미리 알린다",
      "보고서에서 클릭 후 기여와 참여 후 기여를 분리해 GA 수치와 비교한다",
    ],
    source: { name: "Meta for Business", url: "https://www.facebook.com/business/news/click-attribution" },
  },
  {
    id: "industry-2026-02-iab-state-of-data",
    platform: "industry",
    kind: "guide",
    title: "IAB State of Data 2026: AI가 바꾸는 측정",
    date: "2026-02-02",
    summary:
      "IAB가 어트리뷰션, 증분 테스트, MMM 세 영역에서 AI가 측정을 어떻게 바꾸는지 다룬 보고서를 냈다. 개인정보 규제, 신호 손실, 플랫폼 내장 최적화, 분절된 데이터 환경 때문에 미디어 노출과 성과를 연결하기 어려워졌다고 진단한다.",
    takeaways: [
      "플랫폼 리포트만으로 성과를 판단하지 않도록 광고주와 독립 측정 계획을 합의한다",
    ],
    source: { name: "IAB", url: "https://www.iab.com/insights/2026-state-of-data-report/" },
  },
  {
    id: "meta-2026-01-ai-drives-performance",
    platform: "meta",
    kind: "guide",
    title: "메타 '2026: AI Drives Performance' — GEM 확장과 증분 어트리뷰션 성과",
    date: "2026-01-28",
    summary:
      "메타가 GEM 학습 GPU를 두 배로 늘리고 시퀀스 학습 구조를 적용해 페이스북 광고 클릭 3.5% 증가를 얻었다고 밝혔다. 증분 어트리뷰션 모델은 표준 모델 대비 증분 전환을 24% 더 잡았고, Lattice 개선으로 광고 품질이 12% 올랐다. 동영상 생성 도구의 연 매출 런레이트는 100억 달러에 이르렀다.",
    takeaways: [
      "전환 캠페인 리포트에 증분 어트리뷰션 설정 결과를 병행 표시하는 것을 테스트한다",
      "랭킹 모델이 소재 신호를 많이 쓰는 만큼 소재 콘셉트 다양화를 운영 기본값으로 둔다",
    ],
    source: { name: "Meta Newsroom", url: "https://about.fb.com/news/2026/01/2026-ai-drives-performance/" },
  },
  {
    id: "meta-2026-01-threads-ads-global",
    platform: "meta",
    kind: "update",
    title: "스레드 광고, 전 세계 모든 이용자 대상으로 확대",
    date: "2026-01-21",
    summary:
      "메타가 월 활성 이용자 4억 명을 넘긴 스레드의 광고를 전 세계로 확대한다고 발표했다. Advantage+와 수동 캠페인에 스레드 지면이 자동 추가되고 이미지·동영상·캐러셀·4:5, Advantage+ 카탈로그, 앱 광고를 지원한다. 노출량은 처음엔 낮게 시작해 몇 달에 걸쳐 늘어난다.",
    takeaways: [
      "지면별 분석에서 스레드 성과를 따로 확인하고 브랜드 안전 이슈가 있으면 제외 여부를 결정한다",
      "텍스트 중심 지면에 맞는 짧은 카피·이미지 소재를 추가로 준비한다",
    ],
    source: { name: "Meta for Business", url: "https://www.facebook.com/business/news/ads-on-threads-one-year-in" },
  },
  {
    id: "google-2026-01-ai-search-behavior-kr",
    platform: "google",
    kind: "guide",
    title: "싱크위드구글: AI가 가져온 검색 행태의 변화",
    date: "2026-01",
    summary:
      "Think with Google 한국판이 AI 검색 확산에 따른 소비자 행동 변화를 정리했다. 시각적 발견(렌즈 검색의 20%가 쇼핑 의도), 복잡한 맞춤형 질의, 구매 전 YouTube·검색 확인, AI 에이전트의 예약·결제 수행을 결정적 순간으로 꼽았다. AI Max 도입 시 전환 약 14% 증가를 언급했다.",
    takeaways: [
      "검색 키워드 기획에 질문형·조건형 롱테일 질의를 늘린다",
      "구매 전 확인 단계용 YouTube 리뷰·비교 콘텐츠를 검색 캠페인과 함께 기획한다",
    ],
    source: { name: "Think with Google 한국", url: "https://business.google.com/kr/think/ai-excellence/ai-powered-search-behavior/" },
  },
  {
    id: "kakao-2025-12-moment-ai",
    platform: "kakao",
    kind: "update",
    title: "카카오모먼트AI 출시: 최적화 점수·업종 비교·퍼널 분석",
    date: "2025-12-11",
    summary:
      "카카오가 자영업자·중소상공인을 위한 AI 광고 지원 서비스 카카오모먼트AI를 출시했다. 캠페인 데이터를 분석해 최적화 점수와 개선 방안을 주고, 업종 평균 대비 예산·클릭률·전환율 위치와 인지→방문→고려→전환 4단계 퍼널 이탈 지점을 보여준다. 목표 설정, 예산 배분, 소재 자동 생성, A/B 테스트로 확대할 계획이다.",
    takeaways: [
      "중소 광고주 계정의 최적화 점수와 업종 비교 지표를 월간 리포트 진단 항목으로 활용한다",
    ],
    source: { name: "카카오 보도자료", url: "https://www.kakaocorp.com/page/detail/11845" },
  },
  {
    id: "naver-2025-11-advoost-screen",
    platform: "naver",
    kind: "update",
    title: "네이버, AI 옥외광고 솔루션 'ADVoost Screen' 출시",
    date: "2025-11-03",
    summary:
      "네이버가 광고 시스템에서 DOOH를 집행하는 ADVoost Screen을 출시했다. 월 단위 대신 주 단위 집행이 가능하고, AutoClip AI가 영상 비율을 매체에 맞게 자동 변환한다. 극장, 도심 대형 LED, 택시, 식당 주문 단말 등이 지면이다.",
    takeaways: [
      "오프라인 매장·지역 광고주에게 소액 주 단위 DOOH 테스트를 제안한다",
    ],
    source: { name: "NAVER Corp. 보도자료", url: "https://navercorp.com/media/pressReleasesDetail?seq=33507" },
  },
  {
    id: "measurement-2025-10-privacy-sandbox",
    platform: "measurement",
    kind: "update",
    title: "구글, 크롬 서드파티 쿠키 현행 유지 확정·Privacy Sandbox 기술 다수 종료",
    date: "2025-10-17",
    summary:
      "구글이 크롬에서 서드파티 쿠키에 대한 현재의 사용자 선택 방식을 유지하고 별도 프롬프트를 도입하지 않기로 했다. Topics, Protected Audience, Attribution Reporting API 등 채택률이 낮은 Privacy Sandbox 기술 10개를 종료하고 CHIPS, FedCM, Private State Tokens는 유지한다.",
    takeaways: [
      "Privacy Sandbox API 기반 측정·타기팅 테스트는 중단하고 1st party 데이터와 서버 측 수집에 집중한다",
    ],
    source: { name: "Privacy Sandbox Blog", url: "https://privacysandbox.google.com/blog/update-on-plans-for-privacy-sandbox-technologies" },
  },
  {
    id: "meta-2025-10-advantage-plus-api",
    platform: "meta",
    kind: "update",
    title: "메타, 기존 ASC·AAC API 종료하고 통합 Advantage+ 구조로 전환",
    date: "2025-10-08",
    summary:
      "메타가 Marketing API v24.0부터 기존 Advantage+ 쇼핑(ASC)·앱(AAC) 캠페인 신규 생성을 막고 2026년 1분기 v25.0에서 종료를 마무리한다고 밝혔다. 이후에는 캠페인 예산 자동화, Advantage+ 타깃(또는 지역만 설정), 지면 제한 없음 세 조건을 충족하면 캠페인이 Advantage+ 상태가 된다.",
    takeaways: [
      "API·자동화 툴로 캠페인을 만드는 계정은 v25.0 기준 통합 구조로 생성 로직을 바꾼다",
      "세 가지 자동화 조건 중 무엇을 끄고 있는지 계정별로 점검하고 이유를 기록한다",
    ],
    source: { name: "PPC Land", url: "https://ppc.land/meta-deprecates-legacy-campaign-apis-for-advantage-structure/" },
  },
  {
    id: "kakao-2025-09-kakaotalk-revamp-ads",
    platform: "kakao",
    kind: "update",
    title: "카카오톡 대개편과 신규 광고 지면(친구탭 피드·채팅탭 목록·지금탭 숏폼)",
    date: "2025-09-23",
    summary:
      "카카오톡이 15년 만의 개편으로 친구탭 피드형 광고, 채팅탭 목록 하단 광고, 지금탭 숏폼 광고 지면을 열었다. 이후 이용자 반발로 친구탭 첫 화면을 목록형으로 되돌리고 피드는 별도 메뉴에서 보도록 바꾸기로 했다(2025년 10월 2일 발표). 피드형 지면의 노출 규모는 개편 직후 예상보다 작을 수 있다.",
    takeaways: [
      "신규 지면은 지면별로 따로 성과를 보고, 친구탭 피드 지면은 노출량 변화를 확인한 뒤 예산을 늘린다",
      "지금탭 숏폼 지면용 9:16·16:9 영상 소재를 준비한다",
    ],
    source: { name: "나스미디어 블로그", url: "https://blog.nasmedia.co.kr/entry/2510adissue-kakao-update" },
  },
  {
    id: "measurement-2025-09-safari-26-privacy",
    platform: "measurement",
    kind: "update",
    title: "Safari 26: 핑거프린팅 스크립트의 쿼리 파라미터·리퍼러 접근 차단",
    date: "2025-09-15",
    summary:
      "Safari 26.0은 알려진 핑거프린팅 스크립트가 화면 크기 등 기기 정보를 읽거나 쿠키·LocalStorage를 오래 저장하지 못하게 하고, 쿼리 파라미터와 document.referrer 접근도 제한한다. 사용자는 고급 추적 및 핑거프린팅 보호를 모든 브라우징에 켤 수 있다. iOS 트래픽 비중이 높은 국내 환경에서 클릭 ID 기반 측정 손실 가능성을 키운다.",
    takeaways: [
      "Conversions API·향상된 전환 등 서버 측 전환 전송을 주요 광고주에 우선 적용한다",
      "iOS Safari 유입의 전환율 추이를 별도로 모니터링한다",
    ],
    source: { name: "WebKit Blog", url: "https://webkit.org/blog/17333/webkit-features-in-safari-26-0/" },
  },
  {
    id: "naver-2025-05-advoost-shopping",
    platform: "naver",
    kind: "update",
    title: "네이버 ADVoost 쇼핑 오픈 베타: 쇼핑몰 연결과 예산만으로 집행",
    date: "2025-05-22",
    summary:
      "네이버가 캠페인 설정, 상품 연동, 소재 선별, 지면 선정을 AI로 자동화한 ADVoost 쇼핑을 오픈 베타로 공개했다. 네이버쇼핑 등록 상품 전체를 연결해 통합검색, 쇼핑검색, 메인, 카페·블로그, 뉴스 지면에 노출한다. 이후 ADVoost 검색·크리에이티브·오디언스로 제품군을 넓힐 계획을 밝혔다.",
    takeaways: [
      "스마트스토어 광고주는 기존 쇼핑검색광고와 ADVoost 쇼핑을 예산을 나눠 병행 테스트한다",
      "자동화 캠페인은 타기팅을 걸 수 없으므로 상품명·이미지·가격 경쟁력 점검을 먼저 한다",
    ],
    source: { name: "바이라인네트워크", url: "https://byline.network/2025/05/22-437/" },
  },
  {
    id: "google-2025-05-gml-2025",
    platform: "google",
    kind: "seminar",
    title: "Google Marketing Live 2025: AI Max for Search, Smart Bidding Exploration 발표",
    date: "2025-05-21",
    summary:
      "구글이 GML 2025에서 AI Max for Search 캠페인, 10여 년 만의 최대 입찰 업데이트라는 Smart Bidding Exploration, AI Overviews 광고의 데스크톱 확대와 AI Mode 광고, Veo·Imagen 기반 소재 생성, PMax 채널 리포트를 발표했다. AI Max는 활성화 시 비슷한 CPA/ROAS에서 전환이 평균 14%, 완전·구문 검색 위주 캠페인은 27% 늘었다고 밝혔다.",
    takeaways: [
      "완전·구문 검색 비중이 높은 검색 캠페인부터 AI Max 실험을 우선 적용한다",
      "Smart Bidding Exploration은 유연한 ROAS 목표와 함께 켜고 신규 검색어 카테고리를 확인한다",
    ],
    source: { name: "Google Blog", url: "https://blog.google/products/ads-commerce/google-marketing-live-2025/" },
  },
  {
    id: "google-2025-04-pmax-channel-reporting",
    platform: "google",
    kind: "update",
    title: "Performance Max 채널별 성과 리포트·검색어 보고서·캠페인 단위 제외 키워드",
    date: "2025-04-30",
    summary:
      "구글이 PMax에 검색, YouTube, Discover, Gmail, 디스플레이, 검색 파트너, 지도별 성과를 보여주는 채널 성과 리포트를 도입했다. 검색·쇼핑 캠페인 수준의 검색어 보고서, 캠페인 단위 제외 키워드와 브랜드 제외, 확장된 애셋 단위 지표도 함께 발표했다.",
    takeaways: [
      "PMax 리포트에 채널별 비용·전환 비중을 고정 항목으로 넣는다",
      "검색어 보고서로 비효율 검색어를 찾아 캠페인 단위 제외 키워드로 정리한다",
    ],
    source: { name: "Google Ads & Commerce Blog", url: "https://blog.google/products/ads-commerce/channel-performance-reporting-coming-to-performance-max/" },
  },
];
