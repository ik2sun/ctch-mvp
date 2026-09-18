# NMG 퍼포먼스 마케팅 숏폼 (Remotion)

60초 · 1080x1920 · 30fps. 내레이션은 edge-tts(ko-KR-InJoonNeural)로 생성.

## 명령
- `npm run studio` : 브라우저 미리보기/편집
- `npm run render` : `out/performance-short.mp4` 렌더링
- `python gen_tts.py "+12%"` : `public/audio/script.json` 문구로 음성 재생성 (durations.json 갱신 → 타임라인 자동 반영)

## 구조
- `src/timeline.ts` : 음성 길이 기반 장면 시작 프레임 계산
- `src/scenes/*` : 도입 / 난관 / 매체 최적화 / 위닝 소재 / 결론
- `src/components/Caption.tsx` : 문장 단위 자막(글자 수 비례 타이밍)
