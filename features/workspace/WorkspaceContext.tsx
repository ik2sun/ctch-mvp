"use client";

// 워크스페이스 권한 — 소유자(k2s@nmg.co.kr)만 저장·수정·삭제, 그 밖의 @nmg.co.kr 계정은 보기 전용.
// 실제 차단은 RLS(0021)·서버 라우트(lib/workspace.ts ownerOnly)가 하고, 여기서는 화면에서 관리 버튼을 숨기거나 막는다.
import { createContext, useContext } from "react";

const WorkspaceContext = createContext<{ canEdit: boolean }>({ canEdit: false });

export function WorkspaceProvider({ canEdit, children }: { canEdit: boolean; children: React.ReactNode }) {
  return <WorkspaceContext.Provider value={{ canEdit }}>{children}</WorkspaceContext.Provider>;
}

export function useCanEdit(): boolean {
  return useContext(WorkspaceContext).canEdit;
}

// 보기 전용이면 안쪽 입력·버튼을 모두 비활성화(fieldset disabled) + 안내 한 줄
export function EditGate({ children, note = true }: { children: React.ReactNode; note?: boolean }) {
  const canEdit = useCanEdit();
  if (canEdit) return <>{children}</>;
  return (
    <>
      {note && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-line bg-canvas px-4 py-3 text-[15px] text-ink-soft">
          <i className="ti ti-eye text-[17px] text-ink-muted" aria-hidden />
          보기 전용 계정이에요. 저장·수정·삭제는 관리자(k2s)만 할 수 있어요.
        </p>
      )}
      <fieldset disabled className="min-w-0 [&_button]:cursor-not-allowed">
        {children}
      </fieldset>
    </>
  );
}
