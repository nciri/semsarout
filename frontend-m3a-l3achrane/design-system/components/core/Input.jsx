import React from "react";
import { Icon } from "./Icon.jsx";

/** Input — single-line text field with optional leading icon and label. */
export function Input({ label, icon, hint, error, id, style, containerStyle, ...rest }) {
  const [focus, setFocus] = React.useState(false);
  const inputId = id || label;
  return (
    <label htmlFor={inputId} style={{ display: "flex", flexDirection: "column", gap: 6, ...containerStyle }}>
      {label && <span style={{ font: "var(--fw-semibold) var(--fs-sm) var(--font-body)", color: "var(--text-strong)" }}>{label}</span>}
      <span style={{
        display: "flex", alignItems: "center", gap: 8, padding: "0 12px", height: 44,
        background: "#fff", borderRadius: "var(--radius-sm)",
        border: `1px solid ${error ? "var(--red-500)" : focus ? "var(--border-focus)" : "var(--border-default)"}`,
        boxShadow: focus ? "var(--ring-focus)" : "none", transition: "border-color var(--dur-fast), box-shadow var(--dur-fast)",
      }}>
        {icon && <Icon name={icon} size={18} color="var(--gray-500)" />}
        <input
          id={inputId} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          style={{ flex: 1, border: "none", outline: "none", background: "transparent", font: "var(--fw-regular) var(--fs-body) var(--font-body)", color: "var(--text-strong)", minWidth: 0, ...style }}
          {...rest}
        />
      </span>
      {(hint || error) && <span style={{ font: "var(--fw-regular) var(--fs-xs) var(--font-body)", color: error ? "var(--red-600)" : "var(--text-muted)" }}>{error || hint}</span>}
    </label>
  );
}
