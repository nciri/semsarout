import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiLock, FiPlus, FiClipboard, FiTrash2 } from 'react-icons/fi'
import api from '../../../services/api'
import { artisanService } from '../../../services/artisanService'
import { rentalService } from '../../../services/rentalService'
import { useRentalFormat } from '../rental/hooks'
import { ConfirmDialog, Modal, Select, DataTable, StatusBadge, EmptyState, GatedNotice, SECONDARY_BTN } from '../../../components/backoffice/ui'
import RichTextarea from '../../../components/common/RichTextarea'
import { isRichTextEmpty } from '../../../utils/richText'

const STATUS_TONE = {
  requested: 'bg-gray-100 text-gray-700',
  scheduled: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  done: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
}

const PRIMARY_BTN = 'inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50'

// Les cinq états d'une intervention, dans l'ordre où elle les traverse : la barre se lit
// comme son avancement, pas comme quatre nombres posés côte à côte.
const FLOW = [
  { status: 'requested', fill: 'bg-gray-300' },
  { status: 'scheduled', fill: 'bg-blue-500' },
  { status: 'in_progress', fill: 'bg-amber-500' },
  { status: 'done', fill: 'bg-emerald-500' },
  { status: 'cancelled', fill: 'bg-red-400' },
]

const NO_FILTER = { trade: '', q: '' }
// `payer` et `charge_mode` vides = « suivre la proposition » ; une valeur = choix de l'agent.
const EMPTY_FORM = {
  title: '', trade: 'plombier', property_id: '', artisan_id: '',
  scheduled_date: '', cost_estimate: '', notes: '',
  client_id: '', nature: '', payer: '', charge_mode: '', third_party_label: '',
}
const NATURES = ['structurel', 'entretien', 'degat_occupant']
const PAYERS = ['owner', 'tenant', 'agency', 'third_party']
const CHARGE_MODES = ['crg_expense', 'deposit_deduction', 'to_rebill', 'direct', 'absorbed']

// Miroir de `payeur_propose` / `mode_propose` (services/directory/app/payeur.py) : la saisie
// propose ce que le service proposerait, l'agent garde la main.
const proposedPayer = (nature, hasLease) => (
  nature === 'degat_occupant' || (nature === 'entretien' && hasLease) ? 'tenant' : 'owner')
const proposedMode = (payer, hasMandate) => {
  if (payer === 'owner' && hasMandate) return 'crg_expense'
  return payer === 'agency' ? 'absorbed' : 'to_rebill'
}

/**
 * Avancement du parc d'interventions : barre empilée plus légende chiffrée. La barre est
 * décorative (`aria-hidden`) — c'est la légende qui porte les nombres, donc la lecture ne
 * dépend jamais de la seule couleur.
 */
function StatusFlow({ counts, total, label }) {
  const { t } = useTranslation(['backoffice'])
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-baseline gap-2">
        <b className="font-display text-2xl font-extrabold leading-none tabular-nums">{total}</b>
        <span className="text-[13px] text-gray-500">{label}</span>
      </div>
      <div aria-hidden="true" className="mt-3 flex h-2.5 gap-[2px] overflow-hidden rounded-full bg-gray-100">
        {FLOW.filter((f) => counts[f.status]).map((f) => (
          <span key={f.status} className={`${f.fill} first:rounded-s-full last:rounded-e-full`}
            style={{ width: `${(counts[f.status] / total) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {FLOW.map((f) => (
          <li key={f.status} className="flex items-center gap-1.5 text-[12.5px]">
            <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${f.fill}`} />
            <span className="text-gray-600">{t(`backoffice:artisans.workOrder.status.${f.status}`)}</span>
            <b className="font-semibold tabular-nums text-gray-900">{counts[f.status] || 0}</b>
          </li>
        ))}
      </ul>
    </div>
  )
}

function WorkOrdersList({ filter = NO_FILTER }) {
  const { t } = useTranslation(['backoffice', 'common'])
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery('work-orders', () => artisanService.listWorkOrders())
  const { data: tradesData } = useQuery('artisan-trades', () => artisanService.listTrades(), { staleTime: 3600000 })
  const [open, setOpen] = useState(false)
  // Le bon visé par la corbeille, en attente de confirmation ; null = fenêtre fermée.
  const [removing, setRemoving] = useState(null)
  // Un bon de travaux porte sur un bien : sans lui, personne ne sait où aller travailler.
  const [form, setForm] = useState(EMPTY_FORM)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const f = useRentalFormat()
  const trades = tradesData?.trades || []
  const tradeLabel = (id) => trades.find((tr) => tr.id === id)?.label || id
  // Même clé que les autres écrans du back-office : le cache est partagé.
  const { data: props } = useQuery('bo-properties-min',
    async () => (await api.get('/backoffice/properties?per_page=200')).data, { enabled: open })
  // Les artisans du métier choisi : proposer un carreleur pour une fuite n'aide personne.
  const { data: artisansData } = useQuery(['artisans', { trade: form.trade, city: '', q: '' }],
    () => artisanService.listArtisans({ trade: form.trade, city: '', q: '' }), { enabled: open })
  const { data: clientsData } = useQuery('bo-clients-min',
    async () => (await api.get('/backoffice/clients?per_page=100')).data, { enabled: open })
  // Le bail et le mandat du bien décident de ce qu'on propose ; sans réponse (offre sans
  // gestion locative), on n'affirme rien sur le bien.
  const { data: leasesData } = useQuery('rental-leases', () => rentalService.listLeases(), { enabled: open, retry: false })
  const { data: mandatesData } = useQuery('rental-mandates', () => rentalService.listMandates(), { enabled: open, retry: false })
  const properties = props?.properties || []
  const clients = clientsData?.clients || []
  const propertyId = Number(form.property_id)
  // La liste ne filtre pas côté service : on retient ici le bail en cours du bien choisi.
  const lease = leasesData?.leases?.find((l) => l.property_id === propertyId && l.status === 'active')
  const hasMandate = !!mandatesData?.mandates?.some((m) => m.property_id === propertyId && m.status === 'active')
  const payer = form.payer || proposedPayer(form.nature, !!lease)
  const chargeMode = form.charge_mode || proposedMode(payer, hasMandate)
  const needsThirdParty = payer === 'third_party'
  const artisans = artisansData?.artisans || []
  const propertyTitle = (id) => properties.find((x) => x.id === id)?.title || (id ? `#${id}` : '—')

  const fail = (e) => toast.error(e.response?.data?.error || t('common:errors.short'))
  const create = useMutation(() => artisanService.createWorkOrder({
    title: form.title.trim(),
    trade: form.trade,
    property_id: propertyId,
    client_id: Number(form.client_id),
    // Sans lui, la liste des interventions d'un bail (retenues sur sa caution) ne les retrouve pas.
    lease_id: lease?.id ?? null,
    // Le service valide nature, payeur et mode ensemble : sans nature, aucun ne part.
    ...(form.nature && {
      nature: form.nature, payer, charge_mode: chargeMode,
      third_party_label: needsThirdParty ? form.third_party_label.trim() : null,
    }),
    artisan_id: form.artisan_id ? Number(form.artisan_id) : null,
    scheduled_date: form.scheduled_date || null,
    cost_estimate: form.cost_estimate ? Number(form.cost_estimate) : null,
    // Le champ est en texte riche : un éditeur vidé rend `<p><br></p>`, du HTML valide mais
    // sans contenu. `trim()` ne le verrait pas vide.
    notes: isRichTextEmpty(form.notes) ? null : form.notes,
  }), {
    onSuccess: () => {
      toast.success(t('backoffice:artisans.workOrder.toasts.created'))
      setForm(EMPTY_FORM)
      setOpen(false)
      qc.invalidateQueries('work-orders')
    },
    onError: fail,
  })
  // Le service décide qui retire quoi (rôle + statut) et renvoie `can_delete` : l'écran
  // n'affiche l'action que là où elle aboutira.
  const remove = useMutation((id) => artisanService.deleteWorkOrder(id), {
    onSuccess: () => {
      toast.success(t('backoffice:artisans.workOrder.toasts.deleted'))
      setRemoving(null)
      qc.invalidateQueries('work-orders')
    },
    onError: (e) => { setRemoving(null); fail(e) },
  })

  // Le filtre de l'onglet vaut aussi ici : chercher « Benali » doit sortir ses interventions,
  // pas seulement sa fiche d'artisan.
  const orders = useMemo(() => {
    const rows = data?.work_orders || []
    const known = tradesData?.trades || []
    const label = (id) => known.find((tr) => tr.id === id)?.label || id
    const s = (filter.q || '').trim().toLowerCase()
    return rows.filter((w) => (!filter.trade || w.trade === filter.trade)
      && (!s || [w.title, w.artisan?.name, label(w.trade)]
        .filter(Boolean).some((v) => v.toLowerCase().includes(s))))
  }, [data, tradesData, filter.trade, filter.q])
  const counts = useMemo(() => orders.reduce((acc, w) => ({ ...acc, [w.status]: (acc[w.status] || 0) + 1 }), {}),
    [orders])

  if (error?.response?.status === 403) {
    return <GatedNotice icon={FiLock} title={t('backoffice:artisans.workOrder.gated.title')} message={t('backoffice:artisans.workOrder.gated.message')} />
  }

  const columns = [
    { header: t('backoffice:artisans.workOrder.columns.title'), cell: (w) => (
      <Link className="text-primary-600 hover:text-primary-700 font-medium" to={`/backoffice/tiers/interventions/${w.id}`}>{w.title}</Link>
    ) },
    { header: t('backoffice:artisans.workOrder.columns.property'), cell: (w) => <span className="text-gray-600">{propertyTitle(w.property_id)}</span> },
    { header: t('backoffice:artisans.workOrder.columns.trade'), cell: (w) => <span className="text-gray-600">{tradeLabel(w.trade)}</span> },
    { header: t('backoffice:artisans.workOrder.columns.artisan'), cell: (w) => <span className="text-gray-600">{w.artisan?.name || '—'}</span> },
    { header: t('backoffice:artisans.workOrder.columns.costFinal'), align: 'right', cell: (w) => <span className="font-medium text-gray-900">{w.cost_final != null ? `${w.cost_final} Đh` : '—'}</span> },
    { header: t('backoffice:artisans.workOrder.columns.status'), cell: (w) => <StatusBadge label={t(`backoffice:artisans.workOrder.status.${w.status}`, { defaultValue: w.status })} className={STATUS_TONE[w.status]} /> },
    // impeccable-disable-next-line gray-on-color -- icône grise sur fond blanc ; le rouge n'est qu'un état :hover
    { header: '', align: 'right', cell: (w) => (w.can_delete ? (
      <button onClick={() => setRemoving(w)} disabled={remove.isLoading}
        title={t('backoffice:artisans.workOrder.delete')}
        className="p-1.5 text-gray-400 hover:text-redcard-600 rounded-lg hover:bg-redcard-50 transition-colors">
        <FiTrash2 className="w-4 h-4" />
      </button>
    ) : null) },
  ]

  return (
    <div className="space-y-6">
      {orders.length > 0 && (
        <StatusFlow counts={counts} total={orders.length}
          label={t('backoffice:artisans.workOrder.flow.label', { count: orders.length })} />
      )}

      <div className="flex justify-end">
        <button onClick={() => setOpen(true)} className={PRIMARY_BTN}>
          <FiPlus className="w-5 h-5" /> {t('backoffice:artisans.workOrder.form.newButton')}
        </button>
      </div>

      <DataTable
        columns={columns}
        rows={orders}
        isLoading={isLoading}
        empty={<EmptyState icon={FiClipboard} title={t('backoffice:artisans.workOrder.empty.title')} description={t('backoffice:artisans.workOrder.empty.description')} />}
      />

      {/* Un retrait ne se rejoue pas : il se confirme dans une fenêtre du produit. */}
      <ConfirmDialog
        open={removing !== null}
        title={t('backoffice:artisans.workOrder.confirmDelete.title')}
        message={t('backoffice:artisans.workOrder.confirmDelete.message', {
          title: removing?.title,
          status: t(`backoffice:artisans.workOrder.status.${removing?.status}`, { defaultValue: removing?.status }),
        })}
        confirmLabel={t('backoffice:artisans.workOrder.confirmDelete.confirm')}
        cancelLabel={t('backoffice:artisans.workOrder.form.cancel')}
        busy={remove.isLoading}
        onCancel={() => setRemoving(null)}
        onConfirm={() => remove.mutate(removing.id)}
      />

      {/* La saisie quitte la page : une intervention se crée dans sa fenêtre, sans pousser
          la liste vers le bas. */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('backoffice:artisans.workOrder.form.modalTitle')}
        footer={(
          <>
            <button onClick={() => setOpen(false)} className={SECONDARY_BTN}>{t('backoffice:artisans.workOrder.form.cancel')}</button>
            <button disabled={!form.title.trim() || !form.property_id || !form.client_id
              || (form.nature && needsThirdParty && !form.third_party_label.trim()) || create.isLoading}
              onClick={() => create.mutate()} className={PRIMARY_BTN}>
              {t('backoffice:artisans.workOrder.form.submit')}
            </button>
          </>
        )}
      >
        <div className="mb-3">
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="wo-property">
            {t('backoffice:artisans.workOrder.form.propertyLabel')}
          </label>
          <Select id="wo-property" value={form.property_id} onChange={set('property_id')} className="w-full">
            <option value="">{t('backoffice:artisans.workOrder.form.propertyPlaceholder')}</option>
            {properties.map((pr) => <option key={pr.id} value={pr.id}>{pr.title}</option>)}
          </Select>
        </div>
        <div className="mb-3">
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="wo-client">
            {t('backoffice:artisans.workOrder.form.clientLabel')}
          </label>
          <Select id="wo-client" value={form.client_id} onChange={set('client_id')} className="w-full">
            <option value="">{t('backoffice:artisans.workOrder.form.clientPlaceholder')}</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{`${c.first_name} ${c.last_name}`}</option>)}
          </Select>
          {form.property_id && leasesData && (
            <p className="mt-1 text-xs text-gray-500">
              {lease
                ? t('backoffice:artisans.workOrder.form.leased', {
                  tenant: lease.tenant_name, date: f.date(lease.end_date), context: lease.end_date ? 'until' : 'open' })
                : t('backoffice:artisans.workOrder.form.noLease')}
            </p>
          )}
        </div>
        <div className="mb-3">
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="wo-title">
            {t('backoffice:artisans.workOrder.form.titleLabel')}
          </label>
          <input
            id="wo-title"
            value={form.title}
            onChange={set('title')}
            placeholder={t('backoffice:artisans.workOrder.form.titlePlaceholder')}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="wo-trade">
              {t('backoffice:artisans.workOrder.form.tradeLabel')}
            </label>
            <Select id="wo-trade" value={form.trade}
              onChange={(e) => setForm((f) => ({ ...f, trade: e.target.value, artisan_id: '' }))}
              className="w-full">
              {trades.map((tr) => <option key={tr.id} value={tr.id}>{tr.label}</option>)}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="wo-artisan">
              {t('backoffice:artisans.workOrder.form.artisanLabel')}
            </label>
            {/* Changer de métier remet l'artisan à zéro : la liste ne contient plus le même. */}
            <Select id="wo-artisan" value={form.artisan_id} onChange={set('artisan_id')} className="w-full">
              <option value="">{t('backoffice:artisans.workOrder.form.artisanPlaceholder')}</option>
              {artisans.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="wo-date">
              {t('backoffice:artisans.workOrder.form.scheduledLabel')}
            </label>
            <input id="wo-date" type="date" value={form.scheduled_date} onChange={set('scheduled_date')}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="wo-cost">
              {t('backoffice:artisans.workOrder.form.costLabel')}
            </label>
            <input id="wo-cost" type="number" min="0" step="50" value={form.cost_estimate} onChange={set('cost_estimate')}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
        </div>
        <div className="mb-3 grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="wo-nature">
              {t('backoffice:artisans.workOrder.form.natureLabel')}
            </label>
            <Select id="wo-nature" value={form.nature} onChange={set('nature')} className="w-full">
              <option value="">{t('backoffice:artisans.workOrder.form.naturePlaceholder')}</option>
              {NATURES.map((v) => <option key={v} value={v}>{t(`backoffice:artisans.workOrder.nature.${v}`)}</option>)}
            </Select>
          </div>
          {/* Sans nature, rien à proposer. Changer de payeur rend la main au mode proposé : un
              mode choisi pour un autre payeur ne vaut plus. */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="wo-payer">
              {t('backoffice:artisans.workOrder.form.payerLabel')}
            </label>
            <Select id="wo-payer" value={form.nature ? payer : ''} disabled={!form.nature}
              onChange={(e) => setForm((f) => ({ ...f, payer: e.target.value, charge_mode: '' }))} className="w-full">
              {!form.nature && <option value="" />}
              {PAYERS.map((v) => <option key={v} value={v}>{t(`backoffice:artisans.workOrder.payer.${v}`)}</option>)}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="wo-mode">
              {t('backoffice:artisans.workOrder.form.modeLabel')}
            </label>
            <Select id="wo-mode" value={form.nature ? chargeMode : ''} disabled={!form.nature}
              onChange={set('charge_mode')} className="w-full">
              {!form.nature && <option value="" />}
              {CHARGE_MODES.map((v) => <option key={v} value={v}>{t(`backoffice:artisans.workOrder.chargeMode.${v}`)}</option>)}
            </Select>
          </div>
        </div>
        {form.nature && needsThirdParty && (
          <div className="mb-3">
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="wo-third-party">
              {t('backoffice:artisans.workOrder.form.thirdPartyLabel')}
            </label>
            <input id="wo-third-party" value={form.third_party_label} onChange={set('third_party_label')}
              placeholder={t('backoffice:artisans.workOrder.form.thirdPartyPlaceholder')}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
        )}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="wo-notes">
            {t('backoffice:artisans.workOrder.form.notesLabel')}
          </label>
          <RichTextarea id="wo-notes" rows={3} value={form.notes}
            onChange={(html) => setForm((f) => ({ ...f, notes: html }))} />
        </div>
      </Modal>
    </div>
  )
}
export default WorkOrdersList
