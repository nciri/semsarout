const NS = window.M3aL3chraneDesignSystem_7918b4;
const { Button, IconButton, Icon, Badge, Chip, Avatar, Input, Select, Tabs,
  VerifiedBadge, MatchScore, FeatureItem, ListingCard, PriceTag, AmenityChip, TopBar } = NS;

const { useState } = React;

const LISTINGS = [
  { match: 85, title: "Chambre dans un F4", city: "Maârif, Casablanca", price: 2300, tone: "var(--navy-100)",
    amenities: [{ icon: "users", label: "3 colocs" }, { icon: "volume-x", label: "Calme" }, { icon: "cigarette-off", label: "Non-fumeur" }] },
  { match: 82, title: "Chambre dans un F3", city: "Agdal, Rabat", price: 2000, tone: "var(--gold-100)",
    amenities: [{ icon: "users", label: "2 colocs" }, { icon: "graduation-cap", label: "Étudiants" }, { icon: "wifi", label: "Wi-Fi" }] },
  { match: 78, title: "Chambre dans un F4", city: "Guéliz, Marrakech", price: 2200, tone: "var(--green-100)",
    amenities: [{ icon: "users", label: "4 colocs" }, { icon: "sparkles", label: "Mixte" }, { icon: "paw-print", label: "Animaux OK" }] },
  { match: 74, title: "Studio à partager", city: "Ain Diab, Casablanca", price: 2600, tone: "var(--info-100)",
    amenities: [{ icon: "users", label: "2 colocs" }, { icon: "waves", label: "Bord de mer" }, { icon: "car", label: "Parking" }] },
  { match: 69, title: "Chambre chez l'habitant", city: "Hassan, Rabat", price: 1500, tone: "var(--gray-150)",
    amenities: [{ icon: "users", label: "Famille" }, { icon: "utensils", label: "Repas inclus" }] },
  { match: 66, title: "Résidence étudiante", city: "Route de Casa, Fès", price: 1800, tone: "var(--navy-50)",
    amenities: [{ icon: "building-2", label: "Résidence" }, { icon: "shield", label: "Gardien" }, { icon: "wifi", label: "Wi-Fi" }] },
];

const PARTNERS = ["UM6P", "Univ. Mohammed V", "INPT", "OFPPT", "Maroc Telecom", "Société Générale"];

function Section({ children, bg, style }) {
  return <section style={{ padding: "72px 40px", background: bg || "transparent", ...style }}>
    <div style={{ maxWidth: "var(--container-max)", margin: "0 auto" }}>{children}</div>
  </section>;
}
function Eyebrow({ children }) {
  return <div style={{ font: "var(--fw-bold) var(--fs-xs) var(--font-body)", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--gold-600)", marginBottom: 10 }}>{children}</div>;
}

/* ---------------- Landing ---------------- */
function Landing({ go }) {
  const [role, setRole] = useState("etudiant");
  return (
    <div style={{ background: "var(--bg-page)" }}>
      {/* Hero */}
      <div style={{ background: "linear-gradient(180deg,var(--navy-50),var(--bg-page))" }}>
        <div style={{ maxWidth: "var(--container-max)", margin: "0 auto", padding: "56px 40px 40px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "center" }}>
          <div>
            <h1 style={{ font: "var(--fw-extrabold) 52px/1.08 var(--font-display)", color: "var(--navy-700)", letterSpacing: "-.02em", margin: "0 0 18px" }}>
              Trouvez votre colocation idéale en toute <span style={{ color: "var(--gold-500)" }}>confiance</span>
            </h1>
            <p style={{ font: "var(--fw-regular) 18px/1.55 var(--font-body)", color: "var(--text-body)", margin: "0 0 26px", maxWidth: 440 }}>
              La plateforme de colocation vérifiée pour étudiants et jeunes actifs au Maroc.
            </p>
            <div style={{ display: "flex", gap: 12, marginBottom: 26 }}>
              <Button variant={role === "etudiant" ? "primary" : "secondary"} size="lg" iconLeft="graduation-cap" onClick={() => setRole("etudiant")}>Je suis étudiant</Button>
              <Button variant={role === "salarie" ? "primary" : "secondary"} size="lg" iconLeft="briefcase" onClick={() => setRole("salarie")}>Je suis salarié</Button>
            </div>
            <SearchBox go={go} />
            <div style={{ display: "flex", gap: 28, marginTop: 26, flexWrap: "wrap" }}>
              <MiniTrust icon="shield-check" title="Profils vérifiés" sub="CIN, statut étudiant ou employeur" />
              <MiniTrust icon="git-compare-arrows" title="Compatibilité intelligente" sub="Plus qu'un prix, un mode de vie" />
              <MiniTrust icon="lock" title="Paiement sécurisé" sub="Caution et premier loyer sous séquestre" />
            </div>
          </div>
          <div style={{ position: "relative", height: 460, borderRadius: "var(--radius-xl)", overflow: "hidden", background: "linear-gradient(160deg,var(--navy-300),var(--navy-600))", boxShadow: "var(--shadow-lg)" }}>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,.55)", flexDirection: "column", gap: 10 }}>
              <Icon name="image" size={40} /><span style={{ font: "var(--fw-medium) var(--fs-sm) var(--font-body)" }}>Photo — ville marocaine</span>
            </div>
            <div style={{ position: "absolute", left: 20, bottom: 20, right: 20, display: "flex", gap: 12 }}>
              <FloatCard icon="user-check" title="Salma, 19 ans" sub="Vérifiée · Rabat" />
              <FloatCard icon="home" title="F4 · Agdal" sub="85% compatible" />
            </div>
          </div>
        </div>
      </div>

      {/* Trust band */}
      <Section bg="#fff" style={{ padding: "56px 40px" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <h2 style={{ font: "var(--fw-bold) 26px var(--font-display)", color: "var(--navy-700)", margin: 0 }}>La confiance, au cœur de M3a-L3chrane</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 18 }}>
          {[["scan-face", "Identité vérifiée", "CIN vérifiée"], ["badge-check", "Statut vérifié", "Étudiant ou employé"], ["clipboard-check", "Annonces modérées", "Contrôle qualité"], ["lock", "Paiement sécurisé", "Séquestre jusqu'à l'état des lieux"]].map(([ic, t, s]) => (
            <div key={t} style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "24px 20px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 52, height: 52, borderRadius: "var(--radius-md)", background: "var(--navy-50)", color: "var(--navy-700)" }}><Icon name={ic} size={26} strokeWidth={1.9} /></span>
              <span style={{ font: "var(--fw-bold) var(--fs-body) var(--font-display)", color: "var(--text-strong)" }}>{t}</span>
              <span style={{ font: "var(--fw-regular) var(--fs-sm) var(--font-body)", color: "var(--text-muted)" }}>{s}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* How it works */}
      <Section>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <Eyebrow>Comment ça marche</Eyebrow>
          <h2 style={{ font: "var(--fw-bold) 28px var(--font-display)", color: "var(--navy-700)", margin: 0 }}>Cinq étapes, en toute sérénité</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 20 }}>
          {[["user-round", "Créez votre profil", "Vérification d'identité et de statut"], ["search", "Recherchez & filtrez", "Trouvez les colocations compatibles"], ["messages-square", "Échangez", "Discutez en toute sécurité"], ["calendar-check", "Visitez & choisissez", "Rencontrez vos futurs colocataires"], ["file-signature", "Signez & emménagez", "Contrat en ligne, paiement sécurisé"]].map(([ic, t, s], i) => (
            <div key={t} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 46, height: 46, borderRadius: "var(--radius-pill)", background: "var(--gold-100)", color: "var(--gold-700)" }}><Icon name={ic} size={22} /></span>
              <span style={{ font: "var(--fw-bold) var(--fs-sm) var(--font-display)", color: "var(--text-strong)" }}>{i + 1}. {t}</span>
              <span style={{ font: "var(--fw-regular) var(--fs-sm)/1.45 var(--font-body)", color: "var(--text-muted)" }}>{s}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Partner logos */}
      <Section bg="#fff" style={{ padding: "48px 40px" }}>
        <div style={{ textAlign: "center", marginBottom: 26 }}>
          <span style={{ font: "var(--fw-semibold) var(--fs-body) var(--font-display)", color: "var(--text-muted)" }}>Ils nous font confiance</span>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 40, flexWrap: "wrap", alignItems: "center" }}>
          {PARTNERS.map((p) => <span key={p} style={{ font: "var(--fw-bold) 18px var(--font-display)", color: "var(--gray-400)", letterSpacing: "-.01em" }}>{p}</span>)}
        </div>
      </Section>

      {/* Partner CTA */}
      <Section>
        <div style={{ background: "var(--navy-700)", borderRadius: "var(--radius-xl)", padding: "44px 48px", display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 40, alignItems: "center", color: "#fff" }}>
          <div>
            <Eyebrow>Partenaires institutions</Eyebrow>
            <h2 style={{ font: "var(--fw-bold) 28px var(--font-display)", margin: "0 0 12px" }}>Des portails dédiés et des intégrations API</h2>
            <p style={{ font: "var(--fw-regular) var(--fs-body-lg)/1.5 var(--font-body)", color: "var(--text-on-navy-muted)", margin: "0 0 24px" }}>
              Pour accompagner vos étudiants et vos collaborateurs, avec un reporting anonymisé et un référentiel vérifié.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,.08)", borderRadius: "var(--radius-md)", padding: "12px 16px" }}>
                <Icon name="graduation-cap" size={22} color="var(--gold-500)" /><div><div style={{ font: "var(--fw-semibold) var(--fs-sm) var(--font-display)" }}>Portail Universités</div><div style={{ font: "var(--fw-regular) var(--fs-xs) var(--font-body)", color: "var(--text-on-navy-muted)" }}>Gérez le logement de vos étudiants</div></div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,.08)", borderRadius: "var(--radius-md)", padding: "12px 16px" }}>
                <Icon name="building-2" size={22} color="var(--gold-500)" /><div><div style={{ font: "var(--fw-semibold) var(--fs-sm) var(--font-display)" }}>Portail Entreprises</div><div style={{ font: "var(--fw-regular) var(--fs-xs) var(--font-body)", color: "var(--text-on-navy-muted)" }}>Relocation de vos nouveaux talents</div></div>
              </div>
            </div>
          </div>
          <div style={{ height: 200, borderRadius: "var(--radius-lg)", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,.4)", flexDirection: "column", gap: 8 }}>
            <Icon name="bar-chart-3" size={34} /><span style={{ font: "var(--fw-medium) var(--fs-sm) var(--font-body)" }}>Tableau de bord partenaire</span>
          </div>
        </div>
      </Section>

      <Footer />
    </div>
  );
}

function MiniTrust({ icon, title, sub }) {
  return <div style={{ display: "flex", gap: 10, maxWidth: 200 }}>
    <Icon name={icon} size={22} color="var(--navy-700)" strokeWidth={2} />
    <div><div style={{ font: "var(--fw-bold) var(--fs-sm) var(--font-display)", color: "var(--text-strong)" }}>{title}</div><div style={{ font: "var(--fw-regular) var(--fs-xs)/1.4 var(--font-body)", color: "var(--text-muted)" }}>{sub}</div></div>
  </div>;
}
function FloatCard({ icon, title, sub }) {
  return <div style={{ flex: 1, background: "rgba(255,255,255,.96)", borderRadius: "var(--radius-md)", padding: "10px 12px", boxShadow: "var(--shadow-md)", display: "flex", alignItems: "center", gap: 9 }}>
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: "var(--radius-sm)", background: "var(--navy-50)", color: "var(--navy-700)" }}><Icon name={icon} size={17} /></span>
    <div><div style={{ font: "var(--fw-bold) var(--fs-xs) var(--font-display)", color: "var(--text-strong)" }}>{title}</div><div style={{ font: "var(--fw-regular) 10px var(--font-body)", color: "var(--text-muted)" }}>{sub}</div></div>
  </div>;
}

function SearchBox({ go }) {
  const [tab, setTab] = useState("coloc");
  return (
    <div style={{ background: "#fff", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-md)", border: "1px solid var(--border-subtle)", padding: 16, maxWidth: 520 }}>
      <div style={{ marginBottom: 14 }}>
        <Tabs value={tab} onChange={setTab} tabs={[{ label: "Colocations", value: "coloc", icon: "users" }, { label: "Résidences", value: "res", icon: "building-2" }]} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10, alignItems: "end" }}>
        <Select label="Ville ou quartier" icon="map-pin" options={["Casablanca", "Rabat", "Marrakech", "Fès", "Tanger", "Agadir"]} />
        <Select label="Budget max" icon="wallet" options={["1 500 MAD", "2 500 MAD", "4 000 MAD"]} />
        <Button variant="primary" size="md" onClick={() => go("results")} style={{ height: 44 }}>Rechercher</Button>
      </div>
    </div>
  );
}

/* ---------------- Search results ---------------- */
function SearchResults({ go }) {
  const [selected, setSelected] = useState("Casablanca");
  return (
    <div style={{ background: "var(--bg-page)", minHeight: "100%" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid var(--border-subtle)", padding: "18px 40px" }}>
        <div style={{ maxWidth: "var(--container-max)", margin: "0 auto", display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
          <div style={{ width: 220 }}><Input label="Ville ou quartier" icon="map-pin" defaultValue="Casablanca" /></div>
          <div style={{ width: 160 }}><Select label="Budget max" options={["2 500 MAD", "4 000 MAD"]} /></div>
          <div style={{ width: 150 }}><Select label="Type" options={["Tout", "Chambre", "Studio"]} /></div>
          <div style={{ width: 150 }}><Select label="Genre" options={["Tout", "Féminin", "Masculin"]} /></div>
          <Button variant="primary" style={{ height: 44 }}>Rechercher</Button>
        </div>
      </div>
      <div style={{ maxWidth: "var(--container-max)", margin: "0 auto", padding: "24px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div><h1 style={{ font: "var(--fw-bold) 24px var(--font-display)", color: "var(--navy-700)", margin: 0 }}>Colocations à Casablanca</h1><span style={{ font: "var(--fw-regular) var(--fs-sm) var(--font-body)", color: "var(--text-muted)" }}>128 annonces vérifiées</span></div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ font: "var(--fw-medium) var(--fs-sm) var(--font-body)", color: "var(--text-muted)" }}>Trier par</span>
            <div style={{ width: 180 }}><Select options={["Pertinence", "Prix croissant", "Date", "Distance"]} /></div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {["Non-fumeur", "Meublé", "Wi-Fi", "Féminin", "Proche campus", "Court séjour"].map((f, i) => <Chip key={f} selected={i === 0}>{f}</Chip>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
          {LISTINGS.map((l, i) => <ListingCard key={i} match={l.match} title={l.title} city={l.city} price={l.price} imageTone={l.tone} amenities={l.amenities} onClick={() => go("detail")} />)}
        </div>
      </div>
      <Footer />
    </div>
  );
}

/* ---------------- Listing detail ---------------- */
function ListingDetail({ go }) {
  return (
    <div style={{ background: "var(--bg-page)", minHeight: "100%" }}>
      <div style={{ maxWidth: "var(--container-max)", margin: "0 auto", padding: "20px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, font: "var(--fw-medium) var(--fs-sm) var(--font-body)", color: "var(--text-muted)", marginBottom: 16 }}>
          <a href="#" onClick={(e) => { e.preventDefault(); go("results"); }}>Rechercher</a><Icon name="chevron-right" size={14} />Casablanca<Icon name="chevron-right" size={14} /><span style={{ color: "var(--text-strong)" }}>Maârif</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: 28 }}>
          <div>
            <div style={{ height: 320, borderRadius: "var(--radius-lg)", background: "linear-gradient(150deg,var(--navy-200),var(--navy-400))", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,.55)" }}>
              <Icon name="image" size={40} />
              <div style={{ position: "absolute", right: 14, bottom: 14 }}><Button variant="secondary" size="sm" iconLeft="images">Voir les 12 photos</Button></div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>{[0, 1, 2, 3, 4].map((i) => <div key={i} style={{ flex: 1, height: 56, borderRadius: "var(--radius-sm)", background: "var(--navy-100)" }} />)}</div>

            <div style={{ marginTop: 26, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
              <div>
                <h1 style={{ font: "var(--fw-bold) 26px var(--font-display)", color: "var(--navy-700)", margin: "0 0 8px" }}>Chambre dans un F4 — Maârif</h1>
                <PriceTag amount={2300} size="lg" />
              </div>
              <VerifiedBadge label="Vérifiée" />
            </div>
            <div style={{ display: "flex", gap: 18, margin: "16px 0", flexWrap: "wrap", font: "var(--fw-medium) var(--fs-sm) var(--font-body)", color: "var(--text-body)" }}>
              {[["users", "3 colocs"], ["bath", "2 salles de bain"], ["ruler", "120 m²"], ["building", "Étage 3"]].map(([ic, t]) => <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name={ic} size={16} color="var(--gray-500)" />{t}</span>)}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
              {[["cigarette-off", "Non-fumeur"], ["volume-x", "Calme"], ["user-plus", "Invités OK"], ["wifi", "Wi-Fi"]].map(([ic, t]) => <AmenityChip key={t} icon={ic}>{t}</AmenityChip>)}
            </div>
            <h3 style={{ font: "var(--fw-bold) var(--fs-h3) var(--font-display)", color: "var(--navy-700)", margin: "0 0 8px" }}>À propos du logement</h3>
            <p style={{ font: "var(--fw-regular) var(--fs-body)/1.6 var(--font-body)", color: "var(--text-body)", margin: "0 0 8px" }}>Appartement lumineux et bien situé, proche du tram et de toutes commodités. Ambiance conviviale et respectueuse.</p>
            <p style={{ font: "var(--fw-regular) var(--fs-sm) var(--font-body)", color: "var(--text-muted)", margin: 0 }}>Inclus : eau, électricité, internet, ménage 1x/semaine.</p>

            <h3 style={{ font: "var(--fw-bold) var(--fs-h3) var(--font-display)", color: "var(--navy-700)", margin: "26px 0 12px" }}>Colocataires actuels</h3>
            <div style={{ display: "flex", gap: 24 }}>
              <Avatar name="Sarah, 23" showLabel subtitle="Étudiante" verified />
              <Avatar name="Youssef, 24" showLabel subtitle="Étudiant" verified />
              <Avatar name="Omar, 25" showLabel subtitle="Ingénieur" verified />
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "#fff", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: 20, boxShadow: "var(--shadow-sm)", position: "sticky", top: 20 }}>
              <div style={{ font: "var(--fw-bold) var(--fs-h3) var(--font-display)", color: "var(--navy-700)", marginBottom: 14 }}>Contacter</div>
              <Button variant="primary" fullWidth iconLeft="send" style={{ marginBottom: 10 }}>Envoyer un message</Button>
              <Button variant="secondary" fullWidth iconLeft="heart">Ajouter aux favoris</Button>
              <div style={{ height: 1, background: "var(--border-subtle)", margin: "18px 0" }} />
              <div style={{ display: "flex", gap: 10 }}>
                <Icon name="lock" size={20} color="var(--green-600)" />
                <div><div style={{ font: "var(--fw-semibold) var(--fs-sm) var(--font-display)", color: "var(--text-strong)" }}>Paiement sécurisé</div><div style={{ font: "var(--fw-regular) var(--fs-xs)/1.45 var(--font-body)", color: "var(--text-muted)", marginTop: 2 }}>Caution et premier loyer sous séquestre jusqu'à l'état des lieux d'entrée.</div><a href="#" style={{ font: "var(--fw-semibold) var(--fs-xs) var(--font-body)", display: "inline-block", marginTop: 6 }}>En savoir plus</a></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

function Footer() {
  return <footer style={{ background: "var(--navy-900)", color: "var(--text-on-navy-muted)", padding: "44px 40px" }}>
    <div style={{ maxWidth: "var(--container-max)", margin: "0 auto", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 24 }}>
      <div style={{ maxWidth: 300 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: "var(--radius-sm)", background: "var(--gold-500)", color: "var(--navy-800)" }}><Icon name="home" size={18} strokeWidth={2.4} /></span>
          <span style={{ font: "var(--fw-extrabold) var(--fs-body) var(--font-display)", color: "#fff" }}>M3a-L3chrane</span>
        </div>
        <p style={{ font: "var(--fw-regular) var(--fs-sm)/1.5 var(--font-body)", margin: 0 }}>La colocation vérifiée au Maroc. Identité, compatibilité et paiement, en toute confiance.</p>
      </div>
      {[["Produit", ["Rechercher", "Publier une annonce", "Résidences", "Tarifs"]], ["Partenaires", ["Universités", "Entreprises", "API développeurs"]], ["Aide", ["Centre de sécurité", "Contact", "CGU", "Confidentialité"]]].map(([h, items]) => (
        <div key={h}><div style={{ font: "var(--fw-bold) var(--fs-sm) var(--font-display)", color: "#fff", marginBottom: 12 }}>{h}</div>{items.map((i) => <div key={i} style={{ font: "var(--fw-regular) var(--fs-sm) var(--font-body)", marginBottom: 8 }}><a href="#" style={{ color: "var(--text-on-navy-muted)" }}>{i}</a></div>)}</div>
      ))}
    </div>
  </footer>;
}

/* ---------------- App shell ---------------- */
function WebApp() {
  const [view, setView] = useState("landing");
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)" }}>
      <TopBar onSignUp={() => {}} onSignIn={() => {}} />
      {view === "landing" && <Landing go={setView} />}
      {view === "results" && <SearchResults go={setView} />}
      {view === "detail" && <ListingDetail go={setView} />}
    </div>
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(<WebApp />);
