# 카카오모먼트 연동 가이드 (CTCH)

> **2026-09-28 변경**: 카카오모먼트 API는 일반 카카오 로그인 토큰을 거절한다(401 "target biz token is not supplied."). CTCH는 **비즈니스 인증**(`/oauth/business/authorize` → `/oauth/business/token`, scope `moment_management`)으로 토큰을 받는다. REST API 키 설정의 **비즈니스 인증 리다이렉트 URI**에 콜백을 등록하고, `.env.local`에 **비즈니스 인증 시크릿**을 `KAKAO_BUSINESS_CLIENT_SECRET`으로 넣는다. 비즈니스 토큰은 리프레시 토큰이 없어 장기 미사용으로 만료되면 다시 연결한다. 아래 본문의 리프레시 토큰(60일) 설명은 이전 방식이다.

CTCH의 매체 연동에 카카오모먼트를 추가했습니다. 네이버 검색광고·메타처럼 대시보드(성과 요약·매체별 표)와 실시간 리포트(캠페인 → 광고그룹 → 소재 트리)에서 카카오모먼트 데이터를 볼 수 있습니다.

## 1. 왜 API 키가 아니라 "카카오 계정 연결"인가

카카오모먼트 Open API는 API 키·시크릿 방식이 아닙니다. **카카오 로그인(OAuth)으로 발급한 비즈니스 액세스 토큰**을 `Authorization: Bearer` 헤더에 넣고, 조회할 광고계정 번호를 `adAccountId` 헤더에 넣어 호출합니다. 토큰을 발급받는 카카오계정은 그 광고계정의 **멤버(마스터 또는 멤버 권한)** 여야 합니다.

- 액세스 토큰: 약 12시간. 서버가 만료 5분 전에 자동 갱신합니다.
- 리프레시 토큰: 약 60일. 만료되면 광고주 관리에서 "다시 연결"이 필요합니다(화면에 재연결 기한이 표시됩니다).
- 토큰은 광고주(clients) 행에 서버 전용 컬럼으로 저장되고 브라우저로 내려가지 않습니다.

## 2. 처음 한 번 — 카카오디벨로퍼스 설정 (관리자)

1. https://developers.kakao.com → 내 애플리케이션 → **애플리케이션 추가**.
2. 앱 설정 → **비즈 앱 전환** (사업자 정보 등록). 앱 소유자 카카오계정 **본인인증** 완료.
3. 좌측 **카카오모먼트** 메뉴 → **사용 권한 신청**. 카카오 검수 후 승인됩니다. 승인 전에는 API가 403(권한 없음)을 반환합니다.
4. **카카오 로그인** → 활성화 ON → **Redirect URI** 등록:
   - 로컬: `http://localhost:3001/api/kakao-moment/oauth/callback`
   - 운영: `https://<배포 도메인>/api/kakao-moment/oauth/callback`
5. **보안** → Client Secret 생성, 상태 "사용함" (권장).
6. 앱 키 → **REST API 키** 복사.

## 3. 서버 설정

`.env.local` (Vercel이면 Environment Variables):

```
KAKAO_REST_API_KEY=발급받은 REST API 키
KAKAO_CLIENT_SECRET=생성한 Client Secret
NEXT_PUBLIC_SITE_URL=https://<배포 도메인>   # 콜백 주소 계산에 사용 (로컬은 http://localhost:3001)
# 선택
KAKAO_REDIRECT_URI=                            # 콜백 주소를 직접 지정할 때
KAKAO_OAUTH_SCOPE=                             # 카카오가 비즈니스 동의항목 scope를 요구하는 경우만
```

Supabase SQL Editor에서 `supabase/migrations/0013_kakao_moment.sql` 실행 (clients 테이블에 토큰·광고계정 컬럼 추가). 서버 재시작.

## 4. 광고주별 연결 (운영자)

1. 광고주 관리 → 광고주 카드의 **수정** → 매체 연동 설정 → **카카오모먼트** 탭.
2. **카카오 계정으로 연결** 클릭 → 카카오 로그인(광고계정 멤버 계정) → 동의 → CTCH로 자동 복귀.
3. 접근 가능한 광고계정이 하나면 자동 선택되고, 여러 개면 목록에서 **광고계정 선택 → 저장**.
4. 탭의 점이 초록색(연동됨)으로 바뀌면 끝. 대시보드 매체 필터에 카카오모먼트 체크박스가 활성화되고, 실시간 리포트에 카카오모먼트 채널 버튼이 동작합니다.

## 5. 데이터 정의

| 화면 지표 | 카카오 보고서 metrics 키 | 비고 |
|---|---|---|
| 노출 | `imp` | BASIC |
| 클릭 | `click` | BASIC |
| 광고비 | `cost` | BASIC, VAT 제외 원 단위(카카오 기준) |
| 도달 | `reach` | ADDITION |
| 전환수 | `conv_purchase_7d` (없으면 `conv_purchase_1d`) | PIXEL_SDK_CONVERSION, 픽셀&SDK "구매" 7일 기여 |
| 전환매출 | `conv_purchase_p_7d` (없으면 `_1d`) | 구매 전환 금액으로 가정. 비율로 들어오면 `lib/kakao-moment/types.ts`에서 키만 교체 |

- 보고서는 한 번에 **31일 이내**만 조회되며 서버가 자동으로 구간을 나눕니다.
- **당일 데이터는 다음날 08:00 전까지 변동**될 수 있습니다.
- 픽셀&SDK가 설치되지 않은 광고계정은 전환·매출이 0으로 나옵니다.

## 6. 요청 제한과 조회 범위

| 보고서 | 제한 | CTCH 처리 |
|---|---|---|
| 광고계정 보고서 | 광고계정당 5초에 1회 | 대시보드 요약 = 3회(현재 일별·전기간·전월) → 약 10~15초 |
| 캠페인 보고서 | 5초에 1회, campaignId 최대 5개 | 실시간 리포트의 광고그룹은 **지출 상위 5개 캠페인**만 |
| 광고그룹 보고서 | 1초에 1회, adGroupId 최대 40개 | 소재는 **지출 상위 40개 광고그룹**만, 소재 이름은 상위 10개 그룹만 |
| 목록 API | 제한 없음 | 캠페인·광고그룹·소재 이름 조회 |

같은 광고계정 요청은 서버 대기열이 자동으로 간격을 두고, 429가 오면 한 번 재시도합니다. 화면은 5분 세션 캐시를 쓰고 "새로고침"으로만 강제 재조회합니다.

## 7. 오류가 나면

| 메시지 | 원인 | 조치 |
|---|---|---|
| 서버에 KAKAO_REST_API_KEY가 없어요 | 환경변수 미설정 | 3번 항목 |
| 카카오모먼트 권한이 없어요 (403) | 앱의 카카오모먼트 사용 권한 미승인, 또는 연결한 카카오계정이 광고계정 멤버가 아님 | 카카오디벨로퍼스 권한 신청 / 카카오모먼트 관리자에서 멤버 초대 |
| 카카오 연결이 만료되었어요 | 리프레시 토큰 60일 경과 | 광고주 관리에서 다시 연결 |
| 인증 상태(state)가 일치하지 않아요 | 연결 시작 후 10분 초과, 다른 브라우저에서 복귀 | 같은 브라우저에서 다시 연결 |
| 토큰 저장에 실패했어요 | 0013 마이그레이션 미실행 | SQL 실행 후 재시도 |
| 요청 제한에 걸렸어요 | 5초/1초 제한 | 자동 재시도, 잠시 후 새로고침 |

## 8. 코드 위치

- 인증·토큰 갱신: `lib/kakao-moment/auth.ts` / API 호출·대기열: `lib/kakao-moment/client.ts` / 지표 매핑: `lib/kakao-moment/types.ts` / 조회·집계: `lib/kakao-moment/aggregate.ts`
- 라우트: `app/api/kakao-moment/oauth/start`, `oauth/callback`, `ad-accounts`(GET 목록·POST 선택·DELETE 해제), `summary`(대시보드), `insights`(실시간 리포트)
- 화면: `features/clients/KakaoConnectPanel.tsx`(광고주 관리 탭), 대시보드 `app/(dashboard)/page.tsx`, 실시간 리포트 `app/(dashboard)/ai-report/page.tsx`
- 연동 상태 점검: `app/api/media-status/route.ts` (캠페인 목록 조회로 실검증)
