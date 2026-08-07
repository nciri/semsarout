import { useTranslation } from "react-i18next";
import { Icon } from "../core/Icon.jsx";
import { LanguageSwitcher } from "./LanguageSwitcher.jsx";

/** SidebarNav — fixed navy app sidebar with brand, nav items, help footer. */
export function SidebarNav({
  items, active = "dash", onSelect, width = 248, style, userName, onLogout,
}) {
  const { t } = useTranslation();
  const displayName = userName || t("nav.myAccount");
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  const navItems = items ?? [
    { icon: "layout-dashboard", label: t("nav.dashboard"), value: "dash" },
    { icon: "search", label: t("nav.search"), value: "search" },
    { icon: "heart", label: t("nav.favorites"), value: "fav" },
    { icon: "file-text", label: t("nav.applications"), value: "apps" },
    { icon: "file-signature", label: t("nav.contracts"), value: "contracts" },
    { icon: "message-circle", label: t("nav.messaging"), value: "msg", badge: 2 },
    { icon: "credit-card", label: t("nav.payments"), value: "pay" },
    { icon: "user", label: t("nav.profile"), value: "profile" },
    { icon: "settings", label: t("nav.settings"), value: "settings" },
  ];
  return (
    <nav style={{ width, minWidth: width, height: "100%", background: "var(--surface-navy)", display: "flex", flexDirection: "column", padding: "20px 14px", boxSizing: "border-box", ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 8px 22px" }}>
        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "var(--radius-sm)", background: "#fff", padding: 3, boxSizing: "border-box" }}>
          <img src="/logo-mark.png" alt="" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
        </span>
        <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
          <span style={{ font: "var(--fw-extrabold) var(--fs-body) var(--font-display)", color: "#fff" }}>M3a-L3chrane</span>
          <span style={{ font: "var(--fw-regular) var(--fs-xs) var(--font-arabic)", color: "var(--text-on-navy-muted)" }}>مع العشران</span>
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
        {navItems.map((it) => {
          const on = active === it.value;
          return (
            <button key={it.value} onClick={() => onSelect && onSelect(it.value)} style={{
              display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: "var(--radius-sm)",
              border: "none", cursor: "pointer", textAlign: "start", width: "100%",
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
      <LanguageSwitcher style={{ marginTop: 12, justifyContent: "center" }} />
      <button style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", marginTop: 8, background: "none", border: "none", color: "var(--text-on-navy-muted)", cursor: "pointer", font: "var(--fw-medium) var(--fs-body) var(--font-display)" }}>
        <Icon name="life-buoy" size={19} strokeWidth={2} /> {t("nav.help")}
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 8px 4px", marginTop: 8, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
        <span style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: "50%",
          background: "rgba(255,255,255,0.12)", color: "#fff", font: "var(--fw-bold) var(--fs-xs) var(--font-display)", flexShrink: 0,
        }}>
          {initials}
        </span>
        <span style={{ flex: 1, minWidth: 0, color: "#fff", font: "var(--fw-semibold) var(--fs-sm) var(--font-display)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {displayName}
        </span>
        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            aria-label={t("nav.logout")}
            title={t("nav.logout")}
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: "var(--radius-sm)", border: "none", background: "transparent", color: "var(--text-on-navy-muted)", cursor: "pointer", flexShrink: 0 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-on-navy-muted)"; }}
          >
            <Icon name="log-out" size={17} strokeWidth={2} />
          </button>
        )}
      </div>
    </nav>
  );
}
