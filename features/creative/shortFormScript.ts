// 숏폼 스크립트 — AI(Claude)가 브리프에서 생성하고 사용자가 편집한 뒤 워커가 렌더에 쓰는 공용 구조.
// 워커(short-form/worker/render_worker.py)와 템플릿 렌더 스크립트(short-form/templates/*)가 같은 JSON을 읽는다.

export type SceneRole = "hook" | "benefit" | "proof" | "offer" | "cta";

export const SCENE_ROLE_LABEL: Record<SceneRole, string> = {
  hook: "후킹",
  benefit: "공감·해결",
  proof: "증명·후기",
  offer: "혜택·CTA",
  cta: "행동 유도",
};

export type ScriptScene = {
  id: string;            // 샷 id (클립 파일명·Veo 프롬프트 키로 쓰임)
  role: SceneRole;
  visual: string;        // 화면 묘사 (어떤 상황·컷을 보여줄지, 한국어)
  kicker: string;        // 상단 작은 라벨 (예: "THE SECRET")
  headline: string;      // 큰 카피, 줄바꿈은 \n
  sub: string;           // 보조 문장
  narration: string;     // 내레이션(TTS) 1~2문장
  seconds: number;       // 화면에 머무는 길이(초). 길이 옵션(DURATION_PRESETS)의 장면 계획에서 정해진다
  prompt: string;        // 영상 생성 프롬프트(영문). 사진형은 빈 문자열
};

export type ShortFormScript = {
  brand: string;
  title: string;
  concept: string;       // 기획 의도·스토리라인 요약 (문제 제기 → 공감 → 제품 해결, 3줄 이내)
  scenes: ScriptScene[];
  cta: { headline: string; sub: string; badge: string };
  voice: string;         // edge-tts 음성 id
  targetSeconds?: number; // 선택한 목표 길이(초)
  endSeconds?: number;    // CTA 엔드카드 길이(초). 워커 build_timeline 이 읽는다 (없으면 4)
};

export type ShortFormBrief = {
  brand: string;
  product: string;
  audience: string;
  benefit: string;
  offer: string;
  cta: string;
  tone: string;
  notes: string;
};

export const EMPTY_BRIEF: ShortFormBrief = {
  brand: "",
  product: "",
  audience: "",
  benefit: "",
  offer: "",
  cta: "",
  tone: "",
  notes: "",
};

export const BRIEF_FIELDS: { key: keyof ShortFormBrief; label: string; placeholder: string; required?: boolean; multiline?: boolean }[] = [
  { key: "brand", label: "브랜드명", placeholder: "예) 르무통", required: true },
  { key: "product", label: "제품·서비스", placeholder: "예) 메리노 울 스니커즈", required: true },
  { key: "audience", label: "타깃", placeholder: "예) 하루 종일 서서 일하는 30~40대 직장인 — 퇴근길 발이 붓고 아픔" },
  { key: "benefit", label: "핵심 강점", placeholder: "예) 맨발로 신어도 안 까지는 편안함, 세탁기 세탁 가능", required: true, multiline: true },
  { key: "offer", label: "프로모션·혜택", placeholder: "예) 르무통 위크 최대 40% 할인, 9/20까지" },
  { key: "cta", label: "행동 유도", placeholder: "예) 하단 링크에서 구매하기" },
  { key: "tone", label: "톤앤매너", placeholder: "예) 따뜻하고 신뢰감 있게, 과장 없이" },
  { key: "notes", label: "참고 사항", placeholder: "예) 실제 후기 인용 가능, 가격 언급 금지", multiline: true },
];

export const VOICES: { id: string; label: string }[] = [
  { id: "ko-KR-InJoonNeural", label: "인준 (남성 · 차분)" },
  { id: "ko-KR-SunHiNeural", label: "선히 (여성 · 밝음)" },
  { id: "ko-KR-HyunsuMultilingualNeural", label: "현수 (남성 · 다국어)" },
];

export const CLIP_SECONDS = 8; // 클립 1개 최대 길이 (Veo 생성 단위)

// 숏폼 길이 옵션 — 첫 생성 때 고른다. 장면 계획(beats)이 AI 스크립트의 장면 수·역할·길이가 된다.
// 합계 = beats 초 + 엔드카드 초. 장면당 8초(클립 1개) 이하.
export type DurationBeat = { role: SceneRole; seconds: number; stage: string; guide: string };
export type DurationPreset = {
  seconds: 15 | 30 | 45;
  name: string;
  fit: string;
  recommended?: boolean;
  endSeconds: number;
  beats: DurationBeat[];
};

export const DURATION_PRESETS: DurationPreset[] = [
  {
    seconds: 15,
    name: "임팩트형",
    fit: "리타겟팅·재구매 · 후킹부터 혜택까지 한 호흡",
    endSeconds: 3,
    beats: [
      { role: "hook", seconds: 3, stage: "Hook", guide: "타깃이 멈출 수밖에 없는 불편한 순간 + 찌르는 첫 문장" },
      { role: "benefit", seconds: 4, stage: "Agitation & Solution", guide: "공감 한마디 후 곧바로 핵심 강점 하나로 해결" },
      { role: "proof", seconds: 2, stage: "Proof", guide: "한눈에 보이는 시각 증명 한 컷" },
      { role: "offer", seconds: 3, stage: "Offer & CTA", guide: "혜택 강조 + 행동 유도" },
    ],
  },
  {
    seconds: 30,
    name: "스토리형",
    fit: "신규 고객 설득 · 문제→해결 서사가 가장 잘 사는 길이",
    recommended: true,
    endSeconds: 4,
    beats: [
      { role: "hook", seconds: 3, stage: "Hook", guide: "타깃이 멈출 수밖에 없는 불편한 순간 + 찌르는 첫 문장" },
      { role: "benefit", seconds: 5, stage: "Agitation", guide: "그 불편함을 한 번 더 파고들어 공감 (이거 나만 그래?). 제품은 아직" },
      { role: "benefit", seconds: 6, stage: "Solution", guide: "핵심 강점을 해결책으로 등장시켜 무엇이 달라지는지 보여줌" },
      { role: "proof", seconds: 6, stage: "Proof", guide: "비교·테스트·디테일 클로즈업 또는 실제 후기 인용" },
      { role: "offer", seconds: 6, stage: "Offer & CTA", guide: "혜택 강조 + 행동 유도" },
    ],
  },
  {
    seconds: 45,
    name: "상세형",
    fit: "고관여·고가 제품 · 사용 장면과 후기를 충분히",
    endSeconds: 4,
    beats: [
      { role: "hook", seconds: 3, stage: "Hook", guide: "타깃이 멈출 수밖에 없는 불편한 순간 + 찌르는 첫 문장" },
      { role: "benefit", seconds: 6, stage: "Agitation", guide: "그 불편함이 일상에서 반복되는 장면으로 공감 심화. 제품은 아직" },
      { role: "benefit", seconds: 7, stage: "Solution", guide: "핵심 강점을 해결책으로 등장" },
      { role: "benefit", seconds: 6, stage: "Solution · 사용 장면", guide: "실제로 쓰는 장면에서 달라진 일상을 보여줌" },
      { role: "proof", seconds: 6, stage: "Proof · 시각 증명", guide: "비교·테스트·디테일 클로즈업" },
      { role: "proof", seconds: 6, stage: "Proof · 후기", guide: "실제 후기 인용 (브리프·참고 사항에 있을 때만, 없으면 다른 확인 가능한 특성)" },
      { role: "offer", seconds: 7, stage: "Offer & CTA", guide: "혜택 강조 + 행동 유도" },
    ],
  },
];

export const DEFAULT_DURATION: DurationPreset["seconds"] = 30;

export function durationPreset(seconds: unknown): DurationPreset {
  return DURATION_PRESETS.find((p) => p.seconds === Number(seconds)) ?? DURATION_PRESETS.find((p) => p.seconds === DEFAULT_DURATION)!;
}

// 내레이션 글자 수 상한 — edge-tts 한국어가 초당 약 6.5자(공백 포함), 장면 전환 여유 0.9초
export function narrationBudget(seconds: number): number {
  return Math.max(8, Math.floor((seconds - 0.9) * 6.5));
}

// Claude 구조화 출력용 JSON 스키마 (enum은 문법 크기 문제로 넣지 않고 코드에서 정규화)
export const SCRIPT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["brand", "title", "concept", "scenes", "cta"],
  properties: {
    brand: { type: "string" },
    title: { type: "string" },
    concept: { type: "string" },
    scenes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "role", "visual", "kicker", "headline", "sub", "narration", "seconds", "prompt"],
        properties: {
          id: { type: "string" },
          role: { type: "string" },
          visual: { type: "string" },
          kicker: { type: "string" },
          headline: { type: "string" },
          sub: { type: "string" },
          narration: { type: "string" },
          seconds: { type: "number" },
          prompt: { type: "string" },
        },
      },
    },
    cta: {
      type: "object",
      additionalProperties: false,
      required: ["headline", "sub", "badge"],
      properties: { headline: { type: "string" }, sub: { type: "string" }, badge: { type: "string" } },
    },
  },
} as const;

const ROLES: SceneRole[] = ["hook", "benefit", "proof", "offer", "cta"];

function slug(s: string, i: number): string {
  const base = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  return base || `scene_${i + 1}`;
}

// 모델 출력·사용자 편집 결과를 워커가 기대하는 형태로 정리한다.
export function normalizeScript(raw: unknown, opts: { kind: "clips" | "photos"; voice?: string }): ShortFormScript {
  const r = (raw ?? {}) as Partial<ShortFormScript> & { scenes?: Partial<ScriptScene>[] };
  const seen = new Set<string>();
  const scenes: ScriptScene[] = (Array.isArray(r.scenes) ? r.scenes : []).map((s, i) => {
    let id = slug(String(s.id ?? ""), i);
    while (seen.has(id)) id = `${id}_${i + 1}`;
    seen.add(id);
    const role = ROLES.includes(s.role as SceneRole) ? (s.role as SceneRole) : i === 0 ? "hook" : "benefit";
    const seconds = Math.min(opts.kind === "clips" ? CLIP_SECONDS : 12, Math.max(2, Number(s.seconds) || 6));
    return {
      id,
      role,
      visual: String(s.visual ?? "").trim(),
      kicker: String(s.kicker ?? "").trim(),
      headline: String(s.headline ?? "").trim(),
      sub: String(s.sub ?? "").trim(),
      narration: String(s.narration ?? "").trim(),
      seconds,
      prompt: opts.kind === "clips" ? String(s.prompt ?? "").trim() : "",
    };
  });
  return {
    brand: String(r.brand ?? "").trim(),
    title: String(r.title ?? "").trim(),
    concept: String(r.concept ?? "").trim(),
    scenes,
    cta: {
      headline: String(r.cta?.headline ?? "").trim(),
      sub: String(r.cta?.sub ?? "").trim(),
      badge: String(r.cta?.badge ?? "").trim(),
    },
    voice: opts.voice || r.voice || VOICES[0].id,
    ...(r.targetSeconds ? { targetSeconds: Number(r.targetSeconds) } : {}),
    ...(r.endSeconds ? { endSeconds: Number(r.endSeconds) } : {}),
  };
}

export function scriptDurationSec(script: ShortFormScript): number {
  return script.scenes.reduce((a, s) => a + s.seconds, 0) + (script.endSeconds ?? 4); // + CTA 엔드카드
}
