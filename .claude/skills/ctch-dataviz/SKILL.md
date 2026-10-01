---
name: ctch-dataviz
description: CTCH 대시보드·리포트의 차트, 그래프, KPI 타일, 매체 색, 표를 만들거나 고칠 때 쓰는 데이터 시각화 규칙. dataviz 방법론(형태 선택 → 색 역할 → 팔레트 검증 스크립트 → 마크 규격 → 호버 → 접근성 → 렌더 확인)에 CTCH 파라미터(매체 고정 색, 표면, Tailwind 토큰)를 채워 둔 프로젝트 버전. "차트", "그래프", "대시보드", "시각화", "매체 색", "KPI", "스파크라인", "recharts" 작업 시 사용.
---

# CTCH 데이터 시각화

차트는 사람이 읽고 코드가 그린다. "보기 좋게"를 검사 가능한 절차로 바꾼다. 방법론 원문은 `references/`, 색 검증은 `scripts/validate_palette.js`.

## 절차 — 순서대로 (색은 마지막)

1. **형태부터** — 데이터가 할 일(크기 비교·식별·증감·단일 수치·시간 추이)이 차트 종류를 정한다. 숫자 하나면 차트가 아니라 KPI 타일. → `references/choosing-a-form.md`
2. **색은 역할로** — 범주(식별)·순차(크기)·발산(증감)·상태(좋음/나쁨). 범주 색은 고정 순서, 돌려쓰기 금지. → `references/color-formula.md`
3. **팔레트는 스크립트로 검증** — 눈대중 금지.
   `node .claude/skills/ctch-dataviz/scripts/validate_palette.js "<hex,...>" --mode light --surface "#ffffff"`
   FAIL은 고치고 넘어간다. CVD ΔE 6~8은 직접 라벨 등 보조 표기가 있을 때만 허용, 정상시 ΔE 15 미만은 무조건 실패.
4. **마크 규격** — 얇은 마크, 막대 끝 4px 라운드, 선 2px, 채움 사이 2px 표면 간격, 라벨은 선택적으로. → `references/marks-and-anatomy.md`
5. **호버 기본 제공** — 선/면은 크로스헤어+툴팁, 막대·점은 마크별 툴팁. 필터는 모든 차트 위 한 줄. → `references/interaction.md`
6. **접근성** — 시리즈 2개 이상이면 범례 필수(4개 이하는 직접 라벨도), 색만으로 의미 전달 금지, 표(테이블 뷰)로도 값을 읽을 수 있게.
7. **렌더해서 눈으로 확인** — 검증기는 색만 본다. 라벨 겹침·잘림·넘침은 스크린샷으로 확인(아래 "렌더 확인").

끝나면 `references/anti-patterns.md`와 대조 — 해당되면 틀린 것.

## 절대 규칙

- **이중 축 금지.** 단위가 다른 두 지표(광고비 vs ROAS, 노출 vs 비용)는 차트 두 개로. 기존 `features/ai-report/TrendChart.tsx`는 이중 축이라 대시보드에서 뺐다 — 새로 쓰지 말 것.
- **색은 매체에 고정, 순위에 따르지 않음.** 필터로 매체가 빠져도 남은 매체 색은 그대로.
- **9번째 색 생성 금지** — "기타"로 접거나 나눠 그린다.
- **글자는 글자 색(ink 토큰)**, 시리즈 색은 옆의 점·막대만.
- **상태 색(good/warn/bad)은 상태에만**, 항상 아이콘+라벨과 함께. 증감은 부호(+/−)를 글자로 쓴다 — 아이콘 폰트가 안 떠도 방향이 읽혀야 함.

## CTCH 파라미터

| 항목 | 값 |
|---|---|
| 매체 범주 색(고정, `features/dashboard/analysis.ts MEDIA_COLORS`) | 메타 `#2a78d6` · 네이버 SA `#eb6834` · GFA `#1baf7a` · 카카오모먼트 `#eda100` · 구글 Ads `#e87ba4` |
| 검증 결과(흰 표면 #ffffff, 2026-10-01) | 인접 CVD ΔE 최저 9.1 · 정상시 ΔE 최저 19.6 → PASS. 청록·노랑·분홍은 대비 3:1 미만 → 범례·직접 라벨·표 필수 |
| 탈락한 배색 | 네이버=청록·GFA=주황·카카오=노랑 순서는 주황↔노랑 정상시 ΔE 13.7로 FAIL. 매체를 추가할 땐 다음 슬롯 `#008300`(초록)·`#4a3aa7`(보라)·`#e34948`(빨강) 순으로 넣고 반드시 재검증 |
| 강조 1색 / 기준 회색 | `signal #4F46E5` / `ink-faint #A7ACB4` (예: 예산 비중=회색, 매출 기여=인디고) |
| 차트 표면 / 페이지 | 페이지·카드 모두 `surface #FFFFFF`(Cake 스타일, 2026-10-01), 면 채움 `canvas #F9FAFB`(카드 머리 띠·칩·합계 행), 테두리 `line #EAECF0`, 카드 radius 10px (다크 모드 없음) |
| 글자 | 메인 숫자 `#1A1A1A` · `ink #101828` · `ink-soft #344054` · `ink-muted #475467`(라벨·보조 문구, 흰 바탕 7.6:1 — "흐릿하다" 피드백으로 #667085에서 진하게) · `ink-faint #98A2B3`(비활성·장식 전용, 2.6:1) — 차가운 남색·회색 |
| 격자 / 축선 | `#EEEEEA` 실선 헤어라인 / `#D9D9D4` — 점선 금지 |
| 상태 | `good #15803D`(5.0:1) · `warn #C2410C`(5.2:1) · `bad #DC2626`(4.8:1) — 작은 글자로도 4.5:1 이상. 증감은 글자 화살표 ↗/↘/→ + 부호(+/−) 병기 |
| 숫자 | 표·축은 `tabular-nums`, KPI 큰 숫자는 비례 숫자 |
| 라이브러리 | recharts 3 (툴팁 타입: `TooltipContentProps<ValueType, NameType>` from `recharts/types/component/DefaultTooltipContent`) |

## 가독성 규격(2026-10-01 사용자 가이드 반영)

- **레이아웃**: 리포트 화면 컨테이너는 `mx-auto w-full max-w-[1600px]` — 그 아래에선 꽉 채우고, 더 넓은 모니터(1920·2560)에선 가운데 정렬. 바깥 여백은 레이아웃 `main p-6 2xl:px-8`, 카드 사이 `gap-6`, 카드 안 `p-6`
- **크기 위계**: 히어로 KPI 숫자 `text-[clamp(28px,2.1vw,36px)] font-bold #1A1A1A`(5칸은 1440px 이상, 아래는 3칸 — 긴 금액이 넘치지 않게) · 표 숫자 15px SemiBold `tabular-nums` · 증감·보조 12~13px Medium · 라벨 13~14px 회색 · 카드 제목 16px
- **KPI 카드 위계**: ① 현재 수치 가장 크게 ② 증감은 우측 상단 ③ 하단 스파크라인
- **전 화면 공통(2026-10-01)**: 모든 기능 페이지의 최상위 컨테이너는 `mx-auto w-full max-w-[1600px] space-y-6`(안쪽에 다시 max-w를 두지 않음 — 모달·드로어만 예외). 카드 `p-6`. 최소 글자 11px(10px 이하 금지), 보조 12px. **배지·상태 칩·표의 짧은 값은 `whitespace-nowrap`**("허용"이 "허/용"으로 깨지지 않게), 표의 긴 설명 열엔 `min-w-[…]`를 줘서 좁으면 줄바꿈 대신 가로 스크롤
- **글자 크기 체계(2026-10-01 상향)**: 최소 12px(캡션·배지) · 보조 13px · 본문 15px · 강조 본문·표 숫자 16px · 카드 제목 17px · 페이지 제목 26px · KPI 28~36px. 본문(body) 기본 15px·행간 1.55. 표 숫자 칸은 코드 서체(font-mono) 대신 `tabular-nums`. 차트 축 13px Medium. 효율 표는 1536px 미만에서 보조 열(노출·클릭·CPC)과 비중 막대를 숨겨 ROAS가 밀려나지 않게(`wide`)
- **서체**: 앱 전체 **Noto Sans KR**(구글 폰트 — Windows 힌팅판이라 작은 글자도 선명, GA 등 구글 제품의 한글 서체). 2026-10-01 Windows 실측 비교에서 Pretendard Variable은 힌팅이 없어 가늘고 흐릿했음. 폴백 Pretendard(정적)·맑은 고딕. 서체를 바꿀 땐 같은 문장으로 후보를 Windows에서 렌더링해 비교하고 고를 것(`font-sans`·`font-display` 모두). Space Grotesk는 한글이 없어 숫자·한글이 섞여 보여 제거
- **읽고 행동할 본문**(AI 액션 플랜 등): 15px, 행간 1.6, 박스 안쪽 `px-5 py-4`, 소제목 15px SemiBold. 항목이 없는 칸은 비워 두지 말고 상태 줄로 대체(예: 즉시 조치 없음 → 상단 초록 상태 줄 + 나머지 2단) — `features/dashboard/AiPlanView.tsx`
- **차트 축**: 13px Medium(500), `#4A4F58` — 배경에 묻히지 않게. 차트 소제목 14px SemiBold
- **인사이트·점검 목록**: 전체 폭 카드 안에선 1단으로 길게 늘이지 말고 Masonry 다단(`lg:columns-2 2xl:columns-3` + 항목 `break-inside-avoid`, `InsightPanel columns`·`SettingCheckList columns`). 반폭 카드(대시보드 AI 인사이트 보드)는 1단. 문구는 행동 지시형("끄거나 솎아내세요", "증액 우선 후보예요")
- **효율 표**: 퍼널 순서 열(광고비·비중 → 노출 → 클릭 → CTR → CPC → 장바구니 → 전환 → CVR → CPA → 전환매출 → ROAS), 값마다 아래 증감. 넓으면 열을 늘려 열 간격을 좁힌다. 좁은 화면은 표 영역만 가로 스크롤 + 첫 열 sticky — 스크롤 래퍼에 `[contain:paint]` 필수(없으면 sticky 열이 문서 가로 폭을 늘림)
- **갤러리**: `grid-cols-[repeat(auto-fill,minmax(190px,1fr))]` — 해상도에 따라 6~7개 이상, 카드 지표는 2×2(15px)

## 디자인 스타일 — Cake 레퍼런스(2026-10-01)

- 흰 페이지 + 얇은 회색 테두리 카드. 공용 `Card`(features/dashboard/ui.tsx)는 **연회색 머리 띠**(`bg-canvas border-b px-6 py-4`, 제목 17px·설명 14px·우측 동작) + 흰 본문(`p-6`)
- 통계 타일 앞엔 **회색 아이콘 사각형**(36px, `rounded-lg border bg-canvas`, 아이콘 `text-ink-soft`)
- 사이드바: 메뉴 아이콘은 **카테고리 색 타일**(28px, 바탕 = accent 10% 투명, 아이콘 = accent를 검정 쪽으로 18% 눌러 차분하게 — 노랑·분홍이 튀지 않게). 하위 메뉴는 24px 타일·부모 색. 현재 메뉴 = 타일을 accent로 채우고 흰 아이콘 + 행 바탕 accent 7% + **같은 색 왼쪽 3px 막대**. 관리 메뉴는 회청색 #475467. 펼치는 메뉴는 오른쪽 `›`(펼치면 90° 회전). 현재 광고주는 이니셜 사각형 + 이름
- 포인트 색은 보라(signal #4F46E5) 하나, 버튼·링크·활성 상태에만
- 서체는 Noto Sans KR(위 "서체" 참고)

## 대시보드 구성 요소(재사용)

`features/dashboard/`: `analysis.ts`(효율 계산·규칙 인사이트·일별 병합·`rowsToSeries` 캠페인 상위 8+기타·`colorsForNames` 이름→매체 색), `ui.tsx`(`Card`·`Segmented`·`MediaChip`), `KpiStrip`(값+증감+스파크라인, `DeltaChip`), `MediaEfficiencyTable`(정렬·비중 막대·증감), `BudgetShareChart`(예산 비중 vs 매출 기여), `DailyMediaCharts`(누적 막대·매체별 선, `MediaLegend`), `InsightPanel`. 표·차트·범례는 `highlight` 상태를 공유해 한 매체를 가리키면 나머지가 흐려진다. 쓰는 화면: 대시보드 `/`, 실시간 리포트 `/ai-report`, 파일 분석 `/report-analysis` — 새 리포트 화면도 이 구성(필터 한 줄 → KPI → 효율/비중 → 인사이트 → 일별 추이)을 따른다.

## 렌더 확인

대시보드는 로그인이 필요하다. `/auth/*` 경로는 미들웨어가 통과시키므로 임시로 `app/auth/zz-<이름>/page.tsx`에 샘플 데이터로 컴포넌트를 렌더하고, 프로젝트 Playwright로 찍은 뒤 **반드시 삭제**(+ `.next/types/app/auth/zz-*` 삭제):

```
PLAYWRIGHT_BROWSERS_PATH="$(pwd)/.claude/skills/seo/ms-playwright" .claude/skills/seo/.venv/Scripts/python.exe <shot.py>
```

아이콘 폰트(Tabler)는 `(dashboard)/layout.tsx`에서만 로드되므로 미리보기에서 아이콘이 빠져 보이는 건 정상 — 그래서 증감은 글자 부호로도 표기한다.

## 참고 파일

| 파일 | 내용 |
|---|---|
| `references/choosing-a-form.md` | 어떤 차트인가 / 차트가 맞긴 한가 |
| `references/color-formula.md` | 색의 네 가지 역할, 여섯 가지 검사 |
| `references/marks-and-anatomy.md` | 마크 규격·간격·라벨·KPI 숫자 |
| `references/interaction.md` | 툴팁·호버·필터·기간 |
| `references/components.md` | 차트 구성 요소 |
| `references/anti-patterns.md` | 틀린 사례 목록 — 매번 대조 |
| `references/palette.md` | 원본 기본 팔레트(참고용, CTCH 값은 위 표가 우선) |
