import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Avatar, Badge, Button, Chip, Icon, MatchScore } from '../../ds/index.js'
import { PROPERTIES } from '../../data/roomAssignmentBoard.js'
import { BackofficeSidebar } from './BackofficeSidebar.jsx'

const SORT_COMPATIBILITY = 'compatibility'
const SORT_PROXIMITY = 'proximity'
const SORT_NAME = 'name'

const SORT_VALUES = [SORT_COMPATIBILITY, SORT_PROXIMITY, SORT_NAME]

const ROOM_STATUS_TAKEN = 'taken'
const ROOM_STATUS_OPEN_WITH_PICK = 'open-with-pick'
const ROOM_STATUS_OPEN_NO_PICK = 'open-no-pick'

function parseKm(distance) {
  return parseFloat(distance.replace(',', '.'))
}

function averageScore(candidate, rooms) {
  const total = rooms.reduce((sum, room) => sum + candidate.scores[room.id], 0)
  return Math.round(total / rooms.length)
}

function compatibilityReason(t, score, candidate) {
  if (score >= 88) return t('backoffice:roomAssignment.room.reasonHigh', { anchor: candidate.anchor })
  if (score >= 75) return t('backoffice:roomAssignment.room.reasonMid')
  return t('backoffice:roomAssignment.room.reasonLow')
}

/**
 * Écran back-office autonome : plan d'affectation des chambres par bien, avec
 * sélection d'un colocataire recommandé puis placement dans une chambre libre
 * (compatible glisser-déposer visuel simplifié en "sélectionner puis placer").
 */
export default function AttributionChambres() {
  const { t } = useTranslation(['backoffice'])
  const navigate = useNavigate()
  const [propertyIndex, setPropertyIndex] = useState(0)
  const [selectedCandidateId, setSelectedCandidateId] = useState(null)
  const [sort, setSort] = useState(SORT_COMPATIBILITY)
  const [assignments, setAssignments] = useState(() => PROPERTIES.map((p) => ({ ...p.initialAssignment })))

  const property = PROPERTIES[propertyIndex]
  const assignment = assignments[propertyIndex]
  const candidateById = useMemo(
    () => new Map(property.candidates.map((c) => [c.id, c])),
    [property]
  )

  const sorts = SORT_VALUES.map((value) => ({
    value,
    label: t(`backoffice:roomAssignment.sorts.${value}`),
  }))

  function selectProperty(index) {
    setPropertyIndex(index)
    setSelectedCandidateId(null)
  }

  function selectCandidate(candidateId) {
    setSelectedCandidateId((current) => (current === candidateId ? null : candidateId))
  }

  function placeInRoom(roomId) {
    if (!selectedCandidateId) return
    setAssignments((current) =>
      current.map((a, i) => {
        if (i !== propertyIndex) return a
        const next = { ...a }
        Object.keys(next).forEach((r) => {
          if (next[r] === selectedCandidateId) delete next[r]
        })
        next[roomId] = selectedCandidateId
        return next
      })
    )
    setSelectedCandidateId(null)
  }

  function clearRoom(roomId) {
    setAssignments((current) =>
      current.map((a, i) => {
        if (i !== propertyIndex) return a
        const next = { ...a }
        delete next[roomId]
        return next
      })
    )
  }

  function autoFill() {
    const current = assignment
    const used = new Set(Object.values(current))
    const openRooms = property.rooms.filter((r) => !current[r.id])
    const pairs = []
    openRooms.forEach((r) => {
      property.candidates.forEach((c) => {
        if (!used.has(c.id)) pairs.push({ roomId: r.id, candidateId: c.id, score: c.scores[r.id] })
      })
    })
    pairs.sort((a, b) => b.score - a.score)
    const next = { ...current }
    const takenRooms = new Set()
    const takenCandidates = new Set(used)
    pairs.forEach((pair) => {
      if (!takenRooms.has(pair.roomId) && !takenCandidates.has(pair.candidateId) && pair.score >= 70) {
        next[pair.roomId] = pair.candidateId
        takenRooms.add(pair.roomId)
        takenCandidates.add(pair.candidateId)
      }
    })
    setAssignments((all) => all.map((a, i) => (i === propertyIndex ? next : a)))
    setSelectedCandidateId(null)
  }

  const selectedCandidate = selectedCandidateId ? candidateById.get(selectedCandidateId) : null

  const openRoomIds = property.rooms.filter((r) => !assignment[r.id]).map((r) => r.id)
  let bestRoomId = null
  if (selectedCandidate && openRoomIds.length) {
    bestRoomId = openRoomIds.reduce((best, roomId) =>
      selectedCandidate.scores[roomId] > selectedCandidate.scores[best] ? roomId : best
    )
  }

  const rooms = property.rooms.map((room) => {
    const tenant = assignment[room.id] ? candidateById.get(assignment[room.id]) : null
    if (tenant) {
      return {
        status: ROOM_STATUS_TAKEN,
        room,
        tenant,
        score: tenant.scores[room.id],
      }
    }
    if (selectedCandidate) {
      return {
        status: ROOM_STATUS_OPEN_WITH_PICK,
        room,
        candidate: selectedCandidate,
        score: selectedCandidate.scores[room.id],
        reason: compatibilityReason(t, selectedCandidate.scores[room.id], selectedCandidate),
        isBest: bestRoomId === room.id,
      }
    }
    const placedIds = new Set(Object.values(assignment))
    const topCandidate = property.candidates
      .filter((c) => !placedIds.has(c.id))
      .reduce((best, c) => (c.scores[room.id] > (best ? best.scores[room.id] : 0) ? c : best), null)
    return { status: ROOM_STATUS_OPEN_NO_PICK, room, topCandidate }
  })

  const placedIds = new Set(Object.values(assignment))
  const roomNameById = new Map(property.rooms.map((r) => [r.id, r.name]))
  const sortComparators = {
    [SORT_COMPATIBILITY]: (a, b) => b.avg - a.avg,
    [SORT_PROXIMITY]: (a, b) => a.km - b.km,
    [SORT_NAME]: (a, b) => a.name.localeCompare(b.name),
  }
  const candidates = property.candidates
    .map((c) => {
      const placedRoomId = Object.keys(assignment).find((roomId) => assignment[roomId] === c.id)
      return {
        candidate: c,
        avg: averageScore(c, property.rooms),
        km: parseKm(c.distance),
        placed: !!placedRoomId,
        placedInRoomName: placedRoomId ? roomNameById.get(placedRoomId) : '',
        selected: selectedCandidateId === c.id,
      }
    })
    .sort(sortComparators[sort])
    .sort((a, b) => (a.placed ? 1 : 0) - (b.placed ? 1 : 0))

  const filled = placedIds.size
  const scores = Object.keys(assignment).map((roomId) => candidateById.get(assignment[roomId]).scores[roomId])
  const meanCompatibility = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0

  const kpis = [
    {
      label: t('backoffice:roomAssignment.kpis.occupation'),
      value: `${filled}/${property.rooms.length}`,
      note: t('backoffice:roomAssignment.kpis.occupationNote', { count: property.rooms.length - filled }),
    },
    {
      label: t('backoffice:roomAssignment.kpis.avgCompatibility'),
      value: meanCompatibility ? `${meanCompatibility}%` : '—',
      note: t('backoffice:roomAssignment.kpis.avgCompatibilityNote'),
    },
    {
      label: t('backoffice:roomAssignment.kpis.avgCommute'),
      value: t('backoffice:roomAssignment.kpis.avgCommuteValue'),
      note: t('backoffice:roomAssignment.kpis.avgCommuteNote'),
    },
    {
      label: t('backoffice:roomAssignment.kpis.waitingCandidates'),
      value: String(property.candidates.length - filled),
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
            <Button variant="secondary" size="md" iconLeft="download">{t('backoffice:roomAssignment.export')}</Button>
            <Button variant="primary" size="md" iconLeft="wand-2" onClick={autoFill}>{t('backoffice:roomAssignment.autoFill')}</Button>
          </div>
        </header>

        <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 2 }}>
            {PROPERTIES.map((p, i) => {
              const on = i === propertyIndex
              const occupied = Object.keys(assignments[i]).length
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
                    <span style={{ font: 'var(--fw-regular) 12px var(--font-body)', color: 'var(--text-muted)' }}>{p.anchorLabel}</span>
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
                  gridTemplateColumns: 'repeat(4,minmax(0,1fr))',
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
                  {t('backoffice:roomAssignment.candidatesHint', { anchor: property.anchorWord })}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {sorts.map((s) => (
                  <Chip key={s.value} selected={sort === s.value} onClick={() => setSort(s.value)}>
                    {s.label}
                  </Chip>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 640, overflowY: 'auto', margin: '0 -4px', padding: '2px 4px' }}>
                {candidates.map((entry) => (
                  <CandidateCard key={entry.candidate.id} entry={entry} onSelect={selectCandidate} />
                ))}
              </div>
            </aside>
          </div>
        </div>
      </main>
    </div>
  )
}

function RoomTile({ entry, onPlace, onClear }) {
  const { t } = useTranslation(['backoffice'])
  const { status, room } = entry
  return (
    <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 14, overflow: 'hidden', background: 'var(--white)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '11px 14px', background: 'var(--gray-100)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ font: 'var(--fw-extrabold) 14px var(--font-display)', color: 'var(--text-heading)', flex: 1 }}>{room.name}</div>
        <div style={{ font: 'var(--fw-bold) 12px var(--font-body)', color: 'var(--text-muted)' }}>{room.price} {t('backoffice:roomAssignment.room.perMonth')}</div>
      </div>
      <div style={{ padding: '8px 14px 0', font: 'var(--fw-regular) 12px var(--font-body)', color: 'var(--text-muted)' }}>{room.meta}</div>

      {status === ROOM_STATUS_TAKEN && (
        <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Avatar name={entry.tenant.name} size={38} />
            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ font: 'var(--fw-extrabold) 13.5px var(--font-display)', color: 'var(--text-heading)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {entry.tenant.name}
              </div>
              <div style={{ font: 'var(--fw-regular) 12px var(--font-body)', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {entry.tenant.profile}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '9px 11px', borderRadius: 10, background: 'var(--green-50)' }}>
            <Badge tone="verified" size="sm">{t('backoffice:roomAssignment.room.compatibilityBadge', { score: entry.score })}</Badge>
            <div style={{ font: 'var(--fw-regular) 12px var(--font-body)', color: 'var(--text-body)', lineHeight: 1.45 }}>
              {entry.tenant.anchor} — {entry.tenant.distance} · {entry.tenant.commute}
            </div>
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
                {t('backoffice:roomAssignment.room.withCandidate', { name: entry.candidate.name.split(' ')[0] })}
              </span>
            </div>
            <div style={{ font: 'var(--fw-regular) 12px var(--font-body)', color: 'var(--text-body)', lineHeight: 1.45 }}>
              {entry.candidate.anchor} — {entry.candidate.distance} · {entry.candidate.commute}
            </div>
            <div style={{ font: 'var(--fw-regular) 12px var(--font-body)', color: 'var(--text-muted)', lineHeight: 1.45 }}>{entry.reason}</div>
          </div>
          {entry.isBest && <Badge tone="gold" size="sm" style={{ alignSelf: 'flex-start' }}>{t('backoffice:roomAssignment.room.bestSuggestion')}</Badge>}
          <Button variant="primary" size="sm" iconLeft="user-plus" onClick={() => onPlace(room.id)}>{t('backoffice:roomAssignment.room.placeHere')}</Button>
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
              ? t('backoffice:roomAssignment.room.bestCandidate', { name: entry.topCandidate.name, score: entry.topCandidate.scores[room.id] })
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
          <div style={{ font: 'var(--fw-regular) 12px var(--font-body)', color: 'var(--text-muted)' }}>{candidate.profile}</div>
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
      <span style={{ display: 'flex', gap: 11, alignItems: 'flex-start', width: '100%' }}>
        <Avatar name={candidate.name} size={38} />
        <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
          <span style={{ font: 'var(--fw-extrabold) 13.5px var(--font-display)', color: 'var(--text-heading)' }}>{candidate.name}</span>
          <span style={{ font: 'var(--fw-regular) 12px var(--font-body)', color: 'var(--text-muted)' }}>{candidate.profile}</span>
        </span>
        <MatchScore value={avg} size="sm" />
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
        <span style={{ font: 'var(--fw-regular) 12px var(--font-body)', color: 'var(--text-body)', lineHeight: 1.45, display: 'flex', alignItems: 'center', gap: 5 }}>
          <Icon name="map-pin" size={13} color="var(--text-muted)" />
          {candidate.anchor} — {candidate.distance}
        </span>
        <span style={{ font: 'var(--fw-regular) 12px var(--font-body)', color: 'var(--text-muted)', lineHeight: 1.45, display: 'flex', alignItems: 'center', gap: 5 }}>
          <Icon name="move-right" size={13} color="var(--text-muted)" />
          {t('backoffice:roomAssignment.candidateCard.commuteBudget', { commute: candidate.commute, budget: candidate.budget })}
        </span>
      </span>
      {selected && (
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {candidate.tags.map((tag) => (
            <span
              key={tag}
              style={{ padding: '3px 8px', borderRadius: 999, background: 'var(--white)', border: '1px solid var(--border-subtle)', font: 'var(--fw-medium) 11.5px var(--font-body)', color: 'var(--text-body)' }}
            >
              {tag}
            </span>
          ))}
        </span>
      )}
      {selected && (
        <span style={{ font: 'var(--fw-extrabold) 12px var(--font-display)', color: 'var(--navy-700)' }}>
          {t('backoffice:roomAssignment.candidateCard.chooseRoom')}
        </span>
      )}
    </button>
  )
}
