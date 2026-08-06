import React from "react";
import { Icon } from "./Icon.jsx";

/** Badge — small status token. tone: neutral · verified · info · warning · danger · gold · navy */
export function Badge({ children, tone = "neutral", icon, size = "md", style, ...rest }) {
  const tones = {
    neutral: { bg: "var(--gray-100)", fg: "var(--gray-700)" },
    verified: { bg: "var(--green-100)", fg: "var(--green-700)" },
    info: { bg: "var(--info-100)", fg: "var(--info-500)" },
    warning: { bg: "var(--amber-100)", fg: "var(--gold-700)" },
    danger: { bg: "var(--red-100)", fg: "var(--red-600)" },
    gold: { bg: "var(--gold-100)", fg: "var(--gold-700)" },
    navy: { bg: "var(--navy-100)", fg: "var(--navy-700)" },
    solidNavy: { bg: "var(--navy-700)", fg: "#fff" },
    solidGreen: { bg: "var(--green-500)", fg: "#fff" },
  }[tone];
  const pad = size === "sm" ? "3px 8px" : "4px 10px";
  const fs = size === "sm" ? "var(--fs-xs)" : "var(--fs-sm)";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, padding: pad, borderRadius: "var(--radius-pill)",
      background: tones.bg, color: tones.fg, font: `var(--fw-semibold) ${fs}/1 var(--font-body)`,
      whiteSpace: "nowrap", ...style,
    }} {...rest}>
      {icon && <Icon name={icon} size={size === "sm" ? 12 : 14} strokeWidth={2.4} />}
      {children}
    </span>
  );
}
