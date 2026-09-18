import json, subprocess, sys
segs = json.load(open("public/audio/script.json", encoding="utf-8"))
rate = sys.argv[1] if len(sys.argv) > 1 else "+5%"
out = []
for s in segs:
    mp3 = f"public/audio/{s['id']}.mp3"
    subprocess.run(["edge-tts", "--voice", "ko-KR-InJoonNeural", "--rate", rate, "--text", s["text"], "--write-media", mp3], check=True)
    d = float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0", mp3]).decode().strip())
    out.append({"id": s["id"], "duration": round(d, 3)})
    print(s["id"], round(d,2), "s")
json.dump(out, open("public/audio/durations.json","w"), indent=2)
print("total", round(sum(o["duration"] for o in out),2))
