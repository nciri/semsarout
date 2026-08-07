import React from "react";
import { Icon } from "../core/Icon.jsx";

/** AmenityChip — small icon + label describing a listing attribute. */
export function AmenityChip({ icon = "check", children, style }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: "var(--radius-pill)",
      background: "var(--gray-100)", color: "var(--gray-700)", font: "var(--fw-medium) var(--fs-sm)/1 var(--font-body)", ...style,
    }}>
      <Icon name={icon} size={14} color="var(--gray-500)" strokeWidth={2} />
      {children}
    </span>
  );
}
