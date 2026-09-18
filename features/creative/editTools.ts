// 이미지 수정 도구 — 업로드·생성한 이미지를 '어떤 도구로 고칠지'. 도구마다 프롬프트 형식이 달라 Claude가 형식을 맞춘다.
// api 가 있는 도구(Nano Banana 2 · GPT Image 2)는 옵션으로 '바로 수정'(편집 API 호출)까지 할 수 있다. 클라이언트·서버 공용.

export type EditToolId = "gemini" | "openai" | "higgsfield_web" | "midjourney" | "firefly" | "chatgpt" | "general";

export type EditTool = {
  id: EditToolId;
  name: string;
  icon: string;
  api?: "gemini" | "openai"; // 편집 API 로 바로 수정 가능
  guide: string;             // Claude 에게 주는 형식 지침
};

export const EDIT_TOOLS: EditTool[] = [
  {
    id: "gemini",
    name: "Nano Banana 2",
    icon: "brand-google",
    api: "gemini",
    guide:
      "Google Gemini 이미지 편집 모델. 원본 이미지와 함께 들어가는 편집 지시문을 쓴다. 영어 자연어 문단으로 '이 이미지에서 무엇을 어떻게 바꾸고 무엇은 그대로 둘지'를 구체적으로. 키워드 나열·파라미터 문법 금지. negative·params 는 빈 문자열.",
  },
  {
    id: "openai",
    name: "GPT Image 2",
    icon: "brand-openai",
    api: "openai",
    guide:
      "OpenAI 이미지 편집(images/edits). 원본 이미지와 함께 들어가는 영어 편집 지시문. 유지할 요소를 먼저 못박고(identical product shape, logo, colors…), 바꿀 요소를 순서대로 지시. 이미지 안 글자가 필요하면 정확한 문구를 따옴표로. negative·params 는 빈 문자열.",
  },
  {
    id: "higgsfield_web",
    name: "Higgsfield (웹)",
    icon: "camera",
    guide:
      "Higgsfield 웹(Soul 등)에서 원본을 참조 이미지로 넣고 쓰는 영어 프롬프트. 인물·패션 화보처럼 촬영 연출(렌즈, 조명, 앵글, 무드, 스타일링)을 구체적으로 묘사하는 문장형. negative 에 피해야 할 요소를 쉼표로, params 는 빈 문자열.",
  },
  {
    id: "midjourney",
    name: "Midjourney",
    icon: "sailboat",
    guide:
      "Midjourney 프롬프트. 영어 묘사를 쉼표로 이어 쓰고(피사체 → 배경 → 조명 → 스타일 → 카메라), 파라미터는 params 에 따로(--ar 비율, --style raw 등 널리 쓰이는 것만. 버전(--v)은 계정마다 달라 지정하지 않는다). 원본은 이미지 프롬프트/참조로 올려 쓴다고 howTo 에 안내. negative 는 --no 뒤에 올 단어들.",
  },
  {
    id: "firefly",
    name: "Adobe Firefly",
    icon: "flame",
    guide:
      "Adobe Firefly(생성형 채우기·참조 이미지). 영어 묘사 문장. 부분 수정이면 '어느 영역을 선택해 무엇으로 채울지'를 howTo 에 단계로 쓰고, prompt 는 그 영역에 들어갈 내용만. negative·params 는 빈 문자열.",
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    icon: "message-chatbot",
    guide: "ChatGPT 에 원본 이미지를 올리고 보내는 한국어 대화형 수정 요청. 유지할 것과 바꿀 것을 번호 목록으로 명확히. negative·params 는 빈 문자열.",
  },
  {
    id: "general",
    name: "범용",
    icon: "sparkles",
    guide: "대부분의 이미지 모델에 통하는 영어 프롬프트. 한 문단 묘사 + 유지 요소 명시. negative 에 피할 요소를 쉼표로, params 는 빈 문자열.",
  },
];

export const EDIT_TOOL_BY_ID: Record<string, EditTool> = Object.fromEntries(EDIT_TOOLS.map((t) => [t.id, t]));

export const EDIT_RATIOS = ["원본", "1:1", "4:5", "9:16", "16:9"] as const;

export type EditPromptResult = {
  title: string;       // 수정안 한 줄 제목
  analysis: string;    // 원본 이미지 파악 (한국어)
  keep: string[];      // 유지할 요소
  changes: string[];   // 바뀌는 점
  prompt: string;      // 도구용 프롬프트
  negative: string;    // 제외 요소 (도구가 지원하면)
  params: string;      // 파라미터 (Midjourney 등)
  howTo: string;       // 도구에서 쓰는 방법 (한국어)
};
