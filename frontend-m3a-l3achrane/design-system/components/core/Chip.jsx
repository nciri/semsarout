import React from "react";
import { Icon } from "./Icon.jsx";

/** Chip — filter / attribute pill. Optional icon; selectable state. */
export function Chip({ children, icon, selected = false, onClick, style, ...rest }) {
  const clickable = typeof onClick === "function";
  return (
    <span
      onClick={onClick}
      role={clickable ? "button" : undefined}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px",
        borderRadius: "var(--radius-pill)", font: "var(--fw-medium) var(--fs-sm)/1 var(--font-body)",
        cursor: clickable ? "pointer" : "default",
        background: selected ? "var(--navy-700)" : "var(--gray-100)",
        color: selected ? "#fff" : "var(--gray-700)",
        border: selected ? "1px solid var(--navy-700)" : "1px solid var(--border-subtle)",
        transition: "all var(--dur-fast) var(--ease-standard)", ...style,
      }}
      {...rest}
    >
      {icon && <Icon name={icon} size={14} strokeWidth={2} />}
      {children}
    </span>
  );
}
