import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Avatar, Badge, Button, Chip, MatchScore } from '../../ds/index.js'
import { acceptCandidature, getBackofficeAttribution, shortlistCandidature } from '../../services/index.js'
import { BackofficeSidebar } from './BackofficeSidebar.jsx'

const SORT_COMPATIBILITY = 'compatibility'
const SORT_NAME = 'name'
const SORT_VALUES = [SORT_COMPATIBILITY, SORT_NAME]

const ROOM_STATUS_TAKEN = 'taken'
const ROOM_STATUS_OPEN_WITH_PICK = 'open-with-pick'
const ROOM_STATUS_OPEN_NO_PICK = 'open-no-pick'

const AUTO_FILL_MIN_SCORE = 70

function formatRent(rent, currency) {
  if (typeof rent !== 'number') return ''
  return `${rent.toLocaleString('fr-FR')} ${currency || ''}`.trim()
}

/**
 * Dérive les candidats d'un bien à partir de ses candidatures : un candidat peut postuler
 * à plusieurs chambres du même bien, l'identité retenue est donc `candidate_user_id` et
 * les candidatures sont repliées en une table (chambre → score, chambre → candidature).
 * Une paire sans `match_pct` vaut 0 : le matching n'a rien renvoyé, pas « 0 % de chance ».
 */
function buildCandidates(property, t) {
  const byUser = new Map()
  for (const c of property.candidatures ?? []) {
    let candidate = byUser.get(c.candidate_user_id)
    if (!candidate) {
      candidate = {
        id: c.candidate_user_id,
        name: c.candidate_name || t('backoffice:roomAssignment.candidateFallback', { id: c.candidate_user_id }),
        scores: {},
        candidatureByRoom: {},
        statusByRoom: {},
      }
      byUser.set(c.candidate_user_id, candidate)
    }
    candidate.scores[c.listing_id] = typeof c.match_pct === 'number' ? c.match_pct : 0
    candidate.candidatureByRoom[c.listing_id] = c.id
    candidate.statusByRoom[c.listing_id] = c.status
  }
  return [...byUser.values()]
}

// Les candidatures déjà acceptées sont les attributions actées côté serveur : elles
// forment l'état de départ du plan et ne sont pas ré-envoyées à l'enregistrement.
function buildAcceptedAssignment(property) {
  const assignment = {}
  for (const c of property.candidatures ?? []) {
    if (c.status === 'accepted') assignment[c.listing_id] = c.candidate_user_id
  }
  return assignment
}

function averageScore(candidate, rooms) {
  if (!rooms.length) return 0
  const total = rooms.reduce((sum, room) => sum + (candidate.scores[room.id] ?? 0), 0)
  return Math.round(total / rooms.length)
}

function compatibilityReason(t, score) {
  if (score >= 88) return t('backoffice:roomAssignment.room.reasonHigh')
  if (score >= 75) return t('backoffice:roomAssignment.room.reasonMid')
  return t('backoffice:roomAssignment.room.reasonLow')
}

/**
 * Écran back-office : plan d'affectation des chambres par bien. Le placement d'un candidat
 * est local (mise en attente) ; l'action « Enregistrer » seule accepte les candidatures
 * correspondantes côté serveur.
 */
export default function AttributionChambres() {
  const { t } = useTranslation(['backoffice'])
  const navigate = useNavigate()
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [propertyIndex, setPropertyIndex] = useState(0)
  const [selectedCandidateId, setSelectedCandidateId] = useState(null)
  const [sort, setSort] = useState(SORT_COMPATIBILITY)
  const [assignments, setAssignments] = useState([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)

  const load = () => {
    let cancelled = false
    setLoading(true)
    setLoadError(false)
    getBackofficeAttribution()
      .then((data) => {
        if (cancelled) return
        const rows = data?.properties ?? []
        setProperties(rows)
        setAssignments(rows.map(buildAcceptedAssignment))
        setPropertyIndex((current) => (current < rows.length ? current : 0))
        setSelectedCandidateId(null)
      })
      .catch(() => { if (!cancelled) setLoadError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }

  useEffect(load, [])

  const property = properties[propertyIndex] ?? null
  const assignment = assignments[propertyIndex] ?? {}
  const candidates = useMemo(() => (property ? buildCandidates(property, t) : []), [property, t])
  const candidateById = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates])
  const acceptedAssignment = useMemo(
    () => (property ? buildAcceptedAssignment(property) : {}),
    [property]
  )

  function selectProperty(index) {
    setPropertyIndex(index)
    setSelectedCandidateId(null)
  }

  function selectCandidate(candidateId) {
    setSelectedCandidateId((current) => (current === candidateId ? null : candidateId))
  }

  function updateAssignment(updater) {
    setAssignments((current) => current.map((a, i) => (i === propertyIndex ? updater(a) : a)))
  }

  function placeInRoom(roomId) {
    if (!selectedCandidateId) return
    updateAssignment((a) => {
      const next = { ...a }
      Object.keys(next).forEach((r) => {
        if (next[r] === selectedCandidateId) delete next[r]
      })
      next[roomId] = selectedCandidateId
      return next
    })
    setSelectedCandidateId(null)
  }

  function clearRoom(roomId) {
    updateAssignment((a) => {
      const next = { ...a }
      delete next[roomId]
      return next
    })
  }

  function autoFill() {
    if (!property) return
    const used = new Set(Object.values(assignment))
    const pairs = []
    property.rooms.filter((r) => !assignment[r.id]).forEach((room) => {
      candidates.forEach((c) => {
        if (!used.has(c.id)) pairs.push({ roomId: room.id, candidateId: c.id, score: c.scores[room.id] ?? 0 })
      })
    })
    pairs.sort((a, b) => b.score - a.score)
    const next = { ...assignment }
    const takenRooms = new Set()
    const takenCandidates = new Set(used)
    pairs.forEach((pair) => {
      if (!takenRooms.has(pair.roomId) && !takenCandidates.has(pair.candidateId) && pair.score >= AUTO_FILL_MIN_SCORE) {
        next[pair.roomId] = pair.candidateId
        takenRooms.add(pair.roomId)
        takenCandidates.add(pair.candidateId)
      }
    })
    updateAssignment(() => next)
    setSelectedCandidateId(null)
  }

  // Placements qui n'existent pas encore côté serveur : seuls ceux-là seront acceptés.
  const pendingPlacements = Object.entries(assignment)
    .filter(([roomId, candidateId]) => acceptedAssignment[roomId] !== candidateId)
    .map(([roomId, candidateId]) => {
      const candidate = candidateById.get(candidateId)
      const id = candidate?.candidatureByRoom[roomId]
      return id ? { id, status: candidate.statusByRoom[roomId] } : null
    })
    .filter(Boolean)

  function savePlacements() {
    if (!pendingPlacements.length) return
    setSaving(true)
    setSaveError(false)
    // Le service n'accepte qu'une candidature présélectionnée : on franchit l'étape pour
    // l'agent, dont le geste (placer dans une chambre) vaut présélection.
    Promise.all(pendingPlacements.map(async ({ id, status }) => {
      if (status === 'received') await shortlistCandidature(id)
      return acceptCandidature(id)
    }))
      .then(() => load())
      .catch(() => setSaveError(true))
      .finally(() => setSaving(false))
  }

  const selectedCandidate = selectedCandidateId ? candidateById.get(selectedCandidateId) : null

  const openRoomIds = property ? property.rooms.filter((r) => !assignment[r.id]).map((r) => r.id) : []
  let bestRoomId = null
  if (selectedCandidate && openRoomIds.length) {
    bestRoomId = openRoomIds.reduce((best, roomId) =>
      (selectedCandidate.scores[roomId] ?? 0) > (selectedCandidate.scores[best] ?? 0) ? roomId : best
    )
  }

  const placedIds = new Set(Object.values(assignment))
  const rooms = (property?.rooms ?? []).map((room) => {
    const tenant = assignment[room.id] ? candidateById.get(assignment[room.id]) : null
    if (tenant) {
      return { status: ROOM_STATUS_TAKEN, room, tenant, score: tenant.scores[room.id] ?? 0 }
    }
    if (selectedCandidate) {
      const score = selectedCandidate.scores[room.id] ?? 0
      return {
        status: ROOM_STATUS_OPEN_WITH_PICK,
        room,
        candidate: selectedCandidate,
        score,
        reason: compatibilityReason(t, score),
        isBest: bestRoomId === room.id,
        // Sans candidature sur cette chambre, il n'y a rien à accepter : on ne propose pas le placement.
        canPlace: !!selectedCandidate.candidatureByRoom[room.id],
      }
    }
    const topCandidate = candidates
      .filter((c) => !placedIds.has(c.id))
      .reduce((best, c) => ((c.scores[room.id] ?? 0) > (best ? best.scores[room.id] ?? 0 : 0) ? c : best), null)
    return { status: ROOM_STATUS_OPEN_NO_PICK, room, topCandidate }
  })

  const roomNameById = new Map((property?.rooms ?? []).map((r) => [r.id, r.name]))
  const sortComparators = {
    [SORT_COMPATIBILITY]: (a, b) => b.avg - a.avg,
    [SORT_NAME]: (a, b) => a.candidate.name.localeCompare(b.candidate.name),
  }
  const candidateRows = candidates
    .map((c) => {
      const placedRoomId = Object.keys(assignment).find((roomId) => assignment[roomId] === c.id)
      return {
        candidate: c,
        avg: averageScore(c, property?.rooms ?? []),
        placed: !!placedRoomId,
        placedInRoomName: placedRoomId ? roomNameById.get(placedRoomId) : '',
        selected: selectedCandidateId === c.id,
      }
    })
    .sort(sortComparators[sort])
    .sort((a, b) => (a.placed ? 1 : 0) - (b.placed ? 1 : 0))

  const filled = placedIds.size
  const roomCount = property?.rooms.length ?? 0
  const scores = Object.keys(assignment).map((roomId) => candidateById.get(assignment[roomId])?.scores[roomId] ?? 0)
  const meanCompatibility = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0

  const kpis = [
    {
      label: t('backoffice:roomAssignment.kpis.occupation'),
      value: `${filled}/${roomCount}`,
      note: t('backoffice:roomAssignment.kpis.occupationNote', { count: Math.max(0, roomCount - filled) }),
    },
    {
      label: t('backoffice:roomAssignment.kpis.avgCompatibility'),
      value: meanCompatibility ? `${meanCompatibility}%` : '—',
      note: t('backoffice:roomAssignment.kpis.avgCompatibilityNote'),
    },
    {
      label: t('backoffice:roomAssignment.kpis.waitingCandidates'),
      value: String(Math.max(0, candidates.length - filled)),
      note: t('backoffice:roomAssignment.kpis.waitingCandidatesNote'),
    },
  ]

  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '248px minmax(0, 1fr)', background: 'var(--bg-page)' }}>
      <BackofficeSidebar active="attribution" onSelect={(id) => navigate('/back-office', { state: { view: id } })} />

      <main style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header
          style={{
            background: 'var(--surface-card)',
            borderBottom: '1px solid var(--border-subtle)',
            padding: '18px 28px',
            display: 'flex',
            alignItems: 'flex-end',
            gap: 24,
            position: 'sticky',
            insetBlockStart: 0,
            zIndex: 4,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
            <div style={{ font: 'var(--fw-bold) 12.5px var(--font-body)', letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              {t('backoffice:roomAssignment.kicker')}
            </div>
            <h1 style={{ margin: 0, font: 'var(--fw-extrabold) 23px var(--font-display)', letterSpacing: '-0.02em', color: 'var(--text-heading)' }}>
              {t('backoffice:roomAssignment.title')}
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 'none' }}>
            <Button variant="secondary" size="md" iconLeft="wand-2" onClick={autoFill} disabled={!property || saving}>
              {t('backoffice:roomAssignment.autoFill')}
            </Button>
            <Button variant="primary" size="md" iconLeft="check" onClick={savePlacements} disabled={!pendingPlacements.length || saving}>
              {saving ? t('backoffice:roomAssignment.saving') : t('backoffice:roomAssignment.save', { count: pendingPlacements.length })}
            </Button>
          </div>
        </header>

        <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {loading && (
            <div style={{ font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>
              {t('backoffice:roomAssignment.loading')}
            </div>
          )}
          {!loading && loadError && (
            <div style={{ font: 'var(--fw-semibold) 12.5px var(--font-body)', color: 'var(--red-600)' }}>
              {t('backoffice:roomAssignment.loadError')}
            </div>
          )}
          {!loading && !loadError && properties.length === 0 && (
            <div style={{ font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>
              {t('backoffice:roomAssignment.empty')}
            </div>
          )}
          {saveError && (
            <div style={{ font: 'var(--fw-semibold) 12.5px var(--font-body)', color: 'var(--red-600)' }}>
              {t('backoffice:roomAssignment.saveError')}
            </div>
          )}

          {!loading && !loadError && property && (
            <>
              <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 2 }}>
                {properties.map((p, i) => {
                  const on = i === propertyIndex
                  const occupied = Object.keys(assignments[i] ?? {}).length
                  return (
                    <button
                      key={p.id}
                      onClick={() => selectProperty(i)}
                      style={{
                        textAlign: 'start',
                        flex: 'none',
                        width: 280,
                        padding: '14px 16px',
                        border: on ? '1.5px solid var(--navy-700)' : '1.5px solid var(--border-subtle)',
                        background: on ? 'var(--navy-50)' : 'var(--white)',
                        borderRadius: 13,
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 7,
                      }}
                    >
                      <span style={{ font: 'var(--fw-extrabold) 14.5px var(--font-display)', color: 'var(--text-heading)' }}>{p.name}</span>
                      <span style={{ font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>{p.place}</span>
                      <span style={{ display: 'flex', gap: 8, alignItems: 'center', marginBlockStart: 2 }}>
                        <Badge tone={on ? 'solidNavy' : 'neutral'} size="sm">
                          {t('backoffice:roomAssignment.occupied', { count: occupied, total: p.rooms.length })}
                        </Badge>
                      </span>
                    </button>
                  )
                })}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 348px', gap: 20, alignItems: 'start' }}>
                <section style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
                  <div
                    style={{
                      background: 'var(--surface-card)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 14,
                      padding: '14px 18px',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3,minmax(0,1fr))',
                      gap: 16,
                      boxShadow: 'var(--shadow-sm)',
                    }}
                  >
                    {kpis.map((k) => (
                      <div key={k.label} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <div style={{ font: 'var(--fw-bold) 11.5px var(--font-body)', letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                          {k.label}
                        </div>
                        <div style={{ font: 'var(--fw-extrabold) 20px var(--font-display)', color: 'var(--text-heading)', letterSpacing: '-0.01em' }}>
                          {k.value}
                        </div>
                        <div style={{ font: 'var(--fw-regular) 12px var(--font-body)', color: 'var(--text-muted)' }}>{k.note}</div>
                      </div>
                    ))}
                  </div>

                  <div
                    style={{
                      background: 'var(--surface-card)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 16,
                      boxShadow: 'var(--shadow-sm)',
                      padding: 18,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 14,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                      <div style={{ font: 'var(--fw-extrabold) 15px var(--font-display)', color: 'var(--text-heading)' }}>
                        {t('backoffice:roomAssignment.planTitle')}
                      </div>
                      <div style={{ font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>
                        {selectedCandidate
                          ? t('backoffice:roomAssignment.planHintSelected', { name: selectedCandidate.name })
                          : t('backoffice:roomAssignment.planHintEmpty')}
                      </div>
                    </div>
                    {rooms.length === 0 && (
                      <div style={{ font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>
                        {t('backoffice:roomAssignment.noRooms')}
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(232px,1fr))', gap: 14 }}>
                      {rooms.map((entry) => (
                        <RoomTile key={entry.room.id} entry={entry} onPlace={placeInRoom} onClear={clearRoom} />
                      ))}
                    </div>
                  </div>
                </section>

                <aside
                  style={{
                    background: 'var(--surface-card)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 16,
                    boxShadow: 'var(--shadow-sm)',
                    padding: 18,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                    position: 'sticky',
                    insetBlockStart: 96,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ font: 'var(--fw-extrabold) 15px var(--font-display)', color: 'var(--text-heading)' }}>
                      {t('backoffice:roomAssignment.candidatesTitle')}
                    </div>
                    <div style={{ font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                      {t('backoffice:roomAssignment.candidatesHint')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                    {SORT_VALUES.map((value) => (
                      <Chip key={value} selected={sort === value} onClick={() => setSort(value)}>
                        {t(`backoffice:roomAssignment.sorts.${value}`)}
                      </Chip>
                    ))}
                  </div>
                  {candidateRows.length === 0 && (
                    <div style={{ font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>
                      {t('backoffice:roomAssignment.noCandidates')}
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 640, overflowY: 'auto', margin: '0 -4px', padding: '2px 4px' }}>
                    {candidateRows.map((entry) => (
                      <CandidateCard key={entry.candidate.id} entry={entry} onSelect={selectCandidate} />
                    ))}
                  </div>
                </aside>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

function RoomTile({ entry, onPlace, onClear }) {
  const { t } = useTranslation(['backoffice'])
  const { status, room } = entry
  const rent = formatRent(room.rent, room.currency)
  return (
    <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 14, overflow: 'hidden', background: 'var(--white)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '11px 14px', background: 'var(--gray-100)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ font: 'var(--fw-extrabold) 14px var(--font-display)', color: 'var(--text-heading)', flex: 1 }}>{room.name}</div>
        {rent && (
          <div style={{ font: 'var(--fw-bold) 12px var(--font-body)', color: 'var(--text-muted)' }}>
            {t('backoffice:roomAssignment.room.rentPerMonth', { rent })}
          </div>
        )}
      </div>
      {room.meta && (
        <div style={{ padding: '8px 14px 0', font: 'var(--fw-regular) 12px var(--font-body)', color: 'var(--text-muted)' }}>{room.meta}</div>
      )}

      {status === ROOM_STATUS_TAKEN && (
        <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Avatar name={entry.tenant.name} size={38} />
            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ font: 'var(--fw-extrabold) 13.5px var(--font-display)', color: 'var(--text-heading)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {entry.tenant.name}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '9px 11px', borderRadius: 10, background: 'var(--green-50)' }}>
            <Badge tone="verified" size="sm">{t('backoffice:roomAssignment.room.compatibilityBadge', { score: entry.score })}</Badge>
          </div>
          <Button variant="secondary" size="sm" iconLeft="user-minus" onClick={() => onClear(room.id)}>{t('backoffice:roomAssignment.room.releaseRoom')}</Button>
        </div>
      )}

      {status === ROOM_STATUS_OPEN_WITH_PICK && (
        <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '9px 11px', borderRadius: 10, background: 'var(--navy-50)', border: '1px dashed var(--navy-300)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ font: 'var(--fw-extrabold) 17px var(--font-display)', color: 'var(--navy-700)', letterSpacing: '-0.01em' }}>{entry.score}%</span>
              <span style={{ font: 'var(--fw-bold) 12px var(--font-body)', color: 'var(--text-muted)' }}>
                {t('backoffice:roomAssignment.room.withCandidate', { name: entry.candidate.name })}
              </span>
            </div>
            <div style={{ font: 'var(--fw-regular) 12px var(--font-body)', color: 'var(--text-muted)', lineHeight: 1.45 }}>{entry.reason}</div>
          </div>
          {entry.isBest && <Badge tone="gold" size="sm" style={{ alignSelf: 'flex-start' }}>{t('backoffice:roomAssignment.room.bestSuggestion')}</Badge>}
          {entry.canPlace ? (
            <Button variant="primary" size="sm" iconLeft="user-plus" onClick={() => onPlace(room.id)}>{t('backoffice:roomAssignment.room.placeHere')}</Button>
          ) : (
            <div style={{ font: 'var(--fw-regular) 12px var(--font-body)', color: 'var(--text-muted)', lineHeight: 1.45 }}>
              {t('backoffice:roomAssignment.room.noCandidatureHere')}
            </div>
          )}
        </div>
      )}

      {status === ROOM_STATUS_OPEN_NO_PICK && (
        <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
          <div
            style={{
              flex: 1,
              minHeight: 74,
              border: '1px dashed var(--border-default)',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              font: 'var(--fw-regular) 12.5px var(--font-body)',
              color: 'var(--text-muted)',
              padding: 10,
              lineHeight: 1.45,
            }}
          >
            {t('backoffice:roomAssignment.room.freeRoomLine1')}
            <br />
            {t('backoffice:roomAssignment.room.freeRoomLine2')}
          </div>
          <div style={{ font: 'var(--fw-regular) 12px var(--font-body)', color: 'var(--text-muted)' }}>
            {entry.topCandidate
              ? t('backoffice:roomAssignment.room.bestCandidate', {
                  name: entry.topCandidate.name,
                  score: entry.topCandidate.scores[room.id] ?? 0,
                })
              : t('backoffice:roomAssignment.room.noCandidateAvailable')}
          </div>
        </div>
      )}
    </div>
  )
}

function CandidateCard({ entry, onSelect }) {
  const { t } = useTranslation(['backoffice'])
  const { candidate, avg, placed, placedInRoomName, selected } = entry

  if (placed) {
    return (
      <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 13, padding: 13, background: 'var(--gray-100)', display: 'flex', gap: 11, alignItems: 'flex-start', opacity: 0.72 }}>
        <Avatar name={candidate.name} size={38} />
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
          <div style={{ font: 'var(--fw-extrabold) 13.5px var(--font-display)', color: 'var(--text-heading)' }}>{candidate.name}</div>
          <div style={{ font: 'var(--fw-bold) 12px var(--font-body)', color: 'var(--green-700)' }}>
            {t('backoffice:roomAssignment.candidateCard.placed', { room: placedInRoomName })}
          </div>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={() => onSelect(candidate.id)}
      style={{
        textAlign: 'start',
        border: selected ? '1.5px solid var(--navy-700)' : '1px solid var(--border-subtle)',
        borderRadius: 13,
        padding: 13,
        background: selected ? 'var(--navy-50)' : 'var(--white)',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: selected ? 10 : 9,
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <span style={{ display: 'flex', gap: 11, alignItems: 'center', width: '100%' }}>
        <Avatar name={candidate.name} size={38} />
        <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
          <span style={{ font: 'var(--fw-extrabold) 13.5px var(--font-display)', color: 'var(--text-heading)' }}>{candidate.name}</span>
        </span>
        <MatchScore value={avg} size="sm" />
      </span>
      {selected && (
        <span style={{ font: 'var(--fw-extrabold) 12px var(--font-display)', color: 'var(--navy-700)' }}>
          {t('backoffice:roomAssignment.candidateCard.chooseRoom')}
        </span>
      )}
    </button>
  )
}
