const NS = window.M3aL3chraneDesignSystem_7918b4;
const { Button, IconButton, Icon, Badge, Avatar, Input, VerifiedBadge } = NS;
const { useState } = React;

const NAV = [
  { icon: "layout-dashboard", label: "Tableau de bord", value: "dash" },
  { icon: "users", label: "Affiliés", value: "aff" },
  { icon: "badge-check", label: "Vérifications", value: "ver", badge: 12 },
  { icon: "bookmark", label: "Offres réservées", value: "res" },
  { icon: "hand-coins", label: "Subventions", value: "sub" },
  { icon: "bar-chart-3", label: "Reporting", value: "rep" },
  { icon: "file-text", label: "Facturation", value: "bill" },
  { icon: "plug", label: "API & webhooks", value: "api" },
];

function PartnerSidebar({ active, onSelect }) {
  return (
    <nav style={{ width: 248, minWidth: 248, background: "var(--surface-navy)", display: "flex", flexDirection: "column", padding: "20px 14px", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 8px 8px" }}>
        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "var(--radius-sm)", background: "var(--gold-500)", color: "var(--navy-800)" }}><Icon name="home" size={19} strokeWidth={2.4} /></span>
        <div style={{ lineHeight: 1.1 }}><div style={{ font: "var(--fw-extrabold) var(--fs-body) var(--font-display)", color: "#fff" }}>M3a-L3chrane</div><div style={{ font: "var(--fw-medium) var(--fs-xs) var(--font-body)", color: "var(--gold-400)" }}>Portail partenaire</div></div>
      </div>
      <div style={{ margin: "12px 4px 16px", padding: "10px 12px", borderRadius: "var(--radius-md)", background: "rgba(255,255,255,.07)", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 30, height: 30, borderRadius: "var(--radius-sm)", background: "var(--navy-400)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", font: "var(--fw-bold) var(--fs-xs) var(--font-display)" }}>UM</span>
        <div style={{ lineHeight: 1.15 }}><div style={{ font: "var(--fw-semibold) var(--fs-sm) var(--font-display)", color: "#fff" }}>Université M6P</div><div style={{ font: "var(--fw-regular) var(--fs-xs) var(--font-body)", color: "var(--text-on-navy-muted)" }}>Convention active</div></div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
        {NAV.map((it) => {
          const on = active === it.value;
          return (
            <button key={it.value} onClick={() => onSelect(it.value)} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: "var(--radius-sm)", border: "none", cursor: "pointer", textAlign: "left", background: on ? "rgba(255,255,255,.12)" : "transparent", color: on ? "#fff" : "var(--text-on-navy-muted)", font: `var(--fw-${on ? "semibold" : "medium"}) var(--fs-body) var(--font-display)` }}>
              <Icon name={it.icon} size={19} strokeWidth={2} /><span style={{ flex: 1 }}>{it.label}</span>
              {it.badge != null && <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: "var(--radius-pill)", background: "var(--gold-500)", color: "var(--navy-800)", font: "var(--fw-bold) var(--fs-xs)/18px var(--font-display)", textAlign: "center" }}>{it.badge}</span>}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function Metric({ label, value, delta, deltaTone = "green", icon }) {
  return (
    <div style={{ flex: 1, background: "#fff", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: 20, boxShadow: "var(--shadow-sm)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ font: "var(--fw-medium) var(--fs-sm) var(--font-body)", color: "var(--text-muted)" }}>{label}</span>
        <Icon name={icon} size={18} color="var(--gray-400)" />
      </div>
      <div style={{ font: "var(--fw-extrabold) 30px var(--font-display)", color: "var(--navy-700)" }}>{value}</div>
      {delta && <div style={{ font: "var(--fw-semibold) var(--fs-xs) var(--font-body)", color: deltaTone === "green" ? "var(--green-600)" : "var(--text-muted)", marginTop: 4 }}>{delta}</div>}
    </div>
  );
}

const ROSTER = [
  { id: "STU-4821", promo: "2025 · Ingénierie", status: "Logé", tone: "verified", city: "Rabat" },
  { id: "STU-4822", promo: "2025 · Management", status: "Vérifié", tone: "info", city: "Casablanca" },
  { id: "STU-4823", promo: "2024 · Data", status: "En recherche", tone: "warning", city: "Rabat" },
  { id: "STU-4824", promo: "2025 · Ingénierie", status: "Logé", tone: "verified", city: "Marrakech" },
  { id: "STU-4825", promo: "2025 · Design", status: "Non inscrit", tone: "neutral", city: "—" },
];

function Dash() {
  return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--bg-page)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 32px", borderBottom: "1px solid var(--border-subtle)", background: "#fff" }}>
        <div><div style={{ font: "var(--fw-bold) 24px var(--font-display)", color: "var(--navy-700)" }}>Tableau de bord</div><div style={{ font: "var(--fw-regular) var(--fs-sm) var(--font-body)", color: "var(--text-muted)", marginTop: 2 }}>Hébergement de vos étudiants · Année 2025</div></div>
        <div style={{ display: "flex", gap: 10 }}><Button variant="secondary" size="sm" iconLeft="download">Exporter</Button><Button variant="primary" size="sm" iconLeft="upload">Importer un référentiel</Button></div>
      </div>
      <div style={{ padding: 32 }}>
        <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
          <Metric label="Affiliés inscrits" value="1 284" delta="+96 ce mois" icon="users" />
          <Metric label="Taux de logement" value="71%" delta="+4 pts" icon="home" />
          <Metric label="Délai médian de mise en relation" value="9 j" delta="−2 j" icon="clock" />
          <Metric label="Budget médian" value="1 900 MAD" delta="stable" deltaTone="muted" icon="wallet" />
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 14px", background: "var(--navy-50)", borderRadius: "var(--radius-md)", marginBottom: 24 }}>
          <Icon name="shield" size={16} color="var(--navy-600)" />
          <span style={{ font: "var(--fw-medium) var(--fs-sm) var(--font-body)", color: "var(--navy-700)" }}>Reporting anonymisé · agrégats masqués sous le seuil de k-anonymat (k ≥ 5). Aucune adresse ni identité de colocataire n'est exposée.</span>
        </div>

        <div style={{ background: "#fff", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
            <h3 style={{ font: "var(--fw-bold) var(--fs-h3) var(--font-display)", color: "var(--navy-700)", margin: 0 }}>Référentiel d'affiliés</h3>
            <div style={{ width: 240 }}><Input icon="search" placeholder="Rechercher un identifiant" /></div>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "var(--gray-50)" }}>{["Identifiant externe", "Promotion", "Ville", "Statut", ""].map((h) => <th key={h} style={{ textAlign: "left", padding: "11px 20px", font: "var(--fw-semibold) var(--fs-xs) var(--font-body)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>{h}</th>)}</tr></thead>
            <tbody>
              {ROSTER.map((r, i) => (
                <tr key={i} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <td style={{ padding: "13px 20px", font: "var(--fw-semibold) var(--fs-sm) var(--font-mono)", color: "var(--navy-700)" }}>{r.id}</td>
                  <td style={{ padding: "13px 20px", font: "var(--fw-regular) var(--fs-sm) var(--font-body)", color: "var(--text-body)" }}>{r.promo}</td>
                  <td style={{ padding: "13px 20px", font: "var(--fw-regular) var(--fs-sm) var(--font-body)", color: "var(--text-body)" }}>{r.city}</td>
                  <td style={{ padding: "13px 20px" }}><Badge tone={r.tone}>{r.status}</Badge></td>
                  <td style={{ padding: "13px 20px", textAlign: "right" }}><IconButton icon="chevron-right" label="Détail" variant="ghost" size="sm" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PartnerApp() {
  const [view, setView] = useState("dash");
  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <PartnerSidebar active={view} onSelect={setView} />
      <Dash />
    </div>
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(<PartnerApp />);
