"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  buildUtmUrl,
  isValidUrl,
  MEDIA_PRESETS,
  NAVER_EXTRA_KEYS,
  type ExtraParam,
  type MediaPreset,
} from "@/features/utm-builder/buildUtm";

type SavedUtm = {
  id: string;
  final_url: string;
  base_url: string;
  utm_campaign: string | null;
  utm_source: string | null;
  memo: string | null;
  created_at: string;
};

export function SingleBuilder() {
  const supabase = createClient();

  // 입력 상태
  const [preset, setPreset] = useState<MediaPreset>(MEDIA_PRESETS[1]);
  const [baseUrl, setBaseUrl] = useState("");
  const [source, setSource] = useState(MEDIA_PRESETS[1].source);
  const [medium, setMedium] = useState(MEDIA_PRESETS[1].medium);
  const [campaign, setCampaign] = useState("");
  const [content, setContent] = useState("");
  const [term, setTerm] = useState("");
  const [memo, setMemo] = useState("");

  // 네이버 트래킹 파라미터
  const [extras, setExtras] = useState<ExtraParam[]>(
    NAVER_EXTRA_KEYS.map((key) => ({ key, value: "" })),
  );

  // 목록 상태
  const [saved, setSaved] = useState<SavedUtm[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const finalUrl = buildUtmUrl(
    { baseUrl, source, medium, campaign, content, term },
    preset.naverTracking ? extras : [],
  );

  // 매체 프리셋 선택 → source/medium 자동 채움
  function selectPreset(p: MediaPreset) {
    setPreset(p);
    if (p.key !== "custom") {
      setSource(p.source);
      setMedium(p.medium);
    }
  }

  function updateExtra(i: number, value: string) {
    setExtras((prev) => prev.map((e, idx) => (idx === i ? { ...e, value } : e)));
  }

  async function copy(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  }

  // 목록 불러오기
  async function loadSaved() {
    setLoading(true);
    const { data } = await supabase
      .from("utm_links")
      .select("id, final_url, base_url, utm_campaign, utm_source, memo, created_at")
      .order("created_at", { ascending: false });
    setSaved(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 저장
  async function handleSave() {
    if (!finalUrl) return;
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }
    const { error } = await supabase.from("utm_links").insert({
      user_id: user.id,
      final_url: finalUrl,
      base_url: baseUrl,
      utm_source: source || null,
      utm_medium: medium || null,
      utm_campaign: campaign || null,
      utm_content: content || null,
      utm_term: term || null,
      extra_params: preset.naverTracking
        ? Object.fromEntries(extras.filter((e) => e.value).map((e) => [e.key, e.value]))
        : null,
      memo: memo || null,
    });
    setSaving(false);
    if (!error) {
      setMemo("");
      loadSaved();
    }
  }

  async function handleDelete(id: string) {
    await supabase.from("utm_links").delete().eq("id", id);
    setSaved((prev) => prev.filter((s) => s.id !== id));
  }

  const urlWarning = baseUrl.length > 0 && !isValidUrl(baseUrl);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* 입력 카드 */}
      <div className="rounded-card border border-line bg-surface p-5">
        {/* 매체 프리셋 */}
        <label className="mb-2 block text-[13px] font-medium text-ink-soft">매체 선택</label>
        <div className="mb-5 flex flex-wrap gap-2">
          {MEDIA_PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => selectPreset(p)}
              className={`rounded-lg border px-3 py-1.5 text-[13px] transition ${
                preset.key === p.key
                  ? "border-signal bg-signal-soft font-medium text-signal"
                  : "border-line text-ink-soft hover:border-ink-faint"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* 랜딩 URL */}
        <div className="mb-4">
          <label className="mb-1.5 block text-[13px] font-medium text-ink-soft">
            랜딩 URL
          </label>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://ulsan.jaseng.co.kr/disease/back/herniated-disc.do?Location_Branch_Code=10014"
            className="field font-mono text-[13px]"
          />
          {urlWarning && (
            <p className="mt-1.5 text-[12px] text-warn">
              http:// 또는 https:// 로 시작하는 전체 주소를 넣어주세요.
            </p>
          )}
        </div>

        {/* UTM 5개 */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="utm_source" value={source} onChange={setSource} placeholder="naver_mo" />
          <Field label="utm_medium" value={medium} onChange={setMedium} placeholder="cpc" />
          <Field label="utm_campaign" value={campaign} onChange={setCampaign} placeholder="지역_애드부스트" />
          <Field label="utm_content" value={content} onChange={setContent} placeholder="애드부스트_울산_척추" />
          <Field label="utm_term" value={term} onChange={setTerm} placeholder="울산척추통증" />
          <Field label="메모 (선택)" value={memo} onChange={setMemo} placeholder="캠페인 구분용 메모" />
        </div>

        {/* 네이버 트래킹 파라미터 */}
        {preset.naverTracking && (
          <div className="mt-5 rounded-lg border border-line bg-canvas p-4">
            <p className="mb-3 text-[13px] font-medium text-ink-soft">
              네이버 파워링크 트래킹 파라미터{" "}
              <span className="font-normal text-ink-muted">(값이 있는 것만 URL에 붙어요)</span>
            </p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {extras.map((e, i) => (
                <div key={e.key}>
                  <label className="mb-1 block font-mono text-[11px] text-ink-muted">
                    {e.key}
                  </label>
                  <input
                    value={e.value}
                    onChange={(ev) => updateExtra(i, ev.target.value)}
                    className="field h-9 font-mono text-[12px]"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 미리보기 + 저장 */}
      <div className="rounded-card border border-line bg-surface p-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[13px] font-medium text-ink-soft">완성된 URL</span>
          <div className="flex gap-2">
            <button
              onClick={() => copy(finalUrl, "preview")}
              disabled={!finalUrl}
              className="btn-ghost h-9 px-3 text-[13px]"
            >
              <i className="ti ti-copy text-[15px]" aria-hidden />
              {copied === "preview" ? "복사됨" : "복사"}
            </button>
            <button
              onClick={handleSave}
              disabled={!finalUrl || saving}
              className="btn-signal h-9 px-4 text-[13px]"
            >
              {saving ? "저장 중…" : "저장"}
            </button>
          </div>
        </div>
        <div className="min-h-[3rem] break-all rounded-lg bg-canvas p-3.5 font-mono text-[12.5px] leading-relaxed text-ink">
          {finalUrl || (
            <span className="text-ink-faint">
              랜딩 URL과 UTM 값을 입력하면 여기에 실시간으로 완성돼요.
            </span>
          )}
        </div>
      </div>

      {/* 저장된 목록 */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-ink">저장된 UTM</h3>
          <span className="text-[13px] text-ink-muted">{saved.length}건</span>
        </div>

        {loading ? (
          <p className="py-8 text-center text-[14px] text-ink-muted">불러오는 중…</p>
        ) : saved.length === 0 ? (
          <div className="rounded-card border border-dashed border-line bg-surface py-10 text-center">
            <p className="text-[14px] text-ink-muted">
              아직 저장된 UTM이 없어요. 위에서 만들고 저장을 눌러보세요.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {saved.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-ink">
                      {s.utm_campaign || s.memo || "이름 없음"}
                    </span>
                    {s.utm_source && (
                      <span className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-ink-muted">
                        {s.utm_source}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[12px] text-ink-muted">
                    {s.final_url}
                  </p>
                </div>
                <button
                  onClick={() => copy(s.final_url, s.id)}
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-line text-ink-muted transition hover:border-ink-faint"
                  title="복사"
                >
                  <i className={`ti ${copied === s.id ? "ti-check text-signal" : "ti-copy"} text-[15px]`} aria-hidden />
                </button>
                <button
                  onClick={() => handleDelete(s.id)}
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-line text-ink-muted transition hover:border-bad hover:text-bad"
                  title="삭제"
                >
                  <i className="ti ti-trash text-[15px]" aria-hidden />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block font-mono text-[12px] text-ink-muted">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="field h-10 text-[14px]"
      />
    </div>
  );
}
