import { Icon } from "./Icon.jsx";

/** IconButton — square/circular icon-only control. */
export function IconButton({ icon, label, variant = "ghost", size = "md", round = false, disabled = false, style, ...rest }) {
  const dim = { sm: 32, md: 40, lg: 46 }[size];
  const iconSize = { sm: 16, md: 19, lg: 22 }[size];
  const variants = {
    ghost: { background: "transparent", color: "var(--text-body)", border: "1px solid transparent" },
    soft: { background: "var(--gray-100)", color: "var(--text-strong)", border: "1px solid transparent" },
    outline: { background: "#fff", color: "var(--text-strong)", border: "1px solid var(--border-default)" },
    navy: { background: "var(--brand-primary)", color: "#fff", border: "1px solid var(--brand-primary)" },
  }[variant];
  return (
    <button
      aria-label={label}
      disabled={disabled}
      onMouseEnter={(e) => { if (!disabled && variant === "ghost") e.currentTarget.style.background = "var(--gray-100)"; }}
      onMouseLeave={(e) => { if (variant === "ghost") e.currentTarget.style.background = "transparent"; }}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", width: dim, height: dim,
        borderRadius: round ? "var(--radius-pill)" : "var(--radius-sm)", cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1, transition: "background var(--dur-fast) var(--ease-standard)", ...variants, ...style,
      }}
      {...rest}
    >
      <Icon name={icon} size={iconSize} strokeWidth={2} />
    </button>
  );
}
