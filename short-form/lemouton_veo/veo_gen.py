# -*- coding: utf-8 -*-
"""Le Mouton Week: generate background clips with Veo 3.1 (Gemini API).

Idempotent: a clip whose mp4 already exists in clips/ is skipped, so re-runs never re-bill.
Usage: python veo_gen.py [model] [shot ...]
"""
import os, sys, time, json, concurrent.futures as cf
from dotenv import load_dotenv
from google import genai
from google.genai import types, errors

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
load_dotenv(r"C:\Users\NMG\.claude\skills\claude-video\.env")
client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

MODEL = "veo-3.1-fast-generate-preview"
RES = "1080p"
A = lambda n: os.path.join(HERE, "assets", n + ".jpg")

STYLE = ("Shot on a cinema camera, shallow depth of field, natural color grading, premium footwear commercial. "
         "No on-screen text, no logos, no captions, no watermark.")

SHOTS = {
    "hook_feet": dict(
        prompt="Vertical 9:16. Late night office, dim with cool blue monitor glow. Under a desk, a woman in business attire "
               "slips off a stiff black high heel and rubs her aching foot, a red mark on the heel. Slow push-in, "
               "moody and tired atmosphere, realistic. " + STYLE,
        refs=[]),
    "cloud_walk": dict(
        prompt="Vertical 9:16. Bright cream studio flooded with soft daylight. Low-angle tracking shot of feet wearing navy "
               "wool sneakers with thick white soles, walking on a floor of fluffy white clouds. Small puffs of cloud drift "
               "up with each step. Dreamy, weightless, joyful, gentle slow motion. " + STYLE,
        refs=["shoe_navy"]),
    "squeeze_wool": dict(
        prompt="Vertical 9:16. Macro studio shot on a warm cream background. Two hands gently twist and squeeze a soft "
               "brown wool sneaker, the shoe bending like a pillow and springing back. Then the camera racks focus to an "
               "extreme close-up of fluffy cream merino wool fibers catching the light. " + STYLE,
        refs=["squeeze", "wool"]),
    "barefoot_cross": dict(
        prompt="Vertical 9:16. Sunny city crosswalk, warm afternoon light. Ankle-level tracking shot of a person in dark "
               "shorts wearing navy wool sneakers with no socks, striding lightly across the zebra crossing. Feet look "
               "weightless, easy and relaxed. Gentle slow motion. " + STYLE,
        refs=["shoe_navy"]),
    "travel_walk": dict(
        prompt="Vertical 9:16. Golden hour in a European old town, cobblestone street. A young woman with a small backpack "
               "walks toward the camera wearing beige wool sneakers, cheerful and relaxed, camera slowly tracking backward. "
               "Feels like an effortless day of walking. " + STYLE,
        refs=["shoe_pair"]),
    "parents_hike": dict(
        prompt="Vertical 9:16. Autumn mountain trail with fallen leaves. A smiling middle-aged couple walks a gentle path "
               "wearing olive and grey wool sneakers, comfortable and unhurried. Low tracking shot that tilts up to their "
               "faces, warm afternoon light. " + STYLE,
        refs=["shoe_green"]),
    "product_hero": dict(
        prompt="Vertical 9:16. Minimal cream studio. A pair of navy and beige wool sneakers with white soles rests on a "
               "soft round pedestal and slowly rotates. Soft shadows, warm rim light, elegant and premium product commercial. "
               + STYLE,
        refs=["shoe_pair"]),
    "cta_hold": dict(
        prompt="Vertical 9:16. Bright clean studio. A smiling young woman in a light mint jacket holds up a pair of grey "
               "wool sneakers toward the camera, then laughs playfully. Medium shot, friendly and energetic. " + STYLE,
        refs=["shoe_grey"]),
}


def ref_images(names):
    out = []
    for n in names:
        with open(A(n), "rb") as f:
            out.append(types.VideoGenerationReferenceImage(
                image=types.Image(image_bytes=f.read(), mime_type="image/jpeg"), reference_type="asset"))
    return out


def generate(name, model=MODEL):
    out = os.path.join(HERE, "clips", name + ".mp4")
    if os.path.exists(out):
        return name, "skip (exists)"
    shot = SHOTS[name]
    attempts = [dict(refs=shot["refs"], res=RES), dict(refs=[], res=RES), dict(refs=[], res="720p")]
    last = None
    for a in attempts:
        cfg = types.GenerateVideosConfig(aspect_ratio="9:16", duration_seconds=8, number_of_videos=1, resolution=a["res"])
        if a["refs"]:
            cfg.reference_images = ref_images(a["refs"])
        try:
            t0 = time.time()
            op = client.models.generate_videos(model=model, source=types.GenerateVideosSource(prompt=shot["prompt"]), config=cfg)
            while not op.done:
                time.sleep(10)
                op = client.operations.get(op)
            if op.error:
                last = f"op error: {op.error}"
                continue
            if not op.response or not op.response.generated_videos:
                last = f"no video returned (filtered?) {op.response}"
                continue
            vid = op.response.generated_videos[0]
            client.files.download(file=vid.video)
            vid.video.save(out)
            return name, f"ok refs={a['refs']} res={a['res']} {int(time.time()-t0)}s"
        except errors.APIError as e:
            last = f"{e.code} {str(e)[:200]}"
            if e.code == 429:
                time.sleep(20)
            continue
    return name, "FAILED: " + str(last)


if __name__ == "__main__":
    args = [x for x in sys.argv[1:]]
    model = args.pop(0) if args and args[0].startswith("veo") else MODEL
    names = args or list(SHOTS)
    os.makedirs(os.path.join(HERE, "clips"), exist_ok=True)
    print("model:", model, "| shots:", ", ".join(names), flush=True)
    with cf.ThreadPoolExecutor(max_workers=3) as ex:
        for name, msg in ex.map(lambda n: generate(n, model), names):
            print(f"[{name}] {msg}", flush=True)
            with open(os.path.join(HERE, "gen_log.txt"), "a", encoding="utf-8") as f:
                f.write(f"{time.strftime('%H:%M:%S')} {model} [{name}] {msg}\n")
    print("done")
