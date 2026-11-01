import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from 'react-query'
import { useTranslation } from 'react-i18next'
import { FiCalendar, FiChevronLeft, FiChevronRight } from 'react-icons/fi'
import { stayService } from '../../../services/stayService'
import { useFormat } from '../../../utils/format'
import { EmptyState } from '../../../components/backoffice/ui'
import { IconAction } from '../components/kit'

const MONTH = /^\d{4}-\d{2}$/

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

function shift(month, delta) {
  const [y, m] = month.split('-').map(Number)
  return monthKey(new Date(y, m - 1 + delta, 1))
}

/** Position et largeur d'un séjour dans la grille du mois, en colonnes de jours. */
function span(stay, month, days) {
  const [y, m] = month.split('-').map(Number)
  const first = Date.UTC(y, m - 1, 1)
  const toDay = (iso) => Math.floor((Date.parse(String(iso).slice(0, 10)) - first) / 86400000)
  // Un séjour qui déborde du mois est coupé au bord : la barre doit commencer à la grille.
  const start = Math.max(0, toDay(stay.check_in))
  const end = Math.min(days, Math.max(toDay(stay.check_out), start + 1))
  return { start, length: Math.max(1, end - start) }
}

function StayCalendar() {
  const { t } = useTranslation(['backoffice', 'common'])
  const { fmtDate } = useFormat()
  const [month, setMonth] = useState(() => monthKey(new Date()))
  const { data, isLoading, error } = useQuery(['stays-calendar', month],
    () => stayService.calendar({ mois: month }), { keepPreviousData: true })

  if (error) return <p className="px-2.5 py-6 text-sm text-gray-500">{t('backoffice:stays.shared.loadError')}</p>

  const days = data?.days || 30
  const rows = data?.properties || []
  const label = MONTH.test(month) ? fmtDate(`${month}-01`, { month: 'long', year: 'numeric' }) : month
  const today = new Date()
  const todayCol = monthKey(today) === month ? today.getDate() : null

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <IconAction icon={FiChevronLeft} label={t('backoffice:stays.calendar.previous')}
          onClick={() => setMonth((m) => shift(m, -1))} />
        <h3 className="font-display text-[15px] font-bold capitalize">{label}</h3>
        <IconAction icon={FiChevronRight} label={t('backoffice:stays.calendar.next')} tipAlign="end"
          onClick={() => setMonth((m) => shift(m, 1))} />
      </div>

      {isLoading && !data ? <div className="h-32 animate-pulse rounded-lg bg-gray-50 motion-reduce:animate-none" aria-busy="true" />
        : !rows.length ? (
          <EmptyState icon={FiCalendar} title={t('backoffice:stays.calendar.empty.title')}
            description={t('backoffice:stays.calendar.empty.description')} />
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="grid items-center gap-y-1.5"
                style={{ gridTemplateColumns: `180px repeat(${days}, minmax(18px, 1fr))` }}>
                <span />
                {Array.from({ length: days }, (_, i) => (
                  <span key={i} className={`text-center text-[10.5px] tabular-nums ${
                    todayCol === i + 1 ? 'font-bold text-primary-700' : 'text-gray-500'}`}>
                    {i + 1}
                  </span>
                ))}

                {rows.map((row) => (
                  <div key={row.property_id} className="contents">
                    <span className="truncate pe-2 text-[12.5px] font-semibold text-gray-800">
                      {row.property_title || t('backoffice:stays.planning.unknownProperty')}
                    </span>
                    <div className="relative h-7" style={{ gridColumn: `2 / span ${days}` }}>
                      <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${days}, 1fr)` }}>
                        {Array.from({ length: days }, (_, i) => (
                          <span key={i} className="border-e border-gray-100 last:border-e-0" />
                        ))}
                      </div>
                      {row.stays.map((s) => {
                        const { start, length } = span(s, month, days)
                        return (
                          <Link key={s.id} to={`/backoffice/sejours/${s.id}`}
                            title={`${s.guest_name || t('backoffice:stays.planning.noGuestName')} · ${t('backoffice:stays.calendar.nights', { count: s.nights })}`}
                            className={`absolute inset-y-1 flex items-center truncate rounded-md px-1.5 text-[11px] font-medium text-white ${
                              s.has_conflict ? 'bg-red-600' : s.status === 'blocked' ? 'bg-gray-500' : 'bg-primary-600'}`}
                            style={{ insetInlineStart: `${(start / days) * 100}%`, width: `${(length / days) * 100}%` }}>
                            <span className="truncate">
                              {s.guest_name || t(`backoffice:stays.platform.${s.platform}`, { defaultValue: s.platform })}
                            </span>
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
    </div>
  )
}
export default StayCalendar
