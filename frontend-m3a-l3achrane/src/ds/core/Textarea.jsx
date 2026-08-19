import React from "react";

/** Textarea — multi-line text field, same look/tokens as Input. */
export function Textarea({ label, hint, error, id, rows = 4, style, containerStyle, ...rest }) {
  const [focus, setFocus] = React.useState(false);
  const inputId = id || label;
  return (
    <label htmlFor={inputId} style={{ display: "flex", flexDirection: "column", gap: 6, ...containerStyle }}>
      {label && <span style={{ font: "var(--fw-semibold) var(--fs-sm) var(--font-body)", color: "var(--text-strong)" }}>{label}</span>}
      <span style={{
        display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px",
        background: "#fff", borderRadius: "var(--radius-sm)",
        border: `1px solid ${error ? "var(--red-500)" : focus ? "var(--border-focus)" : "var(--border-default)"}`,
        boxShadow: focus ? "var(--ring-focus)" : "none", transition: "border-color var(--dur-fast), box-shadow var(--dur-fast)",
      }}>
        <textarea
          id={inputId} rows={rows} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          style={{ flex: 1, border: "none", outline: "none", background: "transparent", resize: "vertical", font: "var(--fw-regular) var(--fs-body) var(--font-body)", color: "var(--text-strong)", minWidth: 0, ...style }}
          {...rest}
        />
      </span>
      {(hint || error) && <span style={{ font: "var(--fw-regular) var(--fs-xs) var(--font-body)", color: error ? "var(--red-600)" : "var(--text-muted)" }}>{error || hint}</span>}
    </label>
  );
}
