/** MatchScore — compatibility % pill that floats on a listing photo. Green ≥80, gold ≥60, grey below. */
export function MatchScore({ value = 85, size = "md", style }) {
  const tone = value >= 80 ? "var(--green-500)" : value >= 60 ? "var(--gold-600)" : "var(--gray-500)";
  const pad = size === "sm" ? "3px 8px" : "4px 11px";
  const fs = size === "sm" ? "var(--fs-xs)" : "var(--fs-sm)";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4, padding: pad, borderRadius: "var(--radius-pill)",
      background: "rgba(255,255,255,0.94)", color: tone, boxShadow: "var(--shadow-sm)",
      font: `var(--fw-bold) ${fs}/1 var(--font-display)`, backdropFilter: "blur(2px)", ...style,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: tone }} />
      {value}%
    </span>
  );
}
