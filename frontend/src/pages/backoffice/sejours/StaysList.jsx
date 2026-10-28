import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiAlertTriangle, FiCalendar, FiUser, FiUserCheck } from 'react-icons/fi'
import { stayService, STAY_STATUS_TONE } from '../../../services/stayService'
import { useFormat } from '../../../utils/format'
import { EmptyState, Field, Modal, PRIMARY_BTN, SECONDARY_BTN, Select } from '../../../components/backoffice/ui'
import { Chip, IconAction, TD, TH } from '../components/kit'
import CheckinModal from './CheckinModal'

const STATUSES = ['confirmed', 'blocked', 'cancelled']

function StaysList() {
  const { t } = useTranslation(['backoffice', 'common'])
  const { fmtDate } = useFormat()
  const qc = useQueryClient()
  const [status, setStatus] = useState('confirmed')
  // La plateforme ne publie pas l'email du voyageur : l'agence le complète ici, sinon la
  // messagerie de séjour n'a personne à qui écrire.
  const [contact, setContact] = useState(null)
  const [checkinStayId, setCheckinStayId] = useState(null)
  const saveContact = useMutation(() => stayService.updateContact(contact.id, {
    guest_name: contact.guest_name || '', guest_email: contact.guest_email || '',
    guest_phone: contact.guest_phone || '',
  }), {
    onSuccess: () => {
      toast.success(t('backoffice:stays.planning.contact.saved'))
      setContact(null)
      qc.invalidateQueries('stays-list')
      qc.invalidateQueries('stays-messages')
    },
    onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short')),
  })
  const { data, isLoading, error } = useQuery(['stays-list', status],
    () => stayService.listStays(status ? { status } : {}))

  if (error) return <p className="px-2.5 py-6 text-sm text-gray-500">{t('backoffice:stays.shared.loadError')}</p>

  const stays = data?.stays || []
  const date = (iso) => (iso ? fmtDate(iso, { day: 'numeric', month: 'short', year: 'numeric' }) : '—')

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[12.5px] font-medium text-gray-600" htmlFor="stays-status">
          {t('backoffice:stays.planning.statusLabel')}
        </label>
        <Select id="stays-status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto">
          <option value="">{t('backoffice:stays.planning.allStatuses')}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{t(`backoffice:stays.status.${s}`)}</option>)}
        </Select>
      </div>

      {isLoading ? <div className="h-24 animate-pulse rounded-lg bg-gray-50 motion-reduce:animate-none" aria-busy="true" />
        : !stays.length ? (
          <EmptyState icon={FiCalendar} title={t('backoffice:stays.planning.empty.title')}
            description={t('backoffice:stays.planning.empty.description')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13.5px]">
              <thead>
                <tr>
                  <th className={TH}>{t('backoffice:stays.planning.columns.property')}</th>
                  <th className={TH}>{t('backoffice:stays.planning.columns.guest')}</th>
                  <th className={TH}>{t('backoffice:stays.planning.columns.dates')}</th>
                  <th className={TH}>{t('backoffice:stays.planning.columns.nights')}</th>
                  <th className={TH}>{t('backoffice:stays.planning.columns.channel')}</th>
                  <th className={TH}>{t('backoffice:stays.planning.columns.status')}</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody>
                {stays.map((s) => (
                  <tr key={s.id} className={s.has_conflict ? 'bg-red-50' : undefined}>
                    <td className={TD}>
                      <b className="block truncate font-semibold">{s.property_title || t('backoffice:stays.planning.unknownProperty')}</b>
                      {s.external_id && <span className="block truncate text-xs text-gray-500">{s.external_id}</span>}
                    </td>
                    <td className={TD}>
                      {s.guest_name || <span className="text-gray-500">{t('backoffice:stays.planning.noGuestName')}</span>}
                      {s.guest_phone && <span className="block text-xs text-gray-500">{s.guest_phone}</span>}
                    </td>
                    <td className={`${TD} whitespace-nowrap`}>{date(s.check_in)} → {date(s.check_out)}</td>
                    <td className={`${TD} tabular-nums`}>{s.nights}</td>
                    <td className={TD}>{t(`backoffice:stays.platform.${s.platform}`, { defaultValue: s.platform })}</td>
                    <td className={TD}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Chip tone={STAY_STATUS_TONE[s.status] || 'neutral'}>
                          {t(`backoffice:stays.status.${s.status}`, { defaultValue: s.status })}
                        </Chip>
                        {s.has_conflict && (
                          <Chip tone="crit">
                            <FiAlertTriangle className="h-3 w-3" aria-hidden="true" />
                            {t('backoffice:stays.planning.conflict')}
                          </Chip>
                        )}
                      </div>
                    </td>
                    <td className={`${TD} text-end`}>
                      <div className="flex justify-end gap-1">
                        <IconAction icon={FiUser} label={t('backoffice:stays.planning.contact.edit')}
                          onClick={() => setContact({ ...s })} />
                        <IconAction icon={FiUserCheck} label={t('backoffice:stays.checkin.open')} tone="gold" tipAlign="end"
                          onClick={() => setCheckinStayId(s.id)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      <Modal open={contact !== null} onClose={() => setContact(null)} title={t('backoffice:stays.planning.contact.title')}
        footer={<>
          <button onClick={() => setContact(null)} className={SECONDARY_BTN}>{t('backoffice:stays.planning.contact.cancel')}</button>
          <button disabled={saveContact.isLoading} onClick={() => saveContact.mutate()} className={PRIMARY_BTN}>
            {t('backoffice:stays.planning.contact.submit')}
          </button>
        </>}>
        <p className="mb-3 text-[13px] text-gray-500">{t('backoffice:stays.planning.contact.help')}</p>
        <Field label={t('backoffice:stays.planning.contact.nameLabel')} value={contact?.guest_name || ''}
          onChange={(e) => setContact((c) => ({ ...c, guest_name: e.target.value }))} />
        <Field label={t('backoffice:stays.planning.contact.emailLabel')} type="email" value={contact?.guest_email || ''}
          onChange={(e) => setContact((c) => ({ ...c, guest_email: e.target.value }))} />
        <Field label={t('backoffice:stays.planning.contact.phoneLabel')} value={contact?.guest_phone || ''}
          onChange={(e) => setContact((c) => ({ ...c, guest_phone: e.target.value }))} />
      </Modal>

      {checkinStayId && <CheckinModal stayId={checkinStayId} onClose={() => setCheckinStayId(null)} />}
    </div>
  )
}
export default StaysList
