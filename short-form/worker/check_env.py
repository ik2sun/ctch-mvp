# -*- coding: utf-8 -*-
"""렌더 워커 실행 전 점검 — 패키지·ffmpeg·환경변수·DB 스키마·폰트를 확인한다. 키 값은 출력하지 않는다.

  python check_env.py
종료 코드 0이면 워커를 바로 실행할 수 있는 상태.
"""
import os, sys, subprocess, importlib.util

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
CTCH = os.path.dirname(os.path.dirname(HERE))
ok, warn = True, False


def line(state, text, hint=""):
    global ok, warn
    mark = {"o": "  [O]", "x": "  [X]", "!": "  [!]"}[state]
    print(f"{mark} {text}" + (f"\n        → {hint}" if hint else ""))
    if state == "x":
        ok = False
    if state == "!":
        warn = True


# 1. 패키지
print("패키지")
for mod, pkg in [("PIL", "Pillow"), ("numpy", "numpy"), ("requests", "requests"),
                 ("dotenv", "python-dotenv"), ("edge_tts", "edge-tts")]:
    found = importlib.util.find_spec(mod) is not None
    line("o" if found else "x", f"{pkg}", "" if found else f"pip install {pkg}")
has_genai = importlib.util.find_spec("google.genai") is not None
line("o" if has_genai else "!", "google-genai (Veo 자동 생성용)",
     "" if has_genai else "pip install google-genai — 사진형 작업만 쓸 거면 없어도 됩니다.")

# 2. ffmpeg
print("\n외부 도구")
for exe in ("ffmpeg", "ffprobe"):
    try:
        subprocess.run([exe, "-version"], capture_output=True, check=True)
        line("o", exe)
    except Exception:
        line("x", exe, "winget install Gyan.FFmpeg 실행 후 새 터미널에서 다시 시도")

# 3. 환경변수
print("\n환경변수 (.env.local)")
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(CTCH, ".env.local"))
    alt = os.path.join(os.path.expanduser("~"), ".claude", "skills", "claude-video", ".env")
    if not os.environ.get("GEMINI_API_KEY") and os.path.exists(alt):
        load_dotenv(alt)
except Exception as e:
    line("x", f"dotenv 로드 실패: {e}")

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
gem = os.environ.get("GEMINI_API_KEY", "")
line("o" if url else "x", f"NEXT_PUBLIC_SUPABASE_URL {'(' + url + ')' if url else ''}",
     "" if url else f"{os.path.join(CTCH, '.env.local')} 에 추가")
line("o" if key else "x", f"SUPABASE_SERVICE_ROLE_KEY ({len(key)}자)" if key else "SUPABASE_SERVICE_ROLE_KEY",
     "" if key else "Supabase 대시보드 > Project Settings > API > service_role")
line("o" if gem else "!", f"GEMINI_API_KEY ({len(gem)}자)" if gem else "GEMINI_API_KEY 없음",
     "" if gem else "Veo 자동 생성에만 필요. 사진형·클립 업로드 작업은 없어도 동작합니다.")

# 4. DB 연결 + 스키마
print("\nSupabase")
if url and key:
    try:
        import requests
        h = {"apikey": key, "Authorization": f"Bearer {key}"}
        cols = "id,status,gen_mode,brief,script,assets,options,progress,cost_usd"
        r = requests.get(f"{url.rstrip('/')}/rest/v1/shortform_jobs?select={cols}&limit=1", headers=h, timeout=20)
        if r.status_code == 200:
            line("o", "shortform_jobs 연결·스키마 정상 (0012 + 0014 적용됨)")
        elif r.status_code == 404 or "PGRST205" in r.text:
            line("x", "shortform_jobs 테이블 없음", "supabase/migrations/0012_shortform_jobs.sql 실행")
        elif "PGRST204" in r.text or "column" in r.text:
            miss = r.text.split("'")[1] if "'" in r.text else "신규"
            line("x", f"컬럼 없음 ({miss})", "supabase/migrations/0014_shortform_generate.sql 실행")
        else:
            line("x", f"조회 실패 HTTP {r.status_code}", r.text[:150])
        rb = requests.get(f"{url.rstrip('/')}/storage/v1/bucket/shortform", headers=h, timeout=20)
        line("o" if rb.status_code == 200 else "x", "storage 버킷 shortform",
             "" if rb.status_code == 200 else "0012 마이그레이션의 버킷 생성 구문 실행")
    except Exception as e:
        line("x", f"연결 실패: {e}")
else:
    line("x", "환경변수가 없어 연결을 건너뜀")

# 5. 폰트
print("\n폰트")
uf = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "Windows", "Fonts")
pret = os.path.exists(os.path.join(uf, "Pretendard-Bold.otf"))
malgun = os.path.exists(r"C:\Windows\Fonts\malgunbd.ttf")
if pret:
    line("o", "Pretendard (권장)")
elif malgun:
    line("!", "Pretendard 없음 — 맑은 고딕으로 대체됩니다", "디자인을 그대로 쓰려면 Pretendard 설치 권장")
else:
    line("x", "한글 폰트 없음", "Pretendard 또는 맑은 고딕 설치 필요")

print("\n" + "=" * 46)
if ok:
    print("점검 통과. start_worker.bat 으로 워커를 실행하세요." + ("  (경고 항목 확인)" if warn else ""))
else:
    print("문제가 있습니다. 위 [X] 항목을 해결한 뒤 다시 실행하세요.")
sys.exit(0 if ok else 1)
