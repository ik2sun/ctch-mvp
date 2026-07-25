import type { Slide } from "./types";
import { resolveTheme, type ThemeDef } from "./themes";
import type { BrandColors, ThemeId } from "./types";

// slides+theme만 저장하고, 프레젠테이션 HTML은 이 함수로 매번 새로 생성한다.
// 화면(iframe srcDoc)과 인쇄용(?print-pdf) 양쪽에서 이 함수 하나로 렌더링한다.

function escapeHtml(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(v: unknown): string {
  return escapeHtml(v);
}

// content를 줄바꿈 기준으로 나눠 문단/리스트로 변환 (Claude가 순수 텍스트로 줄 것을 대비)
function renderContent(content: string): string {
  const lines = String(content ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return "";
  return lines.map((l) => `<p class="ln">${escapeHtml(l)}</p>`).join("");
}

function asRecordArray(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// ---- 슬라이드별 레이아웃 템플릿 ------------------------------------------
// system prompt의 layout enum(6종)이 8개 슬라이드에 재사용되므로, 실제로는
// 고정된 8슬라이드 구조(slide.index)를 1차 기준으로 사용하고, layout은 폴백으로만 쓴다.

function coverSlide(slide: Slide, theme: ThemeDef): string {
  const bgLayer =
    theme.coverAnimation === "particles"
      ? `<div id="particles-cover" class="absolute inset-0"></div>`
      : theme.coverAnimation === "gradient-mesh"
        ? `<div class="gradient-mesh absolute inset-0"></div>`
        : `<div class="cover-block" data-aos="fade-right"></div>`;

  return `
  <section class="slide-cover" data-transition="zoom">
    ${bgLayer}
    <div class="cover-inner">
      <p class="cover-eyebrow" data-gsap="eyebrow">PROPOSAL</p>
      <h1 class="cover-title" data-gsap="title">${escapeHtml(slide.title)}</h1>
      <p class="cover-subtitle" data-gsap="subtitle">${escapeHtml(slide.subtitle)}</p>
    </div>
  </section>`;
}

function statusSlide(slide: Slide, idx: number): string {
  const items = asRecordArray(slide.data?.chart ?? slide.data?.items ?? slide.data?.metrics);
  const labels = items.length
    ? items.map((i) => String(i.label ?? i.name ?? ""))
    : ["채널A", "채널B", "채널C", "기타"];
  const values = items.length
    ? items.map((i) => num(i.value ?? i.ratio))
    : [40, 25, 20, 15];

  return `
  <section class="slide-basic" data-auto-animate>
    <div class="basic-grid">
      <div class="basic-text">
        <p class="kicker">${escapeHtml(slide.subtitle)}</p>
        <h2>${escapeHtml(slide.title)}</h2>
        <div class="body">${renderContent(slide.content)}</div>
      </div>
      <div class="basic-visual">
        <canvas id="chart-${idx}"></canvas>
      </div>
    </div>
    <script type="application/json" class="chart-data" data-slide="${idx}" data-kind="donut">${JSON.stringify({ labels, values })}</script>
  </section>`;
}

function opportunitySlide(slide: Slide, idx: number): string {
  const items = asRecordArray(slide.data?.bubbles ?? slide.data?.items ?? slide.data?.competitors);
  const nodes = items.length
    ? items.map((i, n) => ({
        name: String(i.name ?? i.label ?? `항목 ${n + 1}`),
        value: num(i.value ?? i.share, 10 + n * 5),
      }))
    : [
        { name: "경쟁사 A", value: 32 },
        { name: "경쟁사 B", value: 24 },
        { name: "시장 기회", value: 44 },
      ];

  return `
  <section class="slide-basic" data-auto-animate>
    <div class="basic-grid">
      <div class="basic-text">
        <p class="kicker">${escapeHtml(slide.subtitle)}</p>
        <h2>${escapeHtml(slide.title)}</h2>
        <div class="body">${renderContent(slide.content)}</div>
      </div>
      <div class="basic-visual">
        <svg id="bubble-${idx}" width="100%" height="360"></svg>
      </div>
    </div>
    <script type="application/json" class="bubble-data" data-slide="${idx}">${JSON.stringify(nodes)}</script>
  </section>`;
}

function strategySlide(slide: Slide, idx: number): string {
  const points = asRecordArray(slide.data?.points ?? slide.data?.pillars);
  const cards = points.length
    ? points
    : String(slide.content ?? "")
        .split("\n")
        .filter(Boolean)
        .slice(0, 3)
        .map((c): Record<string, unknown> => ({ title: c, desc: "" }));

  const cardHtml = cards
    .slice(0, 3)
    .map(
      (c, i) => `
      <div class="strategy-card" data-aos="fade-up" data-aos-delay="${i * 120}">
        <span class="strategy-num">0${i + 1}</span>
        <h3>${escapeHtml(c.title ?? c.name ?? "")}</h3>
        <p>${escapeHtml(c.desc ?? c.description ?? "")}</p>
      </div>`,
    )
    .join("");

  return `
  <section class="slide-strategy" data-auto-animate>
    <p class="kicker">${escapeHtml(slide.subtitle)}</p>
    <h2>${escapeHtml(slide.title)}</h2>
    <div class="strategy-cards">${cardHtml}</div>
  </section>`;
}

function mediaSlide(slide: Slide, idx: number): string {
  const items = asRecordArray(slide.data?.channels ?? slide.data?.items);
  const channels = items.length
    ? items
    : [
        { name: "메타", ratio: 40, icon: "instagram" },
        { name: "구글", ratio: 30, icon: "search" },
        { name: "네이버", ratio: 20, icon: "compass" },
        { name: "기타", ratio: 10, icon: "layout-grid" },
      ];
  const labels = channels.map((c) => String(c.name ?? c.label ?? ""));
  const values = channels.map((c) => num(c.ratio ?? c.value));
  const legend = channels
    .map(
      (c) => `
      <li><i data-lucide="${escapeAttr(c.icon ?? "circle")}"></i><span>${escapeHtml(c.name ?? c.label ?? "")}</span><b>${num(c.ratio ?? c.value)}%</b></li>`,
    )
    .join("");

  return `
  <section class="slide-basic" data-auto-animate>
    <div class="basic-grid">
      <div class="basic-text">
        <p class="kicker">${escapeHtml(slide.subtitle)}</p>
        <h2>${escapeHtml(slide.title)}</h2>
        <div class="body">${renderContent(slide.content)}</div>
        <ul class="media-legend">${legend}</ul>
      </div>
      <div class="basic-visual">
        <canvas id="chart-${idx}"></canvas>
      </div>
    </div>
    <script type="application/json" class="chart-data" data-slide="${idx}" data-kind="pie">${JSON.stringify({ labels, values })}</script>
  </section>`;
}

function timelineSlide(slide: Slide, idx: number): string {
  const items = asRecordArray(slide.data?.milestones ?? slide.data?.timeline);
  const steps = items.length
    ? items
    : String(slide.content ?? "")
        .split("\n")
        .filter(Boolean)
        .map((c, i): Record<string, unknown> => ({ label: `${i + 1}월`, desc: c }));

  const stepsHtml = steps
    .map(
      (s, i) => `
      <div class="timeline-step" data-gsap="timeline-step" style="--i:${i}">
        <div class="timeline-dot"></div>
        <p class="timeline-label">${escapeHtml(s.label ?? s.month ?? `${i + 1}월`)}</p>
        <p class="timeline-desc">${escapeHtml(s.desc ?? s.description ?? "")}</p>
      </div>`,
    )
    .join("");

  return `
  <section class="slide-timeline" data-auto-animate>
    <p class="kicker">${escapeHtml(slide.subtitle)}</p>
    <h2>${escapeHtml(slide.title)}</h2>
    <div class="timeline-track">${stepsHtml}</div>
  </section>`;
}

function impactSlide(slide: Slide, idx: number): string {
  const items = asRecordArray(slide.data?.kpis ?? slide.data?.items);
  const kpis = items.length
    ? items
    : [
        { label: "ROAS", value: 320, suffix: "%" },
        { label: "CPA", value: 18, suffix: "% ↓" },
        { label: "전환수", value: 1200, suffix: "건" },
      ];

  const kpiHtml = kpis
    .slice(0, 3)
    .map(
      (k) => `
      <div class="impact-kpi">
        <p class="impact-number" data-countup="${num(k.value)}">0</p>
        <p class="impact-suffix">${escapeHtml(k.suffix ?? "")}</p>
        <p class="impact-label">${escapeHtml(k.label ?? "")}</p>
      </div>`,
    )
    .join("");

  return `
  <section class="slide-impact" data-auto-animate>
    <p class="kicker">${escapeHtml(slide.subtitle)}</p>
    <h2>${escapeHtml(slide.title)}</h2>
    <div class="impact-grid">${kpiHtml}</div>
    <div class="body">${renderContent(slide.content)}</div>
  </section>`;
}

function profileSlide(slide: Slide): string {
  const items = asRecordArray(slide.data?.highlights ?? slide.data?.items);
  const cards = items.length
    ? items
    : String(slide.content ?? "")
        .split("\n")
        .filter(Boolean)
        .slice(0, 3)
        .map((c): Record<string, unknown> => ({ text: c }));

  const cardHtml = cards
    .slice(0, 3)
    .map(
      (c, i) => `
      <div class="profile-card" data-aos="zoom-in" data-aos-delay="${i * 100}">
        <p>${escapeHtml(c.text ?? c.label ?? "")}</p>
      </div>`,
    )
    .join("");

  return `
  <section class="slide-profile" data-auto-animate>
    <p class="kicker">${escapeHtml(slide.subtitle)}</p>
    <h2>${escapeHtml(slide.title)}</h2>
    <div class="profile-cards">${cardHtml}</div>
  </section>`;
}

// slide.index(1~8) 고정 구조를 1차 기준으로 사용, 범위를 벗어나면 layout 필드로 폴백
function renderSlide(slide: Slide, theme: ThemeDef): string {
  const i = slide.index;
  if (i === 1) return coverSlide(slide, theme);
  if (i === 2) return statusSlide(slide, i);
  if (i === 3) return opportunitySlide(slide, i);
  if (i === 4) return strategySlide(slide, i);
  if (i === 5) return mediaSlide(slide, i);
  if (i === 6) return timelineSlide(slide, i);
  if (i === 7) return impactSlide(slide, i);
  if (i === 8) return profileSlide(slide);

  switch (slide.layout) {
    case "cover":
      return coverSlide(slide, theme);
    case "data":
      return statusSlide(slide, i);
    case "strategy":
      return strategySlide(slide, i);
    case "timeline":
      return timelineSlide(slide, i);
    case "impact":
      return impactSlide(slide, i);
    case "profile":
      return profileSlide(slide);
    default:
      return statusSlide(slide, i);
  }
}

export function buildPresentationHtml(
  slides: Slide[],
  themeId: ThemeId,
  brandColors: BrandColors,
): string {
  const theme = resolveTheme(themeId, brandColors);
  const sections = slides.map((s) => renderSlide(s, theme)).join("\n");

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>제안서</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.css" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/aos@2.3.4/dist/aos.css" />
<script>
  var printLink = document.createElement('link');
  printLink.rel = 'stylesheet';
  printLink.href = window.location.search.match(/print-pdf/gi)
    ? 'https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/css/print/pdf.css'
    : 'https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/css/print/paper.css';
  document.head.appendChild(printLink);
</script>
<style>
  :root {
    --bg: ${theme.background};
    --accent: ${theme.accent};
    --text: ${theme.text};
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; }
  body { font-family: ${theme.fontDisplay}; }
  .reveal { background: var(--bg); }
  .reveal .slides section { text-align: left; color: var(--text); }
  .kicker { color: var(--accent); font-weight: 700; letter-spacing: .08em; font-size: 15px; margin: 0 0 6px; text-transform: uppercase; }
  h1, h2, h3 { color: var(--text); margin: 0; }
  .body { font-size: 20px; line-height: 1.7; margin-top: 18px; color: var(--text); opacity: .92; }
  .body .ln { margin: 0 0 10px; }
  .reveal .slides section { padding: 40px 64px; }

  /* Cover */
  .slide-cover { position: relative; display: flex; align-items: center; justify-content: center; text-align: center; overflow: hidden; }
  .cover-inner { position: relative; z-index: 2; }
  .cover-eyebrow { color: var(--accent); letter-spacing: .3em; font-weight: 700; font-size: 14px; margin-bottom: 18px; }
  .cover-title { font-size: 56px; font-weight: 900; line-height: 1.25; margin-bottom: 20px; }
  .cover-subtitle { font-size: 22px; opacity: .85; }
  #particles-cover { z-index: 1; }
  .gradient-mesh { z-index: 1; background:
    radial-gradient(circle at 20% 20%, var(--accent) 0%, transparent 45%),
    radial-gradient(circle at 80% 30%, #ffffff22 0%, transparent 40%),
    radial-gradient(circle at 50% 90%, var(--accent) 0%, transparent 50%);
    opacity: .35; }
  .cover-block { position: absolute; left: 0; top: 0; bottom: 0; width: 34%; background: var(--accent); opacity: .12; }

  /* Basic 2-col (status / opportunity / media) */
  .basic-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; align-items: center; height: 100%; }
  .basic-visual { display: flex; align-items: center; justify-content: center; }
  .media-legend { list-style: none; padding: 0; margin: 18px 0 0; display: flex; flex-direction: column; gap: 10px; }
  .media-legend li { display: flex; align-items: center; gap: 10px; font-size: 16px; }
  .media-legend b { margin-left: auto; color: var(--accent); }

  /* Strategy cards */
  .strategy-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 36px; }
  .strategy-card { background: color-mix(in srgb, var(--text) 6%, transparent); border: 1px solid color-mix(in srgb, var(--text) 14%, transparent); border-radius: 16px; padding: 28px; }
  .strategy-num { color: var(--accent); font-size: 26px; font-weight: 900; }
  .strategy-card h3 { margin: 10px 0 8px; font-size: 20px; }
  .strategy-card p { margin: 0; font-size: 15px; opacity: .85; line-height: 1.6; }

  /* Timeline */
  .timeline-track { display: flex; gap: 0; margin-top: 60px; position: relative; }
  .timeline-track::before { content: ""; position: absolute; top: 8px; left: 0; right: 0; height: 2px; background: color-mix(in srgb, var(--text) 20%, transparent); }
  .timeline-step { flex: 1; position: relative; padding-top: 30px; }
  .timeline-dot { position: absolute; top: 0; left: 0; width: 16px; height: 16px; border-radius: 50%; background: var(--accent); }
  .timeline-label { font-weight: 700; color: var(--accent); margin: 0 0 6px; }
  .timeline-desc { font-size: 14px; opacity: .85; margin: 0; line-height: 1.5; }

  /* Impact */
  .impact-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 40px; }
  .impact-kpi { text-align: center; }
  .impact-number { font-size: 64px; font-weight: 900; color: var(--accent); margin: 0; }
  .impact-suffix { margin: -8px 0 6px; opacity: .8; }
  .impact-label { margin: 0; font-size: 16px; opacity: .85; }

  /* Profile */
  .profile-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 40px; }
  .profile-card { background: color-mix(in srgb, var(--accent) 12%, transparent); border-radius: 16px; padding: 28px; font-size: 17px; font-weight: 600; line-height: 1.6; }
</style>
</head>
<body>
<div class="reveal">
  <div class="slides">
    ${sections}
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/aos@2.3.4/dist/aos.js"></script>
<script src="https://cdn.jsdelivr.net/npm/particles.js@2.0.0/particles.min.js"></script>
<script src="https://unpkg.com/lucide@latest"></script>
<script>
  window.Reveal.initialize({ hash: true, controls: true, progress: true, transition: 'slide', width: 1280, height: 720 }).then(function () {
    if (window.lucide) window.lucide.createIcons();
    if (window.AOS) window.AOS.init({ duration: 700, once: true });

    if (window.particlesJS && document.getElementById('particles-cover')) {
      particlesJS('particles-cover', {
        particles: {
          number: { value: 60 },
          color: { value: '${theme.accent}' },
          opacity: { value: 0.5 },
          size: { value: 3 },
          line_linked: { enable: true, color: '${theme.accent}', opacity: 0.25 },
          move: { enable: true, speed: 1.2 }
        },
        interactivity: { events: { onhover: { enable: true, mode: 'grab' } } }
      });
    }

    if (window.gsap) {
      gsap.from('[data-gsap="eyebrow"]', { opacity: 0, y: -12, duration: 0.6 });
      gsap.from('[data-gsap="title"]', { opacity: 0, y: 24, duration: 0.8, delay: 0.15 });
      gsap.from('[data-gsap="subtitle"]', { opacity: 0, y: 16, duration: 0.8, delay: 0.35 });
      gsap.from('[data-gsap="timeline-step"]', { opacity: 0, y: 16, duration: 0.5, stagger: 0.12 });
    }

    // Chart.js: donut / pie
    document.querySelectorAll('.chart-data').forEach(function (el) {
      var payload = JSON.parse(el.textContent || '{}');
      var idx = el.getAttribute('data-slide');
      var kind = el.getAttribute('data-kind');
      var ctx = document.getElementById('chart-' + idx);
      if (!ctx || !window.Chart) return;
      new Chart(ctx, {
        type: kind === 'pie' ? 'pie' : 'doughnut',
        data: {
          labels: payload.labels,
          datasets: [{ data: payload.values, backgroundColor: ['${theme.accent}', '#ffffff55', '#ffffff33', '#ffffff1f', '#ffffff10'] }],
        },
        options: { plugins: { legend: { labels: { color: '${theme.text}' } } } },
      });
    });

    // D3: 버블 차트
    document.querySelectorAll('.bubble-data').forEach(function (el) {
      var nodes = JSON.parse(el.textContent || '[]');
      var idx = el.getAttribute('data-slide');
      var svg = d3.select('#bubble-' + idx);
      if (svg.empty() || !nodes.length) return;
      var width = 480, height = 360;
      var pack = d3.pack().size([width, height]).padding(8);
      var root = d3.hierarchy({ children: nodes }).sum(function (d) { return d.value || 1; });
      var packed = pack(root).leaves();
      var g = svg.attr('viewBox', '0 0 ' + width + ' ' + height).append('g');
      var node = g.selectAll('g').data(packed).enter().append('g')
        .attr('transform', function (d) { return 'translate(' + d.x + ',' + d.y + ')'; });
      node.append('circle').attr('r', function (d) { return d.r; })
        .attr('fill', '${theme.accent}').attr('opacity', 0.75);
      node.append('text').text(function (d) { return d.data.name; })
        .attr('text-anchor', 'middle').attr('dy', 4)
        .attr('fill', '${theme.background}').attr('font-size', 12).attr('font-weight', 700);
    });

    // 카운트업
    document.querySelectorAll('[data-countup]').forEach(function (el) {
      var target = parseFloat(el.getAttribute('data-countup')) || 0;
      var start = 0;
      var duration = 1200;
      var startTime = null;
      function step(ts) {
        if (!startTime) startTime = ts;
        var progress = Math.min((ts - startTime) / duration, 1);
        el.textContent = Math.round(start + (target - start) * progress).toLocaleString('ko-KR');
        if (progress < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });

    window.Reveal.on('slidechanged', function (event) {
      window.parent.postMessage({ type: 'slidechanged', indexh: event.indexh }, '*');
    });
  });

  window.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'goto-slide' && window.Reveal) {
      window.Reveal.slide(e.data.index);
    }
  });
</script>
</body>
</html>`;
}
