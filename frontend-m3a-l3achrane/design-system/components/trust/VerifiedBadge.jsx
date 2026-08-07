import React from "react";
import { Icon } from "../core/Icon.jsx";

/** VerifiedBadge — trust token showing identity/status verification. */
export function VerifiedBadge({ label = "Vérifiée", level = "full", size = "md", style }) {
  const on = { full: "var(--green-500)", partial: "var(--gold-600)", none: "var(--gray-400)" }[level];
  const bg = { full: "var(--green-100)", partial: "var(--gold-100)", none: "var(--gray-100)" }[level];
  const fs = size === "sm" ? "var(--fs-xs)" : "var(--fs-sm)";
  const ic = size === "sm" ? 13 : 15;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, padding: size === "sm" ? "3px 9px" : "5px 11px",
      borderRadius: "var(--radius-pill)", background: bg, color: on,
      font: `var(--fw-semibold) ${fs}/1 var(--font-body)`, ...style,
    }}>
      <Icon name="shield-check" size={ic} strokeWidth={2.4} />
      {label}
    </span>
  );
}
