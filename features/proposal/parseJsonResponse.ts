// Claude가 텍스트 앞뒤에 설명이나 코드펜스를 덧붙이는 경우를 방어적으로 처리하고 JSON만 추출
export function parseJsonResponse<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("AI 응답에서 JSON을 찾지 못했어요.");
  }
  return JSON.parse(candidate.slice(start, end + 1)) as T;
}
