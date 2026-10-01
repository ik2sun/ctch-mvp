// 워크스페이스 이메일 판정 — 순수 함수만(미들웨어·edge에서도 import 가능). 서버 전용 기능은 lib/workspace.ts
export const WORKSPACE_DOMAIN = "nmg.co.kr";

export function ownerEmail(): string {
  return (process.env.SUPERADMIN_EMAIL ?? "").trim().toLowerCase();
}

export function isOwnerEmail(email: string | null | undefined): boolean {
  const owner = ownerEmail();
  return !!owner && (email ?? "").trim().toLowerCase() === owner;
}

export function isWorkspaceEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase().endsWith(`@${WORKSPACE_DOMAIN}`);
}
