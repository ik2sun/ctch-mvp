# Meta Marketing API 캠페인 생성 가이드 (간소화 벌크 세팅 도구용)

- 작성일: 2026-10-09
- 대상: 캠페인 → 광고세트 → 광고 소재(크리에이티브) → 광고를 API로 만드는 NMG 사내 벌크 세팅 도구(KRW 계정)
- 원칙: 공식 문서(developers.facebook.com)에서 확인한 내용만 사실로 적었다. 공식 문서에서 찾지 못했거나 서드파티 자료에서만 본 내용은 **(미확인)**으로 표시했다.
- 참고: 메타 문서는 2026년부터 `developers.facebook.com/documentation/ads-commerce/...`(새 문서, `.md` 원문 제공)와 `developers.facebook.com/docs/marketing-api/...`(기존 레퍼런스)가 함께 운영된다. 전체 목차는 https://developers.facebook.com/documentation/ads-commerce/llms.txt

---

## 0. 한눈에 보기

| 항목 | 결론 |
|---|---|
| 사용할 버전 | **v25.0 고정 권장**(공식 예제가 모두 v25.0). 요청 본문은 v26.0 규칙(광고세트 `advantage_audience` 명시 등)에 맞춰 두고, `validate_only`로 확인한 뒤 v26.0으로 올린다 |
| v21.0 | Marketing API 기준 **2025-09-09에 만료됨**. 현재 CTCH 코드 `lib/meta/graph.ts`의 `META_API_VERSION = "v21.0"`, `app/api/admin/api-keys/route.ts`, `features/creative-analysis/fetchAsset.ts`가 v21.0을 씀 → 쓰기(생성) 기능은 v25.0으로 시작할 것 |
| 생성 순서 | 이미지/영상 업로드 → 캠페인 → 광고세트 → 크리에이티브 → 광고 (모두 `status=PAUSED`로 만들고 마지막에 켜기) |
| 예산 단위 | KRW는 통화 offset **1** → `daily_budget=50000`은 5만 원 그대로 (USD처럼 ×100 하지 않음) |
| 필수 필드 함정 | 캠페인 `special_ad_categories`(빈 배열이라도 필수) / 광고세트 예산을 쓰면 캠페인에 `is_adset_budget_sharing_enabled`(v24+) / 광고세트 `targeting_automation.advantage_audience` 명시(v26+) / 크리에이티브 `instagram_user_id`(`instagram_actor_id` 폐지) |
| 사전 검증 | 캠페인·광고세트·광고·크리에이티브 모두 `execution_options=["validate_only"]` 지원 |
| 한국 | EU가 아니므로 DSA(`dsa_beneficiary`/`dsa_payor`) 불필요, `special_ad_categories=[]` |

---

## 1. API 버전과 2025~2026 주요 변경

출처:
- https://developers.facebook.com/docs/graph-api/changelog/versions/
- https://developers.facebook.com/docs/marketing-api/marketing-api-changelog/
- https://developers.facebook.com/docs/graph-api/changelog/version26.0
- https://developers.facebook.com/docs/graph-api/changelog/version25.0
- https://developers.facebook.com/docs/graph-api/changelog/version24.0
- https://developers.facebook.com/docs/graph-api/changelog/version23.0
- https://developers.facebook.com/docs/graph-api/changelog/version22.0
- https://developers.facebook.com/docs/graph-api/changelog/version21.0

### 1.1 버전 표 (2026-10-09 조회 기준)

Graph API와 Marketing API는 만료일이 다르다. **광고 생성은 Marketing API 만료일을 따른다.**

| 버전 | 출시 | Graph API 만료 | Marketing API 만료 |
|---|---|---|---|
| v26.0 | 2026-07-29 | 미정 | 버전 표에는 아직 없음(변경 로그 `version26.0`에는 Marketing API 항목이 있음) |
| v25.0 | 2026-02-18 | 2028-07-29 | 미정(TBD) |
| v24.0 | 2025-10-08 | 2028-02-18 | **2026-10-06 (만료됨)** |
| v23.0 | 2025-05-29 | 2027-10-08 | 2026-06-09 (만료됨) |
| v22.0 | 2025-01-21 | 2027-05-20 | 2026-02-19 (만료됨) |
| v21.0 | 2024-10-02 | 2027-01-21 | **2025-09-09 (만료됨)** |

- 버전 페이지에 "Marketing API version auto-upgrade"가 2026-07-29로 적혀 있다. 만료된 버전으로 호출하면 자동으로 가장 오래된 사용 가능 버전으로 처리되는 것으로 보이나, 쓰기 요청에서 그대로 통하는지는 **(미확인)**. 레퍼런스에 오류 코드 `2635`(Deprecated Ads API version)가 있으므로 만료 버전으로 생성 요청을 보내면 안 된다.
- **결론**: v25.0을 고정해서 쓰고, v26.0 규칙을 미리 지킨다. v26.0 전환은 `validate_only` 통과 후.

### 1.2 광고 생성에 영향이 있는 변경 (최신순)

| 버전 / 적용일 | 변경 | 우리 도구에서 할 일 |
|---|---|---|
| **v26.0** (전 버전은 v25 만료 시) | 관련 타겟을 쓰는 광고세트는 `targeting_automation.advantage_audience`를 **1 또는 0으로 반드시 명시**. 빠지면 `ADS_TARGETING__REQUIRE_EXPLICIT_ADVANTAGE_AUDIENCE_FLAG` 오류 | 광고세트 생성 시 항상 넣는다 |
| v26.0 | 인스타그램 **탐색 탭(Explore) 지면** 사용 불가 — 명시하면 오류 | `instagram_positions`에서 `explore` 빼기 (`explore_home`은 별개, 아래 참고) |
| v26.0, 전 버전 2026-10-27 | `messenger_positions`의 `story` 값 무시(조용히 제거) | 메신저 스토리 지면 선택지 제거 |
| v26.0, 전 버전 2026-10-27 | 투표(poll) 소재 생성 불가(`poll_spec`, `interactive_components_spec`의 poll) | 지원 안 함 |
| v26.0, 전 버전 2026-10-27 | Web+App 전환 위치 캠페인에 `applink_treatment=web_only` 소재 연결 불가 | 앱 캠페인은 범위 밖 |
| v26.0 | 샵이 있는 광고주는 크리에이티브 `destination_type` 기본값이 `WEBSITE_AND_SHOP`, 끄려면 `WEBSITE_AND_SHOP_OPT_OUT` | 자사몰로만 보내려면 opt-out 옵션 제공 **(필드 위치 미확인 — 크리에이티브 레퍼런스에서 재확인)** |
| v26.0, 전 버전 2026-10-27 | `delivery_estimate` 응답에서 `daily_outcomes_curve`·`budget_guardrail`·`estimate_dau` 제거 | 예상 도달은 `estimate_mau_*`만 사용 |
| **v25.0** (전 버전 2026-05-19) | Advantage+ 쇼핑(ASC)·앱(AAC) 캠페인 **생성·복제·수정 불가**. `smart_promotion_type=AUTOMATED_SHOPPING_ADS`/`SMART_APP_PROMOTION`으로 생성 불가 | 일반 캠페인 구조로 만들고, 3가지 자동화(캠페인 예산·Advantage+ 타겟·자동 지면)를 켜면 "Advantage+ 캠페인"이 됨 (1.3 참고) |
| **v24.0** | 광고세트 예산을 쓰는 캠페인은 생성 시 `is_adset_budget_sharing_enabled`를 **true/false로 반드시 명시**(누락 시 오류 4834011) | 캠페인 예산(CBO)이 아니면 항상 보낸다 |
| v24.0 | 일 예산 초과 집행 허용 폭 25% → 75%(주간 합계는 일 예산×7 이하) | 화면 안내 문구 |
| v24.0 | Advantage+ 지면 일부 지출 `placement_soft_opt_out`(제외 지면에도 최대 5%) — 판매·잠재고객 목표 | 선택 옵션 |
| v24.0 | 페이스북 **동영상 피드(video_feeds)** 지면 생성·수정 시 오류 → 릴스로 대체 | `facebook_positions`에서 `video_feeds` 제거 |
| v24.0, 전 버전 2026-01-06 | 상세 타겟(관심사) 일부 통합 — 통합 전 관심사 ID는 거절 | 관심사는 항상 `/search`로 새로 찾고 저장된 ID 재사용 시 `adinterestvalid`로 확인 |
| v24.0, 전 버전 2026-01-06 | 플래그된 맞춤 전환·맞춤 타겟을 쓰는 캠페인/광고세트 생성 실패 | 오류 메시지 그대로 노출 |
| v23.0 | 신규 광고세트는 기본으로 Advantage+ 타겟에 opt-in. `targeting_automation.individual_setting`의 `age`·`gender`로 연령·성별을 "제안"으로 지정 가능 | 연령·성별을 엄격히 지키려면 `advantage_audience: 0` |
| v23.0 → v25.0 | `smart_promotion_type`으로 캠페인 생성 불가(v25부터) | 보내지 않음 |
| **v22.0** (전 버전 2025-09-09) | `instagram_actor_id` 폐지 → **`instagram_user_id`**. 조회 필드 `instagram_story_id` → `source_instagram_media_id`, `effective_instagram_story_id` → `effective_instagram_media_id` | 크리에이티브에 `instagram_user_id`만 사용 (둘 다 보내면 오류 2446149) |
| v22.0 | `STANDARD_ENHANCEMENTS` 묶음 opt-in 불가 → 기능별 `creative_features_spec` | 5.7 참고 |
| v22.0 (전 버전 2025-04-21) | **상세 타겟 제외(detailed targeting exclusions) 제거** — 계정 단위 제외(고용주)만 허용. 맞춤 타겟 제외는 `exclusions` 안이 아니라 `excluded_custom_audiences` | 관심사 제외 기능 만들지 않음 |
| v22.0 | Asset Feed Spec의 Segment Asset Customization 미지원 | 지면별 맞춤(placement)만 사용 |
| v21.0 | ODAX(OUTCOME_*)가 아닌 목표로는 새 광고세트·광고 생성 불가 | 목표는 OUTCOME_* 6종만 |
| v21.0 | 이미지 확장이 `creative_features_spec.standard_enhancements`로 이동(이후 v22에서 묶음 자체가 폐지) | — |

### 1.3 "Advantage+ 캠페인"의 현재 정의 (v25+)

출처: https://developers.facebook.com/documentation/ads-commerce/marketing-api/advantage-campaigns.md

- 별도 캠페인 유형이 아니라 **세 가지 자동화가 모두 켜진 일반 캠페인**이다. 읽기 전용 `advantage_state_info.advantage_state`가 `ADVANTAGE_PLUS_SALES`/`ADVANTAGE_PLUS_APP`/`ADVANTAGE_PLUS_LEADS`이면 Advantage+, 하나라도 꺼지면 `DISABLED`.
  1. **캠페인 예산**(CBO) + 지원 입찰 전략(`LOWEST_COST_WITHOUT_CAP` 권장, `COST_CAP`, `LOWEST_COST_WITH_BID_CAP`, `LOWEST_COST_WITH_MIN_ROAS`)
  2. **Advantage+ 지면**: 지면 타겟을 지정하지 않음(계정 단위 지면 제외는 허용). 모든 광고세트가 충족해야 함
  3. **Advantage+ 타겟**: 광고세트 중 하나 이상이 `targeting_automation.advantage_audience: 1`(권장) 또는 지역만 지정 등
- `advantage_state`를 직접 POST해서 만들 수 없다.
- 기존 캠페인 이전: `POST /{campaign_id}?migrate_to_advantage_plus=true`(같은 ID) 또는 `POST /{campaign_id}/copies?migrate_to_advantage_plus=true`(새 ID). 이전·복사 시 학습 단계로 돌아감.
- 조회: `GET /{campaign_id}?fields=name,objective,advantage_state_info`

---

## 2. 캠페인 생성 — `POST /act_{ad_account_id}/campaigns`

출처:
- https://developers.facebook.com/docs/marketing-api/reference/ad-account/campaigns/
- https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group/
- https://developers.facebook.com/documentation/ads-commerce/marketing-api/bidding/guides/adset-budget-sharing

### 2.1 파라미터

| 파라미터 | 타입 | 필수 | 값 / 설명 |
|---|---|---|---|
| `name` | string | 실무상 필수 | 캠페인 이름(이모지 가능) |
| `objective` | enum | 실무상 필수 | **ODAX 6종만 사용**: `OUTCOME_AWARENESS`(인지), `OUTCOME_TRAFFIC`(트래픽), `OUTCOME_ENGAGEMENT`(참여), `OUTCOME_LEADS`(잠재고객), `OUTCOME_APP_PROMOTION`(앱 홍보), `OUTCOME_SALES`(판매). 레퍼런스 enum에는 `CONVERSIONS`·`LINK_CLICKS` 등 레거시 값도 남아 있으나 v21부터 새 광고세트·광고 생성 불가 |
| `status` | enum | 선택 | 생성 시 `ACTIVE`/`PAUSED`만. **`PAUSED` 권장** |
| `special_ad_categories` | array<enum> | **필수** | `NONE`, `EMPLOYMENT`, `HOUSING`, `CREDIT`, `ISSUES_ELECTIONS_POLITICS`, `ONLINE_GAMBLING_AND_GAMING`, `FINANCIAL_PRODUCTS_SERVICES`. 해당 없음 = `[]`(또는 `["NONE"]`) |
| `special_ad_category_country` | array<string> | 조건부 | 특별 광고 카테고리를 쓸 때 국가 코드(예 `["KR"]`) |
| `buying_type` | string | 선택 | 기본 `AUCTION`. `RESERVED`는 도달·빈도 구매 |
| `bid_strategy` | enum | CBO일 때 | `LOWEST_COST_WITHOUT_CAP`(최저 비용, 기본), `LOWEST_COST_WITH_BID_CAP`(입찰가 한도), `COST_CAP`(비용 한도), `LOWEST_COST_WITH_MIN_ROAS`(최소 ROAS). CBO가 아니면 광고세트에서 설정 |
| `daily_budget` | int64 | 선택(CBO) | 캠페인 예산(일). 캠페인·광고세트 중 **한 곳에만**(둘 다 넣으면 오류 1885621) |
| `lifetime_budget` | int64 | 선택(CBO) | 캠페인 예산(총). 광고세트에 `end_time` 필요 |
| `is_adset_budget_sharing_enabled` | bool | **조건부 필수(v24+)** | 캠페인 예산이 없을 때(광고세트 예산) 반드시 `true`/`false`. 누락 시 4834011. true면 광고세트끼리 예산 최대 20% 공유(일 예산만, 같은 입찰 전략 필요) |
| `spend_cap` | int64 | 선택 | 캠페인 지출 한도(통화 최소 단위). 해제는 `922337203685478`. 최소값은 약 USD 100 상당(계정 필드 `min_campaign_group_spend_cap`로 확인) |
| `start_time` / `stop_time` | datetime | 선택 | 일반적으로 광고세트에서 설정 |
| `promoted_object` | object | 조건부 | 카탈로그 판매(`product_catalog_id`) 등 일부에만 |
| `budget_schedule_specs` | list | 선택 | 고수요 기간 예산 증액(`time_start`, `time_end`, `budget_value`, `budget_value_type` ABSOLUTE/MULTIPLIER, `recurrence_type`) |
| `campaign_optimization_type` | enum | 선택 | `NONE`, `ICO_ONLY` |
| `adlabels` | list | 선택 | 라벨 |
| `execution_options` | list | 선택 | `["validate_only"]` = 만들지 않고 검증만 |
| `smart_promotion_type` | — | **보내지 말 것** | v25부터 생성에 사용 불가 |

응답: `{"id": "<CAMPAIGN_ID>", "success": true}`(read-after-write 지원)

### 2.2 예시 — 광고세트 예산(ABO) 판매 캠페인

```http
POST https://graph.facebook.com/v25.0/act_<AD_ACCOUNT_ID>/campaigns
Content-Type: application/x-www-form-urlencoded

name=1009_르무통_CV_가을프로모션
objective=OUTCOME_SALES
status=PAUSED
special_ad_categories=[]
is_adset_budget_sharing_enabled=false
access_token=<TOKEN>
```

### 2.3 예시 — 캠페인 예산(CBO), 일 30만 원

```json
{
  "name": "1009_르무통_CV_CBO",
  "objective": "OUTCOME_SALES",
  "status": "PAUSED",
  "special_ad_categories": [],
  "daily_budget": 300000,
  "bid_strategy": "LOWEST_COST_WITHOUT_CAP"
}
```
- 그래프 API는 폼 인코딩이 기본이며 객체·배열 값은 JSON 문자열로 넣는다. JSON 본문(`Content-Type: application/json`)도 일반적으로 받지만 Marketing API 전 엔드포인트 보장 여부는 **(미확인)** → 폼 인코딩 권장.

### 2.4 예산 공유(is_adset_budget_sharing_enabled) 관련 오류

| 코드 | 의미 |
|---|---|
| 4834002 | 캠페인 예산과 함께 쓸 수 없음 |
| 4834005 | 입찰 전략이 필요함 |
| 4834006 | 공유 켜진 상태에서 입찰 전략 중간 변경 불가 |
| 4834009 | 광고세트 스펙이 균일해야 함 |
| 4834011 | 광고세트 예산 캠페인에 값이 누락됨 |

- 집행 중 켜기는 불가, 끄기만 가능. 신규·복제 캠페인에만 적용.

---

## 3. 광고세트 생성 — `POST /act_{ad_account_id}/adsets`

출처:
- https://developers.facebook.com/docs/marketing-api/reference/ad-account/adsets/
- https://developers.facebook.com/docs/marketing-api/bidding/overview/billing-events/
- https://developers.facebook.com/documentation/ads-commerce/marketing-api/bidding/overview/budgets.md
- https://developers.facebook.com/docs/marketing-api/currencies/
- https://developers.facebook.com/docs/marketing-api/reference/ad-account/minimum_budgets/
- https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group/ (목표별 검증 표)

### 3.1 파라미터

| 파라미터 | 타입 | 필수 | 값 / 설명 |
|---|---|---|---|
| `name` | string | **필수** | 최대 400자 |
| `campaign_id` | string | **필수** | (`campaign_spec`을 쓰는 경우 제외) |
| `optimization_goal` | enum | 실무상 필수 | 3.2 표 참고 |
| `billing_event` | enum | 실무상 필수 | `IMPRESSIONS`(대부분), `LINK_CLICKS`, `THRUPLAY` 등. 3.3 표 |
| `bid_strategy` | enum | ABO일 때 | 캠페인과 같은 4종 |
| `bid_amount` | int | 조건부 | `LOWEST_COST_WITH_BID_CAP`·`COST_CAP`이면 필수. 통화 최소 단위(KRW=원) |
| `bid_constraints` | object | 조건부 | `LOWEST_COST_WITH_MIN_ROAS`일 때 `{"roas_average_floor": <값>}` — 값 단위(예: 10000 = ROAS 1.0 = 100%)는 **(미확인 — 입찰 가이드에서 재확인)** |
| `daily_budget` | int64 | 조건부 | ABO면 `daily_budget` 또는 `lifetime_budget` 중 하나 > 0. 집행 기간이 24시간 초과일 때만 |
| `lifetime_budget` | int64 | 조건부 | `end_time` 필수 |
| `start_time` | datetime | 선택 | ISO 8601(예 `2026-10-10T09:00:00+0900`) 또는 UNIX 타임스탬프 |
| `end_time` | datetime | 조건부 | 총 예산이면 필수. 일 예산에서 `0` = 종료 없음 |
| `promoted_object` | object | 조건부 | 3.4 표 |
| `destination_type` | enum | 선택 | `WEBSITE`, `APP`, `MESSENGER`, `WHATSAPP`, `INSTAGRAM_DIRECT`, `ON_AD`(인스턴트 양식), `ON_POST`, `ON_VIDEO`, `ON_PAGE`, `ON_EVENT`, `SHOP_AUTOMATIC`, `APPLINKS_AUTOMATIC`, `INSTAGRAM_PROFILE`, `FACEBOOK_PAGE`, `INSTAGRAM_PROFILE_AND_FACEBOOK_PAGE`, 메시지 조합형 등. 웹사이트 전환·트래픽은 `WEBSITE` |
| `attribution_spec` | list | 선택 | `[{"event_type":"CLICK_THROUGH","window_days":7},{"event_type":"VIEW_THROUGH","window_days":1}]`. `event_type`: `CLICK_THROUGH`, `VIEW_THROUGH`, `ENGAGED_VIDEO_VIEW` |
| `targeting` | object | 실무상 필수 | 3.5 |
| `status` | enum | 선택 | `ACTIVE`/`PAUSED` |
| `frequency_control_specs` | list | 선택 | `[{"event":"IMPRESSIONS","interval_days":7,"max_frequency":2}]` (1~90). **최적화 목표가 `REACH`·`THRUPLAY`일 때만 적용** |
| `is_dynamic_creative` | bool | 선택 | 다이내믹 크리에이티브(asset_feed_spec 조합 테스트) 광고세트. 기본 false |
| `pacing_type` | list | 선택 | `["standard"]` 기본, `["day_parting"]`은 광고 일정(총 예산 필요) |
| `daily_min_spend_target` / `daily_spend_cap` | int64 | 선택 | CBO 캠페인 안에서 광고세트별 하한·상한 |
| `placement_soft_opt_out` | — | 선택(v24+) | 제외 지면에도 최대 5% 지출 허용(판매·잠재고객) — 값 형식 **(미확인)** |
| `dsa_beneficiary` / `dsa_payor` | string | EU 타겟 시 필수 | 한국 타겟만이면 불필요 |
| `execution_options` | list | 선택 | `["validate_only"]` |

응답: `{"id": "<ADSET_ID>"}`. 주요 오류: 100, 190, 200, 368, 2635, 2641(제한된 지역), 2695(캠페인당 광고세트 한도 — iOS14), 80004.

### 3.2 목표(objective)별 최적화 목표·전환 위치·promoted_object

공식 표(Ad Campaign 레퍼런스 "Outcome-Driven Ads Experiences Objective Validation")에서 웹 기반 광고에 해당하는 행만 정리. 표는 레거시 목표 → 새 목표 매핑 형식이라 일부 조합은 요약한 것이다.

| objective | 대표 용도 | destination_type | optimization_goal | promoted_object |
|---|---|---|---|---|
| `OUTCOME_AWARENESS` | 도달 | (없음) | `REACH`, `IMPRESSIONS` | `page_id` |
| | 광고 회상 | (없음) | `AD_RECALL_LIFT` | `page_id` |
| | 동영상 조회 | (없음) | `THRUPLAY`, `TWO_SECOND_CONTINUOUS_VIDEO_VIEWS` | `page_id` |
| `OUTCOME_TRAFFIC` | 웹사이트 | `WEBSITE`(문서 표는 공란) | `LINK_CLICKS`, `LANDING_PAGE_VIEWS`, `REACH`, `IMPRESSIONS` | 없음(LPV는 픽셀 설치 필요 — 픽셀 지정 여부 **(미확인)**) |
| | 메신저·왓츠앱 | `MESSENGER`/`WHATSAPP` | `LINK_CLICKS`, `REACH`, `IMPRESSIONS` | 왓츠앱은 `page_id` |
| `OUTCOME_ENGAGEMENT` | 게시물 참여 | `ON_POST` | `POST_ENGAGEMENT`, `REACH`, `IMPRESSIONS` | 없음 |
| | 동영상 | `ON_VIDEO` | `THRUPLAY`, `TWO_SECOND_CONTINUOUS_VIDEO_VIEWS` | 없음 |
| | 페이지 좋아요 | `ON_PAGE` | `PAGE_LIKES` | `page_id` |
| | 웹 전환(참여형) | (없음) | `OFFSITE_CONVERSIONS`, `LINK_CLICKS`, `REACH`, `LANDING_PAGE_VIEWS`, `IMPRESSIONS` | `pixel_id` + `custom_event_type` |
| `OUTCOME_LEADS` | 인스턴트 양식 | `ON_AD` | `LEAD_GENERATION`, `QUALITY_LEAD` | `page_id` |
| | 웹사이트 잠재고객 | (없음) | `OFFSITE_CONVERSIONS`, `LINK_CLICKS`, `REACH`, `LANDING_PAGE_VIEWS`, `IMPRESSIONS` | `pixel_id` + `custom_event_type`(예 `LEAD`, `COMPLETE_REGISTRATION`) |
| `OUTCOME_SALES` | **웹사이트 구매** | `WEBSITE`(문서 표는 공란) | `OFFSITE_CONVERSIONS`(전환 수), `VALUE`(전환 가치 — ROAS 입찰과 함께) | `pixel_id` + `custom_event_type`(예 `PURCHASE`, `ADD_TO_CART`) |
| | 메신저 | `MESSENGER` | `CONVERSATIONS` | `page_id`, `pixel_id`, `custom_event_type` |
| | 카탈로그 | `WEBSITE` | `LINK_CLICKS`/`OFFSITE_CONVERSIONS` | 캠페인 `product_catalog_id`, 광고세트 `product_set_id` + `custom_event_type` |
| `OUTCOME_APP_PROMOTION` | 앱 설치 | (없음) | `APP_INSTALLS`, `LINK_CLICKS`, `OFFSITE_CONVERSIONS` | `application_id` + `object_store_url` |

- `VALUE` 최적화가 판매 목표에서 허용된다는 것은 최적화 목표 enum과 일반 운영 경험에서 알 수 있으나 위 공식 표 행에는 없다 → **(미확인 — 첫 실호출을 `validate_only`로 확인)**.
- `custom_event_type` 주요 값: `PURCHASE`, `ADD_TO_CART`, `INITIATED_CHECKOUT`, `ADD_PAYMENT_INFO`, `LEAD`, `COMPLETE_REGISTRATION`, `CONTENT_VIEW`, `SEARCH`, `ADD_TO_WISHLIST`, `CONTACT`, `SUBSCRIBE`, `START_TRIAL`, `OTHER` 등(전체 enum은 Ad Promoted Object 레퍼런스 — 이번에 원문 대조 못 함 **(미확인)**). 맞춤 전환은 `custom_conversion_id`.

### 3.3 optimization_goal ↔ billing_event 조합

출처: https://developers.facebook.com/docs/marketing-api/bidding/overview/billing-events/

| optimization_goal | 가능한 billing_event |
|---|---|
| `LINK_CLICKS` | `LINK_CLICKS`, `IMPRESSIONS` |
| `THRUPLAY` | `IMPRESSIONS`, `THRUPLAY` |
| `TWO_SECOND_CONTINUOUS_VIDEO_VIEWS` | `IMPRESSIONS`, `TWO_SECOND_CONTINUOUS_VIDEO_VIEWS` |
| `APP_INSTALLS`, `AD_RECALL_LIFT`, `ENGAGED_USERS`, `EVENT_RESPONSES`, `IMPRESSIONS`, `LEAD_GENERATION`, `OFFSITE_CONVERSIONS`, `PAGE_LIKES`, `POST_ENGAGEMENT`, `REACH`, `VALUE`, `LANDING_PAGE_VIEWS` | `IMPRESSIONS`만 |

→ **간소화 도구는 `billing_event=IMPRESSIONS` 고정**으로 충분(트래픽 + 링크 클릭 과금만 예외 선택지).

### 3.4 예산 단위와 KRW

- 예산·입찰가는 **계정 통화의 최소 단위**로 넣는다. 통화 offset: KRW = **1**(JPY·TWD·IDR·VND 등과 같음), USD = 100.
  - KRW: `daily_budget=50000` → 5만 원 / USD: `daily_budget=5000` → $50.
- 최소 예산: 계정·통화·최적화 목표·입찰가에 따라 다르다. 하드코딩하지 말고 조회한다.
  - `GET /act_{id}?fields=min_daily_budget,currency` (계정 최소 일 예산)
  - `GET /act_{id}/minimum_budgets?bid_amount=<선택>` (Auction 광고세트 최소 일 예산; 응답 노드 필드 이름 `min_daily_budget_imp`, `min_daily_budget_video_views`, `min_daily_budget_high_freq`, `min_daily_budget_low_freq` 등은 **(미확인)**)
  - 예산 부족 오류: 1885272(Budget too low), 2238055(캠페인 예산 최소 미만 — 문서에 다른 의미로도 중복 기재), 1885650(변경 반영 구간 예산 부족)
- 실제 KRW 최소 일 예산 금액(예: 노출 과금 1,000원대 등)은 공식 문서에 숫자로 없음 → **(미확인)**. CTCH 미디어믹스 동기화는 자체 규칙으로 100원 단위·최소 1,000원을 쓰고 있다.
- 예산 변경 제한: 광고세트당 **1시간에 4번**(초과 시 1시간 차단, 613/1487632). 지출 한도 변경 하루 10번(17/1885172).

### 3.5 타겟팅(targeting) 스펙

출처:
- https://developers.facebook.com/documentation/ads-commerce/marketing-api/audiences/reference/basic-targeting.md
- https://developers.facebook.com/documentation/ads-commerce/marketing-api/audiences/reference/advanced-targeting.md
- https://developers.facebook.com/documentation/ads-commerce/marketing-api/audiences/reference/placement-targeting.md

| 필드 | 형식 / 값 |
|---|---|
| `geo_locations.countries` | `["KR"]` (국가는 맞춤 타겟이 없으면 하나 이상 필요) |
| `geo_locations.regions` | `[{"key":"<REGION_KEY>"}]` 최대 200 — 키는 `/search?type=adgeolocation`으로 조회 |
| `geo_locations.cities` | `[{"key":"<CITY_KEY>","radius":17,"distance_unit":"kilometer"}]` 반경 10~50마일 / 17~80km, 최대 250 |
| `geo_locations.zips` | `[{"key":"KR:06236"}]` 형식(국가코드:우편번호) — 한국 우편번호 지원 여부 **(미확인)** |
| `geo_locations.location_types` | `["home","recent"]`(기본 둘 다) |
| `excluded_geo_locations` | 같은 구조(`recent` 사용 불가) |
| `age_min` | 기본 18, 최소 13 (한국은 18 미만 타겟 제한 오류 1870165 가능) |
| `age_max` | 최대 65(65 = 65세 이상) |
| `genders` | `[1]` 남성, `[2]` 여성, 생략 = 전체 |
| `locales` | `[<locale key>]` — `/search?type=adlocale&q=ko`로 키 조회 |
| `flexible_spec` | `[{"interests":[{"id":"...","name":"..."}],"behaviors":[...]}]` — 배열 안 객체끼리 AND, 객체 안은 OR. 쓰면 `geo_locations` 등 필요 |
| `interests` / `behaviors` | `[{"id":"6003139266461","name":"Movies"}]` (최상위에도 넣을 수 있음) |
| `custom_audiences` | `[{"id":"<CA_ID>"}]` |
| `excluded_custom_audiences` | `[{"id":"<CA_ID>"}]` 최대 500 — **`exclusions` 안에 맞춤 타겟 넣는 방식은 폐지** |
| `exclusions` (상세 타겟 제외) | **v22부터 사실상 사용 불가**(계정 단위 고용주 제외만) |
| `publisher_platforms` | `facebook`, `instagram`, `threads`, `messenger`, `audience_network` |
| `facebook_positions` | `feed`, `right_hand_column`, `marketplace`, `story`, `search`, `instream_video`, `facebook_reels`, `facebook_reels_overlay`, `profile_feed`, `notification` (~~`video_feeds`~~ v24에서 오류) |
| `instagram_positions` | `stream`(피드), `story`, `reels`, `explore_home`, `profile_feed`, `ig_search`, `profile_reels` (~~`explore`~~ v26에서 오류) |
| `audience_network_positions` | `classic`, `rewarded_video` (단독 선택 불가) |
| `messenger_positions` | `sponsored_messages`(다른 지면과 함께 불가) (~~`story`~~ v26에서 무시) |
| `threads_positions` | `threads_stream` (인스타 `stream`과 함께) |
| `device_platforms` | `mobile`, `desktop` |
| `user_os` | 예 `["iOS"]`, `["Android_ver_4.4_and_above"]` |
| `targeting_automation.advantage_audience` | `1` = Advantage+ 타겟(연령·관심사 등은 "제안"으로 취급) / `0` = 끔(입력값을 엄격 적용). **v26부터 명시 필수** |
| `targeting_automation.individual_setting` | `{"age":1,"gender":1}` 연령·성별을 제안으로(판매·앱 목표, 일부 광고주), `{"geo":1}` 선택 지역에 관심 있는 사람까지 확장(v22+) |

지면 규칙:
- `publisher_platforms`를 넣으면 `facebook`이 포함되어야 한다(문서 기재).
- `facebook_positions: story`·`messenger_positions: story`는 피드 또는 IG 스토리 + `device_platforms: ["mobile"]` 필요.
- `marketplace`·`search`·`profile_feed`·`notification`은 `feed` 필요.
- **Advantage+ 지면 = 지면 필드(`publisher_platforms` 이하)를 아예 빼는 것.** 간소화 도구 기본값으로 권장.

Advantage+ 타겟 주의:
- `advantage_audience: 1`이면 `age_max` 등은 엄격한 제한이 아니라 제안으로 쓰인다는 서드파티 보고가 있고, 1일 때 `age_max`를 65 미만으로 두면 오류가 난다는 보고도 있다 → **(미확인)**. 연령·성별을 엄격히 지켜야 하는 광고주는 `0`.

### 3.6 광고세트 예시 — 판매(구매 전환), ABO, 일 5만 원, Advantage+ 지면

```http
POST https://graph.facebook.com/v25.0/act_<AD_ACCOUNT_ID>/adsets

name=1009_lookalike_f2544
campaign_id=<CAMPAIGN_ID>
status=PAUSED
daily_budget=50000
billing_event=IMPRESSIONS
optimization_goal=OFFSITE_CONVERSIONS
bid_strategy=LOWEST_COST_WITHOUT_CAP
destination_type=WEBSITE
promoted_object={"pixel_id":"<PIXEL_ID>","custom_event_type":"PURCHASE"}
attribution_spec=[{"event_type":"CLICK_THROUGH","window_days":7},{"event_type":"VIEW_THROUGH","window_days":1}]
start_time=2026-10-10T00:00:00+0900
targeting={
  "geo_locations":{"countries":["KR"]},
  "age_min":25,"age_max":44,"genders":[2],
  "custom_audiences":[{"id":"<LAL_ID>"}],
  "excluded_custom_audiences":[{"id":"<PURCHASER_180D_ID>"}],
  "targeting_automation":{"advantage_audience":0}
}
```

### 3.7 광고세트 예시 — 트래픽(랜딩 페이지 조회), 비용 한도, 지면 수동

```json
{
  "name": "1009_traffic_ig_reels",
  "campaign_id": "<CAMPAIGN_ID>",
  "status": "PAUSED",
  "daily_budget": 30000,
  "billing_event": "IMPRESSIONS",
  "optimization_goal": "LANDING_PAGE_VIEWS",
  "bid_strategy": "COST_CAP",
  "bid_amount": 800,
  "destination_type": "WEBSITE",
  "targeting": {
    "geo_locations": {"countries": ["KR"]},
    "age_min": 20, "age_max": 65,
    "publisher_platforms": ["facebook", "instagram"],
    "facebook_positions": ["feed", "facebook_reels"],
    "instagram_positions": ["stream", "story", "reels"],
    "device_platforms": ["mobile"],
    "targeting_automation": {"advantage_audience": 1}
  }
}
```

### 3.8 DSA (EU 전용)

출처: https://developers.facebook.com/blog/post/2023/05/16/new-marketing-mpa-api-requirements-for-facebook-and-instagram-ads-targeting-eu/ , https://developers.facebook.com/docs/marketing-api/reference/ad-account/dsa_recommendations

- EU(및 연계 지역)를 타겟하는 광고세트만 `dsa_beneficiary`(혜택 받는 사람·조직)·`dsa_payor`(지불자) 문자열 필요. 계정 기본값 `default_dsa_beneficiary`/`default_dsa_payor` 설정 가능, 추천값 `GET /act_{id}/dsa_recommendations`.
- 누락 시 오류: 3858152(게시 전 수혜자·지불자 필요), 복사 시 3858079(payor 없음)/3858081(beneficiary 없음).
- **한국만 타겟하면 불필요.** 국가 선택에 EU 국가가 들어가면 그때만 입력칸을 연다.

---

## 4. 미디어 업로드

### 4.1 이미지 — `POST /act_{ad_account_id}/adimages`

출처: https://developers.facebook.com/docs/marketing-api/reference/ad-account/adimages/ , https://developers.facebook.com/docs/marketing-api/reference/ad-image/

| 방식 | 요청 |
|---|---|
| base64 | `bytes=<BASE64>` (폼 필드) |
| 파일(multipart) | `-F 'filename=@sample.jpg'` 형식이 널리 쓰이나 레퍼런스에는 `bytes`·`copy_from`만 기재 → **(미확인, 실호출로 확인)**. 파일 이름에 확장자 필수 |
| 다른 계정에서 복사 | `copy_from={"source_account_id":"<ACT_NUM>","hash":"<HASH>"}` |
| zip | "이미지 또는 zip 업로드 가능"이라고만 기재, 세부 **(미확인)** |

응답(레퍼런스의 반환 타입 기준):
```json
{
  "images": {
    "sample.jpg": {
      "hash": "0d500843a1d4699a0b41e99f4137a5c3",
      "url": "https://scontent...",
      "url_128": "...", "url_256": "...",
      "width": 1080, "height": 1350,
      "name": "sample.jpg"
    }
  }
}
```
- 이후 크리에이티브에서는 `hash`만 쓴다. 해시는 광고계정 단위 — 같은 이미지는 다시 올리지 않고 재사용(CTCH GFA 벌크와 같은 캐시 전략).
- 삭제: `DELETE /act_{id}/adimages?hash=<HASH>`(계정에서 연결만 해제). 사용 중이면 삭제 불가.
- 크기·형식 제한은 레퍼런스에 숫자 없음. 크리에이티브 `image_file`/`image_url`은 최대 8MB(adcreatives 레퍼런스). 권장 비율(메타 광고 가이드 기준, 이번 조사에서 원문 대조는 안 함 **(미확인)**): 피드 1:1(1080×1080) 또는 **4:5(1080×1350)**, 스토리·릴스 **9:16(1080×1920)** — 위 14%·아래 20%(약 250px)는 글자·로고를 두지 않는 안전 영역, 링크형 가로 1.91:1(1200×628).

### 4.2 동영상

#### (A) 광고계정 영상 라이브러리 — `POST /act_{ad_account_id}/advideos`
출처: https://developers.facebook.com/docs/marketing-api/reference/ad-account/advideos/

| 파라미터 | 설명 |
|---|---|
| `source` | 파일(multipart) — 작은 파일 |
| `file_url` | 공개 URL에서 가져오기 (Supabase storage 공개 URL 등) |
| `name` / `title`(255자 미만) / `description` | 메타데이터 |
| `upload_phase` | `start` / `transfer` / `finish` / `cancel` (청크 업로드) |
| `file_size` | start 단계 전체 바이트 |
| `upload_session_id`, `start_offset`, `end_offset`, `video_file_chunk` | transfer 단계 |

청크 업로드 순서(레퍼런스 파라미터 기준, 호스트는 `graph-video.facebook.com` 관행 — **(미확인)**):
```text
1) POST /act_{id}/advideos  upload_phase=start  file_size=<bytes>
   → {"upload_session_id":"...","video_id":"...","start_offset":"0","end_offset":"1048576"}
2) POST /act_{id}/advideos  upload_phase=transfer  upload_session_id=...  start_offset=0  video_file_chunk=@chunk
   → {"start_offset":"1048576","end_offset":"..."}  (start_offset==end_offset 될 때까지 반복)
3) POST /act_{id}/advideos  upload_phase=finish  upload_session_id=...  title=...
   → {"success":true}
```
응답 필드: `id`, `video_id`, `upload_session_id`, `start_offset`, `end_offset`, `success` 등.

#### (B) 새 문서의 영상 광고 업로드 — `POST /act_{id}/video_ads` (Resumable)
출처: https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/videoads/fbvideoads

```text
1) POST /v25.0/act_{id}/video_ads   upload_phase=start
   → {"video_id":"<VID>","upload_url":"https://rupload.facebook.com/video-ads-upload/v25.0/<VID>"}
2a) 로컬 파일: POST <upload_url>  헤더 Authorization: OAuth <TOKEN>, offset: 0, file_size: <bytes>, 본문=파일 바이트
2b) 호스팅 파일: POST <upload_url>  헤더 Authorization: OAuth <TOKEN>, file_url: https://...  (본문 없음, 인증 필요한 URL 불가)
   → {"success":true}
3) GET /v25.0/<VID>?fields=status   (선택)
4) POST /v25.0/act_{id}/video_ads   upload_phase=finish  video_id=<VID>
```
- 권한: `ads_read`, `ads_management` + 광고계정 `CREATE_CONTENT` 작업 권한. **비즈니스(시스템 사용자 포함) 계정으로의 업로드는 미지원**이라고 문서에 적혀 있음 — 시스템 사용자 토큰으로 되는지 **(미확인, 실호출 확인 필요)**. 안 되면 (A) `advideos`를 쓴다.
- 중단 시 재개: status의 `uploading_phase.bytes_transferred`를 읽어 `offset`으로 다시 POST.

#### 처리 상태 확인(공통)
```http
GET /v25.0/<VIDEO_ID>?fields=status
```
```json
{"status":{
  "video_status":"processing",          // ready | processing | expired | error
  "uploading_phase":{"status":"complete","bytes_transferred":12345678},
  "processing_phase":{"status":"in_progress"},
  "publishing_phase":{"status":"not_started"}
}}
```
- **`video_status=ready`가 될 때까지 크리에이티브 생성을 미룬다**(5~10초 간격 폴링, 최대 수 분).
- 썸네일: 영상 크리에이티브는 `image_hash` 또는 `image_url` 썸네일이 사실상 필요. 메타가 만든 썸네일은 `GET /<VIDEO_ID>/thumbnails`(`uri`, `is_preferred`) — 필드는 CTCH 소재 분석에서 실사용 중이나 이번에 레퍼런스 원문 대조는 못 함 **(미확인)**. 메타 CDN URL을 `image_url`로 넣는 것은 문서가 권장하지 않음 → 썸네일 이미지를 따로 `adimages`에 올려 `image_hash`로 쓰는 것을 권장.
- 영상 권장 사양(같은 문서): MP4, 16:9~9:16, 최소 너비 1200px(1280×720 권장), 24~60fps, H.264/H.265, AAC 48kHz 128kbps+, 10GB 이하 권장.

---

## 5. 광고 소재 — `POST /act_{ad_account_id}/adcreatives`

출처:
- https://developers.facebook.com/docs/marketing-api/reference/ad-account/adcreatives/
- https://developers.facebook.com/docs/marketing-api/reference/ad-creative-object-story-spec/
- https://developers.facebook.com/docs/marketing-api/reference/ad-creative-link-data/
- https://developers.facebook.com/docs/marketing-api/reference/ad-creative-video-data/
- https://developers.facebook.com/docs/marketing-api/reference/ad-creative-link-data-call-to-action/
- https://developers.facebook.com/documentation/ads-commerce/marketing-api/dynamic-creative/placement-asset-customization.md
- https://developers.facebook.com/documentation/ads-commerce/marketing-api/creative/advantage-creative/get-started.md
- https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/videoads.md

### 5.1 주요 파라미터

| 파라미터 | 설명 |
|---|---|
| `name` | 소재 이름(라이브러리용) |
| `object_story_spec` | 새 게시물(비게시 페이지 포스트)로 광고 만들기: `page_id` + `instagram_user_id` + `link_data`/`video_data`/`photo_data`/`text_data`/`template_data` 중 하나 |
| `object_story_id` | 기존 페이지 게시물 `<PAGE_ID>_<POST_ID>` (같은 ID 소재가 있으면 기존 소재 ID 반환) |
| `source_instagram_media_id` | 기존 인스타그램 게시물로 광고 |
| `instagram_user_id` | 인스타 계정 ID (object_story_spec 안에도 둠) |
| `asset_feed_spec` | 여러 문구·제목·이미지 조합 / 지면별 에셋 |
| `degrees_of_freedom_spec` | `{"creative_features_spec":{...}}` Advantage+ 크리에이티브 기능별 opt-in/out |
| `url_tags` | 랜딩 URL 뒤에 붙는 쿼리(UTM). 예 `utm_source=meta&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}` |
| `contextual_multi_ads` | 다중 광고(`enroll_status`) |
| `threads_user_id` | 스레드 지면용 |
| `branded_content` / `facebook_branded_content` / `instagram_branded_content` | 브랜디드 콘텐츠·파트너십 |
| `execution_options` | `["validate_only"]` |

응답: `{"id":"<CREATIVE_ID>"}`. 오류: 100, 105(파라미터 과다), 190, 200, 368, 500(금지 콘텐츠), 613, 1500(잘못된 URL), 2635, 80004.

### 5.2 object_story_spec

| 필드 | 설명 |
|---|---|
| `page_id` | 페이스북 페이지(사용자가 관리자·편집자). 실무상 필수 |
| `instagram_user_id` | 인스타그램 계정 ID. **`instagram_actor_id`는 2025-09-09 전 버전 폐지** — 둘 다 넣으면 2446149 |
| `link_data` | 링크(이미지·캐러셀) 광고 |
| `video_data` | 영상 광고 |
| `photo_data` / `text_data` / `template_data` | 사진 게시물 / 텍스트 / 다이내믹 상품 광고 |

### 5.3 link_data (단일 이미지 · 캐러셀)

| 필드 | 설명 |
|---|---|
| `link` | 랜딩 URL(CTA 링크와 같아야 함) |
| `message` | 본문(기본 문구) |
| `name` | 헤드라인(제목) |
| `description` | 설명(링크 설명 — 인스타그램에는 미사용) |
| `caption` | 표시 URL(인스타그램 미사용) |
| `image_hash` 또는 `picture` | 둘 중 하나 |
| `call_to_action` | `{"type":"SHOP_NOW","value":{"link":"https://..."}}` (생략 시 인스타는 LEARN_MORE) |
| `child_attachments` | 캐러셀 카드 2~10개(인스타는 처음 5개만 노출 — 레퍼런스 기재). 카드 필드: `link`, `name`, `description`, `image_hash`/`picture`, `video_id`, `call_to_action` |
| `multi_share_optimized` | 캐러셀 순서 자동 최적화(기본 true) |
| `multi_share_end_card` | 끝 카드(페이지 아이콘) 표시(기본 true) |

#### 예시 — 단일 이미지
```json
{
  "name": "1009_lemouton_walking_img01",
  "object_story_spec": {
    "page_id": "<PAGE_ID>",
    "instagram_user_id": "<IG_USER_ID>",
    "link_data": {
      "image_hash": "<IMAGE_HASH>",
      "link": "https://www.example.co.kr/event/fall",
      "message": "하루 2만 보에도 가벼운 발. 가을 한정 15% 할인",
      "name": "가을 워킹화 기획전",
      "description": "10/12까지",
      "call_to_action": {"type": "SHOP_NOW", "value": {"link": "https://www.example.co.kr/event/fall"}}
    }
  },
  "url_tags": "utm_source=meta&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}"
}
```

#### 예시 — 캐러셀
```json
{
  "object_story_spec": {
    "page_id": "<PAGE_ID>",
    "instagram_user_id": "<IG_USER_ID>",
    "link_data": {
      "link": "https://www.example.co.kr/best",
      "message": "가을 베스트 3",
      "child_attachments": [
        {"link": "https://www.example.co.kr/p/1", "image_hash": "<H1>", "name": "클래식", "call_to_action": {"type": "SHOP_NOW"}},
        {"link": "https://www.example.co.kr/p/2", "image_hash": "<H2>", "name": "메이트", "call_to_action": {"type": "SHOP_NOW"}},
        {"link": "https://www.example.co.kr/p/3", "image_hash": "<H3>", "name": "슬립온", "call_to_action": {"type": "SHOP_NOW"}}
      ],
      "multi_share_optimized": true,
      "multi_share_end_card": false
    }
  }
}
```

### 5.4 video_data

| 필드 | 설명 |
|---|---|
| `video_id` | 광고계정에 연결된 영상 ID |
| `image_hash` / `image_url` | 썸네일(둘 중 하나, 실무상 필수) |
| `title` | 헤드라인 |
| `message` | 본문 |
| `link_description` | 설명 |
| `call_to_action` | `{"type":"SHOP_NOW","value":{"link":"..."}}` |

```json
{
  "object_story_spec": {
    "page_id": "<PAGE_ID>",
    "instagram_user_id": "<IG_USER_ID>",
    "video_data": {
      "video_id": "<VIDEO_ID>",
      "image_hash": "<THUMB_HASH>",
      "title": "가을 워킹화 기획전",
      "message": "걷는 맛이 달라지는 가을",
      "call_to_action": {"type": "SHOP_NOW", "value": {"link": "https://www.example.co.kr/event/fall"}}
    }
  }
}
```

### 5.5 CTA type 값 (레퍼런스 원문, 자주 쓰는 것 굵게)

**`SHOP_NOW`(지금 구매하기)**, **`LEARN_MORE`(더 알아보기)**, **`SIGN_UP`(가입하기)**, **`BUY_NOW`(바로 구매)**, **`ORDER_NOW`(지금 주문)**, **`GET_OFFER`(혜택 받기)**, **`BOOK_NOW`(예약하기)**, **`APPLY_NOW`(지원하기)**, **`CONTACT_US`(문의하기)**, **`DOWNLOAD`**, **`SUBSCRIBE`(구독)**, **`GET_QUOTE`(견적 받기)**, **`INSTALL_MOBILE_APP`**, **`WATCH_MORE`**, **`SEE_MORE`**, **`MESSAGE_PAGE`**, **`WHATSAPP_MESSAGE`**, **`CALL_NOW`**, **`NO_BUTTON`**, `OPEN_LINK`, `LIKE_PAGE`(링크 광고 불가), `PLAY_GAME`, `INSTALL_APP`, `USE_APP`, `CALL`, `CALL_ME`, `VIDEO_CALL`, `USE_MOBILE_APP`, `MOBILE_DOWNLOAD`, `BOOK_TRAVEL`, `LISTEN_MUSIC`, `WATCH_VIDEO`, `VISIT_PAGES_FEED`, `CONTACT`, `GET_OFFER_VIEW`, `BUY_TICKETS`, `UPDATE_APP`, `GET_DIRECTIONS`, `BUY`, `SEND_UPDATES`, `DONATE`, `SAY_THANKS`, `SELL_NOW`, `SHARE`, `DONATE_NOW`, `START_ORDER`, `ADD_TO_CART`, `VIEW_CART`, `VIEW_IN_CART`, `VIDEO_ANNOTATION`, `RECORD_NOW`, `INQUIRE_NOW`, `CONFIRM`, `REFER_FRIENDS`, `REQUEST_TIME`, `GET_SHOWTIMES`, `LISTEN_NOW`, `TRY_DEMO`, `FOLLOW_USER`, `RAISE_MONEY`, `SEE_SHOP`, `GET_DETAILS`, `FIND_OUT_MORE`, `VISIT_WEBSITE`, `BROWSE_SHOP`, `EVENT_RSVP`, `FOLLOW_NEWS_STORYLINE`, `FIND_A_GROUP`, `FIND_YOUR_GROUPS`, `PAY_TO_ACCESS`, `PURCHASE_GIFT_CARDS`, `FOLLOW_PAGE`, `SEND_A_GIFT`, `SWIPE_UP_SHOP`, `SWIPE_UP_PRODUCT`, `SEND_GIFT_MONEY`, `PLAY_GAME_ON_FACEBOOK`, `GET_STARTED`, `OPEN_INSTANT_APP`, `AUDIO_CALL`, `GET_PROMOTIONS`, `JOIN_CHANNEL`, `MAKE_AN_APPOINTMENT`, `ASK_ABOUT_SERVICES`, `BOOK_A_CONSULTATION`, `GET_A_QUOTE`, `BUY_VIA_MESSAGE`, `ASK_FOR_MORE_INFO`, `CHAT_WITH_US`, `VIEW_PRODUCT`, `VIEW_CHANNEL`, `GET_IN_TOUCH`, `ASK_A_QUESTION`, `START_A_CHAT`, `CHAT_NOW`, `ASK_US`, `WATCH_LIVE_VIDEO`, `JOIN_LIVE_VIDEO`, `SHOP_WITH_AI`, `TRY_ON_WITH_AI`, `WATCH_NOW`, `STREAM_NOW`, `BUY_ACTIVITY_TICKETS`

- 목표마다 허용 CTA가 다르다(문서: Ads Product Guide 참고). 페이스북 스토리는 `CALL_NOW`·`GET_DIRECTIONS` 불가. 웹 판매·트래픽용 간소화 선택지는 굵은 글씨 10개 정도면 충분.
- `value` 객체: `link`(필수급), `app_link`, `lead_gen_form_id` 등 — 하위 필드 전체 목록은 **(미확인)**.

### 5.6 asset_feed_spec — 여러 문구 + 지면별 이미지(피드 4:5 / 스토리·릴스 9:16)

```json
{
  "name": "1009_fall_pac",
  "object_story_spec": {"page_id": "<PAGE_ID>", "instagram_user_id": "<IG_USER_ID>"},
  "asset_feed_spec": {
    "ad_formats": ["SINGLE_IMAGE"],
    "images": [
      {"hash": "<HASH_4x5>",  "adlabels": [{"name": "feed"}]},
      {"hash": "<HASH_9x16>", "adlabels": [{"name": "vertical"}]}
    ],
    "bodies": [{"text": "하루 2만 보에도 가벼운 발"}, {"text": "가을 한정 15% 할인"}],
    "titles": [{"text": "가을 워킹화 기획전"}],
    "descriptions": [{"text": "10/12까지"}],
    "link_urls": [{"website_url": "https://www.example.co.kr/event/fall"}],
    "call_to_action_types": ["SHOP_NOW"],
    "optimization_type": "PLACEMENT",
    "asset_customization_rules": [
      {
        "customization_spec": {
          "publisher_platforms": ["facebook", "instagram"],
          "facebook_positions": ["feed"],
          "instagram_positions": ["stream"]
        },
        "image_label": {"name": "feed"}
      },
      {
        "customization_spec": {
          "publisher_platforms": ["facebook", "instagram"],
          "facebook_positions": ["story", "facebook_reels"],
          "instagram_positions": ["story", "reels"]
        },
        "image_label": {"name": "vertical"}
      }
    ]
  }
}
```
규칙(공식 문서):
- 규칙(`asset_customization_rules`)은 **2개 이상**, 각 규칙에 `customization_spec` 필수, `publisher_platforms` 필수 + 선택한 플랫폼의 position 필드 필수.
- 라벨: 이미지 `image_label`, 영상 `video_label`, 캐러셀 `carousel_label` — 에셋 `adlabels.name`과 일치해야 함(불일치 오류 2446173).
- 설명(`descriptions`)은 1개만(지면별 맞춤 불가). `explore_home`은 `SINGLE_IMAGE`만.
- 기존 게시물로는 지면별 맞춤 API 생성 불가.
- 위 예시의 규칙 2개를 페이스북+인스타 묶음으로 쓴 것, 규칙에 `priority`를 다는 방식은 **(미확인)** — 공식 예시는 플랫폼별 1규칙. 첫 실호출을 `validate_only`로 확인.
- 영상 지면 맞춤: `videos: [{"video_id":..., "thumbnail_hash":..., "adlabels":[...]}]` + `video_label` (영상 에셋 필드명 `thumbnail_hash`는 **(미확인)**).
- 여러 문구(bodies/titles 최대 5개씩 등) 조합 개수 제한은 **(미확인)**.

### 5.7 Advantage+ 크리에이티브 — `degrees_of_freedom_spec.creative_features_spec`

```json
"degrees_of_freedom_spec": {
  "creative_features_spec": {
    "image_touchups":        {"enroll_status": "OPT_IN"},
    "text_optimizations":    {"enroll_status": "OPT_OUT"},
    "image_templates":       {"enroll_status": "OPT_OUT"},
    "image_uncrop":          {"enroll_status": "OPT_OUT"},
    "image_background_gen":  {"enroll_status": "OPT_OUT"},
    "image_animation":       {"enroll_status": "OPT_OUT"},
    "adapt_to_placement":    {"enroll_status": "OPT_IN"},
    "inline_comment":        {"enroll_status": "OPT_IN"},
    "enhance_cta":           {"enroll_status": "OPT_OUT"}
  }
}
```
- 키 23종: `adapt_to_placement`, `add_text_overlay`, `creative_stickers`, `description_automation`, `enhance_cta`, `image_animation`, `image_background_gen`, `image_brightness_and_contrast`, `image_templates`, `image_text_translation`, `image_touchups`, `image_uncrop`, `inline_comment`, `media_type_automation`, `pac_relaxation`, `product_extensions`, `reveal_details_over_time`, `text_optimizations`, `text_translation`, `translate_voiceover`, `video_auto_crop`, `video_filtering`, `video_uncrop`
- `enroll_status`: `OPT_IN` / `OPT_OUT`. 음악은 여기 아님(`asset_feed_spec.audios`, 빼려면 비움).
- 기본값: `adapt_to_placement`만 opt-in 기본(4:5·9:16 지면 적용) 명시. **나머지 기능을 생략했을 때 메타가 자동으로 켜는지는 (미확인)** — 광고주 브랜드 톤 보호를 위해 이미지 생성·문구 변형 계열은 명시적으로 `OPT_OUT` 권장.
- `standard_enhancements`(묶음)는 v22부터 opt-in 불가. 조회 결과에 보여도 `OPT_IN`이 아니면 적용 안 됨. `enroll_status` 누락 오류 3858082.
- 레퍼런스 표기로는 `degrees_of_freedom_spec`에 `degrees_of_freedom_type`이 필수라고 되어 있으나 Get Started 예시는 `creative_features_spec`만 보냄 → **(미확인)**.

### 5.8 기존 인스타 게시물 / 파트너십 광고 (요약)

출처: https://developers.facebook.com/documentation/ads-commerce/marketing-api/ad-creative/partnership-ads.md , .../partnership-ads/ads-creation/boost-existing-post.md , .../use-new-creative.md

- 기존 IG 게시물: 크리에이티브에 `instagram_user_id` + `source_instagram_media_id`(+ 페이지 `object_id` 또는 `page_id` 필요 여부 **(미확인)**). 지면별 에셋 맞춤 불가.
- 기존 페이스북 게시물: `object_story_id=<PAGE_ID>_<POST_ID>`. 삭제된 게시물 오류 1885557/2490155.
- 파트너십 광고(크리에이터 계정 공동 표기): 크리에이터의 게시물 단위 또는 계정 단위 권한 승인이 선행되어야 하며 `branded_content` 등의 필드를 씀. 콘텐츠가 파트너십 광고로 쓸 수 없으면 3867105. 세부 본문은 위 문서 참고 — 간소화 도구 1차 범위에서는 제외 권장.

---

## 6. 광고 생성 — `POST /act_{ad_account_id}/ads`

출처: https://developers.facebook.com/docs/marketing-api/reference/ad-account/ads/

| 파라미터 | 필수 | 설명 |
|---|---|---|
| `name` | **필수** | 광고 이름 |
| `adset_id` | **필수** | (`adset_spec` 대체 가능) |
| `creative` | **필수** | `{"creative_id":"<ID>"}` 또는 크리에이티브 스펙 직접 |
| `status` | 선택 | `ACTIVE`/`PAUSED`(테스트는 PAUSED 권장) |
| `tracking_specs` | 선택 | 추적 행동(픽셀 등). 보통 생략(광고세트 promoted_object로 자동) |
| `conversion_domain` | 조건부 | 픽셀과 데이터를 공유하는 캠페인의 광고면 필요. 1·2단계 도메인만(예 `example.co.kr`) — 공식 예시는 `facebook.com`, `.co.kr` 같은 2단계 공공 접미사의 취급은 **(미확인)** |
| `adlabels`, `display_sequence` | 선택 | |
| `ad_schedule_start_time` / `ad_schedule_end_time` | 선택 | 광고 개별 일정(판매·앱 캠페인만) |
| `execution_options` | 선택 | `validate_only`, `synchronous_ad_review`, `include_recommendations` |
| `bid_amount` | — | 폐지(광고세트에서) |

```http
POST /v25.0/act_<AD_ACCOUNT_ID>/ads
name=1009_lemouton_walking_img01_c1
adset_id=<ADSET_ID>
creative={"creative_id":"<CREATIVE_ID>"}
status=PAUSED
conversion_domain=example.co.kr
```
응답 `{"id":"<AD_ID>","success":true}`. 생성 후 심사(`effective_status=IN_PROCESS` → `ACTIVE`/`DISAPPROVED`). 심사 거절은 2490427/2490468(새로 만들어야 함).

---

## 7. 드롭다운용 읽기 엔드포인트

출처: https://developers.facebook.com/docs/marketing-api/reference/ad-account/ , https://developers.facebook.com/documentation/ads-commerce/marketing-api/audiences/reference/targeting-search.md , https://developers.facebook.com/docs/marketing-api/reference/ad-account/delivery_estimate/

| 용도 | 요청 |
|---|---|
| 계정 기본 정보 | `GET /act_{id}?fields=name,account_id,currency,timezone_name,timezone_offset_hours_utc,account_status,disable_reason,min_daily_budget,min_campaign_group_spend_cap,spend_cap,amount_spent,business,user_tasks,default_dsa_payor,default_dsa_beneficiary` |
| `account_status` 값 | 1 ACTIVE, 2 DISABLED, 3 UNSETTLED, 7 PENDING_RISK_REVIEW, 8 PENDING_SETTLEMENT, 9 IN_GRACE_PERIOD, 100 PENDING_CLOSURE, 101 CLOSED → **1이 아니면 실행 막기** |
| 홍보 가능 페이지 | `GET /act_{id}/promote_pages?fields=id,name,picture` (대안: `GET /me/accounts`, 비즈니스 `GET /{business_id}/owned_pages`) |
| 인스타 계정 | `GET /act_{id}/instagram_accounts`, `GET /act_{id}/connected_instagram_accounts` (둘 다 ShadowIGUser) / 페이지 연결 계정 `GET /{page_id}?fields=instagram_business_account{id,username}` (페이지 필드는 공식 레퍼런스 원문 대조 못 함 **(미확인)**) / IG 쪽에서 `GET /{ig_user_id}/authorized_adaccounts` |
| 픽셀 | `GET /act_{id}/adspixels?fields=id,name,last_fired_time` (엣지 목록 원문 대조 못 함 **(미확인)**, 업계 관행상 사용) |
| 맞춤 타겟 | `GET /act_{id}/customaudiences?fields=id,name,subtype,approximate_count_lower_bound,approximate_count_upper_bound,operation_status` (필드명 **(미확인)**) |
| 맞춤 전환 | `GET /act_{id}/customconversions?fields=id,name,custom_event_type` **(미확인)** |
| 기존 캠페인 | `GET /act_{id}/campaigns?fields=id,name,objective,status,effective_status,daily_budget,lifetime_budget,bid_strategy,is_adset_budget_sharing_enabled&limit=200` |
| 기존 광고세트 | `GET /act_{id}/adsets?fields=id,name,campaign_id,status,optimization_goal,billing_event,daily_budget,targeting,promoted_object&limit=200` |
| 지역 검색 | `GET /search?type=adgeolocation&location_types=["region"]&country_code=KR&q=서울` → `key`, `name`, `type`, `country_code`, `region`, `region_id` |
| 관심사 검색 | `GET /search?type=adinterest&q=러닝&limit=20&locale=ko_KR` → `id`, `name`, `path` |
| 관심사 추천 | `GET /search?type=adinterestsuggestion&interest_list=["Running"]` |
| 관심사 유효성 | `GET /search?type=adinterestvalid&interest_fbid_list=[...]` → `valid` (v24 통합 대응) |
| 행동·인구 | `GET /search?type=adTargetingCategory&class=behaviors` (`demographics`, `life_events`, `income`, `family_statuses`, `user_device`, `user_os`, `industries`) |
| 언어 | `GET /search?type=adlocale&q=ko` |
| 계정 통합 타겟 검색 | `GET /act_{id}/targetingsearch?q=...` |
| 예상 도달 | `GET /act_{id}/delivery_estimate?optimization_goal=OFFSITE_CONVERSIONS&promoted_object={...}&targeting_spec={...}` (v26부터 `daily_outcomes_curve` 등 제거) / `GET /act_{id}/reachestimate?targeting_spec=...` |
| 최소 예산 | `GET /act_{id}/minimum_budgets` |
| 결과 읽기 | `GET /act_{id}/ads?fields=creative{effective_instagram_media_id,instagram_permalink_url}` |

---

## 8. 복사(Copies) 엔드포인트

출처:
- https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group/copies/
- https://developers.facebook.com/docs/marketing-api/reference/ad-campaign/copies/
- https://developers.facebook.com/docs/marketing-api/reference/adgroup/copies/

| 엔드포인트 | 주요 파라미터 | 응답 |
|---|---|---|
| `POST /{campaign_id}/copies` | `deep_copy`(기본 false), `start_time`, `end_time`(일 예산 `0`=무기한), `status_option`(`ACTIVE`/`PAUSED` 기본/`INHERITED_FROM_SOURCE`), `rename_options{rename_strategy: DEEP_RENAME / ONLY_TOP_LEVEL_RENAME(기본) / NO_RENAME, rename_prefix, rename_suffix}`, `parameter_overrides`, `migrate_to_advantage_plus` | `copied_campaign_id`, `ad_object_ids[{ad_object_type, source_id, copied_id}]` |
| `POST /{adset_id}/copies` | `campaign_id`(다른 캠페인으로 복사), `deep_copy`, `start_time`, `end_time`, `status_option`, `rename_options` | `copied_adset_id`, `ad_object_ids` |
| `POST /{ad_id}/copies` | `adset_id`, `creative_parameters`(소재 필드 덮어쓰기 — `degrees_of_freedom_spec`은 병합이 아니라 통째 교체), `status_option`, `rename_options` | `copied_ad_id` |

제한:
- `deep_copy` 하위 객체 수: **동기 호출 최대 3개, 비동기 최대 51개**. 그 이상이면 비동기 배치로 나누거나 직접 생성.
- 이미 끝난 광고세트를 복사하면 복사 시점부터 원본과 같은 기간으로 예약.
- v25부터 ASC·AAC 캠페인 복사 불가. v24 관심사 통합 이후 복사 시 통합 관심사로 자동 대체.
- 복사본은 기본 `PAUSED` — 벌크 "기존 캠페인 복제 후 소재만 교체"에 유용.

---

## 9. 대량 처리 효율 · 한도 · 오류

### 9.1 Batch API

출처: https://developers.facebook.com/docs/graph-api/batch-requests

```http
POST https://graph.facebook.com/v25.0/
access_token=<TOKEN>
include_headers=false
batch=[
  {"method":"POST","name":"cmp","relative_url":"act_<ID>/campaigns",
   "body":"name=Test&objective=OUTCOME_SALES&status=PAUSED&special_ad_categories=[]&is_adset_budget_sharing_enabled=false"},
  {"method":"POST","name":"as1","relative_url":"act_<ID>/adsets",
   "body":"campaign_id={result=cmp:$.id}&name=AS1&daily_budget=50000&billing_event=IMPRESSIONS&optimization_goal=OFFSITE_CONVERSIONS&..."}
]
```
- 한 번에 **최대 50개**. 각 요청이 호출 수·한도에 따로 집계(배치로 한도를 아끼지는 못함, 왕복만 줄임).
- `name` + `{result=<name>:$.id}`(JSONPath)로 앞 결과 참조. `body`는 URL 인코딩 문자열.
- 응답은 요청 순서대로 `[{code, headers, body(문자열 JSON)}]`. 개별 실패는 다른 요청에 영향 없음. 타임아웃 시 끝나지 않은 요청은 `null` → 재시도.
- 바이너리: multipart로 파일 첨부 + 요청의 `attached_files`.
- **"한 배치에 같은 캠페인의 광고세트 여러 개 불가"**라고 문서에 적혀 있음 → 광고세트는 배치를 나누거나 순차 생성.
- `depends_on`, `omit_response_on_success`는 이번 문서 본문에서 확인 못 함 **(미확인)**.

### 9.2 비동기 배치 — `POST /act_{id}/async_batch_requests`

출처: https://developers.facebook.com/docs/marketing-api/reference/ad-account/async_batch_requests/

- 파라미터: `adbatch`(목록, 각 항목 `name`·`relative_url`·`body` 필수), `name`(추적용, 필수). 응답 `{"id": "<요청 세트 ID>"}`.
- 결과 조회 방법(`GET /{id}?fields=...`, `/requests`)과 한도는 문서 본문에 없음 **(미확인)**. 한 HTTP 요청에 최대 50개(광고세트 copies 문서 기재).
- 간소화 도구 규모(수십~수백 개)는 동기 순차 + 소량 배치로 충분, 비동기는 후순위.

### 9.3 validate_only (드라이런)

- 캠페인·광고세트·광고·크리에이티브 모두 `execution_options=["validate_only"]` 지원 → 실제 생성 없이 검증, 성공 시 `{"success": true}`.
- 단, 광고세트 검증엔 실제 `campaign_id`가, 광고 검증엔 실제 `adset_id`·`creative_id`가 필요하다(존재하지 않는 부모 ID로는 검증 불가 — 일반 동작상 **(미확인)**). 실무: 캠페인을 `PAUSED`로 실제 생성 → 하위는 validate_only로 전체 점검 → 통과하면 실제 생성. 실패하면 PAUSED 캠페인 삭제.
- 오류 응답의 `error.error_user_title`·`error_user_msg`(사용자용 문구, 계정 언어로 옴)와 `error_data.blame_field_specs`(문제 필드)를 화면에 그대로 보여줄 것.

### 9.4 호출 한도

출처: https://developers.facebook.com/documentation/ads-commerce/marketing-api/overview/rate-limiting.md , https://developers.facebook.com/docs/marketing-api/marketing-api-changelog/

| 구분 | 내용 |
|---|---|
| BUC(ads_management, 광고계정당 1시간) | Limited(개발) 300 + 40×활성 광고 수 / Full 100,000 + 40×활성 광고 수 |
| 계정 점수 | 읽기 1점·쓰기 3점, Limited 최대 60점(300초 감쇠, 도달 시 300초 차단), Full 9,000점(60초 차단) |
| 쓰기 QPS | 앱×광고계정 100 QPS 이하 |
| 헤더 | `X-Business-Use-Case-Usage`(`call_count`, `total_cputime`, `total_time`, `estimated_time_to_regain_access`, `ads_api_access_tier`), `X-Ad-Account-Usage`(`acc_id_util_pct`, `reset_time_duration`), 앱 단위 `x-app-usage`(CTCH `lib/meta/graph.ts`가 이미 감시) |
| 등급 | 2026-05-04부터 "Marketing API Access Tier": Limited / Full. Full 자동 승인 기준 15일간 500회 이상 호출 + 최근 500회 오류율 15% 미만 |
| 광고 생성량 | 계정 일 지출 한도에 비례해 제한(613/1487225). 고정 개수 상한은 문서에 없음 |

한도 오류:

| 코드/서브코드 | 의미 | 처리 |
|---|---|---|
| 4 | 앱 호출 한도 | 대기 후 재시도 |
| 17 / 2446079 | 광고계정 점수 한도 | `estimated_time_to_regain_access` 만큼 대기 |
| 613 / 1487742 | 광고계정 호출 과다 | 백오프 |
| 613 / 5044001 | 쓰기 QPS 초과 | 동시성 낮추기 |
| 613 / 1487632 | 광고세트 예산 1시간 4회 초과 | 1시간 뒤 |
| 613 / 1487225 | 일 지출 한도로 광고 생성 제한 | 지출 한도 상향 |
| 17 / 1885172 | 지출 한도 하루 10회 초과 | 다음 날 |
| 80000·80003·80004·80014 | BUC 한도 | 헤더 보고 대기 |
| 613 (서브코드 없음) | 남용 방지 차단 | 메타 지원 문의 |

### 9.5 생성 시 자주 보는 오류 (한국어 풀이)

출처: https://developers.facebook.com/docs/marketing-api/error-reference/ (+ 각 엔드포인트 레퍼런스)

| 코드/서브코드 | 뜻 | 사전 점검 |
|---|---|---|
| 100 | 잘못된 파라미터(가장 흔함 — `error_user_msg` 확인) | 필수 필드·enum |
| 100 / 33 | 지원하지 않는 요청 — 토큰 사용자가 맞춤 타겟 소유 계정 관리자 아님 | 시스템 사용자 권한 |
| 100 / 1487694 | 폐지된 타겟 카테고리 | 관심사 재검색 |
| 100 / 1815946 | 여러 지역에 반경(radius) 사용 | 반경은 도시 단위만 |
| 100 / 3858258 | 이미지 다운로드 실패(접근 불가·robots.txt) | `picture`/`image_url` 대신 해시 업로드 |
| 190 | 토큰 만료·무효 | 토큰 점검 |
| 200 / 10 / 294 | 권한 없음 / `ads_management` + 허용 앱 필요 | 권한·역할 |
| 1500 | URL 무효 | 랜딩 URL 형식 |
| 2635 | 만료된 API 버전 | v25.0 사용 |
| 2607 | 광고에 쓸 수 없는 통화 | — |
| 1487033 | 종료일이 과거 | 날짜 검증 |
| 1487929 | promoted_object 여러 개 | 하나만 |
| 1885029 | 광고 페이지 ≠ promoted_object 페이지 | 페이지 일치 |
| 1885204 | 이 최적화는 자동 입찰만 | 입찰 전략 |
| 1885272 | 예산 너무 적음 | `minimum_budgets` |
| 1885557 / 2490155 | 홍보 게시물 사용 불가(삭제·권한) | 게시물 확인 |
| 1885621 | 캠페인 예산과 광고세트 예산 동시 지정 | 한쪽만 |
| 1815199 | 광고계정이 인스타 계정에 접근 권한 없음 | 인스타 계정 목록에서만 선택 |
| 1815629 | 에셋 값 중복(asset_feed_spec) | 문구 중복 제거 |
| 2446149 | `instagram_user_id`와 `instagram_actor_id` 동시 지정 | user_id만 |
| 2446173 | 지면 맞춤 규칙 라벨이 에셋 라벨과 불일치 | 라벨 검증 |
| 2446383 | 이 목표는 웹사이트 URL과 CTA 필요 | link·CTA |
| 2446394 | 맞춤 타겟 제외 시 상세 타겟 불가 | 조합 제한 |
| 2446509 | 잘못된 destination type | 목표별 표 |
| 2446580 | `components`와 `child_attachments` 동시 사용 | — |
| 2446307 | 캠페인 지출 한도가 최소 미만 | `min_campaign_group_spend_cap` |
| 1870065 | 비활성 맞춤 타겟 포함 | 타겟 상태 |
| 1870090 / 1870092 | 맞춤 타겟 약관 / 비즈니스 도구 약관 미동의 | 광고주 계정에서 동의 |
| 1870165 | 18세 미만 타겟 불가 | age_min ≥ 18 |
| 1870199 | `location_types` 값 제거 필요 | 기본값 사용 |
| 3858064 | 최소 연령 미만 타겟 | — |
| 3858082 | standard enhancements에 `enroll_status` 누락 | 기능별로 지정 |
| 3858152 / 3858079 / 3858081 | DSA 수혜자·지불자 누락(EU) | EU 타겟 시 입력 |
| 4834002~4834011 | 광고세트 예산 공유 관련(2.4) | `is_adset_budget_sharing_enabled` |
| `ADS_TARGETING__REQUIRE_EXPLICIT_ADVANTAGE_AUDIENCE_FLAG` | v26: advantage_audience 미지정 | 항상 0/1 |
| 2641 | 제한된 지역 포함·제외 | — |
| 2695 | 캠페인 광고세트 한도 도달 | — |
| 2490427 / 2490468 | 심사 거절로 비활성 — 새로 생성 | — |
| 1404078 / 2859015 / 1404163 | 일시 차단 / 광고 게재 불가 계정 | 계정 상태 |
| 2708008 | 사회 이슈·선거·정치 광고 권한 없음 | special_ad_categories |
| 368 / 500 | 남용 판정 / 금지 콘텐츠 | 문구 점검 |

---

## 10. 권한 · 토큰

출처: https://developers.facebook.com/documentation/ads-commerce/marketing-api/get-started/authorization.md , https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/videoads/fbvideoads

| 권한 | 용도 | 근거 |
|---|---|---|
| `ads_management` | 캠페인·광고세트·광고·소재 생성·수정 | 공식 |
| `ads_read` | 조회·인사이트 | 공식 |
| `business_management` | 비즈니스 자산(페이지·계정·픽셀) 조회 | **(미확인 — 공식 권한 문서 대조 못 함)** |
| `pages_show_list`, `pages_read_engagement` | 페이지 목록, 페이지 게시물로 광고 | **(미확인)** |
| `pages_manage_ads` | 페이지 광고 관리 | **(미확인)** |
| `instagram_basic` (+ `instagram_manage_comments` 등) | 인스타 계정 조회 | **(미확인)** |

- 자기 회사 광고계정만이면 Standard 접근으로 충분, 남의 광고계정을 관리하면 `ads_management`/`ads_read` Advanced 접근(App Review) + Marketing API Access Tier(Full 권장) 필요.
- **시스템 사용자 토큰**(비즈니스 관리자 > 시스템 사용자, 만료 없음 토큰) 권장. 시스템 사용자 수: Limited 1명 + 관리자 1명, Full 10명 + 관리자 1명. 시스템 사용자에게 광고계정(광고 관리 이상)·페이지(광고 생성 권한)·픽셀·인스타 계정 자산을 할당해야 한다.
- 페이지: `object_story_spec.page_id`의 페이지에 사용자가 관리자·편집자(또는 광고 작업 권한)여야 하고, 페이지가 그 광고계정의 `promote_pages`에 있어야 안전.
- 인스타: 광고계정 `instagram_accounts`(또는 `connected_instagram_accounts`)에 있는 계정만(1815199 방지).
- 영상 업로드(`video_ads`): `CREATE_CONTENT` 작업 권한 필요, 비즈니스 계정 업로드는 미지원이라고 명시.
- CTCH 현황: 공용 키 `META_ACCESS_TOKEN`·광고주 개별 토큰(`lib/meta/token.ts resolveMetaToken`)은 읽기용으로 검증됨. 미디어믹스 동기화 기록상 **`ads_management` 권한 보유 여부는 미검증** → 쓰기 전에 `GET /me/permissions`(사용자 토큰) 또는 `GET /debug_token`으로 스코프 확인.

---

## 11. 한국 계정 특이사항

| 항목 | 내용 |
|---|---|
| 통화 | KRW offset 1 → 금액을 그대로(원 단위) 보냄. 1원 미만 단위 없음 |
| 최소 예산 | 문서에 고정 금액 없음 → `min_daily_budget`·`minimum_budgets`로 조회해 입력 검증 (미확인: 실제 금액) |
| 지출 한도 최소 | `min_campaign_group_spend_cap`(약 USD 100 상당 — 원화 환산 금액은 계정 조회값 사용) |
| 시간대 | 계정 `timezone_name`(대개 `Asia/Seoul`). `start_time`은 `+0900` 오프셋을 붙여 보냄 |
| DSA | EU 아님 → 불필요 |
| special_ad_categories | 대부분 `[]`. 금융(대출·카드·보험 등) 광고주는 `FINANCIAL_PRODUCTS_SERVICES`/`CREDIT` 검토 — 한국에 해당 카테고리가 강제되는지는 **(미확인)**, 지정하면 타겟(연령·성별·우편번호·유사 타겟 등) 제약이 붙음 |
| 연령 | 18세 미만 타겟 제한(1870165는 "18세 미만(태국 20, 인도네시아 21)") |
| 지역 | `countries:["KR"]`, 시·도는 `regions` 키, 시·군·구는 `cities` 키(반경 17~80km) — `/search?type=adgeolocation&country_code=KR` |
| 언어 | 보통 생략. 필요 시 `/search?type=adlocale&q=ko` |
| 랜딩 | `conversion_domain`에 `example.co.kr` 같은 등록 도메인 |
| 샵 | 메타 샵이 있는 광고주는 v26부터 `WEBSITE_AND_SHOP` 기본 — 자사몰만 원하면 opt-out |

---

## 12. 권장 생성 흐름 (의사 코드)

```text
0. 사전 조회(캐시 30분): act 계정 정보(currency, timezone, account_status, min_daily_budget)
   + promote_pages + instagram_accounts + adspixels + customaudiences
1. 입력 검증(로컬) → 실패 행 표시
2. 미디어: 이미지 → adimages (해시 캐시, 계정 단위 재사용)
          영상 → advideos(file_url 또는 청크) → status 폴링 ready → 썸네일 이미지 업로드
3. 캠페인 POST (status=PAUSED)  ← 기존 캠페인 선택 시 생략
4. 광고세트: validate_only 로 전부 점검 → 통과하면 실제 POST (PAUSED)
5. 크리에이티브: validate_only → 실제 POST
6. 광고: validate_only → 실제 POST (PAUSED)
7. 사용자 승인 후 켜기: 광고 → 광고세트 → 캠페인 순으로 status=ACTIVE
8. 실행 기록(autopilot_actions)에 생성 ID·요청 본문·오류 저장. 중간 실패 시 이번 실행에서 만든 PAUSED 객체 목록을 보여주고 "정리(삭제)" 버튼 제공
- 쓰기 요청은 5xx여도 자동 재시도하지 않는다(중복 생성 방지 — GFA와 같은 원칙). 재시도 전 이름으로 존재 여부 조회.
- 동시성: 광고계정당 쓰기 2~4개 동시, x-business-use-case-usage 80% 넘으면 일시 정지.
```

---

## 13. 간소화 세팅 도구 설계 시사점

### 13.1 기본값으로 숨겨도 되는 것

| 필드 | 기본값 | 이유 |
|---|---|---|
| API 버전 | `v25.0` (상수 하나로 관리, v26 전환 대비) | 공식 예제 기준·만료 미정 |
| `status` (모든 객체) | `PAUSED` | 승인 후 실행 원칙(오토파일럿과 동일) |
| `special_ad_categories` | `[]` | 한국 일반 광고주 |
| `buying_type` | `AUCTION`(생략) | |
| `billing_event` | `IMPRESSIONS` | 대부분의 목표에서 유일한 값 |
| `bid_strategy` | `LOWEST_COST_WITHOUT_CAP` | 비용·입찰 한도는 고급 옵션 |
| `is_adset_budget_sharing_enabled` | ABO면 `false` | v24 필수, 명시적 선택이 안전 |
| `destination_type` | `WEBSITE` | 웹 판매·트래픽·잠재고객 |
| `optimization_goal` | 판매 `OFFSITE_CONVERSIONS` / 트래픽 `LANDING_PAGE_VIEWS` / 인지 `REACH` / 잠재고객(웹) `OFFSITE_CONVERSIONS` | 목표에서 자동 결정 |
| `custom_event_type` | 판매 `PURCHASE` / 잠재고객 `LEAD` | |
| `attribution_spec` | 클릭 7일 + 조회 1일 | 메타 기본과 같음 |
| 지면 | Advantage+ 지면(지면 필드 생략) | 자동이 권장, v24·v26 지면 폐지 영향도 회피 |
| `targeting.geo_locations` | `{"countries":["KR"]}` | |
| `targeting_automation.advantage_audience` | `1`(단, 연령·성별을 지정하면 `0`으로 바꿔 묻기) | v26 필수 — **절대 생략하지 않음** |
| `age_min`/`age_max`/`genders` | 18 / 65 / 전체 | |
| `end_time` | 일 예산이면 생략(무기한) | |
| `degrees_of_freedom_spec` | 이미지 생성·문구 변형 계열 `OPT_OUT`, `adapt_to_placement`·`image_touchups`·`inline_comment` 정도만 `OPT_IN` (광고주 프리셋으로 저장) | 브랜드 톤 보호 |
| `url_tags` | `utm_source=meta&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}` (랜딩에 utm_이 없을 때만 — CTCH GFA 벌크와 같은 규칙) | 소재 분석(UTM 필터)과 연결 |
| `call_to_action.type` | `SHOP_NOW`(판매)·`LEARN_MORE`(그 외) | |
| `conversion_domain` | 랜딩 URL의 등록 도메인 자동 추출 | 픽셀 공유 캠페인 필수 |
| 이름 | CTCH 네이밍 규칙(`clients.naming_rules`) 템플릿으로 자동 생성 | 소재 분석 파싱과 일치 |

### 13.2 반드시 사용자에게 받아야 하는 것

1. **광고계정**(CTCH 광고주의 `meta_ad_account_id`) — 상태 1(ACTIVE) 아니면 막기
2. **캠페인 목표**(판매/트래픽/인지/잠재고객 4개 정도로 축소) 또는 기존 캠페인 선택
3. **예산 위치와 금액**: 캠페인 예산(CBO) vs 광고세트 예산, 일/총, 원 단위
4. **시작일**(종료일은 총 예산일 때만)
5. **페이스북 페이지 + 인스타그램 계정**(조회된 목록에서만 선택)
6. **픽셀 + 전환 이벤트**(판매·웹 잠재고객일 때)
7. **타겟**: 지역(기본 KR), 연령·성별(선택), 맞춤 타겟 포함/제외(목록 선택), 관심사(검색 선택, 선택)
8. **소재**: 이미지/영상 파일, 본문·헤드라인·설명, CTA, 랜딩 URL — 지면별 비율(4:5 / 9:16)을 같이 받으면 지면 맞춤 규칙 자동 구성

### 13.3 API 호출 전에 로컬에서 검증할 것

| 검증 | 막는 오류 |
|---|---|
| 버전 상수가 만료되지 않았는지(설정 화면에 표시) | 2635 |
| 토큰에 `ads_management` 있는지(`/me/permissions` 또는 `debug_token`) | 200/294 |
| 계정 `account_status == 1`, `currency == "KRW"`(아니면 금액 단위 경고) | 1404163, 금액 100배 실수 |
| 예산 ≥ `min_daily_budget`(및 `minimum_budgets`), 정수(원) | 1885272 |
| CBO·ABO 중 한쪽에만 예산 | 1885621 |
| ABO 캠페인 생성 시 `is_adset_budget_sharing_enabled` 포함 | 4834011 |
| 총 예산이면 `end_time` 있음, 종료 > 시작 > 지금 | 1487033 |
| `bid_strategy`가 COST_CAP/BID_CAP이면 `bid_amount` 있음, MIN_ROAS면 `bid_constraints` 있음 | 100 |
| 목표 ↔ `optimization_goal` ↔ `billing_event` ↔ `promoted_object` 조합이 3.2·3.3 표 안에 있음 | 100, 2446509 |
| 판매 목표면 `pixel_id`+`custom_event_type` 있음 | 100 |
| `advantage_audience`가 0/1로 들어감 | v26 `REQUIRE_EXPLICIT_ADVANTAGE_AUDIENCE_FLAG` |
| `age_min ≥ 18`, `age_max ≤ 65`, `age_min ≤ age_max` | 1870165, 100 |
| 지면 수동이면 폐지 지면(`video_feeds`, `explore`, messenger `story`) 없음 + 의존 규칙(story는 mobile 등) | 100 |
| 관심사 ID가 최신(`adinterestvalid`) | 1487694, v24 통합 |
| `exclusions`(상세 타겟 제외) 사용 안 함, 맞춤 타겟 제외는 `excluded_custom_audiences` | v22 오류 |
| 페이지가 `promote_pages`에, 인스타가 `instagram_accounts`에 있음 | 1885029, 1815199 |
| `instagram_actor_id` 미사용 | 2446149 |
| 랜딩 URL이 http(s)·접속 가능, CTA 링크 = `link` | 1500, 2446383 |
| 이미지 비율(1:1·4:5·9:16·1.91:1 ±2%)과 8MB 이하, 영상 `video_status == ready` | 업로드·심사 실패 |
| asset_feed_spec 라벨 짝 맞음, 규칙 2개 이상, 설명 1개, 문구 중복 없음 | 2446173, 1815629 |
| 같은 캠페인의 광고세트 여러 개를 한 배치에 넣지 않음 | 배치 실패 |
| EU 국가가 타겟에 있으면 DSA 입력 요구 | 3858152 |
| 하위 객체는 `validate_only`로 한 번 돌린 뒤 실제 생성 | 전반 |

### 13.4 단계별 범위 제안

- **1차**: 기존 캠페인 선택 또는 새 캠페인(판매·트래픽), ABO/CBO, 광고세트(지역·연령·성별·맞춤 타겟·Advantage+ 타겟), 단일 이미지·단일 영상 소재, 지면 자동, 엑셀 벌크(GFA 벌크 화면 구조 재사용).
- **2차**: 지면별 에셋 맞춤(4:5/9:16), 여러 문구(asset_feed_spec), 캐러셀, 기존 광고 복사(`/copies`) + 소재 교체, 비용 한도·최소 ROAS 입찰.
- **보류**: 파트너십 광고, 카탈로그·앱 캠페인, 인스턴트 양식, 비동기 배치.

### 13.5 첫 실호출 때 확인할 (미확인) 항목

1. 시스템 사용자 토큰에 `ads_management`가 있는지, `video_ads` 업로드가 시스템 사용자로 되는지(안 되면 `advideos`)
2. `adimages` multipart `filename=@` 업로드 응답 키
3. KRW 계정의 실제 `min_daily_budget`·`minimum_budgets` 값과 응답 필드 이름
4. 판매 목표 + `VALUE` 최적화 + `LOWEST_COST_WITH_MIN_ROAS`의 `bid_constraints.roas_average_floor` 단위
5. `advantage_audience: 1`일 때 `age_max < 65` 허용 여부
6. `creative_features_spec` 생략 시 기본으로 켜지는 기능
7. `conversion_domain`에 `.co.kr` 도메인 형식
8. v26 `WEBSITE_AND_SHOP_OPT_OUT`의 정확한 필드 위치
9. 페이지 `instagram_business_account` 필드와 광고계정 `instagram_accounts` 결과 차이
10. 비동기 배치 결과 조회 방법

---

## 부록 A. 출처 목록

- 버전: https://developers.facebook.com/docs/graph-api/changelog/versions/
- 변경 로그: https://developers.facebook.com/docs/marketing-api/marketing-api-changelog/ , https://developers.facebook.com/docs/graph-api/changelog/version26.0 , .../version25.0 , .../version24.0 , .../version23.0 , .../version22.0 , .../version21.0
- Advantage+ 캠페인: https://developers.facebook.com/documentation/ads-commerce/marketing-api/advantage-campaigns.md
- 예산 공유: https://developers.facebook.com/documentation/ads-commerce/marketing-api/bidding/guides/adset-budget-sharing
- 캠페인: https://developers.facebook.com/docs/marketing-api/reference/ad-account/campaigns/ , https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group/
- 광고세트: https://developers.facebook.com/docs/marketing-api/reference/ad-account/adsets/
- 과금 이벤트: https://developers.facebook.com/docs/marketing-api/bidding/overview/billing-events/
- 예산: https://developers.facebook.com/documentation/ads-commerce/marketing-api/bidding/overview/budgets.md
- 통화: https://developers.facebook.com/docs/marketing-api/currencies/
- 최소 예산: https://developers.facebook.com/docs/marketing-api/reference/ad-account/minimum_budgets/
- 타겟: https://developers.facebook.com/documentation/ads-commerce/marketing-api/audiences/reference/basic-targeting.md , .../advanced-targeting.md , .../placement-targeting.md , .../targeting-search.md
- 이미지: https://developers.facebook.com/docs/marketing-api/reference/ad-account/adimages/ , https://developers.facebook.com/docs/marketing-api/reference/ad-image/
- 영상: https://developers.facebook.com/docs/marketing-api/reference/ad-account/advideos/ , https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/videoads/fbvideoads , https://developers.facebook.com/docs/graph-api/video-uploads , https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/videoads.md
- 크리에이티브: https://developers.facebook.com/docs/marketing-api/reference/ad-account/adcreatives/ , https://developers.facebook.com/docs/marketing-api/reference/ad-creative-object-story-spec/ , https://developers.facebook.com/docs/marketing-api/reference/ad-creative-link-data/ , https://developers.facebook.com/docs/marketing-api/reference/ad-creative-video-data/ , https://developers.facebook.com/docs/marketing-api/reference/ad-creative-link-data-call-to-action/
- 지면 맞춤: https://developers.facebook.com/documentation/ads-commerce/marketing-api/dynamic-creative/placement-asset-customization.md
- Advantage+ 크리에이티브: https://developers.facebook.com/documentation/ads-commerce/marketing-api/creative/advantage-creative/get-started.md
- 파트너십: https://developers.facebook.com/documentation/ads-commerce/marketing-api/ad-creative/partnership-ads.md
- 광고: https://developers.facebook.com/docs/marketing-api/reference/ad-account/ads/
- 광고계정: https://developers.facebook.com/docs/marketing-api/reference/ad-account/
- 예상 도달: https://developers.facebook.com/docs/marketing-api/reference/ad-account/delivery_estimate/
- 복사: https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group/copies/ , https://developers.facebook.com/docs/marketing-api/reference/ad-campaign/copies/ , https://developers.facebook.com/docs/marketing-api/reference/adgroup/copies/
- 배치: https://developers.facebook.com/docs/graph-api/batch-requests , https://developers.facebook.com/docs/marketing-api/reference/ad-account/async_batch_requests/
- 한도: https://developers.facebook.com/documentation/ads-commerce/marketing-api/overview/rate-limiting.md
- 오류: https://developers.facebook.com/docs/marketing-api/error-reference/
- 권한: https://developers.facebook.com/documentation/ads-commerce/marketing-api/get-started/authorization.md
- DSA: https://developers.facebook.com/blog/post/2023/05/16/new-marketing-mpa-api-requirements-for-facebook-and-instagram-ads-targeting-eu/ , https://developers.facebook.com/docs/marketing-api/reference/ad-account/dsa_recommendations
- 문서 목차: https://developers.facebook.com/documentation/ads-commerce/llms.txt
