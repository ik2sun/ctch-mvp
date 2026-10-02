---
name: ctch-mail-import
description: CTCH 캠페인 매니저에 광고주 메일을 가져온다. claude.ai Gmail 커넥터(Gmail MCP)로 광고주 규칙에 맞는 메일을 검색·읽고 scripts/pm-mail.ts import로 CTCH DB(pm_emails)에 넣는다. "르무통 메일 가져와", "광고주 메일 가져와 줘", "메일 동기화", "캠페인 매니저 메일 업데이트" 요청 시 사용.
---

# CTCH 광고주 메일 가져오기 (Gmail MCP → CTCH)

기본 방법은 CTCH 화면의 "내 Gmail 연결 → 메일 동기화"다. 이 스킬은 그 대안으로, 각 담당자가 **자기 Claude Code**에서 이 절차를 실행하면, 그 사람의 Gmail(claude.ai Gmail 커넥터)에서 수집 조건(특정인·키워드, 받은·보낸편지함, 민감 메일 제외)에 맞는 메일만 CTCH에 들어간다. 다른 담당자 메일함에 있던 같은 메일은 1건으로 합쳐진다(Message-ID, 없으면 보낸 사람·시각·제목).

## 전제
- 작업 폴더가 CTCH 프로젝트(`.env.local`에 `SUPABASE_SERVICE_ROLE_KEY`가 있음)
- claude.ai Gmail 커넥터가 이 세션에 켜져 있음. Gmail 도구가 안 보이면 멈추고 사용자에게 `/mcp`에서 claude.ai Gmail을 켜 달라고 안내한다(claude.ai 계정으로 로그인한 Claude Code에서만 보임)
- 마이그레이션 `supabase/migrations/0022_campaign_manager.sql` 실행됨(아니면 스크립트가 안내 오류를 낸다)

## 절차

1. **내 메일함 주소 확인** — Gmail 커넥터의 프로필 도구가 있으면 그것으로, 없으면 검색 결과의 받는 사람이나 사용자에게 확인. 이 주소가 `--mailbox` 값이다(@nmg.co.kr).

2. **광고주 규칙과 검색식 받기**
   ```bash
   npx --yes tsx scripts/pm-mail.ts rules "<광고주명>" --mailbox <내 메일 주소>
   ```
   - 광고주명이 모호하면 `npx --yes tsx scripts/pm-mail.ts clients <검색어>`로 확인
   - 출력의 `gmailQuery`를 그대로 쓴다(처음 90일, 이후 이 메일함의 마지막 수집 메일 - 2일부터). `gmailQuery`가 null이면 멈추고 "CTCH 캠페인 매니저 화면에서 광고주 메일 도메인·주소·키워드를 먼저 저장하세요"라고 안내

3. **Gmail MCP로 검색·읽기**
   - 검색 도구에 `gmailQuery`를 넣고 결과를 끝까지(다음 페이지 포함) 모은다. 한 번에 최대 200건 — 넘으면 오래된 쪽부터 나눠 여러 번 import
   - 메시지(또는 스레드)를 읽기 도구로 열어 **본문까지** 가져온다. 스레드로 받으면 스레드 안 메시지를 각각 한 건으로
   - 규칙과 무관해 보이는 메일(뉴스레터·광고·자동 알림)은 넣지 않는다

4. **JSON 파일로 저장** — 스크래치패드(없으면 OS 임시 폴더)에 배열로. 프로젝트 폴더에 두지 않는다(메일 원문)
   ```json
   [
     {
       "messageId": "<CAxxxx@mail.gmail.com>",
       "threadId": "18f…",
       "from": "김담당 <kim@lemouton.co.kr>",
       "to": ["k2s@nmg.co.kr"],
       "cc": ["lee@nmg.co.kr"],
       "subject": "10월 예산 증액 요청",
       "date": "2026-10-01T09:12:00+09:00",
       "body": "본문 텍스트(HTML이면 텍스트로)",
       "snippet": "선택"
     }
   ]
   ```
   - `messageId`는 RFC Message-ID 헤더가 보이면 꼭 넣는다(메일함끼리 중복 판정이 정확해짐). Gmail 내부 id는 메일함마다 달라 messageId로 쓰지 않는다
   - `from`·`date`는 필수. 본문은 그대로 넣으면 스크립트가 답장 인용부를 잘라 6,000자로 저장한다
   - **본문을 요약·수정하지 않는다**(AI 정리는 CTCH가 따로 함)

5. **가져오기**
   ```bash
   npx --yes tsx scripts/pm-mail.ts import "<광고주명>" <파일.json> --mailbox <내 메일 주소>
   ```
   출력 `added`(새 메일)·`merged`(다른 담당자가 이미 넣은 같은 메일에 내 메일함 추가)·`alreadyHad`·`skipped`를 사용자에게 알린다.

6. **임시 파일 삭제** 후 안내: "CTCH > AI 마케팅 에이전트 > 퍼포먼스 매니저에서 'AI로 메일 정리'를 누르면 요청·합의·일정이 갱신돼요."

## 주의
- 메일 원문은 대화에 길게 옮기지 않는다(건수·제목 정도만 보고)
- 다른 사람 메일함은 읽을 수 없다 — 각 담당자가 자기 Claude Code에서 실행해야 그 사람 메일이 들어간다
- 수집 조건은 CTCH 화면에서 바꾼다. 이 절차에서 조건을 넓혀 검색하지 않는다. 급여·인사·경영지원 등 민감 메일은 가져오지 않는다(스크립트도 한 번 더 거른다)
