# Gestion locative — Phase 5 (UI back-office) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire l'UI **back-office agence** de la gestion locative (mandats, baux + quittancement, candidatures, CRG), **strictement conforme à la charte et au layout SemsarOut** — indiscernable des modules Artisans/Contrats existants.

**Architecture:** React 18 + Vite + react-router-dom 6 + **react-query 3** + axios + `react-toastify`. Aucune primitive visuelle nouvelle : on **réutilise le kit `src/components/backoffice/ui.jsx`** et les tokens Tailwind existants. Un module `RentalLayout` à onglets (comme `ArtisansLayout`) branché dans `BackofficeLayout` + `App.jsx`. Toutes les données via un `rentalService` (wrapper `api` `/api/v1`) frappant les routes back-office `/backoffice/gestion-locative/*` déjà livrées (Phases 1-4).

**Tech Stack:** React 18, Vite 7, react-router-dom 6, react-query 3, axios, react-toastify, react-icons/fi, TailwindCSS 3.

## Global Constraints (CHARTE — non négociable)

- **Réutiliser le kit** `src/components/backoffice/ui.jsx` : `PageHeader, StatCard, Toolbar, Select, StatusBadge, Panel, Field, EmptyState, DataTable, Modal, PRIMARY_BTN, SECONDARY_BTN, GatedNotice`. Ne PAS réinventer boutons/tables/cartes/modales.
- **Tokens Tailwind uniquement** (jamais de couleur en dur hors charte) : accents `primary-*`/`gold-*` (OR), `emerald-*`/`secondary-*` (teal), `redcard-*` (rouge signature), neutres `gray-*`, `midnight`, `ivory`. Rayons `rounded-lg`/`rounded-xl` (cf. kit). Police via classes par défaut (sans=Inter, display=Manrope).
- **Icônes** : `react-icons/fi` (Feather) — jamais d'autre librairie.
- **Devise** : afficher les montants en `Đh` (ex. `` `${n} Đh` ``), format cohérent avec les pages existantes.
- **Données** : react-query (`useQuery`/`useMutation`/`useQueryClient`) via `rentalService` ; toasts `react-toastify` (`toast.success`/`toast.error(e.response?.data?.error || 'Erreur')`). Jamais de `fetch` direct.
- **Gating** : sur un `error?.response?.status === 403`, afficher `<GatedNotice icon={FiLock} title=… message="…réservé aux plans Pro et Entreprise." />` (patron `WorkOrdersList`). L'entrée de menu est **toujours visible** (le back enforce).
- **Formulaires** : état contrôlé simple + `Field`/`Select` du kit dans un `Modal` (patron existant ; pas de nouvelle lib de formulaire).
- **Périmètre** : **UI agence back-office uniquement**. L'UI candidat (espace public `/dashboard` : déposer/suivre sa candidature) est **hors périmètre** (suivi séparé — les routes candidat `/gestion-locative/applications` existent déjà côté API).
- Commits : Conventional Commits, un changement logique par commit, **pas d'attribution IA**. `git commit` = commande bash SEULE (séparée de `git add`).
- Vérification : `npm run build` (Vite) **doit passer** après chaque tâche (pas de casse d'import/JSX). Le lint ne doit pas régresser.
- Le back-office est déjà protégé par `PrivateRoute` + `BackofficeLayout` ; les nouvelles routes vivent DANS le bloc `<Route ... element={<BackofficeLayout/>}>` de `App.jsx`.

---

### Task 1: Fondation (service + layout + menu) + onglet Mandats

**Files:**
- Create: `frontend/src/services/rentalService.js`
- Create: `frontend/src/pages/backoffice/rental/RentalLayout.jsx`
- Create: `frontend/src/pages/backoffice/rental/MandatesList.jsx`
- Create: `frontend/src/pages/backoffice/rental/MandateDetail.jsx`
- Modify: `frontend/src/pages/backoffice/components/BackofficeLayout.jsx` (entrée de menu)
- Modify: `frontend/src/App.jsx` (imports + routes)

**Interfaces:**
- Produces: `rentalService` (toutes les méthodes agence) ; routes `/backoffice/gestion-locative` (onglet Mandats), `/backoffice/gestion-locative/mandats/:id`.

- [ ] **Step 1: `rentalService.js`** (wrapper `api`, patron `artisanService`)
```jsx
import api from './api'

const B = '/backoffice/gestion-locative'

export const rentalService = {
  // Mandats
  listMandates: async () => (await api.get(`${B}/mandates`)).data,
  getMandate: async (id) => (await api.get(`${B}/mandates/${id}`)).data,
  createMandate: async (data) => (await api.post(`${B}/mandates`, data)).data,
  signMandate: async (id) => (await api.post(`${B}/mandates/${id}/sign`)).data,
  listCrg: async (mandateId) => (await api.get(`${B}/mandates/${mandateId}/crg`)).data,
  crgPdfUrl: (mandateId, crgId) => `/api/v1${B}/mandates/${mandateId}/crg/${crgId}.pdf`,
  // Baux
  listLeases: async () => (await api.get(`${B}/leases`)).data,
  getLease: async (id) => (await api.get(`${B}/leases/${id}`)).data,
  createLease: async (data) => (await api.post(`${B}/leases`, data)).data,
  signLease: async (id) => (await api.post(`${B}/leases/${id}/sign`)).data,
  reviseLease: async (id, data) => (await api.post(`${B}/leases/${id}/revise`, data)).data,
  returnDeposit: async (id, data) => (await api.post(`${B}/leases/${id}/deposit-return`, data)).data,
  // Quittancement
  listRentPeriods: async (leaseId) => (await api.get(`${B}/leases/${leaseId}/rent-periods`)).data,
  payRentPeriod: async (id, data) => (await api.post(`${B}/rent-periods/${id}/pay`, data)).data,
  receiptPdfUrl: (id) => `/api/v1${B}/rent-periods/${id}/receipt.pdf`,
  // Candidatures
  listApplications: async () => (await api.get(`${B}/applications`)).data,
  getApplication: async (id) => (await api.get(`${B}/applications/${id}`)).data,
  decideApplication: async (id, data) => (await api.post(`${B}/applications/${id}/decide`, data)).data,
  validateDocument: async (appId, docId, data) => (await api.patch(`${B}/applications/${appId}/documents/${docId}`, data)).data,
}
```
> Note PDF : les URL PDF sont servies par le BFF sous `/api/v1` avec le Bearer ; pour un simple lien `<a href>` sans en-tête, on ouvre via `window.open` après fetch blob OU on rend un lien direct (le back exige le JWT). En pratique, rendre un bouton qui `api.get(url, {responseType:'blob'})` puis `window.open(URL.createObjectURL(blob))`. Fournir un helper (voir MandateDetail Step 4).

- [ ] **Step 2: `RentalLayout.jsx`** (onglets — calque exact `ArtisansLayout`)
```jsx
import { NavLink, Outlet } from 'react-router-dom'
import { PageHeader } from '../../../components/backoffice/ui'

const TABS = [
  { to: '', label: 'Mandats', end: true },
  { to: 'baux', label: 'Baux' },
  { to: 'candidatures', label: 'Candidatures' },
]

function RentalLayout() {
  return (
    <div className="space-y-6">
      <PageHeader title="Gestion locative" subtitle="Mandats de gestion, baux & quittancement, candidatures locatives" />
      <nav className="flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <NavLink
            key={t.label}
            to={t.to}
            end={t.end}
            className={({ isActive }) => `px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${isActive ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}
export default RentalLayout
```

- [ ] **Step 3: `MandatesList.jsx`** (calque `WorkOrdersList` : StatCards + Toolbar création via Modal + DataTable + GatedNotice)
```jsx
import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { FiLock, FiPlus, FiFileText } from 'react-icons/fi'
import { rentalService } from '../../../services/rentalService'
import { StatCard, DataTable, StatusBadge, EmptyState, GatedNotice, Modal, Field, Select, PRIMARY_BTN, SECONDARY_BTN } from '../../../components/backoffice/ui'

const STATUS = {
  draft: ['Brouillon', 'bg-gray-100 text-gray-700'],
  active: ['Actif', 'bg-emerald-50 text-emerald-700'],
  expired: ['Échu', 'bg-amber-100 text-amber-700'],
  terminated: ['Résilié', 'bg-red-100 text-red-700'],
}

function MandatesList() {
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery('rental-mandates', () => rentalService.listMandates())
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ property_id: '', landlord_client_id: '', mandate_type: 'gestion', fee_percent: '' })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const create = useMutation(() => rentalService.createMandate({
    property_id: Number(form.property_id), landlord_client_id: Number(form.landlord_client_id),
    mandate_type: form.mandate_type, fee_percent: form.fee_percent ? Number(form.fee_percent) : null,
  }), {
    onSuccess: () => { toast.success('Mandat créé'); setOpen(false); setForm({ property_id: '', landlord_client_id: '', mandate_type: 'gestion', fee_percent: '' }); qc.invalidateQueries('rental-mandates') },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })

  const mandates = data?.mandates || []
  const stats = useMemo(() => ({
    total: mandates.length,
    active: mandates.filter((m) => m.status === 'active').length,
    draft: mandates.filter((m) => m.status === 'draft').length,
  }), [mandates])

  if (error?.response?.status === 403) {
    return <GatedNotice icon={FiLock} title="Gestion locative" message="La gestion locative est réservée aux plans Pro et Entreprise." />
  }

  const columns = [
    { header: 'Référence', cell: (m) => <Link className="text-primary-600 hover:text-primary-700 font-medium" to={`/backoffice/gestion-locative/mandats/${m.id}`}>{m.reference}</Link> },
    { header: 'Type', cell: (m) => <span className="text-gray-600">{m.mandate_type === 'gestion' ? 'Gestion' : 'Location'}</span> },
    { header: 'Honoraires', align: 'right', cell: (m) => <span className="text-gray-700">{m.fee_percent != null ? `${m.fee_percent} %` : '—'}</span> },
    { header: 'Statut', cell: (m) => <StatusBadge label={STATUS[m.status]?.[0] || m.status} className={STATUS[m.status]?.[1]} /> },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total mandats" value={stats.total} icon={FiFileText} />
        <StatCard label="Actifs" value={stats.active} tone="green" />
        <StatCard label="Brouillons" value={stats.draft} tone="amber" />
      </div>
      <div className="flex justify-end">
        <button onClick={() => setOpen(true)} className={PRIMARY_BTN}><FiPlus className="w-5 h-5" /> Nouveau mandat</button>
      </div>
      <DataTable columns={columns} rows={mandates} isLoading={isLoading}
        empty={<EmptyState icon={FiFileText} title="Aucun mandat" description="Créez un mandat de gestion pour un propriétaire et un bien." />} />

      <Modal open={open} onClose={() => setOpen(false)} title="Nouveau mandat de gestion"
        footer={<>
          <button onClick={() => setOpen(false)} className={SECONDARY_BTN}>Annuler</button>
          <button disabled={!form.property_id || !form.landlord_client_id || create.isLoading} onClick={() => create.mutate()} className={PRIMARY_BTN}>Créer</button>
        </>}>
        <Field label="ID du bien" type="number" value={form.property_id} onChange={set('property_id')} placeholder="ex. 12" />
        <Field label="ID du client bailleur" type="number" value={form.landlord_client_id} onChange={set('landlord_client_id')} placeholder="ex. 5" />
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
          <Select value={form.mandate_type} onChange={set('mandate_type')} className="w-full">
            <option value="gestion">Gestion</option>
            <option value="location">Location</option>
          </Select>
        </div>
        <Field label="Honoraires (%)" type="number" value={form.fee_percent} onChange={set('fee_percent')} placeholder="ex. 8" />
      </Modal>
    </div>
  )
}
export default MandatesList
```

- [ ] **Step 4: `MandateDetail.jsx`** (Panel récap + action Signer + section CRG avec lien PDF via blob)
```jsx
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { FiArrowLeft, FiCheckCircle, FiDownload } from 'react-icons/fi'
import api from '../../../services/api'
import { rentalService } from '../../../services/rentalService'
import { Panel, StatusBadge, DataTable, EmptyState, PRIMARY_BTN, SECONDARY_BTN } from '../../../components/backoffice/ui'

async function openPdf(url) {
  try {
    const res = await api.get(url, { responseType: 'blob' })
    window.open(URL.createObjectURL(res.data), '_blank')
  } catch { toast.error('PDF indisponible') }
}

function MandateDetail() {
  const { id } = useParams()
  const qc = useQueryClient()
  const { data: m, isLoading } = useQuery(['rental-mandate', id], () => rentalService.getMandate(id))
  const { data: crgData } = useQuery(['rental-crg', id], () => rentalService.listCrg(id))
  const sign = useMutation(() => rentalService.signMandate(id), {
    onSuccess: () => { toast.success('Mandat signé'); qc.invalidateQueries(['rental-mandate', id]) },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })
  if (isLoading || !m) return <div className="p-6 text-gray-500">Chargement…</div>

  const crg = crgData?.reports || []
  const crgColumns = [
    { header: 'Période', cell: (c) => <span className="text-gray-700">{c.period_label}</span> },
    { header: 'Encaissé', align: 'right', cell: (c) => <span className="text-gray-700">{c.rent_collected} Đh</span> },
    { header: 'Net reversé', align: 'right', cell: (c) => <span className="font-medium text-gray-900">{c.net} Đh</span> },
    { header: '', align: 'right', cell: (c) => <button onClick={() => openPdf(rentalService.crgPdfUrl(id, c.id))} className="text-primary-600 hover:text-primary-700 inline-flex items-center gap-1"><FiDownload className="w-4 h-4" /> PDF</button> },
  ]

  return (
    <div className="space-y-6">
      <Link to="/backoffice/gestion-locative" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"><FiArrowLeft className="w-4 h-4" /> Retour aux mandats</Link>
      <Panel title={`Mandat ${m.reference}`} action={m.status === 'draft' && <button disabled={sign.isLoading} onClick={() => sign.mutate()} className={PRIMARY_BTN}><FiCheckCircle className="w-5 h-5" /> Signer</button>}>
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div><dt className="text-gray-500">Statut</dt><dd className="mt-1"><StatusBadge label={m.status} /></dd></div>
          <div><dt className="text-gray-500">Type</dt><dd className="mt-1 text-gray-900">{m.mandate_type}</dd></div>
          <div><dt className="text-gray-500">Honoraires</dt><dd className="mt-1 text-gray-900">{m.fee_percent != null ? `${m.fee_percent} %` : '—'}</dd></div>
          <div><dt className="text-gray-500">Bien (ID)</dt><dd className="mt-1 text-gray-900">{m.property_id}</dd></div>
          <div><dt className="text-gray-500">Bailleur (client)</dt><dd className="mt-1 text-gray-900">{m.landlord_client_id}</dd></div>
        </dl>
      </Panel>
      <Panel title="Comptes-rendus de gestion (CRG)">
        <DataTable columns={crgColumns} rows={crg}
          empty={<EmptyState title="Aucun CRG" description="Les comptes-rendus mensuels apparaissent ici une fois les loyers encaissés." />} />
      </Panel>
    </div>
  )
}
export default MandateDetail
```

- [ ] **Step 5: Entrée de menu** — dans `frontend/src/pages/backoffice/components/BackofficeLayout.jsx`, ajouter dans la liste des items (à côté de `artisans`), en important une icône (`FiKey` de `react-icons/fi`) :
```jsx
      { path: '/backoffice/gestion-locative', icon: FiKey, label: 'Gestion locative' },
```
(ajouter `FiKey` à l'import `react-icons/fi` en tête du fichier s'il n'y est pas.)

- [ ] **Step 6: Routes** — dans `frontend/src/App.jsx`, ajouter les imports (près des imports Artisans) :
```jsx
import RentalLayout from './pages/backoffice/rental/RentalLayout'
import MandatesList from './pages/backoffice/rental/MandatesList'
import MandateDetail from './pages/backoffice/rental/MandateDetail'
```
et, DANS le bloc `<Route ... element={<BackofficeLayout/>}>` (à côté du bloc `artisans`), le routage à onglets :
```jsx
          {/* Gestion locative : mandats + baux + candidatures en onglets */}
          <Route path="gestion-locative" element={<RentalLayout />}>
            <Route index element={<MandatesList />} />
          </Route>
          <Route path="gestion-locative/mandats/:id" element={<MandateDetail />} />
```

- [ ] **Step 7: Build + vérif** — `cd frontend && npm run build`. Expected: build Vite **réussi** (pas d'erreur d'import/JSX). Optionnel : `npm run lint` ne régresse pas. Vérifier visuellement (lecture) que MandatesList réutilise `StatCard/DataTable/Modal/GatedNotice` et n'introduit aucune couleur hors charte.

- [ ] **Step 8: Commit**
```bash
cd /home/younes/Documents/work/0semsar
git add frontend/src/services/rentalService.js frontend/src/pages/backoffice/rental/RentalLayout.jsx frontend/src/pages/backoffice/rental/MandatesList.jsx frontend/src/pages/backoffice/rental/MandateDetail.jsx frontend/src/pages/backoffice/components/BackofficeLayout.jsx frontend/src/App.jsx
```
```bash
git commit -m "feat(front): gestion locative back-office — mandats (liste/détail/CRG) + layout à onglets"
```

---

### Task 2: Onglet Baux + quittancement

**Files:**
- Create: `frontend/src/pages/backoffice/rental/LeasesList.jsx`
- Create: `frontend/src/pages/backoffice/rental/LeaseDetail.jsx`
- Modify: `frontend/src/pages/backoffice/rental/RentalLayout.jsx` (onglet déjà présent — rien si Task 1 a inclus les 3 onglets ; sinon vérifier)
- Modify: `frontend/src/App.jsx` (imports + routes baux)

**Interfaces:**
- Consumes: `rentalService` (leases + rent-periods).
- Produces: routes `/backoffice/gestion-locative/baux`, `/backoffice/gestion-locative/baux/:id`.

- [ ] **Step 1: `LeasesList.jsx`** (calque `MandatesList` ; création d'un bail rattaché à un mandat)
```jsx
import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { FiLock, FiPlus, FiHome } from 'react-icons/fi'
import { rentalService } from '../../../services/rentalService'
import { StatCard, DataTable, StatusBadge, EmptyState, GatedNotice, Modal, Field, PRIMARY_BTN, SECONDARY_BTN } from '../../../components/backoffice/ui'

const STATUS = {
  draft: ['Brouillon', 'bg-gray-100 text-gray-700'],
  active: ['Actif', 'bg-emerald-50 text-emerald-700'],
  ended: ['Terminé', 'bg-amber-100 text-amber-700'],
  terminated: ['Résilié', 'bg-red-100 text-red-700'],
}

function LeasesList() {
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery('rental-leases', () => rentalService.listLeases())
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ mandate_id: '', tenant_client_id: '', rent_amount: '', charges_amount: '', deposit_amount: '', payment_day: '1' })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const create = useMutation(() => rentalService.createLease({
    mandate_id: Number(form.mandate_id), tenant_client_id: Number(form.tenant_client_id),
    rent_amount: Number(form.rent_amount), charges_amount: form.charges_amount ? Number(form.charges_amount) : 0,
    deposit_amount: form.deposit_amount ? Number(form.deposit_amount) : 0, payment_day: Number(form.payment_day) || 1,
  }), {
    onSuccess: () => { toast.success('Bail créé'); setOpen(false); qc.invalidateQueries('rental-leases') },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })

  const leases = data?.leases || []
  const stats = useMemo(() => ({ total: leases.length, active: leases.filter((l) => l.status === 'active').length }), [leases])
  if (error?.response?.status === 403) return <GatedNotice icon={FiLock} title="Baux" message="La gestion locative est réservée aux plans Pro et Entreprise." />

  const columns = [
    { header: 'Référence', cell: (l) => <Link className="text-primary-600 hover:text-primary-700 font-medium" to={`/backoffice/gestion-locative/baux/${l.id}`}>{l.reference}</Link> },
    { header: 'Loyer', align: 'right', cell: (l) => <span className="text-gray-700">{l.rent_amount} Đh</span> },
    { header: 'Charges', align: 'right', cell: (l) => <span className="text-gray-600">{l.charges_amount ? `${l.charges_amount} Đh` : '—'}</span> },
    { header: 'Statut', cell: (l) => <StatusBadge label={STATUS[l.status]?.[0] || l.status} className={STATUS[l.status]?.[1]} /> },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Total baux" value={stats.total} icon={FiHome} />
        <StatCard label="Actifs" value={stats.active} tone="green" />
      </div>
      <div className="flex justify-end">
        <button onClick={() => setOpen(true)} className={PRIMARY_BTN}><FiPlus className="w-5 h-5" /> Nouveau bail</button>
      </div>
      <DataTable columns={columns} rows={leases} isLoading={isLoading}
        empty={<EmptyState icon={FiHome} title="Aucun bail" description="Créez un bail rattaché à un mandat de gestion." />} />

      <Modal open={open} onClose={() => setOpen(false)} title="Nouveau bail"
        footer={<>
          <button onClick={() => setOpen(false)} className={SECONDARY_BTN}>Annuler</button>
          <button disabled={!form.mandate_id || !form.tenant_client_id || !form.rent_amount || create.isLoading} onClick={() => create.mutate()} className={PRIMARY_BTN}>Créer</button>
        </>}>
        <Field label="ID du mandat" type="number" value={form.mandate_id} onChange={set('mandate_id')} />
        <Field label="ID du client locataire" type="number" value={form.tenant_client_id} onChange={set('tenant_client_id')} />
        <Field label="Loyer (Đh)" type="number" value={form.rent_amount} onChange={set('rent_amount')} />
        <Field label="Charges (Đh)" type="number" value={form.charges_amount} onChange={set('charges_amount')} />
        <Field label="Dépôt de garantie (Đh)" type="number" value={form.deposit_amount} onChange={set('deposit_amount')} />
        <Field label="Jour d'échéance (1-28)" type="number" value={form.payment_day} onChange={set('payment_day')} />
      </Modal>
    </div>
  )
}
export default LeasesList
```

- [ ] **Step 2: `LeaseDetail.jsx`** (récap + Signer/Réviser/Restituer dépôt + quittancement : échéances + Enregistrer paiement + quittance PDF)
```jsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { FiArrowLeft, FiCheckCircle, FiDownload } from 'react-icons/fi'
import api from '../../../services/api'
import { rentalService } from '../../../services/rentalService'
import { Panel, StatusBadge, DataTable, EmptyState, Modal, Field, PRIMARY_BTN, SECONDARY_BTN, Select } from '../../../components/backoffice/ui'

async function openPdf(url) {
  try { const res = await api.get(url, { responseType: 'blob' }); window.open(URL.createObjectURL(res.data), '_blank') }
  catch { toast.error('PDF indisponible') }
}

const RP_STATUS = {
  pending: ['À régler', 'bg-gray-100 text-gray-700'],
  late: ['En retard', 'bg-red-100 text-red-700'],
  partial: ['Partiel', 'bg-amber-100 text-amber-700'],
  paid: ['Payé', 'bg-emerald-50 text-emerald-700'],
}

function LeaseDetail() {
  const { id } = useParams()
  const qc = useQueryClient()
  const { data: l, isLoading } = useQuery(['rental-lease', id], () => rentalService.getLease(id))
  const { data: rpData } = useQuery(['rental-rent-periods', id], () => rentalService.listRentPeriods(id))
  const [payFor, setPayFor] = useState(null)   // rent period being paid
  const [payForm, setPayForm] = useState({ amount: '', method: 'virement' })
  const [reviseOpen, setReviseOpen] = useState(false)
  const [newRent, setNewRent] = useState('')

  const refresh = () => { qc.invalidateQueries(['rental-lease', id]); qc.invalidateQueries(['rental-rent-periods', id]) }
  const sign = useMutation(() => rentalService.signLease(id), { onSuccess: () => { toast.success('Bail signé'); refresh() }, onError: (e) => toast.error(e.response?.data?.error || 'Erreur') })
  const revise = useMutation(() => rentalService.reviseLease(id, { new_rent: Number(newRent) }), { onSuccess: () => { toast.success('Loyer révisé'); setReviseOpen(false); refresh() }, onError: (e) => toast.error(e.response?.data?.error || 'Erreur') })
  const returnDep = useMutation(() => rentalService.returnDeposit(id, {}), { onSuccess: () => { toast.success('Dépôt restitué'); refresh() }, onError: (e) => toast.error(e.response?.data?.error || 'Erreur') })
  const pay = useMutation(() => rentalService.payRentPeriod(payFor.id, { amount: Number(payForm.amount), method: payForm.method }), {
    onSuccess: () => { toast.success('Paiement enregistré'); setPayFor(null); setPayForm({ amount: '', method: 'virement' }); refresh() },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })

  if (isLoading || !l) return <div className="p-6 text-gray-500">Chargement…</div>
  const periods = rpData?.rent_periods || []
  const columns = [
    { header: 'Période', cell: (p) => <span className="text-gray-700">{p.period_label}</span> },
    { header: 'Dû', align: 'right', cell: (p) => <span className="text-gray-700">{p.total_amount} Đh</span> },
    { header: 'Statut', cell: (p) => <StatusBadge label={RP_STATUS[p.status]?.[0] || p.status} className={RP_STATUS[p.status]?.[1]} /> },
    { header: '', align: 'right', cell: (p) => p.status === 'paid'
      ? <button onClick={() => openPdf(rentalService.receiptPdfUrl(p.id))} className="text-primary-600 hover:text-primary-700 inline-flex items-center gap-1"><FiDownload className="w-4 h-4" /> Quittance</button>
      : <button onClick={() => { setPayFor(p); setPayForm({ amount: String(p.total_amount), method: 'virement' }) }} className="text-primary-600 hover:text-primary-700 font-medium">Enregistrer paiement</button> },
  ]

  return (
    <div className="space-y-6">
      <Link to="/backoffice/gestion-locative/baux" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"><FiArrowLeft className="w-4 h-4" /> Retour aux baux</Link>
      <Panel title={`Bail ${l.reference}`} action={<div className="flex gap-2">
        {l.status === 'draft' && <button disabled={sign.isLoading} onClick={() => sign.mutate()} className={PRIMARY_BTN}><FiCheckCircle className="w-5 h-5" /> Signer</button>}
        {l.status === 'active' && <button onClick={() => { setNewRent(String(l.rent_amount)); setReviseOpen(true) }} className={SECONDARY_BTN}>Réviser le loyer</button>}
        {l.status === 'active' && <button disabled={returnDep.isLoading} onClick={() => returnDep.mutate()} className={SECONDARY_BTN}>Restituer le dépôt</button>}
      </div>}>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><dt className="text-gray-500">Statut</dt><dd className="mt-1"><StatusBadge label={l.status} /></dd></div>
          <div><dt className="text-gray-500">Loyer</dt><dd className="mt-1 text-gray-900">{l.rent_amount} Đh</dd></div>
          <div><dt className="text-gray-500">Charges</dt><dd className="mt-1 text-gray-900">{l.charges_amount || 0} Đh</dd></div>
          <div><dt className="text-gray-500">Dépôt</dt><dd className="mt-1 text-gray-900">{l.deposit_amount || 0} Đh</dd></div>
        </dl>
      </Panel>
      <Panel title="Quittancement">
        <DataTable columns={columns} rows={periods}
          empty={<EmptyState title="Aucune échéance" description="Les échéances de loyer sont générées mensuellement par l'ordonnanceur." />} />
      </Panel>

      <Modal open={!!payFor} onClose={() => setPayFor(null)} title={`Enregistrer un paiement — ${payFor?.period_label || ''}`}
        footer={<>
          <button onClick={() => setPayFor(null)} className={SECONDARY_BTN}>Annuler</button>
          <button disabled={!payForm.amount || pay.isLoading} onClick={() => pay.mutate()} className={PRIMARY_BTN}>Enregistrer</button>
        </>}>
        <Field label="Montant (Đh)" type="number" value={payForm.amount} onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))} />
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">Méthode</label>
          <Select value={payForm.method} onChange={(e) => setPayForm((f) => ({ ...f, method: e.target.value }))} className="w-full">
            <option value="virement">Virement</option><option value="cheque">Chèque</option><option value="especes">Espèces</option><option value="carte">Carte</option>
          </Select>
        </div>
      </Modal>

      <Modal open={reviseOpen} onClose={() => setReviseOpen(false)} title="Réviser le loyer"
        footer={<>
          <button onClick={() => setReviseOpen(false)} className={SECONDARY_BTN}>Annuler</button>
          <button disabled={!newRent || revise.isLoading} onClick={() => revise.mutate()} className={PRIMARY_BTN}>Appliquer</button>
        </>}>
        <Field label="Nouveau loyer (Đh)" type="number" value={newRent} onChange={(e) => setNewRent(e.target.value)} />
      </Modal>
    </div>
  )
}
export default LeaseDetail
```

- [ ] **Step 3: Routes** — dans `App.jsx`, imports :
```jsx
import LeasesList from './pages/backoffice/rental/LeasesList'
import LeaseDetail from './pages/backoffice/rental/LeaseDetail'
```
et dans le bloc `<Route path="gestion-locative" element={<RentalLayout />}>` ajouter `<Route path="baux" element={<LeasesList />} />`, puis en sibling `<Route path="gestion-locative/baux/:id" element={<LeaseDetail />} />`.

- [ ] **Step 4: Build + Commit** — `cd frontend && npm run build` (doit passer).
```bash
cd /home/younes/Documents/work/0semsar
git add frontend/src/pages/backoffice/rental/LeasesList.jsx frontend/src/pages/backoffice/rental/LeaseDetail.jsx frontend/src/App.jsx
```
```bash
git commit -m "feat(front): gestion locative — baux + quittancement (échéances, paiement, quittance PDF)"
```

---

### Task 3: Onglet Candidatures

**Files:**
- Create: `frontend/src/pages/backoffice/rental/ApplicationsList.jsx`
- Create: `frontend/src/pages/backoffice/rental/ApplicationDetail.jsx`
- Modify: `frontend/src/App.jsx` (imports + routes candidatures)

**Interfaces:**
- Consumes: `rentalService` (applications + documents).
- Produces: routes `/backoffice/gestion-locative/candidatures`, `/backoffice/gestion-locative/candidatures/:id`.

- [ ] **Step 1: `ApplicationsList.jsx`** (liste — pas de création côté agence : les candidats postulent depuis l'espace public)
```jsx
import { useMemo } from 'react'
import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import { FiLock, FiInbox } from 'react-icons/fi'
import { rentalService } from '../../../services/rentalService'
import { StatCard, DataTable, StatusBadge, EmptyState, GatedNotice } from '../../../components/backoffice/ui'

const STATUS = {
  received: ['Reçue', 'bg-blue-100 text-blue-700'],
  reviewing: ['En étude', 'bg-amber-100 text-amber-700'],
  accepted: ['Acceptée', 'bg-emerald-50 text-emerald-700'],
  rejected: ['Refusée', 'bg-red-100 text-red-700'],
  withdrawn: ['Retirée', 'bg-gray-100 text-gray-700'],
}

function ApplicationsList() {
  const { data, isLoading, error } = useQuery('rental-applications', () => rentalService.listApplications())
  const apps = data?.applications || []
  const stats = useMemo(() => ({ total: apps.length, received: apps.filter((a) => a.status === 'received').length, accepted: apps.filter((a) => a.status === 'accepted').length }), [apps])
  if (error?.response?.status === 403) return <GatedNotice icon={FiLock} title="Candidatures" message="La gestion locative est réservée aux plans Pro et Entreprise." />

  const columns = [
    { header: 'Candidat', cell: (a) => <Link className="text-primary-600 hover:text-primary-700 font-medium" to={`/backoffice/gestion-locative/candidatures/${a.id}`}>{a.applicant_name || a.applicant_email || `#${a.id}`}</Link> },
    { header: 'Bien (ID)', cell: (a) => <span className="text-gray-600">{a.property_id}</span> },
    { header: 'Revenu mensuel', align: 'right', cell: (a) => <span className="text-gray-700">{a.monthly_income != null ? `${a.monthly_income} Đh` : '—'}</span> },
    { header: 'Statut', cell: (a) => <StatusBadge label={STATUS[a.status]?.[0] || a.status} className={STATUS[a.status]?.[1]} /> },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total" value={stats.total} icon={FiInbox} />
        <StatCard label="Nouvelles" value={stats.received} tone="blue" />
        <StatCard label="Acceptées" value={stats.accepted} tone="green" />
      </div>
      <DataTable columns={columns} rows={apps} isLoading={isLoading}
        empty={<EmptyState icon={FiInbox} title="Aucune candidature" description="Les dossiers déposés par les candidats sur vos biens apparaissent ici." />} />
    </div>
  )
}
export default ApplicationsList
```

- [ ] **Step 2: `ApplicationDetail.jsx`** (récap + pièces avec valider/refuser + décision accepter/refuser)
```jsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { FiArrowLeft, FiCheck, FiX } from 'react-icons/fi'
import { rentalService } from '../../../services/rentalService'
import { Panel, StatusBadge, DataTable, EmptyState, Modal, Field, PRIMARY_BTN, SECONDARY_BTN } from '../../../components/backoffice/ui'

const DOC_STATUS = {
  received: ['Reçue', 'bg-blue-100 text-blue-700'],
  validated: ['Validée', 'bg-emerald-50 text-emerald-700'],
  rejected: ['Refusée', 'bg-red-100 text-red-700'],
}

function ApplicationDetail() {
  const { id } = useParams()
  const qc = useQueryClient()
  const { data: a, isLoading } = useQuery(['rental-application', id], () => rentalService.getApplication(id))
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')
  const refresh = () => qc.invalidateQueries(['rental-application', id])
  const decide = useMutation((payload) => rentalService.decideApplication(id, payload), {
    onSuccess: () => { toast.success('Décision enregistrée'); setRejectOpen(false); refresh() },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })
  const validateDoc = useMutation(({ docId, status }) => rentalService.validateDocument(id, docId, { status }), {
    onSuccess: () => { toast.success('Pièce mise à jour'); refresh() },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })
  if (isLoading || !a) return <div className="p-6 text-gray-500">Chargement…</div>
  const docs = a.documents || []
  const pending = ['received', 'reviewing'].includes(a.status)
  const docColumns = [
    { header: 'Type', cell: (d) => <span className="text-gray-700">{d.doc_type}</span> },
    { header: 'Fichier', cell: (d) => <span className="text-gray-600">{d.filename || '—'}</span> },
    { header: 'Statut', cell: (d) => <StatusBadge label={DOC_STATUS[d.status]?.[0] || d.status} className={DOC_STATUS[d.status]?.[1]} /> },
    { header: '', align: 'right', cell: (d) => (
      <div className="flex gap-2 justify-end">
        <button onClick={() => validateDoc.mutate({ docId: d.id, status: 'validated' })} className="text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-1"><FiCheck className="w-4 h-4" /> Valider</button>
        <button onClick={() => validateDoc.mutate({ docId: d.id, status: 'rejected' })} className="text-red-600 hover:text-red-700 inline-flex items-center gap-1"><FiX className="w-4 h-4" /> Refuser</button>
      </div>
    ) },
  ]

  return (
    <div className="space-y-6">
      <Link to="/backoffice/gestion-locative/candidatures" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"><FiArrowLeft className="w-4 h-4" /> Retour aux candidatures</Link>
      <Panel title={`Candidature ${a.applicant_name || `#${a.id}`}`} action={pending && <div className="flex gap-2">
        <button disabled={decide.isLoading} onClick={() => decide.mutate({ decision: 'accepted' })} className={PRIMARY_BTN}><FiCheck className="w-5 h-5" /> Accepter</button>
        <button onClick={() => setRejectOpen(true)} className={SECONDARY_BTN}><FiX className="w-5 h-5" /> Refuser</button>
      </div>}>
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div><dt className="text-gray-500">Statut</dt><dd className="mt-1"><StatusBadge label={a.status} /></dd></div>
          <div><dt className="text-gray-500">Email</dt><dd className="mt-1 text-gray-900">{a.applicant_email || '—'}</dd></div>
          <div><dt className="text-gray-500">Téléphone</dt><dd className="mt-1 text-gray-900">{a.applicant_phone || '—'}</dd></div>
          <div><dt className="text-gray-500">Revenu mensuel</dt><dd className="mt-1 text-gray-900">{a.monthly_income != null ? `${a.monthly_income} Đh` : '—'}</dd></div>
          <div><dt className="text-gray-500">Garant</dt><dd className="mt-1 text-gray-900">{a.guarantor_name || '—'}</dd></div>
          <div><dt className="text-gray-500">Bien (ID)</dt><dd className="mt-1 text-gray-900">{a.property_id}</dd></div>
        </dl>
      </Panel>
      <Panel title="Pièces justificatives">
        <DataTable columns={docColumns} rows={docs}
          empty={<EmptyState title="Aucune pièce" description="Le candidat n'a pas encore déposé de pièces." />} />
      </Panel>

      <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} title="Refuser la candidature"
        footer={<>
          <button onClick={() => setRejectOpen(false)} className={SECONDARY_BTN}>Annuler</button>
          <button disabled={decide.isLoading} onClick={() => decide.mutate({ decision: 'rejected', reason })} className={PRIMARY_BTN}>Confirmer le refus</button>
        </>}>
        <Field label="Motif (facultatif, communiqué au candidat)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex. dossier incomplet" />
      </Modal>
    </div>
  )
}
export default ApplicationDetail
```

- [ ] **Step 3: Routes** — dans `App.jsx`, imports :
```jsx
import ApplicationsList from './pages/backoffice/rental/ApplicationsList'
import ApplicationDetail from './pages/backoffice/rental/ApplicationDetail'
```
dans le bloc `gestion-locative` layout ajouter `<Route path="candidatures" element={<ApplicationsList />} />`, puis sibling `<Route path="gestion-locative/candidatures/:id" element={<ApplicationDetail />} />`.

- [ ] **Step 4: Build + Commit** — `cd frontend && npm run build` (doit passer).
```bash
cd /home/younes/Documents/work/0semsar
git add frontend/src/pages/backoffice/rental/ApplicationsList.jsx frontend/src/pages/backoffice/rental/ApplicationDetail.jsx frontend/src/App.jsx
```
```bash
git commit -m "feat(front): gestion locative — candidatures (liste/détail, pièces, décision)"
```

---

### Task 4: Vérification build/charte + documentation

**Files:**
- Modify: `docs/architecture-v2-status.md` (ou `docs/emails/catalogue-emails.md`) — noter l'UI livrée

- [ ] **Step 1: Build complet + lint** — `cd frontend && npm run build` puis `npm run lint` (si présent). Expected : build vert. Corriger toute erreur d'import/JSX/hook.

- [ ] **Step 2: Revue charte (lecture)** — vérifier que **toutes** les pages `frontend/src/pages/backoffice/rental/*` :
  - importent leurs primitives depuis `components/backoffice/ui` (aucun bouton/table/modale réécrit) ;
  - n'utilisent que des classes de tokens (`primary-*`/`emerald-*`/`redcard-*`/`gray-*`), aucune couleur hex en dur ;
  - utilisent `react-icons/fi`, `Đh`, react-query + toasts, `GatedNotice` sur 403 ;
  - respectent le layout à onglets (`RentalLayout`) et les chemins `/backoffice/gestion-locative/*`.

- [ ] **Step 3: Doc** — dans `docs/architecture-v2-status.md`, noter « UI back-office gestion locative livrée (mandats, baux/quittancement, candidatures, CRG) — Phase 5 ». Marquer la Vague 3 complète (backend + UI).

- [ ] **Step 4: Commit**
```bash
cd /home/younes/Documents/work/0semsar
git add docs/architecture-v2-status.md
```
```bash
git commit -m "docs(rental): UI back-office gestion locative livrée (Phase 5)"
```

---

## Self-Review

**Conformité charte (le point clé)** — chaque page réutilise le kit `components/backoffice/ui.jsx` (aucune primitive réécrite), n'emploie que les tokens Tailwind (`primary`/`emerald`/`redcard`/`gray`), `react-icons/fi`, `Đh`, react-query + `react-toastify`, `GatedNotice` sur 403, et le patron de module à onglets (`RentalLayout` calqué sur `ArtisansLayout`). Résultat : indiscernable d'Artisans/Contrats.

**Spec coverage (Phase 5)** — mandats (liste/détail/signature/CRG+PDF), baux (liste/détail/signature/révision/restitution dépôt) + quittancement (échéances/paiement/quittance PDF), candidatures (liste/détail/pièces valider-refuser/décision). Toutes les routes back-office API des Phases 1-4 sont câblées. Hors périmètre (noté) : UI candidat (espace public) et une éventuelle vue CRG dédiée (le CRG est présenté dans le détail mandat).

**Placeholder scan** — aucun « TBD ». Les PDF (quittance/CRG) s'ouvrent via `api.get(url,{responseType:'blob'})` + `window.open` (le back exige le Bearer, un simple `<a href>` ne le porterait pas). Les créations (mandat/bail) demandent des IDs (bien/client) au format numérique — cohérent avec l'état actuel (pas encore d'autocomplete bien/client ; amélioration future notée).

**Type/route consistency** — `rentalService` frappe exactement les chemins livrés (`/backoffice/gestion-locative/...`). Les `:id` de détail sont des routes sœurs du layout (patron `artisans/interventions/:id`). Les statuts (`draft/active/…`, `pending/paid/…`, `received/accepted/…`) correspondent aux valeurs backend.

**Vérification** — pas de navigateur automatisé : la garantie est `npm run build` vert + revue de conformité charte (lecture). Un **smoke test manuel** (naviguer les 3 onglets, créer un mandat, enregistrer un paiement, décider une candidature) est **laissé à l'utilisateur** (mesh + front lancés), comme pour les briques précédentes.

**Améliorations futures notées (hors périmètre)** — autocomplete bien/client (au lieu de saisir des IDs) ; upload de pièces côté candidat (espace public) ; onglet CRG dédié ; pagination si volumétrie.
