import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiLink, FiPlus, FiRefreshCw, FiTrash2 } from 'react-icons/fi'
import { SiAirbnb } from 'react-icons/si'
import api from '../../../services/api'
import { stayService, SOURCE_STATUS_TONE, STAY_PLATFORMS } from '../../../services/stayService'
import { useFormat } from '../../../utils/format'
import { EmptyState, Modal, PRIMARY_BTN, SECONDARY_BTN, Select } from '../../../components/backoffice/ui'
import { Chip, IconAction, TD, TH } from '../components/kit'

/**
 * Un bien est presque toujours publié sur plusieurs plateformes : l'écran les présente
 * toutes ensemble, un champ par plateforme, et n'envoie que celles qu'on a remplies.
 * Le service reste unitaire (un calendrier par couple bien/plateforme), la boucle est ici.
 */
const EMPTY = { property_id: '', urls: Object.fromEntries(STAY_PLATFORMS.map((p) => [p, ''])) }

const MARK = 'grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[12.5px] font-bold'
// Booking.com et VRBO n'ont pas de glyphe dans react-icons : un monogramme à leur couleur
// se reconnaît mieux qu'une icône générique répétée quatre fois.
const PLATFORM_MARK = {
  airbnb: <span className={`${MARK} bg-[#FF5A5F]/10 text-[#D93B40]`}><SiAirbnb className="h-[18px] w-[18px]" /></span>,
  booking: <span className={`${MARK} bg-[#003580] text-white`}>B.</span>,
  vrbo: <span className={`${MARK} bg-[#1668E3] text-white`}>V</span>,
  autre: <span className={`${MARK} bg-gray-100 text-gray-500`}><FiLink className="h-[18px] w-[18px]" /></span>,
}

function CalendarsList() {
  const { t } = useTranslation(['backoffice', 'common'])
  const { fmtDate } = useFormat()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const setProperty = (e) => { setForm((f) => ({ ...f, property_id: e.target.value })); setErrors({}) }
  const setUrl = (p) => (e) => setForm((f) => ({ ...f, urls: { ...f.urls, [p]: e.target.value } }))

  const { data, isLoading, error } = useQuery('stays-sources', () => stayService.listSources())
  const { data: props } = useQuery('bo-properties-min',
    async () => (await api.get('/backoffice/properties?per_page=200')).data, { enabled: open })

  const refresh = () => ['stays-sources', 'stays-overview', 'stays-list'].forEach((k) => qc.invalidateQueries(k))
  const fail = (e) => toast.error(e.response?.data?.error || t('common:errors.short'))

  // Un échec de plateforme ne doit pas emporter les autres : on retient les URL fautives
  // avec leur raison et on efface celles qui sont passées, pour ne pas les renvoyer deux fois.
  const add = useMutation(async () => {
    const pending = STAY_PLATFORMS.filter((p) => !connected.has(p) && form.urls[p].trim())
    const failed = {}
    let added = 0
    let imported = 0
    for (const platform of pending) {
      try {
        const r = await stayService.addSource({
          property_id: Number(form.property_id), platform, ical_url: form.urls[platform].trim(),
        })
        added += 1
        imported += r.sync?.created || 0
      } catch (e) {
        failed[platform] = e.response?.data?.error || t('common:errors.short')
      }
    }
    return { added, imported, failed }
  }, {
    onSuccess: ({ added, imported, failed }) => {
      if (added) toast.success(t('backoffice:stays.calendars.toasts.connected', { count: added, stays: imported }))
      setErrors(failed)
      if (Object.keys(failed).length) {
        setForm((f) => ({
          ...f,
          urls: Object.fromEntries(STAY_PLATFORMS.map((p) => [p, failed[p] ? f.urls[p] : ''])),
        }))
      } else {
        setOpen(false)
        setForm(EMPTY)
      }
      refresh()
    },
    onError: fail,
  })
  const sync = useMutation((id) => stayService.syncSource(id), {
    onSuccess: (r) => {
      toast.success(t('backoffice:stays.calendars.toasts.synced', {
        created: r.sync?.created || 0, cancelled: r.sync?.cancelled || 0,
      }))
      refresh()
    },
    onError: fail,
  })
  const remove = useMutation((id) => stayService.deleteSource(id), {
    onSuccess: () => { toast.success(t('backoffice:stays.calendars.toasts.removed')); refresh() },
    onError: fail,
  })

  if (error) return <p className="px-2.5 py-6 text-sm text-gray-500">{t('backoffice:stays.shared.loadError')}</p>

  const sources = data?.sources || []
  const properties = props?.properties || []
  // Le service refuse deux calendriers pour un même couple bien/plateforme : autant le dire
  // dans le champ plutôt que de laisser l'agence buter sur un 400.
  const connected = new Set(sources.filter((s) => String(s.property_id) === form.property_id).map((s) => s.platform))
  const filled = STAY_PLATFORMS.some((p) => !connected.has(p) && form.urls[p].trim())

  return (
    <div className="grid gap-3">
      {/* Les calendriers ne figurent plus dans la colonne des rubriques : on arrive ici par
          l'icône de l'en-tête, l'écran doit donc se nommer et savoir d'où l'on vient. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-display text-[15px] font-bold">{t('backoffice:stays.overview.tabs.calendars')}</h2>
          <Link to="/backoffice/sejours" className="text-[12.5px] font-medium text-gray-500 hover:text-gray-900">
            {t('backoffice:stays.calendars.backToPlanning')}
          </Link>
        </div>
        <IconAction icon={FiPlus} label={t('backoffice:stays.calendars.add')} onClick={() => setOpen(true)} tone="primary" tipAlign="end" />
      </div>

      {isLoading ? <div className="h-24 animate-pulse rounded-lg bg-gray-50 motion-reduce:animate-none" aria-busy="true" />
        : !sources.length ? (
          <EmptyState icon={FiLink} title={t('backoffice:stays.calendars.empty.title')}
            description={t('backoffice:stays.calendars.empty.description')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13.5px]">
              <thead>
                <tr>
                  <th className={TH}>{t('backoffice:stays.calendars.columns.property')}</th>
                  <th className={TH}>{t('backoffice:stays.calendars.columns.channel')}</th>
                  <th className={TH}>{t('backoffice:stays.calendars.columns.state')}</th>
                  <th className={TH}>{t('backoffice:stays.calendars.columns.lastSync')}</th>
                  <th className={TH}>{t('backoffice:stays.calendars.columns.stays')}</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.id}>
                    <td className={TD}>
                      <b className="block truncate font-semibold">{s.property_title || `#${s.property_id}`}</b>
                    </td>
                    <td className={TD}>{t(`backoffice:stays.platform.${s.platform}`, { defaultValue: s.platform })}</td>
                    <td className={TD}>
                      <Chip tone={SOURCE_STATUS_TONE[s.status] || 'neutral'}>
                        {t(`backoffice:stays.calendars.state.${s.status}`, { defaultValue: s.status })}
                      </Chip>
                      {s.last_error && <span className="mt-0.5 block text-xs text-red-700">{s.last_error}</span>}
                    </td>
                    <td className={`${TD} whitespace-nowrap`}>
                      {s.last_synced_at ? fmtDate(s.last_synced_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className={`${TD} tabular-nums`}>{s.reservations_count}</td>
                    <td className={`${TD} text-end`}>
                      <div className="flex justify-end gap-1">
                        <IconAction icon={FiRefreshCw} label={t('backoffice:stays.calendars.sync')}
                          onClick={() => sync.mutate(s.id)} disabled={sync.isLoading} />
                        <IconAction icon={FiTrash2} label={t('backoffice:stays.calendars.remove')} tone="danger" tipAlign="end"
                          onClick={() => remove.mutate(s.id)} disabled={remove.isLoading} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      <Modal open={open} onClose={() => setOpen(false)} title={t('backoffice:stays.calendars.modal.title')}
        footer={<>
          <button onClick={() => setOpen(false)} className={SECONDARY_BTN}>{t('backoffice:stays.calendars.modal.cancel')}</button>
          <button disabled={!form.property_id || !filled || add.isLoading} onClick={() => add.mutate()} className={PRIMARY_BTN}>
            {t('backoffice:stays.calendars.modal.submit')}
          </button>
        </>}>
        <p className="mb-3 text-[13px] text-gray-500">{t('backoffice:stays.calendars.modal.help')}</p>
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="ical-property">
            {t('backoffice:stays.calendars.modal.propertyLabel')}
          </label>
          <Select id="ical-property" value={form.property_id} onChange={setProperty}>
            <option value="">{t('backoffice:stays.calendars.modal.propertyPlaceholder')}</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </Select>
        </div>
        <div className="grid gap-2.5">
          {STAY_PLATFORMS.map((p) => {
            const name = t(`backoffice:stays.platform.${p}`)
            const done = connected.has(p)
            return (
              <div key={p}>
                <div className="flex items-center gap-2.5">
                  {/* Le monogramme porte du texte : il reste hors du nom accessible du champ,
                      que l'étiquette ne doit pas mélanger avec la lettre de la marque. */}
                  <span aria-hidden="true">{PLATFORM_MARK[p]}</span>
                  <input type="url" value={done ? '' : form.urls[p]} onChange={setUrl(p)} disabled={done}
                    aria-label={t('backoffice:stays.calendars.modal.urlFor', { platform: name })}
                    placeholder={done ? t('backoffice:stays.calendars.modal.alreadyConnected')
                      : t('backoffice:stays.calendars.modal.urlPlaceholder', { platform: name })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-50 disabled:text-gray-400" />
                </div>
                {errors[p] && <p className="mt-1 ps-[46px] text-xs text-red-700">{errors[p]}</p>}
              </div>
            )
          })}
        </div>
      </Modal>
    </div>
  )
}
export default CalendarsList
