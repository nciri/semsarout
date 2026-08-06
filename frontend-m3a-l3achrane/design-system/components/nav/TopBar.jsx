import React from "react";
import { Icon } from "../core/Icon.jsx";
import { Button } from "../core/Button.jsx";

/** TopBar — public site navy header: brand, links, language, auth actions. */
export function TopBar({
  links = ["Comment ça marche", "Découvrir", "À propos"], lang = "FR",
  onSignIn, onSignUp, style,
}) {
  return (
    <header style={{ display: "flex", alignItems: "center", gap: 28, padding: "0 40px", height: 68, background: "var(--surface-navy)", boxShadow: "var(--shadow-nav)", ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "var(--radius-sm)", background: "var(--gold-500)", color: "var(--navy-800)" }}>
          <Icon name="home" size={19} strokeWidth={2.4} />
        </span>
        <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
          <span style={{ font: "var(--fw-extrabold) var(--fs-body) var(--font-display)", color: "#fff" }}>M3a-L3chrane</span>
          <span style={{ font: "var(--fw-regular) var(--fs-xs) var(--font-arabic)", color: "var(--text-on-navy-muted)" }}>مع العشران</span>
        </span>
      </div>
      <nav style={{ display: "flex", gap: 22, flex: 1 }}>
        {links.map((l) => <a key={l} href="#" style={{ color: "var(--text-on-navy-muted)", font: "var(--fw-medium) var(--fs-body) var(--font-display)" }}>{l}</a>)}
      </nav>
      <button style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "none", color: "#fff", cursor: "pointer", font: "var(--fw-medium) var(--fs-body) var(--font-display)" }}>
        {lang} <Icon name="chevron-down" size={15} />
      </button>
      <a href="#" onClick={onSignIn} style={{ color: "#fff", font: "var(--fw-medium) var(--fs-body) var(--font-display)" }}>Se connecter</a>
      <Button variant="accent" size="sm" onClick={onSignUp}>S'inscrire</Button>
    </header>
  );
}
