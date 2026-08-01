import { Icon } from "../core/Icon.jsx";

/** FeatureItem — icon + bold title + calm subtitle. Trust band / how-it-works cell. */
export function FeatureItem({ icon = "shield-check", title, subtitle, layout = "row", tone = "navy", style }) {
  const chip = { navy: { bg: "var(--navy-50)", fg: "var(--navy-700)" }, green: { bg: "var(--green-50)", fg: "var(--green-600)" }, gold: { bg: "var(--gold-100)", fg: "var(--gold-700)" } }[tone];
  const col = layout === "col";
  return (
    <div style={{ display: "flex", flexDirection: col ? "column" : "row", alignItems: col ? "flex-start" : "flex-start", gap: 12, textAlign: "left", ...style }}>
      <span style={{ flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: "var(--radius-md)", background: chip.bg, color: chip.fg }}>
        <Icon name={icon} size={22} strokeWidth={2} />
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{ font: "var(--fw-bold) var(--fs-body) var(--font-display)", color: "var(--text-strong)" }}>{title}</span>
        {subtitle && <span style={{ font: "var(--fw-regular) var(--fs-sm)/1.45 var(--font-body)", color: "var(--text-muted)" }}>{subtitle}</span>}
      </span>
    </div>
  );
}
