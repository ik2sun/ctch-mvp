# short-form — 숏폼 제작 작업 폴더

> 2026-09-07 `Desktop/Claude-k2s/short-form`에서 ctch 저장소로 복사한 사본. CTCH의 **AI 마케팅 에이전트 > 소재 생성 > 숏폼 제작** 탭이 이 폴더를 카탈로그로 보여주며, 웹 소재 생성 기능은 이 파이프라인 위에 구현한다.
> 대용량 미디어(mp4/wav/mp3, ffmpeg.exe, node_modules, frames, reference/)는 git에서 제외되어 있다.

2026-09-04(금) 세션과 09-07(월) 오전 세션에서 만든 숏폼 제작 환경을 한곳에 모은 폴더.
원본은 각각 임시 스크래치패드 · `C:\Users\NMG\Videos` · `nmg-homepage/video`에 있었고, 여기로 복사한 뒤 경로를 이 폴더 기준으로 고쳤다.
이후 숏폼 작업은 이 폴더에서 진행한다.

## 구성

| 폴더 | 내용 | 파이프라인 | 결과물 |
|---|---|---|---|
| `helinox/` | 헬리녹스 × 산조공무점 Chair One (re) 프로모 (09-04) | PIL 프레임 렌더 + 합성 사운드 → ffmpeg | `helinox_short.mp4` (1080x1920·30fps) |
| `lemouton/` | 르무통 위크 프로모 v1 (09-04) | PIL 프레임 렌더 + edge-tts 내레이션 + 합성 BGM/SFX | `lemouton_week_short.mp4` |
| `lemouton_veo/` | 르무통 위크 v2 (09-07): Veo 3.1 배경 클립 + v1 타이포/오디오 | `veo_gen.py`(클립 생성) → `render_veo.py`(합성) | `lemouton_week_veo.mp4`, `_share.mp4` |
| `remotion-performance/` | NMG 퍼포먼스 마케팅 숏폼 60초 (09-07) | Remotion 4.0.320 + edge-tts | `out/performance-short.mp4` |
| `reference/` | 09-04 claude-video 스킬로 분석한 레퍼런스 영상 2편 + 분석 JSON | | |
| `tools/ffbin/` | 09-04 세션에서 받은 ffmpeg.exe (PIL 렌더 스크립트가 참조) | | |

## 실행 방법

### helinox / lemouton (PIL 렌더)
```
cd helinox   (또는 lemouton)
python render.py
```
- ffmpeg는 `../tools/ffbin/ffmpeg.exe`를 사용하도록 경로를 고쳐 두었다. PATH의 ffmpeg 9.0.1을 쓰려면 `FFMPEG = "ffmpeg"`로 바꾸면 된다.
- 폰트는 `C:\Users\NMG\AppData\Local\Microsoft\Windows\Fonts`의 Pretendard / GmarketSans / SB 어그로를 참조한다.
- `lemouton/patch_front.py`는 v1 render.py 앞부분을 리스타일한 일회성 패치 스크립트(이미 적용됨). 재실행 불필요.
- `lemouton/tts/`의 n0~n4가 내레이션. 문구는 `lemouton_veo/narration_v1.txt` 참고.

### lemouton_veo (Veo 3.1)
```
cd lemouton_veo
python veo_gen.py            # clips/에 mp4가 없는 샷만 생성(재실행해도 재과금 없음)
python render_veo.py         # 합성. frames/는 clips/에서 자동 추출(복사 시 제외함)
python render_veo.py --stills
```
- Gemini API 키는 `C:\Users\NMG\.claude\skills\claude-video\.env`의 GEMINI_API_KEY. 값은 절대 출력하지 말 것.
- Developer API 제약: `generate_audio`, `negative_prompt` 미지원. `reference_images` 최대 3장, 1080p 9:16 8초는 Fast 모델에서 정상.
- 단가: Lite $0.05/s, Fast 720p $0.10/s, Fast 1080p $0.15/s, Standard $0.40/s.
- 특정 샷만 다시 뽑으려면 `clips/<샷>.mp4` 삭제 후 `veo_gen.py` 실행. `SHOTS` 사전(영문 프롬프트 + 레퍼런스 자산)이 샷 정의.

### remotion-performance (Remotion)
```
cd remotion-performance
npm run studio               # 브라우저 미리보기
npm run render               # out/performance-short.mp4
python gen_tts.py "+12%"     # public/audio/script.json 문구로 음성 재생성 → durations.json → 타임라인 자동 반영
```
- node_modules는 원본에서 그대로 복사했다. 문제가 있으면 `npm ci`.
- `src/timeline.ts`가 음성 길이 기반으로 장면 시작 프레임을 계산. 장면은 `src/scenes/*`.
- `veo/veo_test.py`는 Veo Lite 시험 생성 스크립트(결과 `public/clips/test_s1.mp4`).

## 공통 도구 상태 (2026-09-07 확인)
- ffmpeg 9.0.1 (winget) PATH 등록됨, ffprobe 포함
- Python 3.12: Pillow 12.3, numpy 2.5, google-genai, python-dotenv, edge-tts
- Node 24.18 / npm 11.16

## 원본 위치 (삭제하지 않음)
- 스크래치패드: `C:\Users\NMG\AppData\Local\Temp\claude\c--Users-NMG-Desktop-Claude-k2s-nmg-homepage\31d34b86-...\scratchpad\{helinox,lemouton,ffbin}` (임시 폴더라 언제든 사라질 수 있음)
- `C:\Users\NMG\Videos\lemouton_veo\`, `lemouton_week_render.py`, `lemouton_week_short.mp4`, `helinox_sanzo_chairone_short.mp4`
- `C:\Users\NMG\Desktop\Claude-k2s\nmg-homepage\video\` (홈페이지 저장소 안의 Remotion 프로젝트, 중복이므로 정리 권장)

## CTCH 연동 (2026-09-07 추가)

### 클립은 플랫폼에서, 합성은 여기서
- 종량제 API(Veo·Claude)는 쓰지 않는다. Flow/Higgsfield/Runway/Luma에서 구독 크레딧으로 클립을 만들고 mp4만 가져온다.
- 로컬에서 직접 합성: `python lemouton_veo/flow_import.py --list` 로 다운로드 폴더의 후보를 보고
  `python lemouton_veo/flow_import.py hook_feet=Flow_abc.mp4 cloud_walk=...` 로 clips/에 정규화(1080x1920·30fps·무음) → `python lemouton_veo/render_veo.py`
- CTCH 웹(소재 생성 > 숏폼 제작 > 새 숏폼 생성)에서는 샷별 클립을 업로드하면 `shortform_jobs`에 queued 작업이 생긴다.

### 범용 템플릿 (2026-09-17 추가) — `templates/`
- `sf_common.py` 공용(폰트·타이포·그라데이션·edge-tts 내레이션·합성 BGM·ffmpeg 인코딩·poster/stills)
- `photo_promo/render.py` 제품 사진 N장 + AI 스크립트 → 모션그래픽. 영상 생성 API 없음(비용 $0)
- `veo_promo/render.py` 샷별 클립(Veo API 생성 또는 업로드) + AI 스크립트 → 타이포·내레이션 합성
- 입력은 `SF_JOB`(job.json) 하나: `{script:{brand,scenes[{id,role,kicker,headline,sub,narration,seconds,prompt}],cta,voice}, assets:[로컬 이미지], clips:{id:로컬 mp4}, options}`
- 장면 레이아웃은 `role`(hook/benefit/proof/offer/cta)이 결정. 장면 길이는 내레이션 길이에 맞춰 자동(클립형은 8초 기본, 길면 클립을 느리게 재생)
- 로컬 단독 실행: `SF_JOB=job.json SF_WORK=work SF_OUT=out.mp4 python templates/photo_promo/render.py`
- 스크립트는 웹 `/api/shortform/script`(Claude)에서 생성. 형식은 `features/creative/shortFormScript.ts`

### 렌더 워커 (사내 PC에서 실행)
```
cd short-form/worker
setup.bat                        # 최초 1회: 패키지 설치 + ffmpeg·환경변수·DB 스키마 점검
start_worker.bat                 # 상시 실행 (더블클릭 가능). 창을 닫으면 멈춘다
python check_env.py              # 점검만 다시 하고 싶을 때
python render_worker.py          # 10초마다 큐 확인, 순서대로 합성
python render_worker.py --once   # 하나만 처리
```
- `ctch/.env.local`의 `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`를 읽는다. ffmpeg/ffprobe는 PATH 필요.
- `gen_mode=generate`(Veo API 자동) 작업은 `GEMINI_API_KEY`가 필요하다(.env.local, 없으면 `~/.claude/skills/claude-video/.env`). 샷별로 생성 즉시 storage `clips/<job>/<shot>.mp4`에 올리고 `shots`·`cost_usd`를 갱신하므로 중간에 실패해 다시 돌려도 만든 샷은 재과금되지 않는다.
- 진행 상황은 `progress` 컬럼으로 웹에 표시된다 (Veo n/m 생성 중 → 클립 정규화 → 렌더).
- 작업 폴더 `worker/jobs/<job id>/` (git 제외). 결과는 storage `shortform/renders/<job id>.mp4`·`.jpg`로 올라가고 작업 상태가 done으로 바뀐다.
- 새 템플릿을 추가하려면 `render_worker.py`의 `TEMPLATES`와 `features/creative/shortFormTemplates.ts`에 같은 id로 등록하고, 렌더 스크립트가 `SF_*` 환경변수를 읽도록 맞춘다.

### 템플릿 스크립트 환경변수
`SF_WORK`(작업 폴더: audio.wav·stills_sheet.jpg·frames 기본 위치), `SF_CLIPS`, `SF_FRAMES`, `SF_OUT`, `SF_JOB`(카피 덮어쓰기 JSON: discount_line, week_days), `SF_FFMPEG`
