import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Card, Chip, Icon, Input, ListingCard, Select } from '../../ds/index.js'
import { getCurrentProfile, listListings } from '../../services/index.js'
import SearchResultsMap from './SearchResultsMap.jsx'

export default function SearchResults() {
  const { t } = useTranslation(['web', 'common'])
  const [items, setItems] = useState(null)
  const [verifiedOnly, setVerifiedOnly] = useState(true)
  const [view, setView] = useState('liste')
  const [hasLifestyleProfile, setHasLifestyleProfile] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    getCurrentProfile()
      .then((profile) => setHasLifestyleProfile(Object.keys(profile.lifestyleAnswers || {}).length > 0))
      .catch(() => {})
  }, [])

  const typeFilters = t('web:search.typeFilters', { returnObjects: true })
  const lifestyleChips = t('web:search.lifestyleChips', { returnObjects: true })
  const sortOptionsDetailed = t('web:search.sortOptionsDetailed', { returnObjects: true })
  const verifiedFilterChip = t('web:search.verifiedFilterChip')

  const proximityRadiusOptions = t('web:search.proximityRadiusOptions', { returnObjects: true })
  const indifferentRadius = proximityRadiusOptions[proximityRadiusOptions.length - 1]

  const [activeType, setActiveType] = useState(typeFilters[0].label)
  const [lifestyle, setLifestyle] = useState(() => new Set([lifestyleChips[0], lifestyleChips[1]]))
  const [proximityRadius, setProximityRadius] = useState(indifferentRadius)

  const typeOptions = t('web:search.typeOptions', { returnObjects: true })
  const genderOptions = t('web:search.genderOptions', { returnObjects: true })
  const budgetOptions = t('web:search.budgetOptions', { returnObjects: true })

  // Barre de recherche (haut de page) : appliquée uniquement au clic sur « Rechercher »,
  // sur les résultats déjà chargés côté client (pas de nouvel appel réseau).
  const [cityQuery, setCityQuery] = useState(t('web:search.locationDefault'))
  const [budgetQuery, setBudgetQuery] = useState('')
  const [typeQuery, setTypeQuery] = useState(typeOptions[0])
  const [genderQuery, setGenderQuery] = useState(genderOptions[0])
  const [appliedSearch, setAppliedSearch] = useState(null)

  const runSearch = () => {
    setAppliedSearch({ city: cityQuery.trim(), budget: budgetQuery, type: typeQuery, gender: genderQuery })
  }

  // Tri (best-effort) : la « pertinence/compatibilité » et le prix existent réellement
  // dans les données ; « Plus récentes » n'a pas de champ date sur ces items — on
  // conserve alors l'ordre reçu plutôt que d'inventer une date.
  const [sortValue, setSortValue] = useState(sortOptionsDetailed[0])

  // Cases « Partenaire institutionnel » / « Contrat en ligne » : aucun champ correspondant
  // n'existe encore sur les annonces (mapListingHit) — l'état est géré et visible (chip
  // active retirable) mais ne filtre pas la liste tant que le backend ne l'expose pas.
  const [institutionalPartnerOnly, setInstitutionalPartnerOnly] = useState(false)
  const [onlineContractOnly, setOnlineContractOnly] = useState(false)

  const PAGE_SIZE = 6
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  useEffect(() => {
    listListings().then(setItems)
  }, [])

  const activeFilters = useMemo(() => {
    const filters = []
    if (activeType) filters.push({ kind: 'type', label: activeType })
    if (verifiedOnly) filters.push({ kind: 'verified', label: verifiedFilterChip })
    lifestyle.forEach((label) => filters.push({ kind: 'lifestyle', label }))
    if (proximityRadius && proximityRadius !== indifferentRadius) filters.push({ kind: 'proximity', label: proximityRadius })
    if (institutionalPartnerOnly) filters.push({ kind: 'institutionalPartner', label: t('web:search.institutionalPartnerLabel') })
    if (onlineContractOnly) filters.push({ kind: 'onlineContract', label: t('web:search.onlineContractLabel') })
    return filters
  }, [activeType, lifestyle, verifiedOnly, verifiedFilterChip, proximityRadius, indifferentRadius, institutionalPartnerOnly, onlineContractOnly, t])

  const toggleLifestyle = (label) => {
    setLifestyle((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  const removeFilter = (filter) => {
    if (filter.kind === 'type') setActiveType(null)
    else if (filter.kind === 'verified') setVerifiedOnly(false)
    else if (filter.kind === 'lifestyle') toggleLifestyle(filter.label)
    else if (filter.kind === 'proximity') setProximityRadius(indifferentRadius)
    else if (filter.kind === 'institutionalPartner') setInstitutionalPartnerOnly(false)
    else if (filter.kind === 'onlineContract') setOnlineContractOnly(false)
  }

  // Nombre extrait d'une option de budget localisée ("2 500 Đh" / "٢٬٥٠٠ درهم") : on ne
  // garde que les chiffres, insensible à la langue/au séparateur de milliers.
  const parseBudget = (label) => {
    const digits = (label || '').replace(/[^\d٠-٩]/g, '')
    if (!digits) return null
    const normalized = digits.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    const n = Number(normalized)
    return Number.isFinite(n) ? n : null
  }

  const visibleItems = useMemo(() => {
    if (!items) return items
    let result = verifiedOnly ? items.filter((it) => it.verifiee) : items

    if (appliedSearch) {
      // `appliedSearch.gender` est capturé au clic « Rechercher » mais volontairement
      // ignoré ici : comme pour les cases partenaire/contrat, `mapListingHit` n'expose
      // aucun champ genre — filtrer dessus donnerait des résultats trompeurs tant que
      // le backend ne l'expose pas.
      const { city, budget, type } = appliedSearch
      if (city) {
        const needle = city.toLowerCase()
        result = result.filter((it) => `${it.ville} ${it.quartier}`.toLowerCase().includes(needle))
      }
      const budgetMax = budget ? parseBudget(budget) : null
      if (budgetMax != null) {
        result = result.filter((it) => it.prixMad <= budgetMax)
      }
      // "Tout" (première option) = pas de filtre ; sinon correspondance best-effort sur
      // le titre/les chips, faute de champ "type" structuré sur mapListingHit.
      if (type && type !== typeOptions[0]) {
        const needle = type.toLowerCase()
        result = result.filter((it) => it.titre?.toLowerCase().includes(needle) || it.chips?.some((c) => c.toLowerCase().includes(needle)))
      }
    }

    const sortIndex = sortOptionsDetailed.indexOf(sortValue)
    if (sortIndex === 1) {
      result = [...result].sort((a, b) => a.prixMad - b.prixMad)
    } else if (sortIndex === 2) {
      result = [...result].sort((a, b) => b.prixMad - a.prixMad)
    } else if (sortIndex === 0) {
      result = [...result].sort((a, b) => (b.matchPct ?? -1) - (a.matchPct ?? -1))
    }
    // sortIndex === 3 ("Plus récentes") : aucun champ date sur ces items, on garde l'ordre reçu.

    return result
  }, [items, verifiedOnly, appliedSearch, sortValue, sortOptionsDetailed, typeOptions])

  const pagedItems = visibleItems?.slice(0, visibleCount) ?? visibleItems
  const hasMore = visibleItems ? visibleCount < visibleItems.length : false

  // Un nouveau filtrage/tri repart de la première page.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [verifiedOnly, appliedSearch, sortValue])

  if (items === null) {
    return (
      <div style={{ padding: 48, maxWidth: 'var(--container-max)', margin: '0 auto', font: 'var(--fw-medium) var(--fs-body) var(--font-body)', color: 'var(--text-muted)' }}>
        {t('common:loading')}
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--bg-page)', minHeight: '100%' }}>
      <div style={{ background: '#fff', borderBottom: '1px solid var(--border-subtle)', padding: '18px 40px' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
          <div style={{ width: 260 }}>
            <Input label={t('web:search.institutionLabel')} icon="graduation-cap" defaultValue={t('web:search.institutionDefault')} />
          </div>
          <div style={{ width: 220 }}>
            <Input
              label={t('web:search.cityLabel')} icon="map-pin"
              value={cityQuery} onChange={(e) => setCityQuery(e.target.value)}
            />
          </div>
          <div style={{ width: 160 }}>
            <Select
              label={t('web:search.budgetLabel')} options={budgetOptions}
              value={budgetQuery} onChange={(e) => setBudgetQuery(e.target.value)}
            />
          </div>
          <div style={{ width: 150 }}>
            <Select label={t('web:search.typeLabel')} options={typeOptions} value={typeQuery} onChange={(e) => setTypeQuery(e.target.value)} />
          </div>
          <div style={{ width: 150 }}>
            <Select label={t('web:search.genderLabel')} options={genderOptions} value={genderQuery} onChange={(e) => setGenderQuery(e.target.value)} />
          </div>
          <Button variant="primary" style={{ height: 44 }} onClick={runSearch}>{t('web:search.cta')}</Button>
        </div>
      </div>

      <div
        style={{
          maxWidth: 1400,
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
              <span style={{ font: 'var(--fw-extrabold) var(--fs-body) var(--font-body)', color: 'var(--text-heading)' }}>{t('web:search.filtersTitle')}</span>
              <button
                type="button"
                onClick={() => {
                  setActiveType(typeFilters[0].label); setLifestyle(new Set()); setVerifiedOnly(false)
                  setProximityRadius(indifferentRadius); setInstitutionalPartnerOnly(false); setOnlineContractOnly(false)
                }}
                style={{ border: 0, background: 'transparent', color: 'var(--link)', font: 'var(--fw-semibold) var(--fs-sm) var(--font-body)', cursor: 'pointer', padding: 0 }}
              >
                {t('web:search.resetFilters')}
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, font: 'var(--fw-extrabold) 12.5px var(--font-body)', letterSpacing: '.02em', color: 'var(--text-heading)' }}>
                <Icon name="wallet" size={15} strokeWidth={2} />
                {t('web:search.monthlyBudgetLabel')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Input defaultValue="1 500" containerStyle={{ width: '100%' }} />
                <Input defaultValue="3 000" containerStyle={{ width: '100%' }} />
              </div>
              <div style={{ font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>{t('web:search.budgetUnitNote')}</div>
            </div>

            <div style={{ height: 1, background: 'var(--border-subtle)' }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, font: 'var(--fw-extrabold) var(--fs-sm) var(--font-body)', color: 'var(--text-heading)' }}>
                <Icon name="home" size={15} strokeWidth={2} />
                {t('web:search.housingTypeLabel')}
              </div>
              {typeFilters.map((f) => (
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, font: 'var(--fw-extrabold) var(--fs-sm) var(--font-body)', color: 'var(--text-heading)' }}>
                <Icon name="sparkles" size={15} strokeWidth={2} />
                {t('web:search.lifestyleLabel')}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {lifestyleChips.map((label) => (
                  <Chip key={label} selected={lifestyle.has(label)} onClick={() => toggleLifestyle(label)}>
                    {label}
                  </Chip>
                ))}
              </div>
            </div>

            <div style={{ height: 1, background: 'var(--border-subtle)' }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, font: 'var(--fw-extrabold) var(--fs-sm) var(--font-body)', color: 'var(--text-heading)' }}>
                <Icon name="navigation" size={15} strokeWidth={2} />
                {t('web:search.proximityLabel')}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {proximityRadiusOptions.map((label) => (
                  <Chip key={label} selected={proximityRadius === label} onClick={() => setProximityRadius(label)}>
                    {label}
                  </Chip>
                ))}
              </div>
            </div>

            <div style={{ height: 1, background: 'var(--border-subtle)' }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, font: 'var(--fw-extrabold) var(--fs-sm) var(--font-body)', color: 'var(--text-heading)' }}>
                <Icon name="shield-check" size={15} strokeWidth={2} />
                {t('web:search.trustLabel')}
              </div>
              <label style={{ display: 'flex', gap: 10, alignItems: 'center', font: 'var(--fw-regular) var(--fs-body) var(--font-body)', color: 'var(--text-body)', cursor: 'pointer' }}>
                <input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} style={{ width: 15, height: 15, accentColor: 'var(--navy-700)' }} />
                {t('web:search.verifiedOnlyLabel')}
              </label>
              <label style={{ display: 'flex', gap: 10, alignItems: 'center', font: 'var(--fw-regular) var(--fs-body) var(--font-body)', color: 'var(--text-body)', cursor: 'pointer' }}>
                <input
                  type="checkbox" checked={institutionalPartnerOnly}
                  onChange={(e) => setInstitutionalPartnerOnly(e.target.checked)}
                  style={{ width: 15, height: 15, accentColor: 'var(--navy-700)' }}
                />
                {t('web:search.institutionalPartnerLabel')}
              </label>
              <label style={{ display: 'flex', gap: 10, alignItems: 'center', font: 'var(--fw-regular) var(--fs-body) var(--font-body)', color: 'var(--text-body)', cursor: 'pointer' }}>
                <input
                  type="checkbox" checked={onlineContractOnly}
                  onChange={(e) => setOnlineContractOnly(e.target.checked)}
                  style={{ width: 15, height: 15, accentColor: 'var(--navy-700)' }}
                />
                {t('web:search.onlineContractLabel')}
              </label>
            </div>
          </Card>
        </aside>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
              borderRadius: 'var(--radius-md, 10px)',
              background: hasLifestyleProfile ? 'var(--navy-50)' : 'var(--gold-100)',
              border: `1px solid ${hasLifestyleProfile ? 'var(--navy-100)' : 'var(--gold-500)'}`,
            }}
          >
            <Icon name={hasLifestyleProfile ? 'user-check' : 'sparkles'} size={16} color={hasLifestyleProfile ? 'var(--navy-700)' : 'var(--gold-700)'} />
            <a
              href="/espace/questionnaire"
              onClick={(e) => { e.preventDefault(); navigate('/espace/questionnaire') }}
              style={{
                font: 'var(--fw-semibold) var(--fs-sm) var(--font-body)',
                color: hasLifestyleProfile ? 'var(--text-heading)' : 'var(--gold-700)',
                flex: 1, textDecoration: 'none',
              }}
            >
              {hasLifestyleProfile ? t('web:search.lifestyleProfileBanner.withProfile') : t('web:search.lifestyleProfileBanner.withoutProfile')}
            </a>
            {hasLifestyleProfile && (
              <a
                href="/espace/questionnaire"
                onClick={(e) => { e.preventDefault(); navigate('/espace/questionnaire') }}
                style={{ font: 'var(--fw-bold) var(--fs-sm) var(--font-body)', color: 'var(--link)', whiteSpace: 'nowrap' }}
              >
                {t('web:search.lifestyleProfileBanner.editLink')}
              </a>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <h1 style={{ margin: 0, font: 'var(--fw-bold) 24px var(--font-display)', color: 'var(--text-heading)', letterSpacing: '-0.02em' }}>
                {t('web:search.resultsTitle')}
              </h1>
              <span style={{ font: 'var(--fw-regular) var(--fs-sm) var(--font-body)', color: 'var(--text-body)' }}>
                {t('web:search.resultsSubtitle', { count: visibleItems.length })}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ width: 180 }}>
                <Select options={sortOptionsDetailed} value={sortValue} onChange={(e) => setSortValue(e.target.value)} />
              </div>
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
                  {t('web:search.viewListLabel')}
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
                  {t('web:search.viewMapLabel')}
                </button>
              </div>
            </div>
          </div>

          {activeFilters.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ font: 'var(--fw-regular) var(--fs-sm) var(--font-body)', color: 'var(--text-muted)' }}>{t('web:search.activeFiltersLabel')}</span>
              {activeFilters.map((filter) => (
                <span
                  key={`${filter.kind}-${filter.label}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 10px 6px 12px',
                    borderRadius: 'var(--radius-pill)', background: 'var(--navy-50)', border: '1px solid var(--navy-100)',
                    color: 'var(--text-heading)', font: 'var(--fw-semibold) var(--fs-sm) var(--font-body)',
                  }}
                >
                  {filter.label}
                  <button
                    type="button"
                    onClick={() => removeFilter(filter)}
                    aria-label={t('web:search.removeFilterLabel', { label: filter.label })}
                    style={{ display: 'inline-flex', color: 'var(--text-muted)', cursor: 'pointer', background: 'none', border: 0, padding: 0, font: 'inherit', lineHeight: 1 }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {view === 'carte' ? (
            <SearchResultsMap items={visibleItems} cityFilter={appliedSearch?.city || null} />
          ) : visibleItems.length === 0 ? (
            <div style={{ padding: '64px 0', textAlign: 'center', font: 'var(--fw-medium) var(--fs-body) var(--font-body)', color: 'var(--text-muted)' }}>
              {t('web:search.empty')}
            </div>
          ) : (
            <>
              <div className="m3a-search-grid" style={{ display: 'grid', gap: 20 }}>
                {pagedItems.map((it) => (
                  <ListingCard
                    key={it.id}
                    image={it.photos?.[0]}
                    match={it.matchPct}
                    verified={it.verifiee}
                    title={it.titre}
                    city={`${it.quartier}, ${it.ville}`}
                    price={it.prixMad}
                    isCondo={it.isCondo}
                    condoFees={it.condoFees}
                    amenities={it.chips?.map((label) => ({ icon: 'check', label }))}
                    proximity={it.proximite?.[0]}
                    onClick={() => navigate(`/annonce/${it.id}`)}
                    onApply={() => navigate(`/espace/candidature?listingId=${it.id}`)}
                  />
                ))}
              </div>
              {hasMore && (
                <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}>
                  <Button variant="secondary" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
                    {t('web:search.loadMore')}
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
