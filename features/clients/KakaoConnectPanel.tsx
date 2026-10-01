"use client";

// 광고주 관리 > 매체 연동 > 카카오모먼트 탭 — API 키 입력이 아니라 카카오 계정 OAuth 연결 + 광고계정 선택 방식
import { useCallback, useEffect, useRef, useState } from "react";

type AdAccount = { id: string; name: string; memberType: string | null; status: string | null };
type Status = {
  linked: boolean;
  configured: boolean;
  adAccountId: string | null;
  linkedAt: string | null;
  refreshExpiresAt: string | null;
  accounts: AdAccount[];
  error?: string;
  expired?: boolean;
};

export function KakaoConnectPanel({ clientId, onChanged }: { clientId: string | null; onChanged?: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pick, setPick] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  // 광고주 전환 시 이전 광고주 응답이 늦게 와서 덮어쓰지 않도록 마지막 요청만 반영
  const reqSeq = useRef(0);
  const load = useCallback(async () => {
    if (!clientId) return;
    const seq = ++reqSeq.current;
    setLoading(true);
    try {
      const res = await fetch(`/api/kakao-moment/ad-accounts?clientId=${clientId}`);
      const json = (await res.json()) as Status & { error?: string };
      if (seq !== reqSeq.current) return;
      if (!res.ok) throw new Error(json.error || "상태를 불러오지 못했어요.");
      setStatus(json);
      setPick(json.adAccountId ?? (json.accounts.length === 1 ? json.accounts[0].id : ""));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "오류가 발생했어요.");
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    // 광고주가 바뀌면 이전 광고주 상태를 먼저 지운다
    setStatus(null);
    setMsg(null);
    setPick("");
    load();
  }, [load]);

  async function saveAccount() {
    if (!clientId || !pick) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/kakao-moment/ad-accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, adAccountId: pick }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "저장에 실패했어요.");
      setMsg("광고계정을 저장했어요.");
      await load();
      onChanged?.();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "오류가 발생했어요.");
    } finally {
      setSaving(false);
    }
  }

  async function unlink() {
    if (!clientId || !confirm("카카오 연결을 해제할까요? 저장된 토큰과 광고계정 선택이 지워져요.")) return;
    setSaving(true);
    try {
      await fetch(`/api/kakao-moment/ad-accounts?clientId=${clientId}`, { method: "DELETE" });
      setMsg("연결을 해제했어요.");
      await load();
      onChanged?.();
    } finally {
      setSaving(false);
    }
  }

  if (!clientId) {
    return (
      <div className="rounded-lg border border-dashed border-line bg-surface p-3.5 text-[13px] text-ink-muted">
        광고주를 먼저 등록한 뒤, 목록에서 <span className="font-medium text-ink">수정</span>을 눌러 카카오 계정을 연결할 수 있어요. (연결 과정에서 카카오 로그인 페이지로 이동해요)
      </div>
    );
  }

  const connectHref = `/api/kakao-moment/oauth/start?clientId=${clientId}`;
  const linked = status?.linked ?? false;
  const selectedName = status?.accounts.find((a) => a.id === status.adAccountId)?.name;

  return (
    <div className="space-y-3">
      {status && !status.configured && (
        <p className="rounded-lg border border-warn/30 bg-warn/5 px-3.5 py-2.5 text-[13px] text-warn">
          서버에 KAKAO_REST_API_KEY가 없어요. 카카오디벨로퍼스 앱의 REST API 키·Client Secret을 .env.local에 넣고 Redirect URI를 등록해야 연결할 수 있어요.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3.5 py-3">
        <div className="text-[13px]">
          {loading && !status ? (
            <span className="text-ink-muted">상태 확인 중…</span>
          ) : linked ? (
            <>
              <span className="font-medium text-good">
                <i className="ti ti-circle-check mr-1" aria-hidden />
                카카오 계정 연결됨
              </span>
              <span className="ml-2 text-ink-muted">
                {status?.linkedAt && `연결 ${new Date(status.linkedAt).toLocaleDateString("ko-KR")}`}
              </span>
              {status?.adAccountId ? (
                <span className="ml-2 text-ink">
                  광고계정 <span className="font-mono">{status.adAccountId}</span>
                  {selectedName && ` (${selectedName})`}
                </span>
              ) : (
                <span className="ml-2 text-warn">광고계정을 아직 선택하지 않았어요</span>
              )}
            </>
          ) : (
            <span className="text-ink-muted">
              <i className="ti ti-circle-dashed mr-1" aria-hidden />
              카카오 계정 미연결
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <a href={connectHref} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#FEE500] px-3 text-[13px] font-medium text-[#191919] hover:brightness-95">
            <i className="ti ti-message-circle text-[15px]" aria-hidden />
            {linked ? "다시 연결" : "카카오 계정으로 연결"}
          </a>
          {linked && (
            <button type="button" onClick={unlink} disabled={saving} className="inline-flex h-8 items-center rounded-lg border border-line px-3 text-[13px] text-ink-soft hover:border-ink-faint">
              연결 해제
            </button>
          )}
        </div>
      </div>

      {status?.error && (
        <p className={`rounded-lg border px-3.5 py-2.5 text-[13px] ${status.expired ? "border-warn/30 bg-warn/5 text-warn" : "border-bad/20 bg-bad/5 text-bad"}`}>{status.error}</p>
      )}

      {linked && (
        <div className="rounded-lg border border-line bg-surface p-3.5">
          <label className="mb-1.5 block text-[13px] font-medium text-ink-soft">카카오모먼트 광고계정 {status?.accounts.length ? `(${status.accounts.length}개 접근 가능)` : ""}</label>
          <div className="flex flex-wrap items-center gap-2">
            {status?.accounts.length ? (
              <select value={pick} onChange={(e) => setPick(e.target.value)} className="field h-9 min-w-[260px] flex-1 text-[15px]">
                <option value="">광고계정 선택</option>
                {status.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.id}
                    {a.memberType ? ` · ${a.memberType}` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <input value={pick} onChange={(e) => setPick(e.target.value.replace(/\D/g, ""))} placeholder="광고계정 번호 직접 입력 (카카오모먼트 관리자 URL의 숫자)" className="field h-9 min-w-[260px] flex-1 font-mono text-[15px]" />
            )}
            <button type="button" onClick={saveAccount} disabled={saving || !pick} className="btn-signal h-9 px-3 text-[15px]">
              {saving ? "저장 중…" : "광고계정 저장"}
            </button>
            <button type="button" onClick={load} disabled={loading} className="btn-ghost h-9 px-3 text-[15px]">
              <i className={`ti ${loading ? "ti-loader-2 animate-spin" : "ti-refresh"} text-[15px]`} aria-hidden />
            </button>
          </div>
          {!status?.accounts.length && !status?.error && (
            <p className="mt-1.5 text-[13px] text-ink-muted">접근 가능한 광고계정 목록이 비어 있어요. 연결한 카카오계정이 카카오모먼트 광고계정의 멤버(마스터/멤버)인지 확인하세요.</p>
          )}
        </div>
      )}

      {msg && <p className="text-[13px] text-ink-soft">{msg}</p>}

      <details className="rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[13px] text-ink-soft">
        <summary className="cursor-pointer font-medium text-ink-soft">연동 방법 (처음 한 번)</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            <b>카카오디벨로퍼스</b>(developers.kakao.com) → 내 애플리케이션 → 앱 생성 → <b>비즈 앱 전환</b>(사업자 정보 등록) → 앱 소유자 카카오계정 본인인증.
          </li>
          <li>
            앱 → <b>카카오모먼트</b> 메뉴 → <b>사용 권한 신청</b>(카카오 검수, 영업일 기준 수일). 승인 전에는 API가 403으로 거절돼요.
          </li>
          <li>
            앱 → 플랫폼 키 → REST API 키 → <b>비즈니스 인증 리다이렉트 URI</b>에 <span className="font-mono">{typeof window !== "undefined" ? `${window.location.origin}/api/kakao-moment/oauth/callback` : "/api/kakao-moment/oauth/callback"}</span> 등록. 같은 화면 클라이언트 시크릿의 <b>비즈니스 인증</b> 코드를 사용(카카오 로그인 코드와 다름).
          </li>
          <li>
            서버 <span className="font-mono">.env.local</span>에 <span className="font-mono">KAKAO_REST_API_KEY</span>, <span className="font-mono">KAKAO_BUSINESS_CLIENT_SECRET</span>(비즈니스 인증 시크릿), 배포 도메인(<span className="font-mono">NEXT_PUBLIC_SITE_URL</span>) 설정 후 재시작.
          </li>
          <li>
            Supabase SQL Editor에서 <span className="font-mono">supabase/migrations/0013_kakao_moment.sql</span> 실행(컬럼 추가).
          </li>
          <li>
            이 화면에서 <b>카카오 계정으로 연결</b> → 광고계정 멤버인 카카오계정으로 로그인·동의 → 돌아와서 <b>광고계정 선택 → 저장</b>. 비즈니스 토큰은 오래 쓰지 않으면 만료되니, "토큰이 유효하지 않아요"가 나오면 다시 연결하세요.
          </li>
        </ol>
      </details>
    </div>
  );
}
