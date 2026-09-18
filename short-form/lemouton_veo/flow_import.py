# -*- coding: utf-8 -*-
"""Google Flow(또는 Runway/Luma 등)에서 내려받은 클립을 clips/<샷>.mp4 규격(1080x1920, 30fps, 무음)으로 가져온다.

  python flow_import.py --list [--src DIR] [--hours 48]        후보 mp4 목록(해상도·길이) 출력
  python flow_import.py hook_feet=Flow_abc.mp4 cloud_walk=... 파일명(또는 경로)을 샷에 매핑해 가져오기
  python flow_import.py --map map.json                          {"hook_feet": "path", ...} 형식으로 일괄 가져오기
  python flow_import.py --missing                               아직 clips/에 없는 샷 목록

파일명은 --src 폴더(기본: 내 다운로드 폴더) 기준 상대 경로도 되고 절대 경로도 된다.
이미 있는 clips/<샷>.mp4 는 --force 없이는 덮어쓰지 않는다. 가져온 뒤 frames/<샷>/ 캐시는 지운다.
"""
import os, sys, json, glob, shutil, subprocess, time

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
CLIPS = os.path.join(HERE, "clips")
FRAMES = os.path.join(HERE, "frames")
FFMPEG = os.environ.get("SF_FFMPEG", "ffmpeg")
FFPROBE = os.environ.get("SF_FFPROBE", "ffprobe")
W, H, FPS = 1080, 1920, 30
SHOTS = ["hook_feet", "cloud_walk", "squeeze_wool", "barefoot_cross", "travel_walk", "parents_hike", "product_hero", "cta_hold"]
DEFAULT_SRC = os.path.join(os.path.expanduser("~"), "Downloads")


def probe(path):
    """(width, height, duration_sec) — 실패하면 (0, 0, 0)."""
    try:
        out = subprocess.check_output([FFPROBE, "-v", "error", "-select_streams", "v:0",
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
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", src,
                    "-vf", f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={FPS}",
                    "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
                    "-movflags", "+faststart", dst], check=True)
    return dst


def resolve(name, src_dir):
    if os.path.isabs(name) and os.path.exists(name):
        return name
    cand = os.path.join(src_dir, name)
    if os.path.exists(cand):
        return cand
    hits = glob.glob(os.path.join(src_dir, f"*{name}*"))
    hits = [h for h in hits if h.lower().endswith(".mp4")]
    if len(hits) == 1:
        return hits[0]
    raise SystemExit(f"파일을 찾을 수 없거나 여러 개입니다: {name} (후보 {len(hits)}개)")


def import_clip(shot, src, force=False):
    if shot not in SHOTS:
        raise SystemExit(f"알 수 없는 샷: {shot}. 가능: {', '.join(SHOTS)}")
    dst = os.path.join(CLIPS, shot + ".mp4")
    if os.path.exists(dst) and not force:
        print(f"[{shot}] 이미 있음 — 건너뜀 (--force 로 덮어쓰기)")
        return
    w, h, dur = probe(src)
    print(f"[{shot}] {os.path.basename(src)}  {w}x{h}  {dur:.1f}s  → 정규화 중…", flush=True)
    if w and h and w > h:
        print(f"    경고: 가로 영상입니다. 가운데를 세로로 크롭합니다.")
    normalize(src, dst)
    shutil.rmtree(os.path.join(FRAMES, shot), ignore_errors=True)
    print(f"[{shot}] ok → {dst}")


def list_candidates(src_dir, hours):
    now = time.time()
    rows = []
    for p in glob.glob(os.path.join(src_dir, "*.mp4")):
        age = (now - os.path.getmtime(p)) / 3600
        if hours and age > hours:
            continue
        w, h, dur = probe(p)
        rows.append((os.path.getmtime(p), p, w, h, dur))
    rows.sort(reverse=True)
    if not rows:
        print(f"최근 {hours}시간 내 mp4가 없습니다: {src_dir}")
        return
    print(f"{src_dir}  (최근 {hours}시간, 최신순)")
    for _, p, w, h, dur in rows:
        tag = "세로" if h > w else "가로"
        print(f"  {tag} {w:>4}x{h:<4} {dur:5.1f}s  {os.path.basename(p)}")


def main():
    args = sys.argv[1:]
    src_dir = DEFAULT_SRC
    hours = 48
    force = "--force" in args
    if "--src" in args:
        src_dir = args[args.index("--src") + 1]
    if "--hours" in args:
        hours = float(args[args.index("--hours") + 1])
    if "--missing" in args:
        missing = [s for s in SHOTS if not os.path.exists(os.path.join(CLIPS, s + ".mp4"))]
        print("없는 샷:", ", ".join(missing) if missing else "(모두 있음)")
        return
    if "--list" in args:
        list_candidates(src_dir, hours)
        return
    mapping = {}
    if "--map" in args:
        mapping = json.load(open(args[args.index("--map") + 1], encoding="utf-8"))
    for a in args:
        if "=" in a and not a.startswith("--"):
            k, v = a.split("=", 1)
            mapping[k.strip()] = v.strip().strip('"')
    if not mapping:
        print(__doc__)
        return
    os.makedirs(CLIPS, exist_ok=True)
    for shot, name in mapping.items():
        import_clip(shot, resolve(name, src_dir), force=force)
    missing = [s for s in SHOTS if not os.path.exists(os.path.join(CLIPS, s + ".mp4"))]
    print("남은 샷:", ", ".join(missing) if missing else "없음 — python render_veo.py 로 합성하세요")


if __name__ == "__main__":
    main()
