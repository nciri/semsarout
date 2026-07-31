import { Icon } from "../core/Icon.jsx";

/** SidebarNav — fixed navy app sidebar with brand, nav items, help footer. */
export function SidebarNav({
  items = [
    { icon: "layout-dashboard", label: "Tableau de bord", value: "dash" },
    { icon: "search", label: "Rechercher", value: "search" },
    { icon: "heart", label: "Mes favoris", value: "fav" },
    { icon: "file-text", label: "Mes candidatures", value: "apps" },
    { icon: "file-signature", label: "Mes contrats", value: "contracts" },
    { icon: "message-circle", label: "Messagerie", value: "msg", badge: 2 },
    { icon: "credit-card", label: "Paiements", value: "pay" },
    { icon: "user", label: "Profil", value: "profile" },
    { icon: "settings", label: "Paramètres", value: "settings" },
  ],
  active = "dash", onSelect, width = 248, style,
}) {
  return (
    <nav style={{ width, minWidth: width, height: "100%", background: "var(--surface-navy)", display: "flex", flexDirection: "column", padding: "20px 14px", boxSizing: "border-box", ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 8px 22px" }}>
        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "var(--radius-sm)", background: "var(--gold-500)", color: "var(--navy-800)" }}>
          <Icon name="home" size={19} strokeWidth={2.4} />
        </span>
        <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
          <span style={{ font: "var(--fw-extrabold) var(--fs-body) var(--font-display)", color: "#fff" }}>M3a-L3chrane</span>
          <span style={{ font: "var(--fw-regular) var(--fs-xs) var(--font-arabic)", color: "var(--text-on-navy-muted)" }}>مع العشران</span>
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
        {items.map((it) => {
          const on = active === it.value;
          return (
            <button key={it.value} onClick={() => onSelect && onSelect(it.value)} style={{
              display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: "var(--radius-sm)",
              border: "none", cursor: "pointer", textAlign: "left", width: "100%",
              background: on ? "rgba(255,255,255,0.12)" : "transparent",
              color: on ? "#fff" : "var(--text-on-navy-muted)",
              font: `var(--fw-${on ? "semibold" : "medium"}) var(--fs-body) var(--font-display)`,
              transition: "background var(--dur-fast)",
            }}
            onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
            onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = "transparent"; }}>
              <Icon name={it.icon} size={19} strokeWidth={2} />
              <span style={{ flex: 1 }}>{it.label}</span>
              {it.badge != null && <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: "var(--radius-pill)", background: "var(--gold-500)", color: "var(--navy-800)", font: "var(--fw-bold) var(--fs-xs)/18px var(--font-display)", textAlign: "center" }}>{it.badge}</span>}
            </button>
          );
        })}
      </div>
      <button style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", marginTop: 12, background: "none", border: "none", color: "var(--text-on-navy-muted)", cursor: "pointer", font: "var(--fw-medium) var(--fs-body) var(--font-display)" }}>
        <Icon name="life-buoy" size={19} strokeWidth={2} /> Besoin d&apos;aide ?
      </button>
    </nav>
  );
}
