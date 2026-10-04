"use client";

// 입찰 시뮬레이터 입력부 — 2단: 좌측 폼(매체·기기 다중 선택 칩 → 세로로 긴 키워드 입력 → 시뮬레이션) / 우측 안내(최근 시뮬레이션·입력 팁).
// 키워드는 짧아서 입력창 폭을 줄이고(최대 680px) 높이를 늘려 20개를 한눈에 본다.
import { MEDIA_COLORS } from "@/features/dashboard/analysis";

export type MediaKey = "naver" | "google";
export type DeviceKey = "MOBILE" | "PC";
export type HistoryItem = { at: string; keywords: string[]; media: MediaKey[]; devices: DeviceKey[] };

const MEDIA_OPTS: { key: MediaKey; label: string; color: string }[] = [
  { key: "naver", label: "네이버 SA", color: MEDIA_COLORS.naver },
  { key: "google", label: "구글 Ads", color: MEDIA_COLORS.google_ads },
];
const DEVICE_OPTS: { key: DeviceKey; label: string; icon: string }[] = [
  { key: "MOBILE", label: "모바일", icon: "device-mobile" },
  { key: "PC", label: "PC", icon: "device-desktop" },
];

// 둥근 토글 칩 — 체크 표시는 글자(✓)로도 써서 아이콘 폰트가 없어도 상태가 읽힌다
function ToggleChip({ on, label, onClick, dot, icon, disabled }: { on: boolean; label: string; onClick: () => void; dot?: string; icon?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className={`inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-[15px] transition disabled:opacity-50 ${
        on ? "border-signal bg-signal-soft font-medium text-ink shadow-[0_1px_2px_rgba(79,70,229,0.12)]" : "border-line bg-surface text-ink-muted hover:border-ink-faint hover:text-ink"
      }`}
    >
      <span className={`flex h-[18px] w-[18px] items-center justify-center rounded-full text-[11px] font-bold ${on ? "bg-signal text-white" : "border border-line bg-surface text-transparent"}`} aria-hidden>
        ✓
      </span>
      {dot && <span className="h-2 w-2 rounded-full" style={{ background: dot }} aria-hidden />}
      {icon && <i className={`ti ti-${icon} text-[16px]`} aria-hidden />}
      {label}
    </button>
  );
}

function timeAgo(iso: string): string {
  const d = Date.now() - Date.parse(iso);
  if (d < 60000) return "방금";
  if (d < 3600000) return `${Math.round(d / 60000)}분 전`;
  if (d < 86400000) return `${Math.round(d / 3600000)}시간 전`;
  return new Date(iso).toLocaleDateString("ko-KR");
}

export function SimulatorForm({
  media,
  devices,
  onMedia,
  onDevices,
  text,
  onText,
  count,
  loading,
  onRun,
  history,
  onHistory,
  onClearHistory,
}: {
  media: MediaKey[];
  devices: DeviceKey[];
  onMedia: (m: MediaKey[]) => void;
  onDevices: (d: DeviceKey[]) => void;
  text: string;
  onText: (t: string) => void;
  count: number;
  loading: boolean;
  onRun: () => void;
  history: HistoryItem[];
  onHistory: (h: HistoryItem) => void;
  onClearHistory: () => void;
}) {
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const combos = (media.includes("naver") ? devices.length : 0) + (media.includes("google") ? 1 : 0);
  const canRun = count > 0 && media.length > 0 && (!media.includes("naver") || devices.length > 0) && !loading;

  return (
    <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,680px)_minmax(0,1fr)]">
      {/* 좌측 폼 */}
      <div className="space-y-9 rounded-card border border-line bg-surface p-7">
        <div className="space-y-5">
          <div>
            <p className="mb-2.5 text-[13px] font-semibold text-ink-soft">매체 — 여러 개 선택 가능</p>
            <div className="flex flex-wrap gap-2">
              {MEDIA_OPTS.map((o) => (
                <ToggleChip key={o.key} on={media.includes(o.key)} label={o.label} dot={o.color} onClick={() => onMedia(toggle(media, o.key))} />
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2.5 text-[13px] font-semibold text-ink-soft">기기 — 네이버는 기기별로 따로 계산해요</p>
            <div className="flex flex-wrap gap-2">
              {DEVICE_OPTS.map((o) => (
                <ToggleChip key={o.key} on={devices.includes(o.key)} label={o.label} icon={o.icon} onClick={() => onDevices(toggle(devices, o.key))} disabled={!media.includes("naver")} />
              ))}
            </div>
            {media.includes("google") && <p className="mt-2 text-[13px] text-ink-muted">구글은 기기 구분 없이 전체 기준으로 예측해요.</p>}
          </div>
        </div>

        <div>
          <div className="mb-2.5 flex items-baseline justify-between">
            <label htmlFor="sa-sim-keywords" className="text-[13px] font-semibold text-ink-soft">
              키워드 — 한 줄에 하나씩
            </label>
            <span className={`text-[13px] tabular-nums ${count >= 20 ? "font-medium text-warn" : "text-ink-muted"}`}>{count}/20개</span>
          </div>
          <textarea
            id="sa-sim-keywords"
            value={text}
            onChange={(e) => onText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && canRun) onRun();
            }}
            rows={14}
            spellCheck={false}
            placeholder={"운동화\n여성 스니커즈\n쿠션 좋은 운동화\n…\n\n엔터로 줄을 바꿔 최대 20개까지 (쉼표로 구분해도 돼요)"}
            className="field h-auto min-h-[360px] w-full resize-y py-3 text-[16px] leading-[1.7]"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-ink-muted">
            {combos > 0 ? `${combos}개 조합을 한 번에 계산해요` : "매체와 기기를 하나 이상 고르세요"}
            <span className="ml-2 text-ink-faint">Ctrl+Enter</span>
          </p>
          <button type="button" onClick={onRun} disabled={!canRun} className="btn-signal h-12 min-w-[180px] px-7 text-[16px]">
            {loading ? "견적 받는 중…" : "시뮬레이션"}
          </button>
        </div>
      </div>

      {/* 우측 안내 */}
      <aside className="space-y-6">
        <div className="rounded-card border border-line bg-surface p-6">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[15px] font-semibold text-ink">최근 시뮬레이션</p>
            {history.length > 0 && (
              <button type="button" onClick={onClearHistory} className="text-[13px] text-ink-muted hover:text-ink">
                지우기
              </button>
            )}
          </div>
          {history.length === 0 ? (
            <p className="py-6 text-center text-[14px] text-ink-muted">시뮬레이션을 돌리면 여기에 남아요. 눌러서 같은 조건으로 다시 볼 수 있어요.</p>
          ) : (
            <ul className="space-y-2">
              {history.map((h) => (
                <li key={h.at}>
                  <button
                    type="button"
                    onClick={() => onHistory(h)}
                    disabled={loading}
                    className="w-full rounded-lg border border-line px-3.5 py-2.5 text-left transition hover:border-signal hover:bg-signal-soft/40 disabled:opacity-50"
                  >
                    <p className="truncate text-[14px] font-medium text-ink">
                      {h.keywords.slice(0, 4).join(", ")}
                      {h.keywords.length > 4 && <span className="font-normal text-ink-muted"> 외 {h.keywords.length - 4}개</span>}
                    </p>
                    <p className="mt-0.5 text-[12px] text-ink-muted">
                      {[h.media.includes("naver") && `네이버(${h.devices.map((d) => (d === "PC" ? "PC" : "모바일")).join("·")})`, h.media.includes("google") && "구글"].filter(Boolean).join(" · ")} · {timeAgo(h.at)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-card border border-line bg-canvas p-6">
          <p className="mb-3 text-[15px] font-semibold text-ink">입력 팁</p>
          <ul className="space-y-2.5 text-[14px] leading-relaxed text-ink-soft">
            <li><b className="font-semibold text-ink">띄어쓰기는 상관없어요.</b> 네이버는 붙여 쓴 키워드로 계산해요(‘여성 스니커즈’ = ‘여성스니커즈’).</li>
            <li><b className="font-semibold text-ink">브랜드·대표·세부 키워드를 섞어 넣으세요.</b> 순위별 입찰가 차이가 커서 예산 배분 판단이 쉬워져요.</li>
            <li><b className="font-semibold text-ink">결과의 연관 키워드</b>를 누르면 바로 추가해서 다시 계산해요.</li>
            <li><b className="font-semibold text-ink">입찰가 곡선</b>에서 클릭이 더 늘지 않는 입찰가를 확인하고, 그 이상은 쓰지 않는 게 좋아요.</li>
            <li className="text-ink-muted">견적은 최근 통계 기반 예측이라 품질지수·소재에 따라 실제와 다를 수 있어요.</li>
          </ul>
        </div>
      </aside>
    </section>
  );
}
