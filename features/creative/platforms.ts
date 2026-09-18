// 숏폼 클립을 만드는 AI 플랫폼(엔진) 선택지.
//  - mode "api":    서버(사내 렌더 워커)가 API로 클립을 직접 생성. 종량제 비용 발생 (Veo)
//  - mode "upload": 각 플랫폼의 구독/크레딧으로 만든 클립을 다운로드해 업로드. API 비용 없음
// Higgsfield 이미지 생성은 별도 탭(이미지 생성)에서 API 연동. Veo API 직접 호출 스크립트는 lemouton_veo/veo_gen.py 에도 남아 있다.

export type PlatformId = "veo_api" | "veo_flow" | "higgsfield" | "runway";

export type Platform = {
  id: PlatformId;
  name: string;
  tagline: string;       // 카드 안 작은 글씨
  detail: string;        // 선택 시 안내
  icon: string;          // tabler icon
  // 아이콘 색 — 평소(연한 배경 + 진한 아이콘) / 선택(그라데이션). Tailwind 가 찾을 수 있게 전체 클래스로 적는다
  tone: { idle: string; on: string };
  mode: "upload" | "api";
  hint: string;          // 클립 확보 방법
};

export const PLATFORMS: Platform[] = [
  {
    id: "veo_api",
    name: "Google Veo API (자동)",
    tagline: "스크립트 프롬프트로 클립 자동 생성",
    detail: "사내 렌더 워커가 Gemini API(Veo 3.1)로 샷별 클립을 생성해 바로 합성. 업로드 불필요, 종량제 비용 발생.",
    icon: "sparkles",
    tone: { idle: "bg-violet-50 text-violet-600", on: "bg-gradient-to-br from-violet-500 to-signal text-white shadow-sm shadow-violet-500/30" },
    mode: "api",
    hint: "GEMINI_API_KEY 필요 · 8초 클립당 $0.40~1.20",
  },
  {
    id: "veo_flow",
    name: "Google Veo (Flow)",
    tagline: "자연스러운 시네마틱 모션",
    detail: "Flow에서 샷 프롬프트로 생성 → 마음에 드는 클립만 다운로드 → 업로드. 구독 크레딧만 소모.",
    icon: "brand-google",
    tone: { idle: "bg-sky-50 text-sky-600", on: "bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-sm shadow-sky-500/30" },
    mode: "upload",
    hint: "labs.google/flow 에서 9:16 · 8초로 생성",
  },
  {
    id: "higgsfield",
    name: "Higgsfield",
    tagline: "제품 중심 디테일 최적화",
    detail: "Higgsfield DoP로 카메라 무빙 클립 생성 후 업로드. 이미지는 '이미지 생성' 탭에서 API로 바로 생성.",
    icon: "camera",
    tone: { idle: "bg-rose-50 text-rose-500", on: "bg-gradient-to-br from-rose-500 to-orange-500 text-white shadow-sm shadow-rose-500/30" },
    mode: "upload",
    hint: "higgsfield.ai 에서 9:16 생성 후 다운로드",
  },
  {
    id: "runway",
    name: "Runway Gen-3",
    tagline: "정교한 카메라 컨트롤",
    detail: "Gen-3 Alpha Turbo로 생성한 클립을 업로드. 이미지→영상 변환에 강점.",
    icon: "movie",
    tone: { idle: "bg-emerald-50 text-emerald-600", on: "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm shadow-emerald-500/30" },
    mode: "upload",
    hint: "app.runwayml.com 에서 9:16 생성",
  },
];

export const PLATFORM_BY_ID: Record<string, Platform> = Object.fromEntries(PLATFORMS.map((p) => [p.id, p]));

export function platformLabel(id: string | null | undefined): string {
  if (id === "photos") return "사진 렌더";
  if (id === "luma") return "Luma Dream Machine"; // 선택지에서 뺐지만 예전 작업 표시용
  return (id && PLATFORM_BY_ID[id]?.name) || "기타";
}

// Veo 3.1 (Gemini API) 모델·단가 — short-form/README.md 의 2026-09-07 확인값. 워커의 VEO_MODELS 와 동일하게 유지.
export type VeoModelId = "veo-3.1-lite-generate-preview" | "veo-3.1-fast-generate-preview" | "veo-3.1-generate-preview";

export const VEO_MODELS: { id: VeoModelId; label: string; resolutions: { id: "720p" | "1080p"; usdPerSec: number }[] }[] = [
  { id: "veo-3.1-lite-generate-preview", label: "Veo 3.1 Lite (저가 · 시안용)", resolutions: [{ id: "720p", usdPerSec: 0.05 }] },
  {
    id: "veo-3.1-fast-generate-preview",
    label: "Veo 3.1 Fast (권장)",
    resolutions: [
      { id: "720p", usdPerSec: 0.1 },
      { id: "1080p", usdPerSec: 0.15 },
    ],
  },
  { id: "veo-3.1-generate-preview", label: "Veo 3.1 Standard (최고 품질)", resolutions: [{ id: "1080p", usdPerSec: 0.4 }] },
];

// Veo 3.1 은 4·6·8초로 생성하고 1080p 는 8초만 된다. 장면보다 짧지 않은 가장 짧은 길이로 만들어 비용을 줄인다.
// 워커 render_worker.py veo_clip_seconds 와 동일하게 유지.
export function veoClipSeconds(sceneSeconds: number, resolution: string): 4 | 6 | 8 {
  if (resolution !== "720p") return 8;
  return sceneSeconds <= 4 ? 4 : sceneSeconds <= 6 ? 6 : 8;
}

export function veoUsdPerSec(model: string, resolution: string): number {
  const m = VEO_MODELS.find((v) => v.id === model);
  const r = m?.resolutions.find((x) => x.id === resolution) ?? m?.resolutions[0];
  return r?.usdPerSec ?? 0.1;
}
