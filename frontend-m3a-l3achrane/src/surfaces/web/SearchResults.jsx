import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Chip, Icon, Input, ListingCard, Select } from '../../ds/index.js'
import { listListings } from '../../services/index.js'

const TYPE_FILTERS = [
  { label: 'Chambre en colocation', count: 31 },
  { label: 'Appartement entier', count: 9 },
  { label: 'Studio partagé', count: 6 },
  { label: 'Résidence partenaire', count: 2 },
]

const LIFESTYLE_CHIPS = ['Non-fumeur', 'Calme', 'Invités OK', 'Animaux OK', 'Colocation féminine', 'Colocation masculine']

const SORT_OPTIONS = ['Compatibilité', 'Prix croissant', 'Prix décroissant', 'Plus récentes']

export default function SearchResults() {
  const [items, setItems] = useState(null)
  const [activeType, setActiveType] = useState(TYPE_FILTERS[0].label)
  const [lifestyle, setLifestyle] = useState(() => new Set(['Non-fumeur', 'Calme']))
  const [verifiedOnly, setVerifiedOnly] = useState(true)
  const [view, setView] = useState('liste')
  const navigate = useNavigate()

  useEffect(() => {
    listListings().then(setItems)
  }, [])

  const activeFilters = useMemo(() => {
    const filters = []
    if (activeType) filters.push(activeType)
    if (verifiedOnly) filters.push('Profils vérifiés')
    filters.push(...lifestyle)
    return filters
  }, [activeType, lifestyle, verifiedOnly])

  const toggleLifestyle = (label) => {
    setLifestyle((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  const visibleItems = useMemo(() => {
    if (!items) return items
    return verifiedOnly ? items.filter((it) => it.verifiee) : items
  }, [items, verifiedOnly])

  if (items === null) {
    return (
      <div style={{ padding: 48, maxWidth: 'var(--container-max)', margin: '0 auto', font: 'var(--fw-medium) var(--fs-body) var(--font-body)', color: 'var(--text-muted)' }}>
        Chargement…
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--bg-page)', minHeight: '100%' }}>
      <div style={{ background: '#fff', borderBottom: '1px solid var(--border-subtle)', padding: '18px 40px' }}>
        <div style={{ maxWidth: 'var(--container-max)', margin: '0 auto', display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
          <div style={{ width: 220 }}><Input label="Ville ou quartier" icon="map-pin" defaultValue="Casablanca, Maârif" /></div>
          <div style={{ width: 160 }}><Select label="Budget max" options={['2 500 MAD', '4 000 MAD']} /></div>
          <div style={{ width: 150 }}><Select label="Type" options={['Tout', 'Chambre', 'Studio']} /></div>
          <div style={{ width: 150 }}><Select label="Genre" options={['Tout', 'Féminin', 'Masculin']} /></div>
          <Button variant="primary" style={{ height: 44 }}>Rechercher</Button>
        </div>
      </div>

      <div
        style={{
          maxWidth: 'var(--container-max)',
          margin: '0 auto',
          padding: '24px 40px 56px',
          display: 'grid',
          gridTemplateColumns: '276px minmax(0,1fr)',
          gap: 28,
          alignItems: 'start',
        }}
      >
        <aside style={{ position: 'sticky', top: 20 }}>
          <Card style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ font: 'var(--fw-extrabold) var(--fs-body) var(--font-body)', color: 'var(--text-heading)' }}>Filtres</span>
              <button
                type="button"
                onClick={() => { setActiveType(TYPE_FILTERS[0].label); setLifestyle(new Set()); setVerifiedOnly(false) }}
                style={{ border: 0, background: 'transparent', color: 'var(--link)', font: 'var(--fw-semibold) var(--fs-sm) var(--font-body)', cursor: 'pointer', padding: 0 }}
              >
                Réinitialiser
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ font: 'var(--fw-extrabold) 12.5px var(--font-body)', letterSpacing: '.02em', color: 'var(--text-heading)' }}>Budget mensuel</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Input defaultValue="1 500" containerStyle={{ flex: 1 }} />
                <Input defaultValue="3 000" containerStyle={{ flex: 1 }} />
              </div>
              <div style={{ font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>MAD / mois, charges comprises</div>
            </div>

            <div style={{ height: 1, background: 'var(--border-subtle)' }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ font: 'var(--fw-extrabold) var(--fs-sm) var(--font-body)', color: 'var(--text-heading)' }}>Type de logement</div>
              {TYPE_FILTERS.map((f) => (
                <label key={f.label} style={{ display: 'flex', gap: 10, alignItems: 'center', font: 'var(--fw-regular) var(--fs-body) var(--font-body)', color: 'var(--text-body)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={activeType === f.label}
                    onChange={() => setActiveType(activeType === f.label ? null : f.label)}
                    style={{ width: 15, height: 15, accentColor: 'var(--navy-700)' }}
                  />
                  {f.label}
                  <span style={{ marginLeft: 'auto', font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>{f.count}</span>
                </label>
              ))}
            </div>

            <div style={{ height: 1, background: 'var(--border-subtle)' }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ font: 'var(--fw-extrabold) var(--fs-sm) var(--font-body)', color: 'var(--text-heading)' }}>Mode de vie</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {LIFESTYLE_CHIPS.map((label) => (
                  <Chip key={label} selected={lifestyle.has(label)} onClick={() => toggleLifestyle(label)}>
                    {label}
                  </Chip>
                ))}
              </div>
            </div>

            <div style={{ height: 1, background: 'var(--border-subtle)' }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ font: 'var(--fw-extrabold) var(--fs-sm) var(--font-body)', color: 'var(--text-heading)' }}>Confiance</div>
              <label style={{ display: 'flex', gap: 10, alignItems: 'center', font: 'var(--fw-regular) var(--fs-body) var(--font-body)', color: 'var(--text-body)', cursor: 'pointer' }}>
                <input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} style={{ width: 15, height: 15, accentColor: 'var(--navy-700)' }} />
                Profils vérifiés uniquement
              </label>
              <label style={{ display: 'flex', gap: 10, alignItems: 'center', font: 'var(--fw-regular) var(--fs-body) var(--font-body)', color: 'var(--text-body)', cursor: 'pointer' }}>
                <input type="checkbox" style={{ width: 15, height: 15, accentColor: 'var(--navy-700)' }} />
                Partenaire institutionnel
              </label>
              <label style={{ display: 'flex', gap: 10, alignItems: 'center', font: 'var(--fw-regular) var(--fs-body) var(--font-body)', color: 'var(--text-body)', cursor: 'pointer' }}>
                <input type="checkbox" style={{ width: 15, height: 15, accentColor: 'var(--navy-700)' }} />
                Contrat en ligne disponible
              </label>
            </div>
          </Card>
        </aside>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <h1 style={{ margin: 0, font: 'var(--fw-bold) 24px var(--font-display)', color: 'var(--text-heading)', letterSpacing: '-0.02em' }}>
                Colocations à Casablanca, Maârif
              </h1>
              <span style={{ font: 'var(--fw-regular) var(--fs-sm) var(--font-body)', color: 'var(--text-body)' }}>
                {visibleItems.length} logements — triés par compatibilité avec votre profil
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ width: 180 }}><Select options={SORT_OPTIONS} /></div>
              <div style={{ display: 'flex', background: 'var(--surface-sunken)', borderRadius: 8, padding: 3, gap: 3 }}>
                <button
                  type="button"
                  onClick={() => setView('liste')}
                  style={{
                    padding: '7px 14px', border: 0, borderRadius: 6, cursor: 'pointer',
                    background: view === 'liste' ? '#fff' : 'transparent',
                    color: view === 'liste' ? 'var(--text-heading)' : 'var(--text-muted)',
                    boxShadow: view === 'liste' ? 'var(--shadow-sm)' : 'none',
                    font: view === 'liste' ? 'var(--fw-bold) 13.5px var(--font-body)' : 'var(--fw-semibold) 13.5px var(--font-body)',
                  }}
                >
                  Liste
                </button>
                <button
                  type="button"
                  onClick={() => setView('carte')}
                  style={{
                    padding: '7px 14px', border: 0, borderRadius: 6, cursor: 'pointer',
                    background: view === 'carte' ? '#fff' : 'transparent',
                    color: view === 'carte' ? 'var(--text-heading)' : 'var(--text-muted)',
                    boxShadow: view === 'carte' ? 'var(--shadow-sm)' : 'none',
                    font: view === 'carte' ? 'var(--fw-bold) 13.5px var(--font-body)' : 'var(--fw-semibold) 13.5px var(--font-body)',
                  }}
                >
                  Carte
                </button>
              </div>
            </div>
          </div>

          {activeFilters.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ font: 'var(--fw-regular) var(--fs-sm) var(--font-body)', color: 'var(--text-muted)' }}>Filtres actifs :</span>
              {activeFilters.map((label) => (
                <span
                  key={label}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 10px 6px 12px',
                    borderRadius: 'var(--radius-pill)', background: 'var(--navy-50)', border: '1px solid var(--navy-100)',
                    color: 'var(--text-heading)', font: 'var(--fw-semibold) var(--fs-sm) var(--font-body)',
                  }}
                >
                  {label}
                  <span style={{ color: 'var(--text-muted)', cursor: 'pointer' }}>×</span>
                </span>
              ))}
            </div>
          )}

          {view === 'carte' ? (
            <div
              style={{
                height: 420, borderRadius: 'var(--radius-lg)', background: 'var(--gray-150)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                font: 'var(--fw-medium) var(--fs-body) var(--font-body)', color: 'var(--text-muted)',
              }}
            >
              <Icon name="map" size={20} />
              Vue carte à venir
            </div>
          ) : visibleItems.length === 0 ? (
            <div style={{ padding: '64px 0', textAlign: 'center', font: 'var(--fw-medium) var(--fs-body) var(--font-body)', color: 'var(--text-muted)' }}>
              Aucune annonce ne correspond à votre recherche.
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(288px, 1fr))', gap: 20 }}>
                {visibleItems.map((it) => (
                  <ListingCard
                    key={it.id}
                    image={it.photos?.[0]}
                    match={it.matchPct}
                    verified={it.verifiee}
                    title={it.titre}
                    city={`${it.quartier}, ${it.ville}`}
                    price={it.prixMad}
                    amenities={it.chips?.map((label) => ({ icon: 'check', label }))}
                    onClick={() => navigate(`/annonce/${it.id}`)}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}>
                <Button variant="secondary">Afficher plus de logements</Button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
