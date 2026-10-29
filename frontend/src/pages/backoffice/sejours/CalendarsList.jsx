import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiLink, FiPlus, FiRefreshCw, FiTrash2 } from 'react-icons/fi'
import api from '../../../services/api'
import { stayService, SOURCE_STATUS_TONE, STAY_PLATFORMS } from '../../../services/stayService'
import { useFormat } from '../../../utils/format'
import { EmptyState, Field, Modal, PRIMARY_BTN, SECONDARY_BTN, Select } from '../../../components/backoffice/ui'
import { Chip, IconAction, TD, TH } from '../components/kit'

const EMPTY = { property_id: '', platform: 'airbnb', ical_url: '' }

function CalendarsList() {
  const { t } = useTranslation(['backoffice', 'common'])
  const { fmtDate } = useFormat()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const { data, isLoading, error } = useQuery('stays-sources', () => stayService.listSources())
  const { data: props } = useQuery('bo-properties-min',
    async () => (await api.get('/backoffice/properties?per_page=200')).data, { enabled: open })

  const refresh = () => ['stays-sources', 'stays-overview', 'stays-list'].forEach((k) => qc.invalidateQueries(k))
  const fail = (e) => toast.error(e.response?.data?.error || t('common:errors.short'))

  const add = useMutation(() => stayService.addSource({
    property_id: Number(form.property_id), platform: form.platform, ical_url: form.ical_url.trim(),
  }), {
    onSuccess: (r) => {
      toast.success(t('backoffice:stays.calendars.toasts.added', { count: r.sync?.created || 0 }))
      setOpen(false)
      setForm(EMPTY)
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
          <button disabled={!form.property_id || !form.ical_url || add.isLoading} onClick={() => add.mutate()} className={PRIMARY_BTN}>
            {t('backoffice:stays.calendars.modal.submit')}
          </button>
        </>}>
        <p className="mb-3 text-[13px] text-gray-500">{t('backoffice:stays.calendars.modal.help')}</p>
        <div className="mb-3">
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="ical-property">
            {t('backoffice:stays.calendars.modal.propertyLabel')}
          </label>
          <Select id="ical-property" value={form.property_id} onChange={set('property_id')}>
            <option value="">{t('backoffice:stays.calendars.modal.propertyPlaceholder')}</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </Select>
        </div>
        <div className="mb-3">
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="ical-platform">
            {t('backoffice:stays.calendars.modal.platformLabel')}
          </label>
          <Select id="ical-platform" value={form.platform} onChange={set('platform')}>
            {STAY_PLATFORMS.map((p) => <option key={p} value={p}>{t(`backoffice:stays.platform.${p}`)}</option>)}
          </Select>
        </div>
        <Field label={t('backoffice:stays.calendars.modal.urlLabel')} type="url" value={form.ical_url}
          onChange={set('ical_url')} placeholder="https://www.airbnb.com/calendar/ical/..." />
      </Modal>
    </div>
  )
}
export default CalendarsList
