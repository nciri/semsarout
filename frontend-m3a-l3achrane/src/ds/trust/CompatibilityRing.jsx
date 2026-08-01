import React from "react";

/** CompatibilityRing — animated circular gauge for the compatibility score. */
export function CompatibilityRing({ value = 85, size = 140, stroke = 12, label = "Excellente compatibilité", style }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const [shown, setShown] = React.useState(0);
  React.useEffect(() => { const t = setTimeout(() => setShown(value), 60); return () => clearTimeout(t); }, [value]);
  const color = value >= 80 ? "var(--green-500)" : value >= 60 ? "var(--gold-500)" : "var(--gray-400)";
  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 8, ...style }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--gray-150)" strokeWidth={stroke} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
            strokeLinecap="round" strokeDasharray={circ}
            strokeDashoffset={circ - (circ * shown) / 100}
            style={{ transition: "stroke-dashoffset 900ms var(--ease-out)" }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ font: `var(--fw-extrabold) ${Math.round(size * 0.26)}px/1 var(--font-display)`, color: "var(--text-strong)" }}>{value}%</span>
        </div>
      </div>
      {label && <span style={{ font: "var(--fw-semibold) var(--fs-body) var(--font-display)", color: "var(--text-strong)", textAlign: "center" }}>{label}</span>}
    </div>
  );
}
