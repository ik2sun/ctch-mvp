"use client";

// 수동 세팅 · 소재 편집 — GFA 소재 3종(네이티브 이미지·이미지 배너·컬렉션). 규격을 고르면 그 규격이 받는 문구 칸만 보이고(공식 소재 가이드 표),
// 오른쪽 미리보기로 바로 확인한다. 이미지는 실행 때 규격 크기·용량에 맞춰 잘라 올린다(imageFit)
import { upscaleRatio, type SourceImage } from "../imageFit";
import { BANNER_TEMPLATES, COLLECTION_CARDS, CTA_OPTIONS, SINGLE_IMAGE_TEMPLATES, autoTemplates, isFeedTemplate, ratioMatches, type TemplateSpec } from "../types";
import { CHIP, CHIP_ON, INPUT, SelectAllLinks } from "../ui";
import { CharInput, ChoiceCards, ImageDrop, Row, Section } from "./controls";
import { CREATIVE_KINDS, copyFieldsFor, creativeProblems, uid, type CardDraft, type CreativeDraft, type CreativeKind } from "./model";

export function CreativeEditor({ k, onChange }: { k: CreativeDraft; onChange: (patch: Partial<CreativeDraft>) => void }) {
  const problems = creativeProblems(k);
  const setKind = (kind: CreativeKind) =>
    onChange({
      kind,
      templates: kind === "SINGLE_IMAGE" ? ["FEED_SINGLE_IMAGE_SQUARE"] : kind === "IMAGE_BANNER" && k.image ? autoTemplates(k.image, "IMAGE_BANNER", "IMAGE_BANNER").map((t) => t.code) : [],
      cards: kind === "MULTIPLE_IMAGE" && k.cards.length < COLLECTION_CARDS.min ? Array.from({ length: COLLECTION_CARDS.min }, () => ({ key: uid("d"), image: null, title: "", url: k.landingUrl })) : k.cards,
    });

  return (
    <div className="grid gap-8 2xl:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <Section title="소재 유형">
          <ChoiceCards value={k.kind} options={CREATIVE_KINDS} onChange={setKind} />
        </Section>
        <Section title="기본 정보">
          <Row label="소재 이름 *" help={k.kind !== "MULTIPLE_IMAGE" && k.templates.length > 1 ? "규격마다 소재가 하나씩 만들어지고 이름 뒤에 규격 약어(_sq, _ls …)가 붙어요" : undefined}>
            <input className={INPUT} value={k.name} maxLength={120} onChange={(e) => onChange({ name: e.target.value })} />
          </Row>
        </Section>
        {k.kind === "MULTIPLE_IMAGE" ? <CollectionFields k={k} onChange={onChange} /> : <ImageFields k={k} onChange={onChange} />}
        {problems.length > 0 && <p className="text-[13px] text-warn">채워야 할 항목: {problems.join(" · ")}</p>}
      </div>
      <Preview k={k} />
    </div>
  );
}

function ImageFields({ k, onChange }: { k: CreativeDraft; onChange: (patch: Partial<CreativeDraft>) => void }) {
  const banner = k.kind === "IMAGE_BANNER";
  const list: TemplateSpec[] = banner ? BANNER_TEMPLATES : SINGLE_IMAGE_TEMPLATES;
  const fields = banner ? [] : copyFieldsFor(k.templates);
  const setImage = (img: SourceImage | null) =>
    onChange({ image: img, ...(banner && img ? { templates: autoTemplates(img, "IMAGE_BANNER", "IMAGE_BANNER").map((t) => t.code) } : {}) });
  const blurry = k.image ? list.filter((t) => k.templates.includes(t.code) && upscaleRatio(k.image!, t) > 1.5).map((t) => t.label) : [];

  return (
    <>
      <Section title="이미지·규격" hint={banner ? "배너는 잘라 쓰지 않아요 — 이미지 비율과 같은 규격만 고를 수 있어요" : "고른 규격 크기에 맞춰 가운데를 잘라 올려요"}>
        <Row label="이미지 *">
          {k.image ? (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={k.image.url} alt="" className="h-20 w-20 rounded-lg object-cover ring-1 ring-line" />
              <div className="min-w-0 text-[13px] text-ink-muted">
                <p className="truncate text-[14px] text-ink">{k.image.file.name}</p>
                <p className="tabular-nums">
                  {k.image.width}×{k.image.height} · {Math.round(k.image.file.size / 1024)}KB
                </p>
                <button type="button" onClick={() => setImage(null)} className="mt-1 underline hover:text-ink">
                  다른 이미지로
                </button>
              </div>
            </div>
          ) : (
            <ImageDrop label="이미지를 끌어 놓거나 눌러서 선택 (JPG·PNG)" onImages={(imgs) => setImage(imgs[0])} />
          )}
        </Row>
        <Row label="규격 *">
          {banner ? (
            <div className="flex flex-wrap gap-1.5">
              {list.map((t) => {
                const ok = !k.image || ratioMatches(k.image, t);
                const on = k.templates.includes(t.code);
                return (
                  <button
                    key={t.code}
                    type="button"
                    disabled={!ok}
                    title={ok ? undefined : "이미지 비율이 달라 쓸 수 없어요"}
                    onClick={() => onChange({ templates: on ? k.templates.filter((x) => x !== t.code) : [...k.templates, t.code] })}
                    className={`${CHIP} ${on ? CHIP_ON : ""} disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    {on && "✓ "}
                    {t.label}
                  </button>
                );
              })}
              {(() => {
                // 배너는 이미지 비율이 맞는 규격만 고를 수 있다
                const usable = list.filter((t) => !k.image || ratioMatches(k.image, t)).map((t) => t.code);
                return (
                  <SelectAllLinks
                    onAll={() => onChange({ templates: usable })}
                    allDisabled={!usable.length || usable.every((c) => k.templates.includes(c))}
                    onNone={() => onChange({ templates: [] })}
                    noneDisabled={!k.templates.length}
                  />
                );
              })()}
            </div>
          ) : (
            <div className="space-y-2">
              {[
                { label: "피드", items: list.filter((t) => isFeedTemplate(t.code)) },
                { label: "배너형(네이티브)", items: list.filter((t) => !isFeedTemplate(t.code)) },
              ].map((g) => (
                <div key={g.label} className="flex flex-wrap items-center gap-1.5">
                  <span className="w-[110px] text-[13px] text-ink-muted">{g.label}</span>
                  {g.items.map((t) => {
                    const on = k.templates.includes(t.code);
                    return (
                      <button key={t.code} type="button" onClick={() => onChange({ templates: on ? k.templates.filter((x) => x !== t.code) : [...k.templates, t.code] })} className={`${CHIP} ${on ? CHIP_ON : ""}`}>
                        {on && "✓ "}
                        {t.label.replace(/^배너형/, "")}
                      </button>
                    );
                  })}
                  <SelectAllLinks
                    onAll={() => onChange({ templates: [...k.templates, ...g.items.map((t) => t.code).filter((c) => !k.templates.includes(c))] })}
                    allDisabled={g.items.every((t) => k.templates.includes(t.code))}
                    onNone={() => onChange({ templates: k.templates.filter((c) => !g.items.some((t) => t.code === c)) })}
                    noneDisabled={!g.items.some((t) => k.templates.includes(t.code))}
                  />
                </div>
              ))}
            </div>
          )}
          {banner && k.image && !list.some((t) => ratioMatches(k.image!, t)) && (
            <p className="mt-2 text-[13px] text-bad">이 이미지 비율({k.image.width}×{k.image.height})에 맞는 배너 규격이 없어요. 750×160·750×280·750×200·1250×560·1200×1200 중 하나로 만들어 주세요.</p>
          )}
          {blurry.length > 0 && <p className="mt-2 text-[13px] text-warn">원본보다 1.5배 넘게 키워져 흐려질 수 있어요: {blurry.join(", ")}</p>}
        </Row>
      </Section>

      <Section title={banner ? "랜딩·안내 문구" : "문구·랜딩"} hint={banner ? undefined : k.templates.length > 1 ? "여러 규격을 고르면 모든 규격의 글자 수 제한을 함께 지켜야 해요" : undefined}>
        {fields.map((f) => (
          <Row key={f.field} label={`${f.label}${f.required ? " *" : ""}`}>
            <CharInput value={(k.copy[f.field] as string | undefined) ?? ""} max={f.max} multiline={f.field === "message" && f.max > 30} onChange={(v) => onChange({ copy: { ...k.copy, [f.field]: v } })} />
          </Row>
        ))}
        {!banner && (
          <Row label="버튼(CTA) *">
            <select className={`${INPUT} max-w-[260px]`} value={k.copy.cta} onChange={(e) => onChange({ copy: { ...k.copy, cta: e.target.value } })}>
              {CTA_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.name}
                </option>
              ))}
            </select>
          </Row>
        )}
        <Row label="랜딩 URL *">
          <input className={INPUT} value={k.landingUrl} placeholder="https://" onChange={(e) => onChange({ landingUrl: e.target.value.trim() })} />
        </Row>
        {banner && (
          <Row label="광고 안내 문구 *" help="이미지를 읽지 못하는 분(화면 낭독기)을 위한 대체 텍스트 — 배너 안 문구를 그대로 적으면 돼요">
            <CharInput value={k.altMessage} max={100} onChange={(v) => onChange({ altMessage: v })} />
          </Row>
        )}
      </Section>
    </>
  );
}

function CollectionFields({ k, onChange }: { k: CreativeDraft; onChange: (patch: Partial<CreativeDraft>) => void }) {
  const setCard = (key: string, patch: Partial<CardDraft>) => onChange({ cards: k.cards.map((c) => (c.key === key ? { ...c, ...patch } : c)) });
  const addImages = (imgs: SourceImage[]) => {
    // 빈 카드부터 채우고, 남으면 카드를 늘린다(최대 10장)
    const cards = k.cards.map((c) => ({ ...c }));
    for (const img of imgs) {
      const empty = cards.find((c) => !c.image);
      if (empty) empty.image = img;
      else if (cards.length < COLLECTION_CARDS.max) cards.push({ key: uid("d"), image: img, title: "", url: cards[0]?.url ?? "" });
    }
    onChange({ cards });
  };
  return (
    <>
      <Section title="문구·버튼">
        <Row label="광고 문구 *">
          <CharInput value={k.copy.message} max={COLLECTION_CARDS.messageMax} multiline onChange={(v) => onChange({ copy: { ...k.copy, message: v } })} />
        </Row>
        <Row label="버튼(CTA) *">
          <select className={`${INPUT} max-w-[260px]`} value={k.copy.cta} onChange={(e) => onChange({ copy: { ...k.copy, cta: e.target.value } })}>
            {CTA_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.name}
              </option>
            ))}
          </select>
        </Row>
        <Row label="버튼 URL" help="비우면 첫 카드 URL">
          <input className={INPUT} value={k.ctaUrl} placeholder="https://" onChange={(e) => onChange({ ctaUrl: e.target.value.trim() })} />
        </Row>
      </Section>
      <Section
        title={`카드 ${k.cards.length}장`}
        hint={`카드 ${COLLECTION_CARDS.min}~${COLLECTION_CARDS.max}장 · 이미지는 600×600으로 가운데를 잘라요`}
        right={
          <button
            type="button"
            onClick={() => {
              const url = k.cards.find((c) => c.url.trim())?.url ?? "";
              if (url) onChange({ cards: k.cards.map((c) => ({ ...c, url })) });
            }}
            className="text-[13px] font-semibold text-[#C2410C]"
          >
            첫 URL을 모든 카드에
          </button>
        }
      >
        <ImageDrop multiple compact label="이미지 여러 장을 한 번에 넣으면 빈 카드부터 채워요" onImages={addImages} />
        <div className="space-y-2">
          {k.cards.map((c, i) => (
            <div key={c.key} className="flex items-start gap-3 rounded-xl border border-line p-3">
              <div className="w-[72px] shrink-0">
                {c.image ? (
                  <button type="button" onClick={() => setCard(c.key, { image: null })} title="이미지 빼기" className="group relative block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.image.url} alt="" className="h-[72px] w-[72px] rounded-lg object-cover" />
                    <span className="absolute inset-0 hidden items-center justify-center rounded-lg bg-black/50 text-[12px] text-white group-hover:flex">빼기</span>
                  </button>
                ) : (
                  <ImageDrop compact label={`${i + 1}`} onImages={(imgs) => setCard(c.key, { image: imgs[0] })} />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <CharInput value={c.title} max={COLLECTION_CARDS.titleMax} placeholder={`카드 ${i + 1} 설명 문구`} onChange={(v) => setCard(c.key, { title: v })} />
                <input className={INPUT} value={c.url} placeholder="카드 랜딩 URL https://" onChange={(e) => setCard(c.key, { url: e.target.value.trim() })} />
              </div>
              <button
                type="button"
                disabled={k.cards.length <= COLLECTION_CARDS.min}
                onClick={() => onChange({ cards: k.cards.filter((x) => x.key !== c.key) })}
                className="mt-2 text-ink-muted hover:text-bad disabled:opacity-30"
                aria-label="카드 빼기"
              >
                <i className="ti ti-trash text-[16px]" aria-hidden />
              </button>
            </div>
          ))}
        </div>
        {k.cards.length < COLLECTION_CARDS.max && (
          <button type="button" onClick={() => onChange({ cards: [...k.cards, { key: uid("d"), image: null, title: "", url: k.cards[0]?.url ?? "" }] })} className="text-[14px] font-semibold text-[#C2410C]">
            + 카드 추가
          </button>
        )}
      </Section>
    </>
  );
}

// 미리보기 — 실제 GFA 지면과 똑같지는 않지만 잘리는 영역·문구 길이를 확인하는 용도
function Preview({ k }: { k: CreativeDraft }) {
  const cta = CTA_OPTIONS.find((o) => o.value === k.copy.cta)?.name ?? "더 알아보기";
  const first = [...SINGLE_IMAGE_TEMPLATES, ...BANNER_TEMPLATES].find((t) => k.templates.includes(t.code));
  const ratio = first ? `${first.width} / ${first.height}` : "1 / 1";
  return (
    <aside className="2xl:sticky 2xl:top-4 2xl:self-start">
      <p className="mb-2 text-[13px] font-semibold text-ink-muted">미리보기{first ? ` · ${first.label}` : ""}</p>
      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_3px_rgba(16,24,40,0.08)]">
        {k.kind === "IMAGE_BANNER" ? (
          <div className="bg-[#F2F4F7]" style={{ aspectRatio: ratio }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {k.image && <img src={k.image.url} alt={k.altMessage} className="h-full w-full object-cover" />}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 px-3 py-2.5">
              <span className="h-7 w-7 rounded-full bg-[#E4E7EC]" />
              <span className="text-[13px] font-semibold text-ink">광고계정 프로필</span>
              <span className="text-[12px] text-ink-muted">광고</span>
            </div>
            {k.copy.message && <p className="whitespace-pre-wrap px-3 pb-2 text-[14px] text-ink">{k.copy.message}</p>}
            {k.kind === "MULTIPLE_IMAGE" ? (
              <div className="flex gap-2 overflow-x-auto px-3 pb-3">
                {k.cards.map((c) => (
                  <div key={c.key} className="w-[130px] shrink-0 overflow-hidden rounded-lg border border-line">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <div className="aspect-square bg-[#F2F4F7]">{c.image && <img src={c.image.url} alt="" className="h-full w-full object-cover" />}</div>
                    <p className="truncate px-2 py-1.5 text-[12px] text-ink">{c.title || "설명 문구"}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-[#F2F4F7]" style={{ aspectRatio: ratio }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {k.image && <img src={k.image.url} alt="" className="h-full w-full object-cover" />}
              </div>
            )}
            {k.kind === "SINGLE_IMAGE" && (k.copy.linkTitle || k.copy.linkText4th) && (
              <p className="px-3 pt-2 text-[13px] text-ink-soft">{[k.copy.linkTitle, k.copy.linkDescription, k.copy.linkText3rd, k.copy.linkText4th, k.copy.linkText5th].filter(Boolean).join(" · ")}</p>
            )}
            <div className="m-3 rounded-lg bg-[#F2F4F7] py-2 text-center text-[13px] font-semibold text-ink">{cta}</div>
          </>
        )}
      </div>
      <p className="mt-2 text-[12px] text-ink-muted">프로필(이름·사진)은 GFA 광고계정에 등록된 것이 자동으로 붙어요.</p>
    </aside>
  );
}
