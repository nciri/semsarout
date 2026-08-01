import { Icon } from "./Icon.jsx";

/**
 * Button — primary action control.
 * variants: primary (navy) · accent (gold) · secondary (outline) · ghost · danger
 */
export function Button({
  children, variant = "primary", size = "md", iconLeft, iconRight,
  fullWidth = false, disabled = false, style, ...rest
}) {
  const sizes = {
    sm: { padding: "8px 14px", font: "var(--fw-semibold) var(--fs-sm)/1 var(--font-display)", gap: 6, icon: 15 },
    md: { padding: "11px 20px", font: "var(--fw-semibold) var(--fs-body)/1 var(--font-display)", gap: 8, icon: 18 },
    lg: { padding: "14px 26px", font: "var(--fw-bold) var(--fs-body-lg)/1 var(--font-display)", gap: 9, icon: 20 },
  }[size];

  const variants = {
    primary: { background: "var(--brand-primary)", color: "#fff", border: "1px solid var(--brand-primary)", boxShadow: "var(--shadow-xs)" },
    accent: { background: "var(--brand-accent)", color: "var(--text-on-accent)", border: "1px solid var(--brand-accent)", boxShadow: "var(--shadow-xs)" },
    secondary: { background: "#fff", color: "var(--text-strong)", border: "1px solid var(--border-default)" },
    ghost: { background: "transparent", color: "var(--text-strong)", border: "1px solid transparent" },
    danger: { background: "var(--red-600)", color: "#fff", border: "1px solid var(--red-600)" },
  }[variant];

  const hover = {
    primary: "var(--brand-primary-hover)", accent: "var(--brand-accent-hover)",
    secondary: "var(--gray-50)", ghost: "var(--gray-100)", danger: "var(--red-500)",
  }[variant];

  return (
    <button
      disabled={disabled}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = "scale(0.98)"; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = ""; }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = hover; }}
      onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.background = variants.background; }}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: sizes.gap,
        padding: sizes.padding, font: sizes.font, borderRadius: "var(--radius-sm)",
        width: fullWidth ? "100%" : "auto", cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1, transition: "background var(--dur-fast) var(--ease-standard), transform var(--dur-fast) var(--ease-standard)",
        whiteSpace: "nowrap", ...variants, ...style,
      }}
      {...rest}
    >
      {iconLeft && <Icon name={iconLeft} size={sizes.icon} strokeWidth={2.2} />}
      {children}
      {iconRight && <Icon name={iconRight} size={sizes.icon} strokeWidth={2.2} />}
    </button>
  );
}
