"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Mermaid 다이어그램 렌더링 (실패 시 원본 코드 표시)
function MermaidBlock({ chart }: { chart: string }) {
  const [svg, setSvg] = useState<string>("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "neutral",
          securityLevel: "loose",
          fontFamily: "Pretendard, sans-serif",
        });
        const id = `ctch-mermaid-${Math.random().toString(36).slice(2)}`;
        const { svg } = await mermaid.render(id, chart.trim());
        if (alive) setSvg(svg);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [chart]);

  if (failed) {
    return (
      <pre className="overflow-x-auto rounded-lg bg-canvas p-3 font-mono text-[12px] text-ink-soft">
        {chart}
      </pre>
    );
  }
  if (!svg) {
    return (
      <div className="rounded-lg bg-canvas p-6 text-center text-[13px] text-ink-muted">
        다이어그램 그리는 중…
      </div>
    );
  }
  return (
    <div
      className="overflow-x-auto rounded-lg border border-line bg-surface p-4 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export function ReportRenderer({ markdown }: { markdown: string }) {
  return (
    <div className="space-y-3 text-[14px] leading-relaxed text-ink-soft">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h2 className="mt-6 border-b border-line pb-2 font-display text-[19px] font-semibold text-ink first:mt-0">
              {children}
            </h2>
          ),
          h2: ({ children }) => (
            <h2 className="mt-6 flex items-center gap-2 border-b border-line pb-2 font-display text-[17px] font-semibold text-ink first:mt-0">
              <span className="signal-dot" />
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-4 text-[15px] font-semibold text-ink">{children}</h3>
          ),
          p: ({ children }) => <p className="my-2">{children}</p>,
          ul: ({ children }) => <ul className="my-2 space-y-1.5 pl-1">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 list-decimal space-y-1.5 pl-5">{children}</ol>,
          li: ({ children }) => (
            <li className="marker:text-signal">{children}</li>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-ink">{children}</strong>
          ),
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-left text-[12.5px]">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-canvas text-ink-muted">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="whitespace-nowrap px-3 py-2 font-medium">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border-t border-line px-3 py-2 align-top">{children}</td>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-2 border-signal bg-signal-soft/40 px-3.5 py-2">
              {children}
            </blockquote>
          ),
          code: (props) => {
            const { className, children } = props as {
              className?: string;
              children?: React.ReactNode;
            };
            const text = String(children ?? "");
            if (className?.includes("mermaid")) {
              return <MermaidBlock chart={text} />;
            }
            if (className?.includes("language-")) {
              return (
                <pre className="my-3 overflow-x-auto rounded-lg bg-canvas p-3 font-mono text-[12px]">
                  {text}
                </pre>
              );
            }
            return (
              <code className="rounded bg-canvas px-1 py-0.5 font-mono text-[12.5px] text-ink">
                {children}
              </code>
            );
          },
          pre: ({ children }) => <>{children}</>,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
