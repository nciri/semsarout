import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "../core/Button.jsx";
import { Icon } from "../core/Icon.jsx";
import { LanguageSwitcher } from "./LanguageSwitcher.jsx";

/** TopBar — public site navy header: brand, links, language, auth actions. */
export function TopBar({
  links, onSignIn, onSignUp, style,
}) {
  const { t } = useTranslation();
  const navLinks = links ?? [
    { label: t("topbar.discover"), to: "/recherche", icon: "search" },
    { label: t("topbar.howItWorks"), to: "/#how-it-works", icon: "info" },
    { label: t("topbar.about"), to: "/#about", icon: "users" },
  ];
  return (
    <header style={{ display: "flex", alignItems: "center", gap: 28, padding: "0 40px", height: 68, background: "var(--surface-navy)", boxShadow: "var(--shadow-nav)", ...style }}>
      <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "var(--radius-sm)", background: "#fff", padding: 3, boxSizing: "border-box" }}>
          <img src="/logo-mark.png" alt="" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
        </span>
        <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
          <span style={{ font: "var(--fw-extrabold) var(--fs-body) var(--font-display)", color: "#fff" }}>M3a-L3chrane</span>
          <span style={{ font: "var(--fw-regular) var(--fs-xs) var(--font-arabic)", color: "var(--text-on-navy-muted)" }}>مع العشران</span>
        </span>
      </Link>
      <nav style={{ display: "flex", gap: 22, flex: 1 }}>
        {navLinks.map((l) => (
          <Link key={l.label} to={l.to} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-on-navy-muted)", font: "var(--fw-medium) var(--fs-body) var(--font-display)", textDecoration: "none" }}>
            {l.icon && <Icon name={l.icon} size={15} strokeWidth={2} />}
            {l.label}
          </Link>
        ))}
      </nav>
      <LanguageSwitcher />
      <a href="#" onClick={onSignIn} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#fff", font: "var(--fw-medium) var(--fs-body) var(--font-display)" }}>
        <Icon name="log-in" size={16} strokeWidth={2} />
        {t("topbar.signIn")}
      </a>
      <Button variant="accent" size="sm" onClick={onSignUp}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Icon name="user-plus" size={15} strokeWidth={2} />
          {t("topbar.signUp")}
        </span>
      </Button>
    </header>
  );
}
