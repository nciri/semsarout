/** Checkbox — native checkbox with clickable label, consistent with the DS. */
export function Checkbox({ label, hint, error, id, style, containerStyle, ...rest }) {
  const inputId = id || label;
  return (
    <label htmlFor={inputId} style={{ display: "flex", flexDirection: "column", gap: 6, ...containerStyle }}>
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="checkbox" id={inputId}
          style={{ width: 18, height: 18, accentColor: "var(--border-focus)", cursor: "pointer", ...style }}
          {...rest}
        />
        {label && <span style={{ font: "var(--fw-regular) var(--fs-body) var(--font-body)", color: "var(--text-strong)", cursor: "pointer" }}>{label}</span>}
      </span>
      {(hint || error) && <span style={{ font: "var(--fw-regular) var(--fs-xs) var(--font-body)", color: error ? "var(--red-600)" : "var(--text-muted)" }}>{error || hint}</span>}
    </label>
  );
}
