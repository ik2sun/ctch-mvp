// 예산 동기화(1-Click Sync) 계획·결과 — 화면과 /api/media-mix/sync 공용 타입

// 예산을 가진 단위 — 메타 CBO 캠페인 / ABO 광고세트, 네이버 SA 캠페인
export type BudgetUnit = {
  id: string;
  name: string;
  level: "campaign" | "adset";
  currentDaily: number; // 원(계정 통화)
  newDaily: number;
};

export type MediaSyncPlan = {
  key: string;
  label: string;
  supported: boolean; // 예산 변경 API 연동 여부
  targetDaily: number; // 화면이 요청한 매체 일 예산
  units: BudgetUnit[];
  skipped: { name: string; reason: string }[]; // 바꾸지 않는 단위(총 예산형·예산 제한 없음 등)
  note?: string;
  error?: string;
};

export type UnitResult = { id: string; name: string; ok: boolean; before: number; after: number; error?: string };
export type MediaSyncResult = { key: string; label: string; results: UnitResult[]; error?: string };
