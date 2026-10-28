import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiCheck, FiCopy, FiLink, FiX } from 'react-icons/fi'
import { stayService, GUEST_STATUS_TONE } from '../../../services/stayService'
import { useFormat } from '../../../utils/format'
import { Modal, PRIMARY_BTN, SECONDARY_BTN } from '../../../components/backoffice/ui'
import { Alert, Chip, IconAction } from '../components/kit'

/** Dossier d'enregistrement d'un séjour : lien privé, occupants déclarés, verdict. */
function CheckinModal({ stayId, onClose }) {
  const { t } = useTranslation(['backoffice', 'common'])
  const { fmtDate } = useFormat()
  const qc = useQueryClient()
  const [token, setToken] = useState(null)   // rendu une seule fois par le service

  const { data } = useQuery(['stays-checkin', stayId], () => stayService.getCheckin(stayId),
    { enabled: Boolean(stayId) })
  const refresh = () => qc.invalidateQueries(['stays-checkin', stayId])
  const fail = (e) => toast.error(e.response?.data?.error || t('common:errors.short'))

  const createLink = useMutation(() => stayService.createCheckinLink(stayId), {
    onSuccess: (r) => { setToken(r.link.token); toast.success(t('backoffice:stays.checkin.toasts.created')); refresh() },
    onError: fail,
  })
  const review = useMutation(({ id, status }) => stayService.reviewGuest(id, { status }), {
    onSuccess: refresh, onError: fail,
  })

  const link = data?.link
  const guests = data?.guests || []
  const url = token ? `${window.location.origin}/sejour/enregistrement/${token}` : null
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t('backoffice:stays.checkin.toasts.copied'))
    } catch {
      toast.error(t('backoffice:stays.checkin.toasts.copyFailed'))
    }
  }

  return (
    <Modal open={Boolean(stayId)} onClose={onClose} maxWidth="lg" title={t('backoffice:stays.checkin.title')}
      footer={<button onClick={onClose} className={SECONDARY_BTN}>{t('backoffice:stays.checkin.close')}</button>}>
      <div className="grid gap-4">
        <div className="grid gap-2">
          {!link && <p className="text-sm text-gray-500">{t('backoffice:stays.checkin.noLink')}</p>}
          {link && (
            <p className="text-[13px] text-gray-500">
              {t(`backoffice:stays.checkin.linkStatus.${link.status}`, { defaultValue: link.status })}
              {' · '}
              {t('backoffice:stays.checkin.expires', {
                date: fmtDate(link.expires_at, { day: 'numeric', month: 'short', year: 'numeric' }),
              })}
            </p>
          )}
          <div>
            <button type="button" onClick={() => createLink.mutate()} disabled={createLink.isLoading} className={PRIMARY_BTN}>
              <FiLink className="h-4 w-4" aria-hidden="true" />
              {link ? t('backoffice:stays.checkin.renew') : t('backoffice:stays.checkin.create')}
            </button>
          </div>
          {url && (
            <Alert tone="info" icon={FiLink}>
              <span className="grid gap-1.5">
                <span>{t('backoffice:stays.checkin.shareOnce')}</span>
                <span className="flex flex-wrap items-center gap-2">
                  <code className="break-all rounded bg-white/70 px-1.5 py-0.5 text-[12px]">{url}</code>
                  <IconAction icon={FiCopy} label={t('backoffice:stays.checkin.copy')} onClick={copy} />
                </span>
              </span>
            </Alert>
          )}
        </div>

        <div className="grid gap-2">
          <h4 className="text-[12.5px] font-semibold uppercase tracking-wide text-gray-500">
            {t('backoffice:stays.checkin.guests', { declared: data?.declared || 0, expected: data?.expected || 0 })}
          </h4>
          {!guests.length && <p className="text-sm text-gray-500">{t('backoffice:stays.checkin.noGuest')}</p>}
          {guests.map((g) => (
            <div key={g.id} className="rounded-lg border border-gray-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <b className="font-semibold">{g.full_name}</b>
                  {g.is_lead && <span className="ms-2 text-xs text-primary-700">{t('backoffice:stays.checkin.lead')}</span>}
                  <span className="block text-[12.5px] text-gray-500">
                    {[g.document_type && t(`backoffice:stays.checkin.documentType.${g.document_type}`),
                      g.document_number, g.nationality].filter(Boolean).join(' · ') || '—'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip tone={GUEST_STATUS_TONE[g.status] || 'neutral'}>
                    {t(`backoffice:stays.checkin.guestStatus.${g.status}`, { defaultValue: g.status })}
                  </Chip>
                  <IconAction icon={FiCheck} label={t('backoffice:stays.checkin.validate')}
                    onClick={() => review.mutate({ id: g.id, status: 'validated' })} disabled={review.isLoading} />
                  <IconAction icon={FiX} label={t('backoffice:stays.checkin.reject')} tone="danger" tipAlign="end"
                    onClick={() => review.mutate({ id: g.id, status: 'rejected' })} disabled={review.isLoading} />
                </div>
              </div>
              {g.review_note && <p className="mt-1 text-xs text-red-700">{g.review_note}</p>}
              {g.documents?.length > 0 ? (
                <ul className="mt-1.5 flex flex-wrap gap-2 text-xs">
                  {g.documents.map((d) => (
                    <li key={d.id}>
                      <a href={stayService.guestDocUrl(d.id)} target="_blank" rel="noreferrer" className="text-primary-700 underline">
                        {d.filename}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1.5 text-xs text-amber-700">{t('backoffice:stays.checkin.noDocument')}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}
export default CheckinModal
