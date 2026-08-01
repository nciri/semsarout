import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Chip, Input, ListingCard, Select } from '../../ds/index.js'
import { listListings } from '../../services/index.js'

const FILTER_CHIPS = ['Non-fumeur', 'Meublé', 'Wifi', 'Féminin', 'Proche fac', 'Court séjour']

export default function SearchResults() {
  const [items, setItems] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    listListings().then(setItems)
  }, [])

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
          <div style={{ width: 220 }}><Input label="Ville ou quartier" icon="map-pin" defaultValue="Casablanca" /></div>
          <div style={{ width: 160 }}><Select label="Budget max" options={['2 500 MAD', '4 000 MAD']} /></div>
          <div style={{ width: 150 }}><Select label="Type" options={['Tout', 'Chambre', 'Studio']} /></div>
          <div style={{ width: 150 }}><Select label="Genre" options={['Tout', 'Féminin', 'Masculin']} /></div>
          <Button variant="primary" style={{ height: 44 }}>Rechercher</Button>
        </div>
      </div>
      <div style={{ maxWidth: 'var(--container-max)', margin: '0 auto', padding: '24px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <h1 style={{ font: 'var(--fw-bold) 24px var(--font-display)', color: 'var(--navy-700)', margin: 0 }}>Colocations disponibles</h1>
            <span style={{ font: 'var(--fw-regular) var(--fs-sm) var(--font-body)', color: 'var(--text-muted)' }}>{items.length} annonces</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ font: 'var(--fw-medium) var(--fs-sm) var(--font-body)', color: 'var(--text-muted)' }}>Trier par</span>
            <div style={{ width: 180 }}><Select options={['Pertinence', 'Prix croissant', 'Date', 'Distance']} /></div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {FILTER_CHIPS.map((f, i) => <Chip key={f} selected={i === 0}>{f}</Chip>)}
        </div>
        {items.length === 0 ? (
          <div style={{ padding: '64px 0', textAlign: 'center', font: 'var(--fw-medium) var(--fs-body) var(--font-body)', color: 'var(--text-muted)' }}>
            Aucune annonce ne correspond à votre recherche.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
            {items.map((it) => (
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
        )}
      </div>
    </div>
  )
}
