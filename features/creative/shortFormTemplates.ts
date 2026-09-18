// 합성 템플릿 정의 — short-form/ 의 렌더 스크립트와 1:1 대응 (워커 render_worker.py 의 TEMPLATES 와 id 동일).
//  - kind "clips":  샷별 영상 클립(업로드 또는 Veo API 생성) 위에 타이포·내레이션을 얹는다
//  - kind "photos": 제품 사진 여러 장을 Ken Burns·전환으로 엮고 타이포·내레이션을 얹는다
//  - scripted=true 인 템플릿은 브리프→AI 스크립트(장면·카피·내레이션·프롬프트)로 구성을 만들고,
//    false 인 템플릿(르무통 위크)은 샷·카피가 고정이라 copyFields 만 바꾼다.
// 르무통 샷 프롬프트는 lemouton_veo/veo_gen.py 의 SHOTS 와 동일하게 유지한다 (Flow 등에 붙여넣기용).

export type TemplateShot = {
  id: string;
  label: string;
  seconds: number;
  prompt: string;
  refs: string[];        // 레퍼런스 자산 파일명 (assets/*.jpg)
};

export type CopyField = { key: string; label: string; placeholder: string; defaultValue: string };

export type TemplateKind = "clips" | "photos";

export type ShortFormTemplate = {
  id: string;
  name: string;
  brand: string;              // 고정 템플릿은 브랜드명, 범용 템플릿은 "범용"
  kind: TemplateKind;
  scripted: boolean;          // true면 브리프→AI 스크립트로 장면 구성
  sceneCount: number;         // 고정 템플릿 샷 수 (scripted 는 길이 옵션 DURATION_PRESETS 가 장면 수를 정함)
  durationSec: number;        // 안내용 대략 길이
  description: string;
  shots: TemplateShot[];      // 고정 템플릿만 사용 (scripted는 script.scenes 가 샷)
  copyFields: CopyField[];    // 고정 템플릿만 사용
  narration: string[];        // 고정 템플릿만 사용
  minAssets?: number;         // photos: 최소 사진 수
  maxAssets?: number;
};

const STYLE =
  "Shot on a cinema camera, shallow depth of field, natural color grading, premium footwear commercial. " +
  "No on-screen text, no logos, no captions, no watermark.";

export const TEMPLATES: ShortFormTemplate[] = [
  {
    id: "veo_promo",
    name: "AI 영상 프로모 (브리프 → 스크립트 → 클립)",
    brand: "범용",
    kind: "clips",
    scripted: true,
    sceneCount: 4,
    durationSec: 36,
    description:
      "브리프를 넣으면 15·30·45초 중 길이를 고르면 Claude가 후킹→공감·해결→증명→혜택·CTA 스토리의 장면별 카피·내레이션·영상 프롬프트를 씁니다. 클립은 Veo API로 자동 생성하거나 Flow 등에서 만들어 올립니다.",
    shots: [],
    copyFields: [],
    narration: [],
  },
  {
    id: "photo_promo",
    name: "제품 사진 프로모 (사진 → 모션그래픽)",
    brand: "범용",
    kind: "photos",
    scripted: true,
    sceneCount: 4,
    durationSec: 24,
    description:
      "제품·브랜드 사진 4~12장을 올리면 Claude가 쓴 장면 카피와 내레이션에 맞춰 줌·전환·타이포를 입힙니다. 영상 생성 API 없이 사진만으로 만들어 종량제 비용 $0.",
    shots: [],
    copyFields: [],
    narration: [],
    minAssets: 4,
    maxAssets: 12,
  },
  {
    id: "lemouton_veo",
    name: "르무통 위크 프로모 (Veo 배경 합성)",
    brand: "Le Mouton",
    kind: "clips",
    scripted: false,
    sceneCount: 8,
    durationSec: 37.2,
    description:
      "8개 배경 클립 위에 후킹 → 메리노 울 소재 → 후기 → 위크 혜택 → CTA 타이포와 내레이션을 얹는 세로형 템플릿. 클립만 바꾸면 같은 구성으로 재생산.",
    copyFields: [
      { key: "discount_line", label: "혜택 문구", placeholder: "예) 최대 40% 할인", defaultValue: "역대급 혜택 · 최대 할인" },
      { key: "week_days", label: "기간 문구", placeholder: "예) 단 7일", defaultValue: "단 7일" },
    ],
    narration: [
      "오늘도, 발바닥이 터질 것 같나요?",
      "하루 종일 걸어도 피곤하지 않은 인생 신발의 비밀, 바로 프리미엄 메리노 울입니다.",
      "이미 수많은 리뷰가 증명하는 압도적인 편안함. 이제 당신이 직접 경험할 차례입니다.",
      "단 일주일, 절대 놓칠 수 없는 역대급 혜택의 르무통 위크가 드디어 열렸습니다.",
      "인기 사이즈가 빠르게 소진되고 있습니다. 지금 바로 하단 링크를 눌러, 당신의 지친 발에 완벽한 휴식을 선물하세요!",
    ],
    shots: [
      {
        id: "hook_feet", label: "후킹 · 아픈 발", seconds: 8, refs: [],
        prompt:
          "Vertical 9:16. Late night office, dim with cool blue monitor glow. Under a desk, a woman in business attire slips off a stiff black high heel and rubs her aching foot, a red mark on the heel. Slow push-in, moody and tired atmosphere, realistic. " + STYLE,
      },
      {
        id: "cloud_walk", label: "구름 위를 걷는 발", seconds: 8, refs: ["shoe_navy"],
        prompt:
          "Vertical 9:16. Bright cream studio flooded with soft daylight. Low-angle tracking shot of feet wearing navy wool sneakers with thick white soles, walking on a floor of fluffy white clouds. Small puffs of cloud drift up with each step. Dreamy, weightless, joyful, gentle slow motion. " + STYLE,
      },
      {
        id: "squeeze_wool", label: "울 소재 클로즈업", seconds: 8, refs: ["squeeze", "wool"],
        prompt:
          "Vertical 9:16. Macro studio shot on a warm cream background. Two hands gently twist and squeeze a soft brown wool sneaker, the shoe bending like a pillow and springing back. Then the camera racks focus to an extreme close-up of fluffy cream merino wool fibers catching the light. " + STYLE,
      },
      {
        id: "barefoot_cross", label: "맨발 횡단보도", seconds: 8, refs: ["shoe_navy"],
        prompt:
          "Vertical 9:16. Sunny city crosswalk, warm afternoon light. Ankle-level tracking shot of a person in dark shorts wearing navy wool sneakers with no socks, striding lightly across the zebra crossing. Feet look weightless, easy and relaxed. Gentle slow motion. " + STYLE,
      },
      {
        id: "travel_walk", label: "여행 · 걷기", seconds: 8, refs: ["shoe_pair"],
        prompt:
          "Vertical 9:16. Golden hour in a European old town, cobblestone street. A young woman with a small backpack walks toward the camera wearing beige wool sneakers, cheerful and relaxed, camera slowly tracking backward. Feels like an effortless day of walking. " + STYLE,
      },
      {
        id: "parents_hike", label: "부모님 산책", seconds: 8, refs: ["shoe_green"],
        prompt:
          "Vertical 9:16. Autumn mountain trail with fallen leaves. A smiling middle-aged couple walks a gentle path wearing olive and grey wool sneakers, comfortable and unhurried. Low tracking shot that tilts up to their faces, warm afternoon light. " + STYLE,
      },
      {
        id: "product_hero", label: "제품 히어로", seconds: 8, refs: ["shoe_pair"],
        prompt:
          "Vertical 9:16. Minimal cream studio. A pair of navy and beige wool sneakers with white soles rests on a soft round pedestal and slowly rotates. Soft shadows, warm rim light, elegant and premium product commercial. " + STYLE,
      },
      {
        id: "cta_hold", label: "CTA · 제품 들기", seconds: 8, refs: ["shoe_grey"],
        prompt:
          "Vertical 9:16. Bright clean studio. A smiling young woman in a light mint jacket holds up a pair of grey wool sneakers toward the camera, then laughs playfully. Medium shot, friendly and energetic. " + STYLE,
      },
    ],
  },
];

export const TEMPLATE_BY_ID: Record<string, ShortFormTemplate> = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));
