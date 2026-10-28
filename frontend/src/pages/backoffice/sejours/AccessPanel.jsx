import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiEdit2, FiKey, FiPlus } from 'react-icons/fi'
import api from '../../../services/api'
import { stayService, ACCESS_MODES, TTLOCK_FIELDS } from '../../../services/stayService'
import { EmptyState, Field, Modal, PRIMARY_BTN, SECONDARY_BTN, Select } from '../../../components/backoffice/ui'
import { Alert, Chip, IconAction, TD, TH } from '../components/kit'

const EMPTY = { property_id: '', mode: 'manual', instructions: '', credentials: {} }

function AccessPanel() {
  const { t } = useTranslation(['backoffice', 'common'])
  const qc = useQueryClient()
  const [form, setForm] = useState(null)   // null = formulaire fermé
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const setCred = (k) => (e) => setForm((f) => ({ ...f, credentials: { ...f.credentials, [k]: e.target.value } }))

  const { data, isLoading, error } = useQuery('stays-access', () => stayService.listAccess())
  const { data: props } = useQuery('bo-properties-min',
    async () => (await api.get('/backoffice/properties?per_page=200')).data, { enabled: form !== null })

  const save = useMutation(() => stayService.setAccess(Number(form.property_id), {
    mode: form.mode, instructions: form.instructions,
    credentials: form.mode === 'ttlock' ? form.credentials : undefined,
  }), {
    onSuccess: () => {
      toast.success(t('backoffice:stays.access.toasts.saved'))
      setForm(null)
      qc.invalidateQueries('stays-access')
    },
    onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short')),
  })

  if (error) return <p className="px-2.5 py-6 text-sm text-gray-500">{t('backoffice:stays.shared.loadError')}</p>

  const rows = data?.access || []
  const properties = props?.properties || []
  const configured = new Set(rows.map((r) => r.property_id))

  return (
    <div className="grid gap-3">
      <div className="flex justify-end">
        <IconAction icon={FiPlus} label={t('backoffice:stays.access.add')} tone="primary" tipAlign="end"
          onClick={() => setForm(EMPTY)} />
      </div>

      <Alert tone="plain" icon={FiKey}>{t('backoffice:stays.access.help')}</Alert>

      {isLoading ? <div className="h-20 animate-pulse rounded-lg bg-gray-50 motion-reduce:animate-none" aria-busy="true" />
        : !rows.length ? (
          <EmptyState icon={FiKey} title={t('backoffice:stays.access.empty.title')}
            description={t('backoffice:stays.access.empty.description')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13.5px]">
              <thead>
                <tr>
                  <th className={TH}>{t('backoffice:stays.access.columns.property')}</th>
                  <th className={TH}>{t('backoffice:stays.access.columns.mode')}</th>
                  <th className={TH}>{t('backoffice:stays.access.columns.instructions')}</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.property_id}>
                    <td className={TD}>
                      <b className="block truncate font-semibold">{r.property_title || `#${r.property_id}`}</b>
                    </td>
                    <td className={TD}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Chip tone={r.mode === 'ttlock' ? 'gold' : 'neutral'}>
                          {t(`backoffice:stays.access.mode.${r.mode}`, { defaultValue: r.mode })}
                        </Chip>
                        {r.mode === 'ttlock' && r.configured && (
                          <Chip tone="good">{t('backoffice:stays.access.credentialsSet')}</Chip>
                        )}
                      </div>
                    </td>
                    <td className={TD}>
                      <span className="line-clamp-2">{r.instructions || '—'}</span>
                    </td>
                    <td className={`${TD} text-end`}>
                      <IconAction icon={FiEdit2} label={t('backoffice:stays.access.edit')} tipAlign="end"
                        onClick={() => setForm({
                          property_id: String(r.property_id), mode: r.mode,
                          instructions: r.instructions || '', credentials: {},
                        })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      <Modal open={form !== null} onClose={() => setForm(null)} title={t('backoffice:stays.access.modal.title')}
        footer={<>
          <button onClick={() => setForm(null)} className={SECONDARY_BTN}>{t('backoffice:stays.access.modal.cancel')}</button>
          <button disabled={!form?.property_id || save.isLoading} onClick={() => save.mutate()} className={PRIMARY_BTN}>
            {t('backoffice:stays.access.modal.submit')}
          </button>
        </>}>
        <div className="mb-3">
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="access-property">
            {t('backoffice:stays.access.modal.propertyLabel')}
          </label>
          <Select id="access-property" value={form?.property_id || ''} onChange={set('property_id')}>
            <option value="">{t('backoffice:stays.access.modal.propertyPlaceholder')}</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}{configured.has(p.id) ? ` · ${t('backoffice:stays.access.alreadySet')}` : ''}
              </option>
            ))}
          </Select>
        </div>
        <div className="mb-3">
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="access-mode">
            {t('backoffice:stays.access.modal.modeLabel')}
          </label>
          <Select id="access-mode" value={form?.mode || 'manual'} onChange={set('mode')}>
            {ACCESS_MODES.map((m) => <option key={m} value={m}>{t(`backoffice:stays.access.mode.${m}`)}</option>)}
          </Select>
          <p className="mt-1 text-[12.5px] text-gray-500">
            {t(`backoffice:stays.access.modeHelp.${form?.mode || 'manual'}`)}
          </p>
        </div>
        <Field label={t('backoffice:stays.access.modal.instructionsLabel')} value={form?.instructions || ''}
          onChange={set('instructions')} />
        {form?.mode === 'ttlock' && (
          <>
            <p className="mb-2 text-[12.5px] text-gray-500">{t('backoffice:stays.access.modal.credentialsHelp')}</p>
            {TTLOCK_FIELDS.map((f) => (
              <Field key={f} label={t(`backoffice:stays.access.credentials.${f}`)}
                type={f.includes('secret') || f.includes('token') ? 'password' : 'text'}
                value={form.credentials[f] || ''} onChange={setCred(f)} autoComplete="off" />
            ))}
          </>
        )}
      </Modal>
    </div>
  )
}
export default AccessPanel
