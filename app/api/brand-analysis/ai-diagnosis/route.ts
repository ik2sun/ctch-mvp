import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import type { InstagramProfile } from "@/features/brand-analysis/apifyClient";
import {
  computeAccountMetrics,
  DOW_LABELS,
  FORMAT_LABELS,
  slotLabel,
  TIER_LABELS,
} from "@/features/brand-analysis/postMetrics";
import { CONTENT_TYPES, CTA_TYPES, HOOK_TYPES, type Diagnosis } from "@/features/brand-analysis/diagnosisTypes";

export const maxDuration = 120;

const SYSTEM = `당신은 인스타그램 계정을 퍼포먼스 마케팅 관점에서 진단하는 분석가입니다.
각 게시물에는 계정 중앙값 대비 인게이지먼트 배수(erIndex)와 등급(tier)이 이미 계산되어 있습니다.
당신의 역할은 (1) 게시물마다 콘텐츠 유형·훅·CTA를 태깅하고, (2) 성과 상위/하위 게시물의 공통점을 데이터로 설명하고, (3) 실행 가능한 액션을 제안하는 것입니다.

반드시 아래 스키마의 JSON만 출력하세요. 마크다운 코드펜스나 인사말, 설명 문장을 붙이지 마세요.

{
  "summary": "계정 성과 총평 2~3문장. 중앙값 ER, 릴스 확산율, 게시 주기 등 수치를 근거로",
  "winningPattern": "상위 게시물(tier=top)의 공통점 2~3문장. 포맷·유형·훅·CTA·시간대 중 실제 데이터에서 드러나는 것만",
  "losingPattern": "하위 게시물(tier=low)의 공통점 2~3문장",
  "suggestions": ["실행 가능한 액션 1", "액션 2", "액션 3", "액션 4"],
  "adCandidates": [{ "id": "게시물 id", "reason": "광고 소재로 쓸 만한 이유 한 줄" }],
  "posts": [
    { "id": "게시물 id", "contentType": "${CONTENT_TYPES.join("|")}", "hookType": "${HOOK_TYPES.join("|")}", "ctaType": "${CTA_TYPES.join("|")}", "insight": "이 게시물이 왜 이 성과를 냈는지 한 줄" }
  ]
}

작성 규칙:
- posts 배열에는 입력된 모든 게시물을 id 그대로 빠짐없이 포함할 것
- contentType/hookType/ctaType은 제시된 값 중 하나만 정확히 사용할 것
- insight는 erIndex와 tier를 근거로 쓸 것. tier=new(집계중)는 "반응 집계 중"으로만 표기
- adCandidates는 tier=top 중 광고 소재로 전환하기 좋은 게시물 최대 3개. 없으면 빈 배열
- suggestions는 "무엇을, 어떤 포맷/시간대로, 왜"가 들어간 구체적 액션으로 작성할 것
- 데이터로 확인 불가한 내용은 추측하지 말 것`;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "서버에 ANTHROPIC_API_KEY가 없어요." }, { status: 500 });
  }

  const { profile } = (await req.json()) as { profile?: InstagramProfile };
  if (!profile || !Array.isArray(profile.posts)) {
    return NextResponse.json({ error: "분석할 프로필 데이터가 없어요." }, { status: 400 });
  }

  const metrics = computeAccountMetrics(profile);
  const pct = (v: number | null) => (v == null ? null : `${(v * 100).toFixed(2)}%`);
  const x = (v: number | null) => (v == null ? null : `${v.toFixed(2)}x`);

  const payload = {
    계정: profile.username,
    팔로워: profile.followersCount,
    분석게시물수: metrics.postsAnalyzed,
    중앙값ER: pct(metrics.medianEr),
    평균ER: pct(metrics.avgEr),
    릴스평균확산율_조회수대비팔로워: pct(metrics.avgReelViewRate),
    릴스게시비중: pct(metrics.reelShare),
    릴스반응비중: pct(metrics.reelEngagementShare),
    주간게시수: metrics.postsPerWeek?.toFixed(1) ?? null,
    상위20퍼센트반응점유율: pct(metrics.topShare),
    최고성과시간대: metrics.bestSlot
      ? `${DOW_LABELS[metrics.bestSlot.dow]}요일 ${slotLabel(metrics.bestSlot.slot)} (ER ${pct(metrics.bestSlot.avgEr)})`
      : null,
    포맷별: metrics.formats.map((f) => ({
      포맷: f.label,
      게시수: f.count,
      평균ER: pct(f.avgEr),
      반응비중: pct(f.engagementShare),
      평균확산율: pct(f.avgViewRate),
    })),
    캡션길이별: metrics.captionBuckets.map((b) => ({ 구간: b.label, 게시수: b.count, 평균ER: pct(b.avgEr) })),
    해시태그수별: metrics.hashtagBuckets.map((b) => ({ 구간: b.label, 게시수: b.count, 평균ER: pct(b.avgEr) })),
    CTA유무별: metrics.ctaSplit.map((b) => ({ 구분: b.label, 게시수: b.count, 평균ER: pct(b.avgEr) })),
    게시물: metrics.posts.map((m) => ({
      id: m.post.id,
      포맷: FORMAT_LABELS[m.post.format],
      게시시각KST:
        m.kstDow != null && m.kstHour != null ? `${DOW_LABELS[m.kstDow]} ${String(m.kstHour).padStart(2, "0")}시` : null,
      좋아요: m.post.likesHidden ? "비공개" : m.post.likes,
      댓글: m.post.comments,
      조회수: m.post.videoViews,
      ER: pct(m.er),
      erIndex: x(m.erIndex),
      tier: TIER_LABELS[m.tier],
      확산율: pct(m.viewRate),
      협찬: m.post.isSponsored || undefined,
      캡션: (m.post.caption ?? "").slice(0, 500),
      해시태그: m.post.hashtags.slice(0, 15),
      멘션: m.post.mentions.slice(0, 5),
      이미지설명: (m.post.altText ?? "").slice(0, 300),
    })),
  };

  try {
    const parsed = await anthropicCall(payload);
    return NextResponse.json(parsed);
  } catch (e) {
    const message = e instanceof Error ? e.message : "AI 진단 중 오류가 발생했어요.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function anthropicCall(payload: unknown): Promise<Diagnosis> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  // 게시물이 최대 50개라 출력이 길어질 수 있어 스트리밍으로 타임아웃을 피함
  const msg = await anthropic.messages
    .stream({
      model: "claude-sonnet-5-5",
      max_tokens: 8000,
      system: SYSTEM,
      messages: [{ role: "user", content: `${JSON.stringify(payload, null, 1)}\n\n위 스키마의 JSON만 출력하세요.` }],
    })
    .finalMessage();

  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let parsed: Diagnosis;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const s = cleaned.indexOf("{");
    const e = cleaned.lastIndexOf("}");
    if (s >= 0 && e > s) parsed = JSON.parse(cleaned.slice(s, e + 1));
    else throw new Error("AI 응답을 해석하지 못했어요.");
  }
  return {
    summary: parsed.summary ?? "",
    winningPattern: parsed.winningPattern ?? "",
    losingPattern: parsed.losingPattern ?? "",
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
    adCandidates: Array.isArray(parsed.adCandidates) ? parsed.adCandidates : [],
    posts: Array.isArray(parsed.posts) ? parsed.posts.map((p) => ({ ...p, id: String(p.id) })) : [],
  };
}
