import React from "react";
import { Icon } from "./Icon.jsx";

/** Select — styled native select with label + chevron. */
export function Select({ label, icon, options = [], value, onChange, id, style, containerStyle, ...rest }) {
  const inputId = id || label;
  return (
    <label htmlFor={inputId} style={{ display: "flex", flexDirection: "column", gap: 6, ...containerStyle }}>
      {label && <span style={{ font: "var(--fw-semibold) var(--fs-sm) var(--font-body)", color: "var(--text-strong)" }}>{label}</span>}
      <span style={{
        position: "relative", display: "flex", alignItems: "center", gap: 8, padding: "0 12px", height: 44,
        background: "#fff", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-default)",
      }}>
        {icon && <Icon name={icon} size={18} color="var(--gray-500)" />}
        <select
          id={inputId} value={value} onChange={onChange}
          style={{ flex: 1, appearance: "none", border: "none", outline: "none", background: "transparent",
            font: "var(--fw-medium) var(--fs-body) var(--font-body)", color: "var(--text-strong)", cursor: "pointer", ...style }}
          {...rest}
        >
          {options.map((o) => typeof o === "string"
            ? <option key={o} value={o}>{o}</option>
            : <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <Icon name="chevron-down" size={18} color="var(--gray-500)" />
      </span>
    </label>
  );
}
