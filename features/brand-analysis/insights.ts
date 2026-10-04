// 인스타 분석 인사이트 — 순수 함수(화면에서 계산, API 비용 없음).
// ① 원라인 행동 지침(규칙 기반 — AI 진단 headline이 있으면 그걸 우선) ② 시각 요소별 성과 비교 ③ 동일 카테고리 벤치마크.
// 원칙: 비교는 계정 중앙값 대비 반응 배수(erIndex)의 중앙값으로, 양쪽 표본 3개 이상·1.15배 이상 차이일 때만 '차이'로 말한다.
import type { AccountMetrics, PostMetric } from "./postMetrics";
import { DOW_LABELS, FORMAT_LABELS, slotLabel } from "./postMetrics";
import type { PostTag } from "./diagnosisTypes";
import type { VisualResult, VisualTag } from "./visualTypes";

export const MIN_N = 3;
const MIN_RATIO = 1.15;

function median(v: number[]): number | null {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const comparable = (m: PostMetric) => m.tier !== "new" && m.tier !== "na" && m.erIndex != null;

// 비교 점수 — 기본은 참여율 배수(erIndex). 좋아요 비공개 게시물이 많아 참여율 비교가 안 되면(비교 가능 6개 미만이면서 절반 미만)
// 댓글 수 배수(계정 중앙값 대비)로 대신한다. 르무통처럼 12개 중 11개가 좋아요 비공개인 계정(2026-10-04 실측) 대응.
export type ScoreMode = "er" | "comments";
export function postScores(metrics: AccountMetrics): { mode: ScoreMode; score: Map<string, number> } {
  const er = metrics.posts.filter(comparable);
  if (er.length >= 6 || er.length >= metrics.posts.length / 2) return { mode: "er", score: new Map(er.map((m) => [m.post.id, m.erIndex!])) };
  const settled = metrics.posts.filter((m) => !m.isRecent);
  const med = median(settled.map((m) => m.post.comments));
  if (!med) return { mode: "er", score: new Map(er.map((m) => [m.post.id, m.erIndex!])) };
  return { mode: "comments", score: new Map(settled.map((m) => [m.post.id, m.post.comments / med])) };
}
export const SCORE_LABEL: Record<ScoreMode, string> = { er: "계정 중앙값 대비 반응(참여율)", comments: "계정 중앙값 대비 댓글 수(좋아요 비공개 게시물이 많아 댓글 기준)" };

export type Group = { label: string; n: number; value: number | null };
export type Comparison = {
  key: string;
  title: string;
  metric: "erIndex" | "viewRate";
  metricLabel: string;
  groups: Group[];
  winner: { best: Group; worst: Group; ratio: number } | null;
  note?: string;
};

function compare(
  key: string,
  title: string,
  posts: PostMetric[],
  labelOf: (m: PostMetric) => string | null,
  order: string[],
  metric: "erIndex" | "viewRate",
  scores: { mode: ScoreMode; score: Map<string, number> },
  note?: string,
): Comparison {
  const by = new Map<string, number[]>();
  for (const m of posts) {
    const label = labelOf(m);
    const v = metric === "erIndex" ? (scores.score.get(m.post.id) ?? null) : m.viewRate;
    if (!label || v == null) continue;
    by.set(label, [...(by.get(label) ?? []), v]);
  }
  const groups: Group[] = order.filter((l) => by.has(l)).map((l) => ({ label: l, n: by.get(l)!.length, value: median(by.get(l)!) }));
  const solid = groups.filter((g) => g.n >= MIN_N && g.value != null && g.value > 0).sort((a, b) => b.value! - a.value!);
  const winner = solid.length >= 2 && solid[0].value! / solid[solid.length - 1].value! >= MIN_RATIO ? { best: solid[0], worst: solid[solid.length - 1], ratio: solid[0].value! / solid[solid.length - 1].value! } : null;
  return { key, title, metric, metricLabel: metric === "erIndex" ? SCORE_LABEL[scores.mode] : "조회율(조회수÷팔로워)", groups, winner, note };
}

export function visualComparisons(metrics: AccountMetrics, visual: VisualResult | null): Comparison[] {
  if (!visual?.posts.length) return [];
  const tag = new Map<string, VisualTag>(visual.posts.map((v) => [v.id, v]));
  const scores = postScores(metrics);
  const posts = metrics.posts.filter((m) => scores.score.has(m.post.id) && tag.has(m.post.id));
  const t = (m: PostMetric) => tag.get(m.post.id)!;
  const reels = metrics.posts.filter((m) => m.post.format === "reel" && m.viewRate != null && m.tier !== "new" && tag.has(m.post.id));
  return [
    compare("people", "사람이 나온 게시물 vs 제품·사물만", posts, (m) => (t(m).people === "없음" ? "사람 없음" : t(m).people === "얼굴" ? "얼굴 보임" : "신체 일부"), ["얼굴 보임", "신체 일부", "사람 없음"], "erIndex", scores),
    compare("subject", "피사체 구도", posts, (m) => t(m).subject, ["착용·사용", "제품 단독", "라이프스타일", "텍스트·그래픽", "기타"], "erIndex", scores),
    compare("tone", "밝은 톤 vs 어두운 톤", posts, (m) => t(m).tone, ["밝음", "중간", "어두움"], "erIndex", scores),
    compare("overlay", "이미지 위 카피(글자) 유무", posts, (m) => (t(m).textOverlay ? "카피 있음" : "카피 없음"), ["카피 있음", "카피 없음"], "erIndex", scores),
    compare("reelHook", "릴스 첫 화면 훅 텍스트 유무", reels, (m) => (t(m).textOverlay ? "훅 텍스트 있음" : "훅 텍스트 없음"), ["훅 텍스트 있음", "훅 텍스트 없음"], "viewRate", scores, "영상 자체는 받을 수 없어 릴스 커버(첫 화면)의 글자로 판단해요"),
  ];
}

export type Action = { text: string; basis: string };

const ACTION_BY: Record<string, (best: string) => string> = {
  people: (b) => (b === "사람 없음" ? "제품·사물 중심 컷" : b === "얼굴 보임" ? "사람 얼굴이 나오는 컷" : "손·발 등 신체가 함께 나오는 컷"),
  subject: (b) => `${b} 구도`,
  tone: (b) => `${b} 톤`,
  overlay: (b) => (b === "카피 있음" ? "이미지에 짧은 카피를 얹은" : "카피 없이 이미지만 보여 주는"),
};

// 원라인 지침 — 포맷·시각·시간대·콘텐츠 유형 중 근거가 선 것만, 효과 큰 순
export function buildActions(metrics: AccountMetrics, tags: PostTag[] | null, visual: VisualResult | null): Action[] {
  const out: (Action & { w: number })[] = [];
  const scores = postScores(metrics);
  const posts = metrics.posts.filter((m) => scores.score.has(m.post.id));
  const unit = scores.mode === "er" ? "반응" : "댓글";

  const fmt = compare("format", "포맷", posts, (m) => FORMAT_LABELS[m.post.format], ["캐러셀", "릴스", "이미지"], "erIndex", scores);
  if (fmt.winner) {
    const share = posts.filter((m) => FORMAT_LABELS[m.post.format] === fmt.winner!.best.label).length / Math.max(1, posts.length);
    out.push({
      w: fmt.winner.ratio,
      text: `${fmt.winner.best.label} ${unit}이 ${fmt.winner.worst.label}의 ${fmt.winner.ratio.toFixed(1)}배예요. 다음 2주는 ${fmt.winner.best.label} 비중을 늘리세요(지금 ${Math.round(share * 100)}%).`,
      basis: `포맷별 ${SCORE_LABEL[scores.mode]} 중앙값 · ${fmt.winner.best.label} ${fmt.winner.best.n}개 vs ${fmt.winner.worst.label} ${fmt.winner.worst.n}개`,
    });
  }

  for (const c of visualComparisons(metrics, visual)) {
    if (!c.winner || !ACTION_BY[c.key]) continue;
    out.push({
      w: c.winner.ratio,
      text: `${c.winner.best.label} 게시물이 ${c.winner.worst.label}보다 ${unit}이 ${c.winner.ratio.toFixed(1)}배 많아요. ${ACTION_BY[c.key](c.winner.best.label)} 위주로 촬영하세요.`,
      basis: `이미지 AI 분석 · ${c.title} · ${c.winner.best.n}개 vs ${c.winner.worst.n}개`,
    });
  }

  if (scores.mode === "er" && metrics.bestSlot && metrics.medianEr && metrics.bestSlot.avgEr / metrics.medianEr >= MIN_RATIO) {
    const r = metrics.bestSlot.avgEr / metrics.medianEr;
    out.push({
      w: Math.min(r, 3) * 0.9, // 시간대는 표본이 작아 가중치를 조금 낮춘다
      text: `${DOW_LABELS[metrics.bestSlot.dow]}요일 ${slotLabel(metrics.bestSlot.slot)} 게시물 반응이 계정 평소의 ${r.toFixed(1)}배예요. 핵심 게시물은 이 시간대에 올리세요.`,
      basis: "요일×시간대 평균 참여율 vs 계정 중앙값",
    });
  }

  if (tags?.length) {
    const tagBy = new Map(tags.map((t) => [t.id, t]));
    const ct = compare("content", "콘텐츠 유형", posts, (m) => tagBy.get(m.post.id)?.contentType ?? null, ["제품소개", "이벤트", "UGC/후기", "브랜딩", "인플루언서/협업", "비하인드", "정보/팁", "기타"], "erIndex", scores);
    if (ct.winner) out.push({ w: ct.winner.ratio, text: `${ct.winner.best.label} 게시물 ${unit}이 ${ct.winner.worst.label}의 ${ct.winner.ratio.toFixed(1)}배예요. ${ct.winner.best.label} 콘텐츠를 늘리세요.`, basis: `AI 진단 콘텐츠 유형 · ${ct.winner.best.n}개 vs ${ct.winner.worst.n}개` });
  }

  return out.sort((a, b) => b.w - a.w).slice(0, 4).map(({ text, basis }) => ({ text, basis }));
}

export type Benchmark = { n: number; topPercent: number | null; medianEr: number | null; peers: { username: string; er: number }[] };

// 동일 카테고리 벤치마크 — 팀이 분석한 같은 카테고리 계정(나 제외)의 중앙값 참여율과 비교. 상위 %는 나보다 높은 계정 비율로.
export function benchmark(myEr: number | null, peers: { username: string; median_er: number | null }[]): Benchmark {
  const list = peers.filter((p) => p.median_er != null).map((p) => ({ username: p.username, er: p.median_er! }));
  if (myEr == null || !list.length) return { n: list.length, topPercent: null, medianEr: median(list.map((p) => p.er)), peers: list };
  const higher = list.filter((p) => p.er > myEr).length;
  return { n: list.length, topPercent: Math.max(1, Math.round(((higher + 1) / (list.length + 1)) * 100)), medianEr: median(list.map((p) => p.er)), peers: list };
}
