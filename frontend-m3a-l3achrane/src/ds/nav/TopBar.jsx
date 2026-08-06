import { useTranslation } from "react-i18next";
import { Button } from "../core/Button.jsx";
import { LanguageSwitcher } from "./LanguageSwitcher.jsx";

/** TopBar — public site navy header: brand, links, language, auth actions. */
export function TopBar({
  links, onSignIn, onSignUp, style,
}) {
  const { t } = useTranslation();
  const navLinks = links ?? [t("topbar.howItWorks"), t("topbar.discover"), t("topbar.about")];
  return (
    <header style={{ display: "flex", alignItems: "center", gap: 28, padding: "0 40px", height: 68, background: "var(--surface-navy)", boxShadow: "var(--shadow-nav)", ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "var(--radius-sm)", background: "#fff", padding: 3, boxSizing: "border-box" }}>
          <img src="/logo-mark.png" alt="" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
        </span>
        <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
          <span style={{ font: "var(--fw-extrabold) var(--fs-body) var(--font-display)", color: "#fff" }}>M3a-L3chrane</span>
          <span style={{ font: "var(--fw-regular) var(--fs-xs) var(--font-arabic)", color: "var(--text-on-navy-muted)" }}>مع العشران</span>
        </span>
      </div>
      <nav style={{ display: "flex", gap: 22, flex: 1 }}>
        {navLinks.map((l) => <a key={l} href="#" style={{ color: "var(--text-on-navy-muted)", font: "var(--fw-medium) var(--fs-body) var(--font-display)" }}>{l}</a>)}
      </nav>
      <LanguageSwitcher />
      <a href="#" onClick={onSignIn} style={{ color: "#fff", font: "var(--fw-medium) var(--fs-body) var(--font-display)" }}>{t("topbar.signIn")}</a>
      <Button variant="accent" size="sm" onClick={onSignUp}>{t("topbar.signUp")}</Button>
    </header>
  );
}
