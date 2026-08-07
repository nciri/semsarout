import React from "react";

/** Avatar — round user image with optional verified dot and name/subtitle. */
export function Avatar({ src, name = "", size = 40, verified = false, subtitle, showLabel = false, style }) {
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const circle = (
    <span style={{ position: "relative", flex: "none", display: "inline-block", width: size, height: size }}>
      <span style={{
        display: "flex", alignItems: "center", justifyContent: "center", width: size, height: size,
        borderRadius: "var(--radius-pill)", overflow: "hidden", background: "var(--navy-100)",
        color: "var(--navy-600)", font: `var(--fw-semibold) ${Math.round(size * 0.36)}px/1 var(--font-display)`,
      }}>
        {src ? <img src={src} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials}
      </span>
      {verified && (
        <span style={{
          position: "absolute", right: -1, bottom: -1, width: size * 0.36, height: size * 0.36,
          background: "var(--green-500)", borderRadius: "var(--radius-pill)", border: "2px solid #fff",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width={size * 0.2} height={size * 0.2} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        </span>
      )}
    </span>
  );
  if (!showLabel) return circle;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10, ...style }}>
      {circle}
      <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
        <span style={{ font: "var(--fw-semibold) var(--fs-sm) var(--font-display)", color: "var(--text-strong)" }}>{name}</span>
        {subtitle && <span style={{ font: "var(--fw-regular) var(--fs-xs) var(--font-body)", color: "var(--text-muted)" }}>{subtitle}</span>}
      </span>
    </span>
  );
}
