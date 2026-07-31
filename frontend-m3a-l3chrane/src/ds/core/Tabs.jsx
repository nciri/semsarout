import React from "react";
import { Icon } from "./Icon.jsx";

/** Tabs — underlined segmented navigation (Colocations / Résidences pattern). */
export function Tabs({ tabs = [], value, onChange, style }) {
  const [internal, setInternal] = React.useState(value ?? (tabs[0] && (tabs[0].value ?? tabs[0])));
  const active = value ?? internal;
  const pick = (v) => { setInternal(v); onChange && onChange(v); };
  return (
    <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border-subtle)", ...style }}>
      {tabs.map((t) => {
        const val = t.value ?? t; const label = t.label ?? t; const on = active === val;
        return (
          <button key={val} onClick={() => pick(val)} style={{
            display: "inline-flex", alignItems: "center", gap: 7, padding: "12px 16px", background: "none",
            border: "none", borderBottom: `2px solid ${on ? "var(--navy-700)" : "transparent"}`, cursor: "pointer",
            marginBottom: -1, color: on ? "var(--navy-700)" : "var(--text-muted)",
            font: `var(--fw-semibold) var(--fs-body) var(--font-display)`, transition: "color var(--dur-fast)",
          }}>
            {t.icon && <Icon name={t.icon} size={17} strokeWidth={2.2} />}
            {label}
          </button>
        );
      })}
    </div>
  );
}
