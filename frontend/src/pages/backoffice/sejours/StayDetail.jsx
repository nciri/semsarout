import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import {
  FiAlertTriangle, FiArrowLeft, FiArrowUpRight, FiEdit2, FiFileText, FiKey, FiMail,
  FiUserCheck, FiXCircle,
} from 'react-icons/fi'
import { stayService, CONTRACT_STATUS_TONE, STAY_STATUS_TONE } from '../../../services/stayService'
import { useFormat } from '../../../utils/format'
import { Alert, Chip, IconAction, Kv, TD, TH } from '../components/kit'
import { Modal, PRIMARY_BTN, SECONDARY_BTN } from '../../../components/backoffice/ui'
import CheckinModal from './CheckinModal'
import StayForm from './StayForm'
import { RichText } from '../../../components/common/RichTextarea'
import { richTextToPlain } from '../../../utils/richText'

const GUEST_TONE = { validated: 'good', rejected: 'crit', declared: 'neutral' }
const MESSAGE_TONE = { sent: 'good', failed: 'crit', pending: 'warn', no_recipient: 'warn' }

function Section({ title, action, children }) {
  return (
    <section className="grid gap-2.5 rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-[14.5px] font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Fiche d'un séjour : tout ce qui lui est accroché, et le lien vers l'écran qui le gère. */
function StayDetail() {
  const { t } = useTranslation(['backoffice', 'common'])
  const { fmtDate, fmtNumber } = useFormat()
  const { stayId } = useParams()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [checkinOpen, setCheckinOpen] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)

  const { data, isLoading, error } = useQuery(['stay-detail', stayId], () => stayService.getStay(stayId))
  const contract = useQuery(['stay-contract', stayId], () => stayService.getContract(stayId))
  const generate = useMutation(() => stayService.createContract(stayId), {
    onSuccess: () => {
      toast.success(t('backoffice:stays.contract.generated'))
      qc.invalidateQueries(['stay-contract', stayId])
      qc.invalidateQueries(['stay-detail', stayId])
    },
    onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short')),
  })
  const cancel = useMutation(() => stayService.cancelStay(stayId), {
    onSuccess: (r) => {
      toast.success(t('backoffice:stays.detail.cancelled'))
      ;(r.code_warnings || []).forEach((w) => toast.warn(w))
      setConfirmCancel(false)
      qc.invalidateQueries(['stay-detail', stayId])
      ;['stays-list', 'stays-overview', 'stays-calendar'].forEach((k) => qc.invalidateQueries(k))
    },
    onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short')),
  })

  if (error) return <p className="py-6 text-sm text-gray-500">{t('backoffice:stays.shared.loadError')}</p>
  if (isLoading || !data) return <div className="h-64 animate-pulse rounded-xl bg-gray-100 motion-reduce:animate-none" aria-busy="true" />

  const s = data.stay
  const date = (iso) => (iso ? fmtDate(iso, { day: 'numeric', month: 'long', year: 'numeric' }) : '—')
  const money = (v) => (v == null ? '—' : `${fmtNumber(v)} ${s.currency || t('backoffice:dashboard.units.dirham')}`)

  return (
    <div className="mx-auto grid w-full max-w-[1100px] gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <IconAction icon={FiArrowLeft} label={t('backoffice:stays.detail.back')} to="/backoffice/sejours" />
          <div>
            <h1 className="font-display text-[22px] font-extrabold leading-tight tracking-tight">
              {s.property_title || t('backoffice:stays.planning.unknownProperty')}
            </h1>
            <p className="mt-1 text-gray-500">
              {date(s.check_in)} → {date(s.check_out)} ·{' '}
              {t(`backoffice:stays.platform.${s.platform}`, { defaultValue: s.platform })}
              {s.external_id ? ` · ${s.external_id}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip tone={STAY_STATUS_TONE[s.status] || 'neutral'}>
            {t(`backoffice:stays.status.${s.status}`, { defaultValue: s.status })}
          </Chip>
          {s.editable && (
            <IconAction icon={FiEdit2} label={t('backoffice:stays.detail.edit')} onClick={() => setEditing(true)}
              className="border border-gray-200 bg-white" />
          )}
          <IconAction icon={FiUserCheck} label={t('backoffice:stays.checkin.open')} onClick={() => setCheckinOpen(true)}
            className="border border-gray-200 bg-white" />
          {s.status !== 'cancelled' && (
            <IconAction icon={FiXCircle} label={t('backoffice:stays.detail.cancel')} tone="danger"
              tipAlign="end" onClick={() => setConfirmCancel(true)} />
          )}
        </div>
      </div>

      {s.has_conflict && (
        <Alert tone="crit" icon={FiAlertTriangle}>
          {t('backoffice:stays.detail.conflictAlert', { count: data.conflicts.length })}
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-4 rounded-xl border border-gray-200 bg-white p-5 sm:grid-cols-3 xl:grid-cols-5">
        <Kv label={t('backoffice:stays.planning.columns.nights')} value={fmtNumber(s.nights || 0)} />
        <Kv label={t('backoffice:stays.detail.guests')} value={s.guest_count ?? '—'} />
        <Kv label={t('backoffice:stays.planning.columns.amount')} value={money(s.total_price)} />
        <Kv label={t('backoffice:stays.detail.cleaningFee')} value={money(s.cleaning_fee)} />
        <Kv label={t('backoffice:stays.detail.source')}
          value={t(`backoffice:stays.detail.sources.${s.source}`, { defaultValue: s.source })} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t('backoffice:stays.detail.contactTitle')}>
          <dl className="grid gap-1.5 text-[13.5px]">
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500">{t('backoffice:stays.planning.contact.nameLabel')}</dt>
              <dd className="font-medium">{s.guest_name || '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500">{t('backoffice:stays.planning.contact.emailLabel')}</dt>
              <dd className="font-medium">{s.guest_email || '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500">{t('backoffice:stays.planning.contact.phoneLabel')}</dt>
              <dd className="font-medium">{s.guest_phone || '—'}</dd>
            </div>
          </dl>
          <RichText html={s.guest_notes} className="mt-1 text-[13px] text-gray-600" />
          {s.special_requests && (
            <p className="text-[13px] text-gray-600">
              {/* 🔴 Rendu **en ligne**, derrière un libellé dans la même phrase : un
                  paragraphe HTML y insérerait une rupture au milieu. On y projette donc
                  le texte, dont les sauts de ligne sont rendus par `whitespace-pre-line`. */}
              <b className="font-semibold">{t('backoffice:stays.planning.form.requests')} : </b>
              <span className="whitespace-pre-line">{richTextToPlain(s.special_requests)}</span>
            </p>
          )}
        </Section>

        <Section title={t('backoffice:stays.detail.accessTitle')}
          action={<IconAction icon={FiKey} label={t('backoffice:stays.detail.openAccess')} tone="gold" tipAlign="end"
            to={`/backoffice/sejours/acces?bien=${s.property_id}`} />}>
          {data.access_code ? (
            <>
              <p className="font-display text-[22px] font-extrabold tabular-nums">{data.access_code.code}</p>
              <p className="text-[12.5px] text-gray-500">
                {t('backoffice:stays.detail.codeWindow', {
                  from: date(data.access_code.valid_from), to: date(data.access_code.valid_until),
                })}
              </p>
            </>
          ) : <p className="text-[13px] text-gray-500">{t('backoffice:stays.detail.noCode')}</p>}

          <h3 className="mt-2 font-display text-[13px] font-bold">{t('backoffice:stays.detail.cleaningTitle')}</h3>
          {data.cleaning ? (
            <Link to={`/backoffice/sejours/menage?tache=${data.cleaning.id}`}
              className="text-[13px] font-medium text-primary-700 hover:underline">
              {t(`backoffice:stays.cleaning.status.${data.cleaning.status}`, { defaultValue: data.cleaning.status })}
              {' · '}{date(data.cleaning.scheduled_date)}
            </Link>
          ) : <p className="text-[13px] text-gray-500">{t('backoffice:stays.detail.noCleaning')}</p>}
        </Section>
      </div>

      <Section title={t('backoffice:stays.detail.guestsTitle')}
        action={<IconAction icon={FiUserCheck} label={t('backoffice:stays.checkin.open')} tone="gold" tipAlign="end"
          onClick={() => setCheckinOpen(true)} />}>
        {!data.guests.length ? (
          <p className="text-[13px] text-gray-500">{t('backoffice:stays.detail.noGuests')}</p>
        ) : (
          <table className="w-full text-[13.5px]">
            <thead>
              <tr>
                <th className={TH}>{t('backoffice:stays.detail.guestName')}</th>
                <th className={TH}>{t('backoffice:stays.detail.guestDocument')}</th>
                <th className={TH}>{t('backoffice:stays.planning.columns.status')}</th>
              </tr>
            </thead>
            <tbody>
              {data.guests.map((g) => (
                <tr key={g.id}>
                  <td className={TD}>
                    {g.full_name}
                    {g.is_lead && <span className="ms-1.5 text-xs text-gray-500">{t('backoffice:stays.detail.lead')}</span>}
                  </td>
                  <td className={TD}>
                    {g.document_type
                      ? t(`backoffice:stays.checkin.documentType.${g.document_type}`, { defaultValue: g.document_type })
                      : '—'}
                  </td>
                  <td className={TD}>
                    <Chip tone={GUEST_TONE[g.status] || 'neutral'}>
                      {t(`backoffice:stays.checkin.guestStatus.${g.status}`, { defaultValue: g.status })}
                    </Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title={t('backoffice:stays.contract.title')}
        action={contract.data?.contract && (
          <IconAction icon={FiArrowUpRight} label={t('backoffice:stays.contract.open')} tone="gold"
            tipAlign="end" to={`/backoffice/contrats/${contract.data.contract.id}`} />
        )}>
        {contract.data?.contract ? (
          <div className="flex flex-wrap items-center gap-2 text-[13.5px]">
            <Chip tone={CONTRACT_STATUS_TONE[contract.data.contract.status] || 'neutral'}>
              {t(`backoffice:stays.contract.status.${contract.data.contract.status}`,
                { defaultValue: contract.data.contract.status })}
            </Chip>
            <span className="text-gray-500">
              {contract.data.contract.signed_at
                ? t('backoffice:stays.contract.signedOn', { date: date(contract.data.contract.signed_at) })
                : t('backoffice:stays.contract.awaitingGuest')}
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[13px] text-gray-500">{t('backoffice:stays.contract.none')}</p>
            {s.status !== 'cancelled' && (
              <button type="button" disabled={generate.isLoading} onClick={() => generate.mutate()}
                className={PRIMARY_BTN}>
                <FiFileText className="h-4 w-4" aria-hidden="true" />
                {t('backoffice:stays.contract.generate')}
              </button>
            )}
          </div>
        )}
      </Section>

      <Section title={t('backoffice:stays.detail.messagesTitle')}
        action={<IconAction icon={FiMail} label={t('backoffice:stays.detail.openMessages')} tone="gold" tipAlign="end"
          to={`/backoffice/sejours/messages?sejour=${s.id}`} />}>
        {!data.messages.length ? (
          <p className="text-[13px] text-gray-500">{t('backoffice:stays.detail.noMessages')}</p>
        ) : (
          <ul className="grid gap-1.5 text-[13.5px]">
            {data.messages.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="truncate">{m.subject}</span>
                <span className="flex items-center gap-2 text-gray-500">
                  {m.sent_at ? date(m.sent_at) : date(m.due_at)}
                  <Chip tone={MESSAGE_TONE[m.status] || 'neutral'}>
                    {t(`backoffice:stays.messages.status.${m.status}`, { defaultValue: m.status })}
                  </Chip>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {data.conflicts.length > 0 && (
        <Section title={t('backoffice:stays.detail.conflictsTitle')}>
          <ul className="grid gap-1.5 text-[13.5px]">
            {data.conflicts.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3">
                <span>
                  {t(`backoffice:stays.platform.${c.platform}`, { defaultValue: c.platform })} ·{' '}
                  {date(c.check_in)} → {date(c.check_out)}
                </span>
                <IconAction icon={FiArrowUpRight} label={t('backoffice:stays.planning.openStay')} tipAlign="end"
                  to={`/backoffice/sejours/${c.id}`} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Modal open={confirmCancel} onClose={() => setConfirmCancel(false)} title={t('backoffice:stays.detail.cancelTitle')}
        footer={<>
          <button onClick={() => setConfirmCancel(false)} className={SECONDARY_BTN}>{t('backoffice:stays.planning.form.cancel')}</button>
          <button disabled={cancel.isLoading} onClick={() => cancel.mutate()} className={PRIMARY_BTN}>
            {t('backoffice:stays.detail.cancelConfirm')}
          </button>
        </>}>
        <p className="text-[13.5px] text-gray-600">{t('backoffice:stays.detail.cancelHelp')}</p>
      </Modal>

      {editing && <StayForm stay={s} onClose={() => setEditing(false)}
        onSaved={() => qc.invalidateQueries(['stay-detail', stayId])} />}
      {checkinOpen && (
        <CheckinModal stayId={Number(stayId)} onClose={() => {
          setCheckinOpen(false)
          qc.invalidateQueries(['stay-detail', stayId])
        }} />
      )}
    </div>
  )
}
export default StayDetail
