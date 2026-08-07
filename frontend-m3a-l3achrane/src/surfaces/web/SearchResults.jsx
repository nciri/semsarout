import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Card, Chip, Icon, Input, ListingCard, Select } from '../../ds/index.js'
import { getCurrentProfile, listListings } from '../../services/index.js'

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

  useEffect(() => {
    listListings().then(setItems)
  }, [])

  const activeFilters = useMemo(() => {
    const filters = []
    if (activeType) filters.push({ kind: 'type', label: activeType })
    if (verifiedOnly) filters.push({ kind: 'verified', label: verifiedFilterChip })
    lifestyle.forEach((label) => filters.push({ kind: 'lifestyle', label }))
    if (proximityRadius && proximityRadius !== indifferentRadius) filters.push({ kind: 'proximity', label: proximityRadius })
    return filters
  }, [activeType, lifestyle, verifiedOnly, verifiedFilterChip, proximityRadius, indifferentRadius])

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
  }

  const visibleItems = useMemo(() => {
    if (!items) return items
    return verifiedOnly ? items.filter((it) => it.verifiee) : items
  }, [items, verifiedOnly])

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
          <div style={{ width: 220 }}><Input label={t('web:search.cityLabel')} icon="map-pin" defaultValue={t('web:search.locationDefault')} /></div>
          <div style={{ width: 160 }}><Select label={t('web:search.budgetLabel')} options={t('web:search.budgetOptions', { returnObjects: true })} /></div>
          <div style={{ width: 150 }}><Select label={t('web:search.typeLabel')} options={t('web:search.typeOptions', { returnObjects: true })} /></div>
          <div style={{ width: 150 }}><Select label={t('web:search.genderLabel')} options={t('web:search.genderOptions', { returnObjects: true })} /></div>
          <Button variant="primary" style={{ height: 44 }}>{t('web:search.cta')}</Button>
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
                onClick={() => { setActiveType(typeFilters[0].label); setLifestyle(new Set()); setVerifiedOnly(false); setProximityRadius(indifferentRadius) }}
                style={{ border: 0, background: 'transparent', color: 'var(--link)', font: 'var(--fw-semibold) var(--fs-sm) var(--font-body)', cursor: 'pointer', padding: 0 }}
              >
                {t('web:search.resetFilters')}
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ font: 'var(--fw-extrabold) 12.5px var(--font-body)', letterSpacing: '.02em', color: 'var(--text-heading)' }}>{t('web:search.monthlyBudgetLabel')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Input defaultValue="1 500" containerStyle={{ width: '100%' }} />
                <Input defaultValue="3 000" containerStyle={{ width: '100%' }} />
              </div>
              <div style={{ font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>{t('web:search.budgetUnitNote')}</div>
            </div>

            <div style={{ height: 1, background: 'var(--border-subtle)' }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ font: 'var(--fw-extrabold) var(--fs-sm) var(--font-body)', color: 'var(--text-heading)' }}>{t('web:search.housingTypeLabel')}</div>
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
              <div style={{ font: 'var(--fw-extrabold) var(--fs-sm) var(--font-body)', color: 'var(--text-heading)' }}>{t('web:search.lifestyleLabel')}</div>
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
              <div style={{ font: 'var(--fw-extrabold) var(--fs-sm) var(--font-body)', color: 'var(--text-heading)' }}>{t('web:search.proximityLabel')}</div>
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
              <div style={{ font: 'var(--fw-extrabold) var(--fs-sm) var(--font-body)', color: 'var(--text-heading)' }}>{t('web:search.trustLabel')}</div>
              <label style={{ display: 'flex', gap: 10, alignItems: 'center', font: 'var(--fw-regular) var(--fs-body) var(--font-body)', color: 'var(--text-body)', cursor: 'pointer' }}>
                <input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} style={{ width: 15, height: 15, accentColor: 'var(--navy-700)' }} />
                {t('web:search.verifiedOnlyLabel')}
              </label>
              <label style={{ display: 'flex', gap: 10, alignItems: 'center', font: 'var(--fw-regular) var(--fs-body) var(--font-body)', color: 'var(--text-body)', cursor: 'pointer' }}>
                <input type="checkbox" style={{ width: 15, height: 15, accentColor: 'var(--navy-700)' }} />
                {t('web:search.institutionalPartnerLabel')}
              </label>
              <label style={{ display: 'flex', gap: 10, alignItems: 'center', font: 'var(--fw-regular) var(--fs-body) var(--font-body)', color: 'var(--text-body)', cursor: 'pointer' }}>
                <input type="checkbox" style={{ width: 15, height: 15, accentColor: 'var(--navy-700)' }} />
                {t('web:search.onlineContractLabel')}
              </label>
            </div>
          </Card>
        </aside>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
              borderRadius: 'var(--radius-md, 10px)', background: 'var(--navy-50)', border: '1px solid var(--navy-100)',
            }}
          >
            <Icon name={hasLifestyleProfile ? 'user-check' : 'sliders'} size={16} color="var(--navy-700)" />
            <a
              href="/espace/questionnaire"
              onClick={(e) => { e.preventDefault(); navigate('/espace/questionnaire') }}
              style={{
                font: 'var(--fw-semibold) var(--fs-sm) var(--font-body)',
                color: hasLifestyleProfile ? 'var(--text-heading)' : 'var(--link)',
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
              <div style={{ width: 180 }}><Select options={sortOptionsDetailed} /></div>
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
            <div
              style={{
                height: 420, borderRadius: 'var(--radius-lg)', background: 'var(--gray-150)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                font: 'var(--fw-medium) var(--fs-body) var(--font-body)', color: 'var(--text-muted)',
              }}
            >
              <Icon name="map" size={20} />
              {t('web:search.mapComingSoon')}
            </div>
          ) : visibleItems.length === 0 ? (
            <div style={{ padding: '64px 0', textAlign: 'center', font: 'var(--fw-medium) var(--fs-body) var(--font-body)', color: 'var(--text-muted)' }}>
              {t('web:search.empty')}
            </div>
          ) : (
            <>
              <div className="m3a-search-grid" style={{ display: 'grid', gap: 20 }}>
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
                    proximity={it.proximite?.[0]}
                    onClick={() => navigate(`/annonce/${it.id}`)}
                    onApply={() => navigate('/espace/candidature')}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}>
                <Button variant="secondary">{t('web:search.loadMore')}</Button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
