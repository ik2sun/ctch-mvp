// 서버 라우트와 브라우저에서 함께 쓰는 순수 함수 (supabase 클라이언트를 import 하지 않는다)

// 메타 광고계정 ID — 숫자만(act_ 접두어는 있어도 없어도 됨). 이메일·URL 등 잘못된 값은 거절.
export function normalizeMetaAccountId(raw: string): { ok: true; value: string | null } | { ok: false; error: string } {
  const v = raw.trim();
  if (!v) return { ok: true, value: null };
  const m = /act=(\d+)/.exec(v); // 광고 관리자 URL을 통째로 붙여넣은 경우
  const digits = m ? m[1] : v.replace(/^act_/, "");
  if (!/^\d{6,20}$/.test(digits)) {
    return { ok: false, error: "메타 광고계정 ID는 숫자만 입력하세요. 광고 관리자 URL의 act= 뒤 숫자예요." };
  }
  return { ok: true, value: `act_${digits}` };
}
