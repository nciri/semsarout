import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useLocation, useOutletContext } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiChevronDown, FiHome, FiLock } from 'react-icons/fi'
import { rentalService } from '../../../services/rentalService'
import SearchableSelect from '../../../components/common/SearchableSelect'
import api from '../../../services/api'
import { EmptyState, GatedNotice, Modal, Field, PRIMARY_BTN, SECONDARY_BTN } from '../../../components/backoffice/ui'
import { Chip, DetailFrame, IconAction } from '../components/kit'
import { INVENTORY_TONE, STATE_COLOR, maskEmail, maskPhone, matches } from './model'
import { DetailRegion } from './parts'
import { useRentalFormat } from './hooks'
import LeasePanel from './LeasePanel'

const COLS = 'md:grid-cols-[minmax(0,2fr)_110px_minmax(0,1.4fr)_110px_40px] xl:grid-cols-[minmax(0,2.1fr)_120px_minmax(0,1.5fr)_118px_118px_40px]'

function PaymentsCell({ l }) {
  const { t } = useTranslation('backoffice')
  const f = useRentalFormat()
  const past = (l.periods || []).filter((p) => p.state !== 'upcoming')
  const chip = l.owed > 0 ? <Chip tone="crit">{t('rental.overview.leases.owed', { amount: f.n(l.owed) })}</Chip>
    : !past.length ? <Chip tone="neutral">{t('rental.overview.leases.noPeriod')}</Chip>
      : past.at(-1).state === 'paid_late' ? <Chip tone="warn">{t('rental.overview.state.paid_late')}</Chip>
        : <Chip tone="good">{t('rental.overview.leases.upToDate')}</Chip>
  return (
    <div className="flex min-w-0 items-center gap-2 max-md:col-span-full">
      <span className="flex gap-[3px]" aria-hidden="true">
        {past.slice(-6).map((p) => <i key={p.id} title={`${f.month(p.year, p.month)} : ${t(`rental.overview.state.${p.state}`)}`} className="block h-2.5 w-2.5 rounded-[3px]" style={{ background: STATE_COLOR[p.state] }} />)}
      </span>
      {chip}
    </div>
  )
}

function LeaseRow({ l, open, onToggle }) {
  const { t } = useTranslation('backoffice')
  const f = useRentalFormat()
  const n = l.days_to_end
  return (
    <div className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-lg border-b border-gray-100 p-2.5 md:gap-3 ${COLS} ${open ? 'bg-primary-50' : 'hover:bg-gray-50'}`}>
      <div className="min-w-0 max-md:col-span-full">
        <b className="block truncate font-semibold">{l.property_title || l.reference}</b>
        <span className="block truncate text-[12.5px] text-gray-500">{[l.property_city, l.tenant_name, l.reference].filter(Boolean).join(' · ')}</span>
      </div>
      <div className="tabular-nums md:text-end">
        <b>{f.n((l.rent_amount || 0) + (l.charges_amount || 0))}</b>
        <span className="block text-xs text-gray-500">{t('dashboard.units.perMonth')}</span>
      </div>
      <PaymentsCell l={l} />
      <div className="text-[12.5px] max-md:col-start-1">
        <span className="block text-[11.5px] text-gray-500 md:hidden">{t('rental.overview.leases.columns.end')}</span>
        {l.end_date ? f.date(l.end_date) : <span className="text-gray-500">{t('rental.overview.lease.noEnd')}</span>}
        {n != null && n >= 0 && n <= 60 && <span className={`block font-semibold ${n <= 7 ? 'text-red-700' : 'text-amber-700'}`}>{t('rental.overview.inDays', { count: n })}</span>}
      </div>
      <div className="hidden xl:block">
        <Chip tone={INVENTORY_TONE[l.inventories?.entree?.status || 'missing']}>
          {l.inventories?.entree ? t(`rental.inventory.status.${l.inventories.entree.status}`, { defaultValue: l.inventories.entree.status }) : t('rental.overview.inventoryStatus.missing')}
        </Chip>
      </div>
      <div className="justify-self-end max-md:col-start-2 max-md:row-start-2">
        <IconAction icon={FiChevronDown} label={open ? t('dashboard.collapse') : t('dashboard.expand')} onClick={onToggle} tone="gold" tipAlign="end"
          aria-expanded={open} aria-controls="rental-detail" data-disclose={`lease:${l.id}`}
          className={`[&>svg]:transition-transform motion-reduce:[&>svg]:transition-none ${open ? '[&>svg]:rotate-180' : ''}`} />
      </div>
    </div>
  )
}

function LeasesList() {
  const { t } = useTranslation(['backoffice', 'common'])
  const qc = useQueryClient()
  const location = useLocation()
  const ctx = useOutletContext()
  const [localOpen, setLocalOpen] = useState(null)
  const openKey = ctx ? ctx.openKey : localOpen
  const toggle = ctx ? ctx.toggle : (k) => setLocalOpen((o) => (o === k ? null : k))
  const { data, isLoading, error } = useQuery('rental-leases', () => rentalService.listLeases())
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ mandate_id: '', tenant_client_id: '', rent_amount: '', charges_amount: '', deposit_amount: '', payment_day: '1' })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const setVal = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const { data: mandatesData } = useQuery('rental-mandates', () => rentalService.listMandates())
  const { data: clientsData } = useQuery('bo-clients-min', async () => (await api.get('/backoffice/clients?per_page=100')).data)
  const mandates = mandatesData?.mandates || []
  const clients = clientsData?.clients || []

  useEffect(() => { if (location.state?.create) setOpen(true) }, [location.state])

  const create = useMutation(() => rentalService.createLease({
    mandate_id: Number(form.mandate_id), tenant_client_id: Number(form.tenant_client_id),
    rent_amount: Number(form.rent_amount), charges_amount: form.charges_amount ? Number(form.charges_amount) : 0,
    deposit_amount: form.deposit_amount ? Number(form.deposit_amount) : 0, payment_day: Number(form.payment_day) || 1,
  }), {
    onSuccess: () => { toast.success(t('backoffice:rental.lease.toasts.created')); setOpen(false); qc.invalidateQueries('rental-leases'); qc.invalidateQueries('rental-summary') },
    onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short')),
  })

  if (error?.response?.status === 403) return <GatedNotice icon={FiLock} title={t('backoffice:rental.shared.pageTitle')} message={t('backoffice:rental.lease.gated.message')} />
  if (error) return <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center text-gray-500">{t('backoffice:rental.shared.loadError')}</div>

  const q = ctx?.query || ''
  const leases = (data?.leases || [])
    .filter((l) => matches(q, l.property_title, l.property_city, l.tenant_name, l.reference))
    .sort((a, b) => (b.owed || 0) - (a.owed || 0))

  return (
    <div>
      {isLoading ? <div className="h-24 animate-pulse rounded-lg bg-gray-50 motion-reduce:animate-none" aria-busy="true" /> : !data?.leases?.length ? (
        <EmptyState icon={FiHome} title={t('backoffice:rental.lease.empty.title')} description={t('backoffice:rental.lease.empty.description')} />
      ) : (
        <>
          <div className={`hidden gap-3 border-b border-gray-100 px-2.5 pb-2 text-[11.5px] font-semibold uppercase tracking-wide text-gray-500 md:grid ${COLS}`}>
            <span>{t('backoffice:rental.overview.leases.columns.lease')}</span>
            <span className="text-end">{t('backoffice:rental.overview.leases.columns.rent')}</span>
            <span>{t('backoffice:rental.overview.leases.columns.payments')}</span>
            <span>{t('backoffice:rental.overview.leases.columns.end')}</span>
            <span className="hidden xl:block">{t('backoffice:rental.overview.leases.columns.inventory')}</span>
            <span />
          </div>
          {!leases.length && <p className="m-0 px-2.5 py-4 text-sm text-gray-500">{t('backoffice:rental.overview.noMatch')}</p>}
          {leases.map((l) => {
            const key = `lease:${l.id}`
            const isOpen = openKey === key
            return (
              <div key={l.id}>
                <LeaseRow l={l} open={isOpen} onToggle={() => toggle(key)} />
                {isOpen && (
                  <div className="mb-2.5">
                    <DetailRegion shown={ctx ? ctx.shown : true} notch="calc(100% - 30px)">
                      <DetailFrame
                        title={[l.property_title || l.reference, l.property_city].filter(Boolean).join(', ')}
                        sub={[l.reference, l.tenant_name, l.tenant_phone && maskPhone(l.tenant_phone), l.tenant_email && maskEmail(l.tenant_email)].filter(Boolean).join(' · ')}
                        link={{ to: `/backoffice/gestion-locative/baux/${l.id}`, label: t('backoffice:rental.overview.openLease') }}
                        onClose={() => (ctx ? ctx.close() : setLocalOpen(null))} titleRef={ctx?.titleRef}>
                        <LeasePanel lease={l} />
                      </DetailFrame>
                    </DetailRegion>
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={t('backoffice:rental.lease.modal.title')}
        footer={<>
          <button onClick={() => setOpen(false)} className={SECONDARY_BTN}>{t('backoffice:rental.lease.modal.cancel')}</button>
          <button disabled={!form.mandate_id || !form.tenant_client_id || !form.rent_amount || create.isLoading} onClick={() => create.mutate()} className={PRIMARY_BTN}>{t('backoffice:rental.lease.modal.create')}</button>
        </>}>
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('backoffice:rental.lease.modal.mandateLabel')}</label>
          <SearchableSelect
            value={form.mandate_id}
            onChange={setVal('mandate_id')}
            options={mandates.map((m) => ({ value: m.id, label: m.reference, description: m.property_title || (m.mandate_type === 'gestion' ? t('backoffice:rental.mandate.type.gestion') : t('backoffice:rental.mandate.type.location')) }))}
            placeholder={t('backoffice:rental.lease.modal.mandatePlaceholder')}
            searchPlaceholder={t('backoffice:rental.lease.modal.mandateSearchPlaceholder')}
          />
        </div>
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('backoffice:rental.lease.modal.tenantLabel')}</label>
          <SearchableSelect
            value={form.tenant_client_id}
            onChange={setVal('tenant_client_id')}
            options={clients.map((c) => ({ value: c.id, label: `${c.first_name} ${c.last_name}`, description: c.email ? maskEmail(c.email) : maskPhone(c.phone) }))}
            placeholder={t('backoffice:rental.lease.modal.tenantPlaceholder')}
            searchPlaceholder={t('backoffice:rental.lease.modal.tenantSearchPlaceholder')}
          />
        </div>
        <Field label={t('backoffice:rental.lease.modal.rentLabel')} type="number" value={form.rent_amount} onChange={set('rent_amount')} />
        <Field label={t('backoffice:rental.lease.modal.chargesLabel')} type="number" value={form.charges_amount} onChange={set('charges_amount')} />
        <Field label={t('backoffice:rental.lease.modal.depositLabel')} type="number" value={form.deposit_amount} onChange={set('deposit_amount')} />
        <Field label={t('backoffice:rental.lease.modal.paymentDayLabel')} type="number" value={form.payment_day} onChange={set('payment_day')} />
      </Modal>
    </div>
  )
}
export default LeasesList
