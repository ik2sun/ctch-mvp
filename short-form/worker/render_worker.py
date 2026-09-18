# -*- coding: utf-8 -*-
"""CTCH 숏폼 렌더 워커 — Supabase의 shortform_jobs 큐를 폴링해 로컬에서 클립 생성(Veo)·TTS·합성하고 결과를 올린다.

  python render_worker.py            계속 폴링 (10초 간격)
  python render_worker.py --once     대기 중인 작업 하나만 처리하고 종료

필요한 것: ctch/.env.local 의 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
           (mode=generate 작업) GEMINI_API_KEY — .env.local 또는 ~/.claude/skills/claude-video/.env,
           PATH의 ffmpeg/ffprobe, Python: Pillow numpy requests python-dotenv edge-tts google-genai,
           Windows 사용자 폰트(Pretendard·GmarketSans, 없으면 맑은 고딕).
Vercel에서는 ffmpeg/PIL 장시간 렌더가 불가능해 이 워커가 사내 PC에서 돈다.

템플릿:
  lemouton_veo  고정 8샷 클립 합성 (short-form/lemouton_veo/render_veo.py, copy 필드만 덮어씀)
  veo_promo     script.scenes 가 샷. mode=generate 면 Veo API로 클립 생성 → storage clips/<job>/<shot>.mp4 저장 후 합성
  photo_promo   assets(사진) + script → 모션그래픽 합성. API 미사용
작업 흐름: queued → rendering(선점) → [Veo 생성] → 다운로드·정규화 → TTS·합성 → renders/<id>.mp4·.jpg 업로드 → done
"""
import os, sys, json, time, shutil, subprocess, traceback, importlib.util
import requests
from dotenv import load_dotenv

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
SHORT_FORM = os.path.dirname(HERE)
CTCH = os.path.dirname(SHORT_FORM)
load_dotenv(os.path.join(CTCH, ".env.local"))
_alt_env = os.path.join(os.path.expanduser("~"), ".claude", "skills", "claude-video", ".env")
if not os.environ.get("GEMINI_API_KEY") and os.path.exists(_alt_env):
    load_dotenv(_alt_env)

URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
if not URL or not KEY:
    raise SystemExit("ctch/.env.local 에 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.")
BUCKET = "shortform"
JOBS_DIR = os.path.join(HERE, "jobs")
TPL_DIR = os.path.join(SHORT_FORM, "templates")
TEMPLATES = {
    "lemouton_veo": dict(kind="clips", scripted=False, dir=os.path.join(SHORT_FORM, "lemouton_veo"), script="render_veo.py",
                         shots=["hook_feet", "cloud_walk", "squeeze_wool", "barefoot_cross",
                                "travel_walk", "parents_hike", "product_hero", "cta_hold"]),
    "veo_promo": dict(kind="clips", scripted=True, dir=os.path.join(TPL_DIR, "veo_promo"), script="render.py"),
    "photo_promo": dict(kind="photos", scripted=True, dir=os.path.join(TPL_DIR, "photo_promo"), script="render.py"),
}
# Veo 3.1 (Gemini API) 단가 — features/creative/platforms.ts VEO_MODELS 와 동일하게 유지
VEO_MODELS = {
    "veo-3.1-lite-generate-preview": {"720p": 0.05},
    "veo-3.1-fast-generate-preview": {"720p": 0.10, "1080p": 0.15},
    "veo-3.1-generate-preview": {"1080p": 0.40},
}
VEO_DEFAULT = "veo-3.1-fast-generate-preview"
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}
W, HH, FPS = 1080, 1920, 30


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


# ---------------------------------------------------------------- supabase REST
def rest(method, path, **kw):
    r = requests.request(method, f"{URL}{path}", headers={**H, **kw.pop("headers", {})}, timeout=60, **kw)
    if r.status_code >= 400:
        raise RuntimeError(f"{method} {path} → {r.status_code} {r.text[:300]}")
    return r


def now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime())


def claim_job():
    r = rest("GET", "/rest/v1/shortform_jobs?status=eq.queued&order=created_at.asc&limit=1",
             headers={"Accept": "application/json"})
    rows = r.json()
    if not rows:
        return None
    job = rows[0]
    r = rest("PATCH", f"/rest/v1/shortform_jobs?id=eq.{job['id']}&status=eq.queued",
             headers={"Content-Type": "application/json", "Prefer": "return=representation"},
             json={"status": "rendering", "updated_at": now_iso(), "error": None, "progress": "작업 준비 중"})
    return r.json()[0] if r.json() else None


def update_job(job_id, **fields):
    fields["updated_at"] = now_iso()
    rest("PATCH", f"/rest/v1/shortform_jobs?id=eq.{job_id}",
         headers={"Content-Type": "application/json", "Prefer": "return=minimal"}, json=fields)


def progress(job, text):
    log("  ", text)
    try:
        update_job(job["id"], progress=text)
    except Exception as e:
        log("  진행 상황 갱신 실패:", e)


def download(path, dst):
    with requests.get(f"{URL}/storage/v1/object/{BUCKET}/{path}", headers=H, stream=True, timeout=300) as r:
        if r.status_code >= 400:
            raise RuntimeError(f"download {path} → {r.status_code} {r.text[:200]}")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        with open(dst, "wb") as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
    return dst


def upload(path, src, content_type):
    with open(src, "rb") as f:
        r = requests.post(f"{URL}/storage/v1/object/{BUCKET}/{path}", data=f,
                          headers={**H, "Content-Type": content_type, "x-upsert": "true"}, timeout=600)
    if r.status_code >= 400:
        raise RuntimeError(f"upload {path} → {r.status_code} {r.text[:200]}")
    return path


# ---------------------------------------------------------------- media helpers
def probe(path):
    try:
        out = subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0",
                                       "-show_entries", "stream=width,height:format=duration",
                                       "-of", "json", path]).decode("utf-8", "ignore")
        j = json.loads(out)
        s = (j.get("streams") or [{}])[0]
        return int(s.get("width", 0)), int(s.get("height", 0)), float(j.get("format", {}).get("duration", 0))
    except Exception:
        return 0, 0, 0.0


def normalize(src, dst):
    """어떤 비율·해상도의 클립이든 세로 1080x1920 30fps 무음 H.264로 맞춘다 (가운데 크롭)."""
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src,
                    "-vf", f"scale={W}:{HH}:force_original_aspect_ratio=increase,crop={W}:{HH},fps={FPS}",
                    "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
                    "-movflags", "+faststart", dst], check=True)
    return dst


# ---------------------------------------------------------------- Veo (Gemini API)
_genai = None
def genai_client():
    global _genai
    if _genai is None:
        key = os.environ.get("GEMINI_API_KEY")
        if not key:
            raise RuntimeError("GEMINI_API_KEY 가 없어요. ctch/.env.local 에 추가해 주세요 (Veo 자동 생성에 필요).")
        from google import genai
        _genai = genai.Client(api_key=key)
    return _genai


def veo_clip_seconds(scene_seconds, resolution):
    """Veo 3.1 은 4·6·8초, 1080p 는 8초만. 장면보다 짧지 않은 가장 짧은 길이 (platforms.ts veoClipSeconds 와 동일)"""
    if resolution != "720p":
        return 8
    s = float(scene_seconds or 8)
    return 4 if s <= 4 else 6 if s <= 6 else 8


def veo_generate(prompt, out, model, resolution, seconds=8):
    """Veo 로 9:16 클립 1개 생성 → out(mp4). 실패 시 해상도 낮춰 1회 재시도. 반환: (걸린 시간, 실제 해상도)"""
    from google.genai import types, errors
    client = genai_client()
    attempts = [resolution] + (["720p"] if resolution != "720p" else [])
    last = None
    for res in attempts:
        secs = seconds if res == "720p" else 8
        cfg = types.GenerateVideosConfig(aspect_ratio="9:16", duration_seconds=secs, number_of_videos=1, resolution=res)
        try:
            t0 = time.time()
            op = client.models.generate_videos(model=model, source=types.GenerateVideosSource(prompt=prompt), config=cfg)
            while not op.done:
                time.sleep(8)
                op = client.operations.get(op)
            if op.error:
                last = f"op error: {op.error}"; continue
            if not op.response or not op.response.generated_videos:
                last = f"영상이 반환되지 않음(안전 필터?) {op.response}"; continue
            vid = op.response.generated_videos[0]
            client.files.download(file=vid.video)
            vid.video.save(out)
            return time.time() - t0, res, secs
        except errors.APIError as e:
            msg = str(e)
            if "prepayment credits are depleted" in msg or "billing" in msg.lower() and e.code == 429:
                raise RuntimeError("Gemini API 선결제 크레딧이 소진됐어요. https://ai.studio/projects 에서 프로젝트 결제를 충전한 뒤 '다시 제작'을 눌러 주세요. (이미 생성된 샷은 재과금되지 않습니다)")
            if e.code in (401, 403):
                raise RuntimeError(f"GEMINI_API_KEY 인증 실패({e.code}). 키 값과 Veo 모델 접근 권한을 확인해 주세요.")
            last = f"{e.code} {msg[:300]}"
            if e.code == 429:
                time.sleep(20)
            continue
    raise RuntimeError("Veo 생성 실패: " + str(last))


def ensure_clips_generated(job, work):
    """mode=generate: script.scenes 중 shots 에 없는 샷을 Veo 로 만들어 storage 에 올리고 job.shots 를 갱신한다.
    이미 생성된 샷은 건너뛰어 재실행해도 재과금되지 않는다."""
    script = job.get("script") or {}
    scenes = script.get("scenes") or []
    shots = dict(job.get("shots") or {})
    opts = job.get("options") or {}
    model = opts.get("veo_model") or VEO_DEFAULT
    if model not in VEO_MODELS:
        raise RuntimeError(f"지원하지 않는 Veo 모델: {model}")
    res = opts.get("resolution") or list(VEO_MODELS[model])[-1]
    if res not in VEO_MODELS[model]:
        res = list(VEO_MODELS[model])[-1]
    todo = [s for s in scenes if not shots.get(s["id"])]
    cost = float(job.get("cost_usd") or 0)
    gen_dir = os.path.join(work, "gen"); os.makedirs(gen_dir, exist_ok=True)
    for i, sc in enumerate(todo):
        if not sc.get("prompt"):
            raise RuntimeError(f"샷 {sc['id']} 에 영상 프롬프트가 없어요.")
        progress(job, f"Veo 클립 생성 {i + 1}/{len(todo)} · {sc['id']} ({model.split('-generate')[0]} {res})")
        out = os.path.join(gen_dir, sc["id"] + ".mp4")
        secs, used_res, clip_secs = veo_generate(sc["prompt"], out, model, res, seconds=veo_clip_seconds(sc.get("seconds"), res))
        cost += clip_secs * VEO_MODELS[model].get(used_res, list(VEO_MODELS[model].values())[0])
        path = upload(f"clips/{job['id']}/{sc['id']}.mp4", out, "video/mp4")
        shots[sc["id"]] = path
        update_job(job["id"], shots=shots, cost_usd=round(cost, 2))
        log(f"    생성 완료 {sc['id']} {used_res} {clip_secs}초 클립 · {secs:.0f}s 소요  누적 ${cost:.2f}")
    job["shots"] = shots
    job["cost_usd"] = cost
    return shots


# ---------------------------------------------------------------- render
def run_template(tpl, env, work, out):
    p = subprocess.run([sys.executable, tpl["script"]], cwd=tpl["dir"], env=env,
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    tail = (p.stdout + "\n" + p.stderr)[-4000:]
    if p.returncode != 0 or not os.path.exists(out):
        raise RuntimeError("render 실패\n" + tail)
    return tail


def run_job(job):
    jid = job["id"]
    tpl = TEMPLATES.get(job.get("template") or "lemouton_veo")
    if not tpl:
        raise RuntimeError(f"알 수 없는 템플릿: {job.get('template')}")
    work = os.path.join(JOBS_DIR, jid)
    clips_dir = os.path.join(work, "clips")
    shutil.rmtree(work, ignore_errors=True)
    os.makedirs(clips_dir, exist_ok=True)
    out = os.path.join(work, "out.mp4")
    env = {**os.environ, "SF_WORK": work, "SF_CLIPS": clips_dir, "SF_FRAMES": os.path.join(work, "frames"),
           "SF_OUT": out, "PYTHONIOENCODING": "utf-8"}

    if tpl["kind"] == "clips":
        if tpl["scripted"]:
            scenes = (job.get("script") or {}).get("scenes") or []
            if not scenes:
                raise RuntimeError("스크립트(script.scenes)가 비어 있어요. 폼에서 스크립트를 생성한 뒤 등록해 주세요.")
            if (job.get("gen_mode") or "upload") == "generate":
                ensure_clips_generated(job, work)
            shot_ids = [s["id"] for s in scenes]
        else:
            shot_ids = tpl["shots"]
        shots = job.get("shots") or {}
        missing = [s for s in shot_ids if not shots.get(s)]
        if missing:
            raise RuntimeError("클립이 없는 샷: " + ", ".join(missing))
        local_clips = {}
        for i, shot in enumerate(shot_ids):
            progress(job, f"클립 정규화 {i + 1}/{len(shot_ids)} · {shot}")
            raw = download(shots[shot], os.path.join(work, "raw", shot + ".mp4"))
            w, h, dur = probe(raw)
            log(f"  [{shot}] {w}x{h} {dur:.1f}s → 정규화")
            local_clips[shot] = normalize(raw, os.path.join(clips_dir, shot + ".mp4"))
        job_json = os.path.join(work, "job.json")
        if tpl["scripted"]:
            payload = {"script": job.get("script") or {}, "assets": [], "clips": local_clips, "options": job.get("options") or {}}
        else:
            payload = job.get("copy") or {}
        with open(job_json, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False)
    else:  # photos
        assets = job.get("assets") or []
        if len(assets) < 2:
            raise RuntimeError("사진이 2장 이상 필요해요.")
        local_assets = []
        for i, path in enumerate(assets):
            progress(job, f"사진 다운로드 {i + 1}/{len(assets)}")
            local_assets.append(download(path, os.path.join(work, "assets", os.path.basename(path))))
        job_json = os.path.join(work, "job.json")
        with open(job_json, "w", encoding="utf-8") as f:
            json.dump({"script": job.get("script") or {}, "assets": local_assets, "clips": {}, "options": job.get("options") or {}},
                      f, ensure_ascii=False)
    env["SF_JOB"] = job_json

    progress(job, "내레이션·합성 렌더 중 (수 분 소요)")
    tail = run_template(tpl, env, work, out)

    _, _, dur = probe(out)
    video_path = upload(f"renders/{jid}.mp4", out, "video/mp4")
    poster_path = None
    for cand in ("poster.jpg", "stills_sheet.jpg"):
        p = os.path.join(work, cand)
        if os.path.exists(p):
            poster_path = upload(f"renders/{jid}.jpg", p, "image/jpeg")
            break
    update_job(jid, status="done", video_path=video_path, poster_path=poster_path, duration_sec=round(dur, 2),
               log=tail, error=None, progress=None, cost_usd=round(float(job.get("cost_usd") or 0), 2))
    shutil.rmtree(os.path.join(work, "frames"), ignore_errors=True)
    shutil.rmtree(os.path.join(work, "raw"), ignore_errors=True)
    log(f"  done {video_path} ({dur:.1f}s)")


def main():
    once = "--once" in sys.argv
    log(f"worker start  url={URL}  templates={', '.join(TEMPLATES)}  veo={'ok' if os.environ.get('GEMINI_API_KEY') else 'no key'}")
    while True:
        try:
            job = claim_job()
        except Exception as e:
            log("큐 조회 실패:", e)
            job = None
        if job:
            log(f"job {job['id']}  {job.get('title')!r}  template={job.get('template')} mode={job.get('gen_mode')} platform={job.get('platform')}")
            try:
                run_job(job)
            except Exception as e:
                msg = str(e)[:2000]
                log("  실패:", msg.splitlines()[0] if msg else e)
                traceback.print_exc()
                try:
                    update_job(job["id"], status="failed", error=msg, progress=None)
                except Exception as e2:
                    log("  상태 갱신 실패:", e2)
            if once:
                return
        elif once:
            log("대기 중인 작업 없음")
            return
        time.sleep(10)


if __name__ == "__main__":
    main()
