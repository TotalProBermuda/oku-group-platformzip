"use client";

import { useEffect, useId, useRef, useState } from "react";

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__|_[^_]+_)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={index}>{part.slice(1, -1)}</em>;
    if (part.startsWith("__") && part.endsWith("__")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("_") && part.endsWith("_")) return <em key={index}>{part.slice(1, -1)}</em>;
    return part;
  });
}

function renderDescription(text: string) {
  return text.split(/\n\s*\n/).filter((block) => block.trim()).map((block, index) => {
    const lines = block.split(/\r?\n/).map((line) => line.replace(/^\s{0,3}#{1,6}\s+/, "").trim());
    const isList = lines.every((line) => /^[-*]\s+/.test(line));
    return (
      <span key={index} style={{ display: "block", marginBottom: index ? 10 : 0 }}>
        {lines.map((line, lineIndex) => (
          <span key={lineIndex} style={{ display: "block" }}>
            {isList ? <><span aria-hidden="true">• </span>{renderInlineMarkdown(line.replace(/^[-*]\s+/, ""))}</> : renderInlineMarkdown(line)}
          </span>
        ))}
      </span>
    );
  });
}

const LABELS: Record<string, { more: string; less: string }> = {
  en: { more: "Read more", less: "Read less" },
  es: { more: "Leer más", less: "Leer menos" },
  pt: { more: "Ler mais", less: "Ler menos" },
};

export default function ExpandableText({
  text,
  locale,
  maxLines = 3,
  className,
}: {
  text: string;
  locale: string;
  maxLines?: number;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const contentRef = useRef<HTMLParagraphElement>(null);
  const contentId = useId();
  const labels = LABELS[locale] ?? LABELS.en;

  useEffect(() => {
    const node = contentRef.current;
    if (!node || expanded) return;
    const measure = () => setHasOverflow(node.scrollHeight > node.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [expanded, text, maxLines]);

  return (
    <div className={className}>
      <p
        id={contentId}
        ref={contentRef}
        style={{
          color: "#4b5563",
          fontSize: 14,
          lineHeight: 1.6,
          margin: 0,
          whiteSpace: "pre-line",
          display: expanded ? "block" : "-webkit-box",
          WebkitBoxOrient: "vertical",
          WebkitLineClamp: expanded ? "unset" : maxLines,
          overflow: "hidden",
        }}
      >
        {renderDescription(text)}
      </p>
      {hasOverflow ? (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => setExpanded((current) => !current)}
          style={{
            appearance: "none",
            background: "none",
            border: 0,
            color: "#c41e3a",
            cursor: "pointer",
            font: "inherit",
            fontSize: 13,
            fontWeight: 650,
            marginTop: 6,
            minHeight: 36,
            padding: "4px 0",
            textDecoration: "underline",
            textUnderlineOffset: 3,
          }}
        >
          {expanded ? labels.less : labels.more}
        </button>
      ) : null}
    </div>
  );
}
