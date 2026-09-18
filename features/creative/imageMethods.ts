// 이미지 생성 방법 — 소재 생성 > 이미지 생성 탭의 선택지. 클라이언트·서버 공용(키 값은 담지 않는다).
//  - mode "api":    서버 route(/api/creative/generate-image)가 각 API로 생성해 저장. 종량제 비용 발생
//  - mode "upload": 이미지를 올리고, 원하면 수정 요청을 적어 도구별 수정 프롬프트를 만든다(ImageEditor). 업로드 자체는 비용 없음
// 생성 결과는 creatives 테이블에 저장하고 model 컬럼에 "<method>:<model>" 형태로 출처를 남긴다.

export type ImageMethodId = "higgsfield" | "gemini" | "openai" | "upload";

export type ImageMethod = {
  id: ImageMethodId;
  name: string;
  model: string;         // API 모델 id (upload 는 빈 문자열)
  tagline: string;
  detail: string;
  icon: string;          // tabler icon
  mode: "api" | "upload";
  envKey?: string;       // 서버에 필요한 환경변수
  ratios: string[];      // 지원 비율 (Higgsfield 는 기존에 쓰던 값만 — 4:5 지원 미확인)
};

export const IMAGE_METHODS: ImageMethod[] = [
  {
    id: "higgsfield",
    name: "Higgsfield Soul",
    model: "higgsfield-ai/soul/standard",
    tagline: "패션·인물 화보 톤",
    detail: "사진 같은 인물·패션 룩에 강해요. Higgsfield 계정 크레딧 차감.",
    icon: "camera",
    mode: "api",
    envKey: "HIGGSFIELD_API_KEY",
    ratios: ["1:1", "4:3", "9:16", "16:9"],
  },
  {
    id: "gemini",
    name: "Google Nano Banana 2",
    model: "gemini-3.1-flash-image",
    tagline: "빠르고 제품 묘사가 정확",
    detail: "Gemini API 이미지 모델. 제품·배경 합성과 한글 문구 표현이 비교적 안정적이에요. 종량제.",
    icon: "brand-google",
    mode: "api",
    envKey: "GEMINI_API_KEY",
    ratios: ["1:1", "4:5", "9:16", "16:9"],
  },
  {
    id: "openai",
    name: "OpenAI GPT Image 2",
    model: "gpt-image-2",
    tagline: "지시 이행·텍스트 렌더링",
    detail: "긴 프롬프트의 세부 지시를 잘 따르고 이미지 속 글자 표현에 강해요. 생성이 느린 편, 종량제.",
    icon: "brand-openai",
    mode: "api",
    envKey: "OPENAI_API_KEY",
    ratios: ["1:1", "4:5", "9:16", "16:9"],
  },
  {
    id: "upload",
    name: "이미지 업로드 · 수정",
    model: "",
    tagline: "올린 이미지로 수정 프롬프트 만들기",
    detail: "이미지를 올리고 바꾸고 싶은 내용을 적으면 AI가 이미지를 보고 고른 도구에 맞는 수정 프롬프트를 만들어요. Nano Banana 2·GPT Image 2는 옵션으로 바로 수정까지 돼요.",
    icon: "upload",
    mode: "upload",
    ratios: [],
  },
];

export const IMAGE_METHOD_BY_ID: Record<string, ImageMethod> = Object.fromEntries(IMAGE_METHODS.map((m) => [m.id, m]));

// creatives.model 값 → 카드에 보일 출처 라벨. 예전 데이터(model 에 higgsfield 모델 id만 있음)도 처리한다.
export function creativeSourceLabel(model: string | null | undefined): string {
  if (!model) return "기타";
  if (model === "upload") return "업로드";
  const i = model.indexOf(":");
  const [method, rest] = i >= 0 ? [model.slice(0, i), model.slice(i + 1)] : [model.startsWith("higgsfield") ? "higgsfield" : "", model];
  if (method === "upload") return rest || "업로드";
  if (method === "edit") return `광고 소재 · ${rest}`;
  return IMAGE_METHOD_BY_ID[method]?.name ?? rest ?? model;
}
