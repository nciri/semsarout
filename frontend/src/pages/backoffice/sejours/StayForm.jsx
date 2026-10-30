import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import api from '../../../services/api'
import { stayService } from '../../../services/stayService'
import { Field, Modal, PRIMARY_BTN, SECONDARY_BTN, Select } from '../../../components/backoffice/ui'
import RichTextarea from '../../../components/common/RichTextarea'

const EMPTY = {
  property_id: '', check_in: '', check_out: '', status: 'confirmed', guest_name: '',
  guest_email: '', guest_phone: '', guest_count: '', total_price: '', cleaning_fee: '',
  guest_notes: '', special_requests: '',
}

const day = (iso) => (iso ? String(iso).slice(0, 10) : '')

function Labelled({ id, label, children }) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor={id}>{label}</label>
      {children}
    </div>
  )
}

/**
 * Réservation directe : la location de la main à la main, hors plateforme.
 *
 * Même formulaire pour la création et la modification — seul un séjour saisi ici est
 * modifiable, un séjour venu d'un calendrier étant réécrit à chaque synchronisation.
 */
function StayForm({ stay, onClose, onSaved }) {
  const { t } = useTranslation(['backoffice', 'common'])
  const qc = useQueryClient()
  const editing = Boolean(stay?.id)
  const [form, setForm] = useState(() => (stay
    ? {
      ...EMPTY,
      ...stay,
      property_id: stay.property_id || '',
      check_in: day(stay.check_in),
      check_out: day(stay.check_out),
      guest_name: stay.guest_name || '',
      guest_email: stay.guest_email || '',
      guest_phone: stay.guest_phone || '',
      guest_notes: stay.guest_notes || '',
      special_requests: stay.special_requests || '',
      guest_count: stay.guest_count ?? '',
      total_price: stay.total_price ?? '',
      cleaning_fee: stay.cleaning_fee ?? '',
    }
    : EMPTY))
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const { data: props } = useQuery('bo-properties-min',
    async () => (await api.get('/backoffice/properties?per_page=200')).data, { enabled: !editing })

  const payload = () => ({
    property_id: Number(form.property_id),
    check_in: form.check_in,
    check_out: form.check_out,
    status: form.status,
    guest_name: form.guest_name.trim(),
    guest_email: form.guest_email.trim(),
    guest_phone: form.guest_phone.trim(),
    guest_count: form.guest_count === '' ? null : Number(form.guest_count),
    total_price: form.total_price === '' ? null : Number(form.total_price),
    cleaning_fee: form.cleaning_fee === '' ? null : Number(form.cleaning_fee),
    guest_notes: form.guest_notes.trim(),
    special_requests: form.special_requests.trim(),
  })

  const save = useMutation(() => (editing
    ? stayService.updateStay(stay.id, payload())
    : stayService.createStay(payload())), {
    onSuccess: (r) => {
      toast.success(t(editing ? 'backoffice:stays.planning.form.updated' : 'backoffice:stays.planning.form.created'))
      const keys = ['stays-list', 'stays-overview', 'stays-calendar', 'stay-detail']
      keys.forEach((k) => qc.invalidateQueries(k))
      onSaved?.(r.stay)
      onClose()
    },
    onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short')),
  })

  const incomplete = !form.check_in || !form.check_out || (!editing && !form.property_id)

  return (
    <Modal open onClose={onClose}
      title={t(editing ? 'backoffice:stays.planning.form.editTitle' : 'backoffice:stays.planning.form.title')}
      footer={<>
        <button onClick={onClose} className={SECONDARY_BTN}>{t('backoffice:stays.planning.form.cancel')}</button>
        <button disabled={save.isLoading || incomplete} onClick={() => save.mutate()} className={PRIMARY_BTN}>
          {t('backoffice:stays.planning.form.submit')}
        </button>
      </>}>
      <p className="mb-3 text-[13px] text-gray-500">{t('backoffice:stays.planning.form.help')}</p>

      {!editing && (
        <Labelled id="stay-property" label={t('backoffice:stays.planning.form.propertyLabel')}>
          <Select id="stay-property" value={form.property_id} onChange={set('property_id')} className="w-full">
            <option value="">{t('backoffice:stays.planning.form.propertyPlaceholder')}</option>
            {(props?.properties || []).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </Select>
        </Labelled>
      )}

      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field type="date" label={t('backoffice:stays.planning.form.checkIn')} value={form.check_in} onChange={set('check_in')} />
        <Field type="date" label={t('backoffice:stays.planning.form.checkOut')} value={form.check_out} onChange={set('check_out')} />
      </div>

      <Labelled id="stay-status" label={t('backoffice:stays.planning.form.statusLabel')}>
        <Select id="stay-status" value={form.status} onChange={set('status')} className="w-full">
          <option value="confirmed">{t('backoffice:stays.status.confirmed')}</option>
          <option value="blocked">{t('backoffice:stays.status.blocked')}</option>
        </Select>
      </Labelled>

      <Field label={t('backoffice:stays.planning.contact.nameLabel')} value={form.guest_name} onChange={set('guest_name')} />
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field type="email" label={t('backoffice:stays.planning.contact.emailLabel')} value={form.guest_email} onChange={set('guest_email')} />
        <Field label={t('backoffice:stays.planning.contact.phoneLabel')} value={form.guest_phone} onChange={set('guest_phone')} />
      </div>
      <div className="grid gap-x-3 sm:grid-cols-3">
        <Field type="number" min="1" label={t('backoffice:stays.planning.form.guestCount')} value={form.guest_count} onChange={set('guest_count')} />
        <Field type="number" min="0" label={t('backoffice:stays.planning.form.totalPrice')} value={form.total_price} onChange={set('total_price')} />
        <Field type="number" min="0" label={t('backoffice:stays.planning.form.cleaningFee')} value={form.cleaning_fee} onChange={set('cleaning_fee')} />
      </div>

      <Labelled id="stay-notes" label={t('backoffice:stays.planning.form.notes')}>
        <RichTextarea id="stay-notes" rows={2} value={form.guest_notes}
          onChange={(html) => setForm((f) => ({ ...f, guest_notes: html }))} />
      </Labelled>
      <Labelled id="stay-requests" label={t('backoffice:stays.planning.form.requests')}>
        <RichTextarea id="stay-requests" rows={2} value={form.special_requests}
          onChange={(html) => setForm((f) => ({ ...f, special_requests: html }))} />
      </Labelled>
    </Modal>
  )
}
export default StayForm
