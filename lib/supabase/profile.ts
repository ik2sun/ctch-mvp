export type Status = "pending" | "approved" | "rejected";
export type Role = "superadmin" | "admin" | "manager" | "viewer";

// 승인 시/역할 변경 시 UI에서 고를 수 있는 역할 — superadmin은 SUPERADMIN_EMAIL 부트스트랩으로만 부여
export const ASSIGNABLE_ROLES: Role[] = ["admin", "manager", "viewer"];

export const ROLE_LABEL: Record<Role, string> = {
  superadmin: "최고관리자",
  admin: "관리자",
  manager: "매니저",
  viewer: "뷰어",
};
