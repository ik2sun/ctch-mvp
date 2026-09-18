"""Veo 시험 생성: Lite 모델, 9:16, 8초, 오디오 없음. 키 값은 절대 출력하지 않음."""
import os, sys, time
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv(r"C:\Users\NMG\.claude\skills\claude-video\.env")
client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

MODEL = sys.argv[1] if len(sys.argv) > 1 else "veo-3.1-lite-generate-preview"
OUT = sys.argv[2] if len(sys.argv) > 2 else "../public/clips/test_s1.mp4"
PROMPT = (
    "Vertical 9:16 cinematic 3D animation. A vast futuristic night city seen from above, "
    "neon blue and dark navy palette. Thousands of glowing blue glass marbles pour down from the sky "
    "like heavy traffic, bouncing chaotically along a giant web of illuminated highway lanes "
    "that converge toward a single glowing gate at the bottom. Camera slowly pushes in. "
    "Clean, minimal, high-end motion graphics style, no text, no people."
)

t0 = time.time()
op = client.models.generate_videos(
    model=MODEL,
    source=types.GenerateVideosSource(prompt=PROMPT),
    config=types.GenerateVideosConfig(
        aspect_ratio="9:16",
        duration_seconds=8,
        number_of_videos=1,
    ),
)
print("요청 접수:", op.name)
while not op.done:
    time.sleep(10)
    op = client.operations.get(op)
    print(f"  대기 중... {int(time.time()-t0)}s", flush=True)

if op.error:
    print("생성 실패:", op.error); sys.exit(1)
vid = op.response.generated_videos[0]
client.files.download(file=vid.video)
vid.video.save(OUT)
print("완료:", OUT, f"({int(time.time()-t0)}s)")
