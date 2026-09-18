// 숏폼 제작 파이프라인 카탈로그 — short-form/ 폴더에 들어있는 실제 제작 환경의 메타데이터.
// 2026-09-04(금)·09-07(월) 세션에서 만든 4개 환경을 그대로 옮겨온 것이며,
// 웹에서 직접 생성하는 기능은 이 카탈로그를 기준으로 이후 구현한다.

export type PipelineEngine = "pil" | "veo" | "remotion";

export type ShortFormPipeline = {
  id: string;
  title: string;
  brand: string;
  engine: PipelineEngine;
  engineLabel: string;
  madeOn: string;            // 제작일 (YYYY-MM-DD)
  durationSec: number;
  size: string;              // 해상도 · fps
  summary: string;
  dir: string;               // ctch/short-form 기준 상대 경로
  entry: string;             // 실행 진입 스크립트
  commands: string[];        // 재렌더 명령
  keyFiles: { path: string; note: string }[];
  preview: { video: string; poster: string };  // public/ 기준 URL
  notes?: string[];
};

export const ENGINE_META: Record<PipelineEngine, { label: string; color: string; icon: string }> = {
  pil: { label: "PIL 프레임 렌더", color: "#eb6834", icon: "brush" },
  veo: { label: "Veo 3.1 + PIL 합성", color: "#4F46E5", icon: "wand" },
  remotion: { label: "Remotion", color: "#1baf7a", icon: "movie" },
};

export const SHORT_FORM_PIPELINES: ShortFormPipeline[] = [
  {
    id: "helinox",
    title: "헬리녹스 × 산조공무점 Chair One (re)",
    brand: "Helinox",
    engine: "pil",
    engineLabel: "PIL 프레임 렌더 + 합성 사운드",
    madeOn: "2026-09-04",
    durationSec: 18.3,
    size: "1080×1920 · 30fps",
    summary: "공식 페이지 이미지 32장을 크롭·줌·전환으로 엮은 제품 프로모. 사운드는 numpy로 합성.",
    dir: "short-form/helinox",
    entry: "render.py",
    commands: ["cd short-form/helinox", "python render.py"],
    keyFiles: [
      { path: "render.py", note: "타임라인·타이포·전환 정의 (ffmpeg는 ../tools/ffbin)" },
      { path: "img/", note: "제품 이미지 32장 (jpg/webp)" },
      { path: "helinox_short.mp4", note: "최종 결과물" },
    ],
    preview: { video: "/short-form/helinox/helinox_short.mp4", poster: "/short-form/helinox/stills_sheet.jpg" },
  },
  {
    id: "lemouton",
    title: "르무통 위크 프로모 v1",
    brand: "Le Mouton",
    engine: "pil",
    engineLabel: "PIL 프레임 렌더 + edge-tts 내레이션",
    madeOn: "2026-09-04",
    durationSec: 37.2,
    size: "1080×1920 · 30fps",
    summary: "후킹 → 메리노 울 소재 → 후기 → 위크 혜택 → CTA 구성. 내레이션 5문장(ko-KR-InJoon)과 합성 BGM/SFX.",
    dir: "short-form/lemouton",
    entry: "render.py",
    commands: ["cd short-form/lemouton", "python render.py"],
    keyFiles: [
      { path: "render.py", note: "DISCOUNT_LINE·REVIEWS 등 카피 상수가 상단에 있음" },
      { path: "assets/", note: "정리된 브랜드 자산 20장 (kv, shoe_*, squeeze, thermal…)" },
      { path: "tts/", note: "n0~n4 내레이션 mp3/wav + durations.json" },
      { path: "lemouton_week_short.mp4", note: "최종 결과물" },
    ],
    preview: { video: "/short-form/lemouton/lemouton_week_short.mp4", poster: "/short-form/lemouton/stills_sheet.jpg" },
    notes: ["할인율 문구(DISCOUNT_LINE)는 확정값으로 교체 필요."],
  },
  {
    id: "lemouton_veo",
    title: "르무통 위크 프로모 v2 (Veo)",
    brand: "Le Mouton",
    engine: "veo",
    engineLabel: "Veo 3.1 Fast 배경 클립 + v1 타이포/오디오",
    madeOn: "2026-09-07",
    durationSec: 37.2,
    size: "1080×1920 · 30fps",
    summary: "8개 샷을 Veo 3.1(Gemini API)로 생성해 전체 화면 배경으로 깔고, v1의 타이포·내레이션·오디오를 합성.",
    dir: "short-form/lemouton_veo",
    entry: "veo_gen.py → render_veo.py",
    commands: [
      "cd short-form/lemouton_veo",
      "python veo_gen.py          # clips/에 없는 샷만 생성 (재과금 없음)",
      "python render_veo.py       # frames/는 clips/에서 자동 추출",
    ],
    keyFiles: [
      { path: "veo_gen.py", note: "SHOTS 사전: 샷별 영문 프롬프트 + 레퍼런스 자산(최대 3장)" },
      { path: "render_veo.py", note: "클립 타임라인·그라데이션·타이포 합성" },
      { path: "clips/", note: "생성된 8초 클립 8개 (1080p 9:16)" },
      { path: "narration_v1.txt", note: "내레이션 원고" },
    ],
    preview: {
      video: "/short-form/lemouton_veo/lemouton_week_veo_share.mp4",
      poster: "/short-form/lemouton_veo/stills_sheet.jpg",
    },
    notes: [
      "GEMINI_API_KEY는 C:\\Users\\NMG\\.claude\\skills\\claude-video\\.env에서 로드 (값 출력 금지).",
      "단가: Lite $0.05/s · Fast 720p $0.10/s · Fast 1080p $0.15/s · Standard $0.40/s.",
      "Developer API는 generate_audio·negative_prompt 미지원.",
    ],
  },
  {
    id: "remotion-performance",
    title: "NMG 퍼포먼스 마케팅 숏폼",
    brand: "NMG",
    engine: "remotion",
    engineLabel: "Remotion 4.0 + edge-tts",
    madeOn: "2026-09-07",
    durationSec: 60,
    size: "1080×1920 · 30fps",
    summary: "구슬(트래픽)·교통망(매체)·열쇠(위닝 소재) 메타포의 60초 모션그래픽. 음성 길이로 장면 타이밍 자동 계산.",
    dir: "short-form/remotion-performance",
    entry: "npm run render",
    commands: [
      "cd short-form/remotion-performance",
      "npm run studio             # 브라우저 미리보기",
      "python gen_tts.py \"+12%\"   # script.json 문구로 음성 재생성",
      "npm run render             # out/performance-short.mp4",
    ],
    keyFiles: [
      { path: "src/scenes/", note: "Intro / Problem / MediaSplit / WinningKey / Outro" },
      { path: "src/timeline.ts", note: "durations.json 기반 장면 시작 프레임" },
      { path: "public/audio/script.json", note: "내레이션 5문장" },
      { path: "veo/veo_test.py", note: "Veo Lite 시험 생성 스크립트" },
    ],
    preview: {
      video: "/short-form/remotion-performance/performance-short.mp4",
      poster: "/short-form/remotion-performance/still.jpg",
    },
  },
];

export function fmtDuration(sec: number): string {
  return `${Math.round(sec)}초`;
}
