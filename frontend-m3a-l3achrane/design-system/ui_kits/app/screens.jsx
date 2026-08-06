const NS = window.M3aL3chraneDesignSystem_7918b4;
const { Button, IconButton, Icon, Badge, Chip, Avatar, Input, ListingCard, MatchScore, VerifiedBadge, CompatibilityRing, SidebarNav } = NS;
const { useState, useRef, useEffect } = React;

function AppHeader({ title, subtitle }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 32px", borderBottom: "1px solid var(--border-subtle)", background: "#fff" }}>
      <div>
        <div style={{ font: "var(--fw-bold) 24px var(--font-display)", color: "var(--navy-700)" }}>{title}</div>
        {subtitle && <div style={{ font: "var(--fw-regular) var(--fs-sm) var(--font-body)", color: "var(--text-muted)", marginTop: 2 }}>{subtitle}</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <IconButton icon="bell" label="Notifications" variant="soft" round />
        <Avatar name="Yassine E." showLabel subtitle="Étudiant" verified size={38} />
      </div>
    </div>
  );
}

function StatCard({ icon, tone, label, value, sub }) {
  const c = { green: ["var(--green-50)", "var(--green-600)"], navy: ["var(--navy-50)", "var(--navy-700)"], gold: ["var(--gold-100)", "var(--gold-700)"] }[tone];
  return (
    <div style={{ flex: 1, background: "#fff", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: 18, boxShadow: "var(--shadow-sm)", display: "flex", gap: 14, alignItems: "center" }}>
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 46, height: 46, borderRadius: "var(--radius-md)", background: c[0], color: c[1] }}><Icon name={icon} size={23} /></span>
      <div><div style={{ font: "var(--fw-medium) var(--fs-sm) var(--font-body)", color: "var(--text-muted)" }}>{label}</div><div style={{ font: "var(--fw-extrabold) 22px var(--font-display)", color: "var(--text-strong)" }}>{value}</div><div style={{ font: "var(--fw-semibold) var(--fs-xs) var(--font-body)", color: c[1] }}>{sub}</div></div>
    </div>
  );
}

function Dashboard() {
  const recs = [
    { match: 85, title: "Chambre dans un F4", city: "Maârif, Casablanca", price: 2300, tone: "var(--navy-100)", amenities: [{ icon: "users", label: "3 colocs" }, { icon: "volume-x", label: "Calme" }] },
    { match: 82, title: "Chambre dans un F3", city: "Agdal, Rabat", price: 2000, tone: "var(--gold-100)", amenities: [{ icon: "users", label: "2 colocs" }, { icon: "graduation-cap", label: "Étudiants" }] },
    { match: 78, title: "Chambre dans un F4", city: "Guéliz, Marrakech", price: 2200, tone: "var(--green-100)", amenities: [{ icon: "users", label: "4 colocs" }, { icon: "wifi", label: "Wi-Fi" }] },
  ];
  return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--bg-page)" }}>
      <AppHeader title={<span>Bonjour Yassine <span style={{ fontSize: 22 }}>👋</span></span>} subtitle="Voici un aperçu de votre recherche" />
      <div style={{ padding: 32 }}>
        <div style={{ display: "flex", gap: 16, marginBottom: 26 }}>
          <StatCard icon="badge-check" tone="green" label="Profil vérifié" value="Étudiant" sub="CIN + statut" />
          <StatCard icon="git-compare-arrows" tone="navy" label="Compatibilité moyenne" value="85%" sub="Excellent" />
          <StatCard icon="file-text" tone="gold" label="Candidatures" value="3" sub="En cours" />
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h2 style={{ font: "var(--fw-bold) var(--fs-h2) var(--font-display)", color: "var(--navy-700)", margin: 0 }}>Recommandations pour vous</h2>
          <a href="#" style={{ font: "var(--fw-semibold) var(--fs-sm) var(--font-body)" }}>Voir tout</a>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 18, marginBottom: 28 }}>
          {recs.map((r, i) => <ListingCard key={i} {...r} imageTone={r.tone} />)}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 18 }}>
          <div style={{ background: "#fff", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: 20, boxShadow: "var(--shadow-sm)" }}>
            <h3 style={{ font: "var(--fw-bold) var(--fs-h3) var(--font-display)", color: "var(--navy-700)", margin: "0 0 14px" }}>Activité récente</h3>
            {[["eye", "Votre candidature a été vue par Sarah", "var(--navy-50)", "var(--navy-700)"], ["message-circle", "Nouveau message de Youssef", "var(--info-100)", "var(--info-500)"], ["file-signature", "Contrat prêt à être signé", "var(--gold-100)", "var(--gold-700)"]].map(([ic, t, bg, fg], i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < 2 ? "1px solid var(--border-subtle)" : "none" }}>
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "var(--radius-sm)", background: bg, color: fg }}><Icon name={ic} size={17} /></span>
                <span style={{ font: "var(--fw-medium) var(--fs-body) var(--font-body)", color: "var(--text-body)" }}>{t}</span>
              </div>
            ))}
          </div>
          <div style={{ background: "#fff", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: 20, boxShadow: "var(--shadow-sm)" }}>
            <h3 style={{ font: "var(--fw-bold) var(--fs-h3) var(--font-display)", color: "var(--navy-700)", margin: "0 0 14px" }}>Prochaine étape</h3>
            <div style={{ display: "flex", gap: 12 }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 42, height: 42, borderRadius: "var(--radius-md)", background: "var(--gold-100)", color: "var(--gold-700)", flex: "none" }}><Icon name="calendar-check" size={21} /></span>
              <div><div style={{ font: "var(--fw-semibold) var(--fs-body) var(--font-display)", color: "var(--text-strong)" }}>Visite planifiée</div><div style={{ font: "var(--fw-regular) var(--fs-sm) var(--font-body)", color: "var(--text-muted)", margin: "2px 0" }}>Samedi 24 mai à 10:00 · Agdal, Rabat</div><a href="#" style={{ font: "var(--fw-semibold) var(--fs-sm) var(--font-body)" }}>Voir le détail</a></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const CONVOS = [
  { name: "Sarah", status: "En ligne", time: "10:24", last: "Parfait, à samedi ! 😊", unread: true, online: true },
  { name: "Youssef", status: "En ligne", time: "Hier", last: "Peux-tu m'envoyer plus…", online: true },
  { name: "Omar", status: "", time: "Hier", last: "Merci à toi !" },
  { name: "Admin M3a-L3chrane", status: "", time: "2 j", last: "Votre contrat est prêt à être signé.", admin: true },
];

function Messaging() {
  const [active, setActive] = useState(0);
  const [msgs, setMsgs] = useState([
    { me: false, t: "Salut Yassine ! Est-ce que tu es disponible ce samedi pour une visite ?", time: "10:22" },
    { me: true, t: "Salut Sarah ! Oui, je suis dispo à 10h. Ça te va ?", time: "10:23" },
    { me: false, t: "Parfait, à samedi ! 😊", time: "10:24" },
  ]);
  const [draft, setDraft] = useState("");
  const endRef = useRef(null);
  useEffect(() => { endRef.current && endRef.current.scrollIntoView && endRef.current.parentElement.scrollTo(0, 99999); });
  const send = () => { if (!draft.trim()) return; setMsgs([...msgs, { me: true, t: draft, time: "10:26" }]); setDraft(""); };
  const c = CONVOS[active];
  return (
    <div style={{ flex: 1, display: "flex", minHeight: 0, background: "#fff" }}>
      {/* conversation list */}
      <div style={{ width: 320, borderRight: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "20px 20px 12px" }}>
          <div style={{ font: "var(--fw-bold) var(--fs-h2) var(--font-display)", color: "var(--navy-700)", marginBottom: 12 }}>Messagerie</div>
          <Input icon="search" placeholder="Rechercher une conversation" />
        </div>
        <div style={{ overflowY: "auto", flex: 1 }}>
          {CONVOS.map((cv, i) => (
            <button key={i} onClick={() => setActive(i)} style={{ display: "flex", gap: 12, alignItems: "center", width: "100%", padding: "12px 20px", background: i === active ? "var(--navy-50)" : "transparent", border: "none", borderBottom: "1px solid var(--gray-100)", cursor: "pointer", textAlign: "left" }}>
              {cv.admin ? <span style={{ width: 42, height: 42, borderRadius: "var(--radius-pill)", background: "var(--navy-700)", color: "var(--gold-500)", display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" }}><Icon name="home" size={20} /></span> : <Avatar name={cv.name} verified={cv.online} size={42} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ font: "var(--fw-semibold) var(--fs-body) var(--font-display)", color: "var(--text-strong)" }}>{cv.name}</span><span style={{ font: "var(--fw-regular) var(--fs-xs) var(--font-body)", color: "var(--text-muted)" }}>{cv.time}</span></div>
                <div style={{ font: `var(--fw-${cv.unread ? "semibold" : "regular"}) var(--fs-sm) var(--font-body)`, color: cv.unread ? "var(--text-strong)" : "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cv.last}</div>
              </div>
              {cv.unread && <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--gold-500)", flex: "none" }} />}
            </button>
          ))}
        </div>
      </div>
      {/* thread */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", borderBottom: "1px solid var(--border-subtle)" }}>
          <Avatar name={c.name} showLabel subtitle={c.status || "Hors ligne"} verified={c.online} size={40} />
          <div style={{ display: "flex", gap: 8 }}><IconButton icon="phone" label="Appeler" variant="ghost" round /><IconButton icon="video" label="Visio" variant="ghost" round /></div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 12, background: "var(--bg-page)" }}>
          {msgs.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: m.me ? "flex-end" : "flex-start" }}>
              <div style={{ maxWidth: "68%", padding: "10px 14px", borderRadius: m.me ? "16px 16px 4px 16px" : "16px 16px 16px 4px", background: m.me ? "var(--navy-700)" : "#fff", color: m.me ? "#fff" : "var(--text-body)", border: m.me ? "none" : "1px solid var(--border-subtle)", font: "var(--fw-regular) var(--fs-body)/1.45 var(--font-body)", boxShadow: "var(--shadow-xs)" }}>
                {m.t}
                <div style={{ font: "var(--fw-regular) 10px var(--font-body)", color: m.me ? "rgba(255,255,255,.6)" : "var(--text-muted)", textAlign: "right", marginTop: 4 }}>{m.time}</div>
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "14px 24px", borderTop: "1px solid var(--border-subtle)" }}>
          <IconButton icon="plus" label="Joindre" variant="soft" round />
          <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Écrire un message…" style={{ flex: 1, height: 44, padding: "0 16px", border: "1px solid var(--border-default)", borderRadius: "var(--radius-pill)", outline: "none", font: "var(--fw-regular) var(--fs-body) var(--font-body)", color: "var(--text-strong)" }} />
          <IconButton icon="send" label="Envoyer" variant="navy" round onClick={send} />
        </div>
      </div>
    </div>
  );
}

function AppShell() {
  const [view, setView] = useState("dash");
  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <SidebarNav active={view === "msg" ? "msg" : "dash"} onSelect={(v) => setView(v === "msg" ? "msg" : "dash")} />
      {view === "msg" ? <Messaging /> : <Dashboard />}
    </div>
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(<AppShell />);
