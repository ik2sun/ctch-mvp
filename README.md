# CTCH · AI 퍼포먼스 마케팅 대시보드 (MVP)

흩어진 퍼포먼스 신호를 하나의 판단으로. 사내 마케팅 팀을 위한 AI 대시보드의 초기 버전(Step 2 — 인증 + 레이아웃 껍데기)입니다.

## 스택

- Next.js 15 (App Router) + React 19 + TypeScript
- Tailwind CSS (CTCH 디자인 토큰)
- Supabase (이메일/비밀번호 인증 · Postgres)
- Pretendard · Space Grotesk · JetBrains Mono

## 지금 들어있는 것 (Step 2)

- 이메일/비밀번호 로그인·회원가입 (Supabase Auth)
- 미로그인 시 대시보드 접근 차단 (`middleware.ts`)
- 좌측 사이드바(7개 기능) + 헤더 + 중앙 메인 레이아웃
- 대시보드 홈(요약 카드 + 기능 바로가기)
- 7개 기능 페이지 자리표시자

기능 로직(UTM 생성, AI 리포트 등)은 다음 단계에서 채웁니다.

## 실행 방법

### 1. Supabase 프로젝트 만들기 (무료)

1. https://supabase.com 에서 프로젝트 생성
2. 좌측 `Project Settings > API` 에서 **Project URL** 과 **anon public key** 복사
3. `Authentication > Providers > Email` 이 켜져 있는지 확인
   - 로컬 테스트를 빠르게 하려면 `Authentication > Sign In / Providers` 에서
     "Confirm email" 을 잠시 꺼두면 가입 즉시 로그인됩니다 (운영에선 켜두세요)

### 2. 환경변수 설정

```bash
cp .env.local.example .env.local
```

`.env.local` 을 열어 복사한 값을 채웁니다.

### 3. 설치 · 실행

```bash
npm install
npm run dev
```

`http://localhost:3000` 접속 → 자동으로 `/login` 으로 이동합니다.
`/signup` 에서 계정을 만든 뒤 로그인하면 대시보드가 열립니다.

## 배포 (Vercel)

1. 이 폴더를 GitHub 저장소에 push
2. https://vercel.com 에서 저장소 Import
3. Environment Variables 에 `.env.local` 값 3개를 그대로 등록
   - `NEXT_PUBLIC_SITE_URL` 은 실제 배포 도메인으로 변경
4. Supabase `Authentication > URL Configuration` 의 Redirect URLs 에
   `https://<배포도메인>/auth/callback` 추가

## 폴더 구조

```
app/
  (auth)/login, signup      로그인·가입
  (dashboard)/              로그인 후 보호 영역 (7개 기능)
  auth/callback/            이메일 인증 콜백
components/layout/          Sidebar · Header · nav 설정
components/ui/              Wordmark · FeaturePlaceholder
lib/supabase/               client · server · middleware
middleware.ts               세션 갱신 + 접근 제어
```
