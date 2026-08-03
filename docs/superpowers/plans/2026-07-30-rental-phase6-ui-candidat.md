# Gestion locative — Phase 6 (UI candidat, espace public) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner au **candidat connecté** (grand public) l'UI pour postuler à un bien en location depuis la page d'annonce, puis suivre son dossier et **déposer ses pièces (S3)** depuis son espace dashboard.

**Architecture:** React 18 + Vite + react-router-dom 6 + react-query 3 + axios + `react-toastify`. UI côté **public/dashboard** (PAS le back-office). Point d'entrée « Postuler » sur `/annonces/:id` (page `PropertyDetail`, visible pour `transaction_type === 'rent'`, connexion requise). Suivi dans le dashboard : `/dashboard/candidatures` (liste) + `/dashboard/candidatures/:id` (détail + pièces). Données via `rentalService` (méthodes candidat frappant les routes publiques `/gestion-locative/*` déjà livrées en Phase 4).

**Tech Stack:** React 18, react-router-dom 6, react-query 3, axios, react-toastify, react-icons/fi, TailwindCSS 3.

## Global Constraints (CHARTE — public/dashboard)

- **Charte dashboard/publique**, PAS le kit back-office `components/backoffice/ui.jsx`. Suivre le langage visuel des pages existantes `PropertyDetail.jsx` (pour la CTA/formulaire) et `dashboard/MyProperties.jsx` (pour liste/détail) : Tailwind + tokens (`primary-*`, `emerald-*`, `redcard-*`, `gray-*`, `slate-*`), `react-icons/fi`, composants `components/dashboard/*` si pertinents.
- **Devise** : `formatPrice` de `../utils/currency` (convention dashboard) pour les montants, PAS de `Đh` en dur.
- **Données** : react-query (`useQuery`/`useMutation`/`useQueryClient`) via `rentalService` ; toasts `react-toastify` (`toast.error(e.response?.data?.error || 'Erreur')`). Jamais de `fetch` direct.
- **Auth** : `useAuthStore()` (`user`, `isAuthenticated`) depuis `../store/authStore`. La route dashboard est déjà protégée par `PrivateRoute`. Le bouton « Postuler » sur l'annonce publique : si `!isAuthenticated` → rediriger vers `/connexion` (avec retour), sinon ouvrir le formulaire.
- **Upload de pièces** : la route API lit le **corps brut** → envoyer le `File` en binaire : `api.post(url, file, { params: { doc_type, filename: file.name }, headers: { 'Content-Type': file.type || 'application/octet-stream' } })`. PAS de `FormData`. Taille max 10 Mo (le back rejette au-delà). Téléchargement via blob (`api.get(url, { responseType: 'blob' })` + `window.open`).
- **Routes API candidat** (déjà livrées, non gatées, cloisonnées par `applicant_user_id`): `POST /gestion-locative/applications`, `GET /gestion-locative/applications`, `GET /gestion-locative/applications/{id}`, `POST /gestion-locative/applications/{id}/withdraw`, `POST /gestion-locative/applications/{id}/documents`, `GET /gestion-locative/applications/{id}/documents/{docId}`.
- Commits : Conventional Commits, un changement logique par commit, **pas d'attribution IA**. `git commit` = commande bash SEULE. `npm run build` doit passer après chaque tâche.
- **Périmètre** : UI candidat (postuler + suivre + pièces). Pas de refonte de `PropertyDetail` au-delà de l'ajout de la CTA/formulaire.

---

### Task 1: Service candidat + « Postuler » sur la page d'annonce

**Files:**
- Modify: `frontend/src/services/rentalService.js` (méthodes candidat)
- Modify: `frontend/src/pages/PropertyDetail.jsx` (bouton + modale « Postuler » pour les biens en location)

**Interfaces:**
- Produces: `rentalService.submitApplication/uploadApplicationDocument/…`; CTA « Postuler » sur `/annonces/:id`.

- [ ] **Step 1: Méthodes candidat dans `rentalService.js`** — ajouter (le fichier existe déjà, garder les méthodes back-office ; `const B = '/backoffice/gestion-locative'` existe — ajouter un préfixe candidat)
```jsx
const C = '/gestion-locative'
// ... (garder tout l'existant) puis :
export const applicantService = {
  submit: async (data) => (await api.post(`${C}/applications`, data)).data,
  myApplications: async () => (await api.get(`${C}/applications`)).data,
  myApplication: async (id) => (await api.get(`${C}/applications/${id}`)).data,
  withdraw: async (id) => (await api.post(`${C}/applications/${id}/withdraw`)).data,
  uploadDocument: async (appId, file, docType) => (await api.post(
    `${C}/applications/${appId}/documents`, file,
    { params: { doc_type: docType, filename: file.name }, headers: { 'Content-Type': file.type || 'application/octet-stream' } })).data,
  documentUrl: (appId, docId) => `${C}/applications/${appId}/documents/${docId}`,
}
```
(Exporter `applicantService` en plus de `rentalService`.)

- [ ] **Step 2: CTA « Postuler » sur `PropertyDetail.jsx`** — lire d'abord la zone d'actions existante (contact/téléphone) pour aligner le style. `PropertyDetail` a déjà `useAuthStore()` (`user`, `isAuthenticated`), `useNavigate`, react-query, `toast`. Ajouter :
  - un état `const [applyOpen, setApplyOpen] = useState(false)` ;
  - un bouton visible uniquement si `property?.transaction_type === 'rent'`, à côté des CTA existantes (contact/tél), style aligné (classe primaire de la page) :
```jsx
{property.transaction_type === 'rent' && (
  <button
    onClick={() => isAuthenticated ? setApplyOpen(true) : navigate('/connexion', { state: { from: `/annonces/${id}` } })}
    className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700 transition-colors"
  >
    <FiFileText className="w-5 h-5" /> Déposer un dossier de candidature
  </button>
)}
```
  - la modale de candidature (formulaire contrôlé, contact prérempli depuis `user`) — style aligné sur la modale/formulaire de contact déjà présente dans la page :
```jsx
const [applyForm, setApplyForm] = useState({
  applicant_name: '', applicant_email: '', applicant_phone: '',
  monthly_income: '', guarantor_name: '', guarantor_income: '',
})
useEffect(() => {
  if (user) setApplyForm((f) => ({ ...f,
    applicant_name: [user.first_name, user.last_name].filter(Boolean).join(' '),
    applicant_email: user.email || '', applicant_phone: user.phone || '' }))
}, [user])

const applyMut = useMutation(
  () => applicantService.submit({
    property_id: Number(id),
    applicant_name: applyForm.applicant_name, applicant_email: applyForm.applicant_email,
    applicant_phone: applyForm.applicant_phone,
    monthly_income: applyForm.monthly_income ? Number(applyForm.monthly_income) : null,
    guarantor_name: applyForm.guarantor_name || null,
    guarantor_income: applyForm.guarantor_income ? Number(applyForm.guarantor_income) : null,
  }),
  { onSuccess: () => { toast.success('Candidature envoyée — suivez-la dans « Mes candidatures ».'); setApplyOpen(false); navigate('/dashboard/candidatures') },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur') })
```
  Rendre la modale (overlay + panneau blanc, cohérent avec la page) avec les champs `applicant_name/email/phone`, `monthly_income`, `guarantor_name/income`, un bouton Annuler et un bouton « Envoyer ma candidature » (`disabled={applyMut.isLoading}`). Importer `applicantService`, `FiFileText`, `useEffect`, `useNavigate` si absents.

- [ ] **Step 3: Build + vérif** — `cd frontend && npm run build` (doit passer). Vérifier (lecture) que la CTA n'apparaît que pour `transaction_type === 'rent'` et redirige vers `/connexion` si non connecté.

- [ ] **Step 4: Commit**
```bash
cd /home/younes/Documents/work/0semsar
git add frontend/src/services/rentalService.js frontend/src/pages/PropertyDetail.jsx
```
```bash
git commit -m "feat(front): candidat — bouton Postuler + soumission de candidature sur l'annonce en location"
```

---

### Task 2: « Mes candidatures » (liste) dans le dashboard

**Files:**
- Create: `frontend/src/pages/dashboard/MyApplications.jsx`
- Modify: `frontend/src/App.jsx` (route `/dashboard/candidatures`)
- Modify: le nav du dashboard (lien « Mes candidatures ») — lire où sont les liens dashboard (ex. `components/dashboard/*` ou `components/layout/Header.jsx`) et ajouter l'entrée de façon cohérente.

**Interfaces:**
- Produces: page liste `/dashboard/candidatures`.

- [ ] **Step 1: `MyApplications.jsx`** (charte dashboard : react-query + `react-icons/fi` + `formatPrice`)
```jsx
import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import { FiInbox, FiChevronRight } from 'react-icons/fi'
import { applicantService } from '../../services/rentalService'
import { formatPrice } from '../../utils/currency'

const STATUS = {
  received: ['Reçue', 'bg-blue-100 text-blue-700'],
  reviewing: ['En étude', 'bg-amber-100 text-amber-700'],
  accepted: ['Acceptée', 'bg-emerald-100 text-emerald-700'],
  rejected: ['Refusée', 'bg-red-100 text-red-700'],
  withdrawn: ['Retirée', 'bg-gray-100 text-gray-700'],
}

function MyApplications() {
  const { data, isLoading } = useQuery('my-applications', () => applicantService.myApplications())
  const apps = data?.applications || []

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Mes candidatures</h1>
      <p className="text-gray-500 mb-6">Suivez l'état de vos dossiers de location.</p>
      {isLoading ? (
        <div className="text-gray-500">Chargement…</div>
      ) : apps.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <FiInbox className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">Aucune candidature</h3>
          <p className="text-gray-500">Trouvez un bien en location et déposez votre dossier depuis l'annonce.</p>
          <Link to="/annonces?transaction_type=rent" className="inline-block mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">Voir les locations</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {apps.map((a) => (
            <Link key={a.id} to={`/dashboard/candidatures/${a.id}`}
              className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-md transition-shadow">
              <div>
                <p className="font-semibold text-gray-900">Bien #{a.property_id}</p>
                <p className="text-sm text-gray-500">Déposée le {a.submitted_at ? new Date(a.submitted_at).toLocaleDateString('fr-FR') : '—'}{a.monthly_income ? ` · revenus ${formatPrice(a.monthly_income)}` : ''}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${STATUS[a.status]?.[1] || 'bg-gray-100 text-gray-700'}`}>{STATUS[a.status]?.[0] || a.status}</span>
                <FiChevronRight className="w-5 h-5 text-gray-300" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
export default MyApplications
```

- [ ] **Step 2: Route** — dans `App.jsx`, importer `MyApplications` et l'ajouter DANS le bloc `<Route path="dashboard" element={<PrivateRoute />}>` :
```jsx
          <Route path="candidatures" element={<MyApplications />} />
```

- [ ] **Step 3: Lien de nav** — lire le composant de navigation du dashboard (probable `components/layout/Header.jsx` menu utilisateur, ou un nav dashboard) et ajouter un lien « Mes candidatures » → `/dashboard/candidatures` de façon cohérente avec les liens existants (ex. « Mes annonces »). Si aucun nav dashboard clair n'existe, ajouter au minimum une carte/lien depuis la page `dashboard` d'accueil.

- [ ] **Step 4: Build + Commit** — `cd frontend && npm run build`.
```bash
cd /home/younes/Documents/work/0semsar
git add frontend/src/pages/dashboard/MyApplications.jsx frontend/src/App.jsx
```
(+ le fichier de nav modifié)
```bash
git commit -m "feat(front): candidat — page Mes candidatures (liste + suivi de statut)"
```

---

### Task 3: Détail candidature + pièces justificatives (upload S3)

**Files:**
- Create: `frontend/src/pages/dashboard/MyApplicationDetail.jsx`
- Modify: `frontend/src/App.jsx` (route `/dashboard/candidatures/:id`)

**Interfaces:**
- Produces: page détail `/dashboard/candidatures/:id` (statut, bien, pièces upload/téléchargement, retrait).

- [ ] **Step 1: `MyApplicationDetail.jsx`**
```jsx
import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { FiArrowLeft, FiUploadCloud, FiDownload, FiFile } from 'react-icons/fi'
import api from '../../services/api'
import { applicantService } from '../../services/rentalService'

const STATUS = {
  received: ['Reçue', 'bg-blue-100 text-blue-700'],
  reviewing: ['En étude', 'bg-amber-100 text-amber-700'],
  accepted: ['Acceptée', 'bg-emerald-100 text-emerald-700'],
  rejected: ['Refusée', 'bg-red-100 text-red-700'],
  withdrawn: ['Retirée', 'bg-gray-100 text-gray-700'],
}
const DOC_STATUS = {
  received: ['Reçue', 'bg-blue-100 text-blue-700'],
  validated: ['Validée', 'bg-emerald-100 text-emerald-700'],
  rejected: ['Refusée', 'bg-red-100 text-red-700'],
}
const DOC_TYPES = [
  ['cin', "Pièce d'identité (CIN)"], ['bulletin_salaire', 'Bulletin de salaire'],
  ['contrat_travail', 'Contrat de travail'], ['avis_impot', "Avis d'imposition"],
  ['garant', 'Pièce du garant'], ['autre', 'Autre'],
]

async function openDoc(url) {
  try { const res = await api.get(url, { responseType: 'blob' }); window.open(URL.createObjectURL(res.data), '_blank') }
  catch { toast.error('Fichier indisponible') }
}

function MyApplicationDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const fileRef = useRef(null)
  const [docType, setDocType] = useState('cin')
  const { data: a, isLoading } = useQuery(['my-application', id], () => applicantService.myApplication(id))

  const upload = useMutation((file) => applicantService.uploadDocument(id, file, docType), {
    onSuccess: () => { toast.success('Pièce ajoutée'); qc.invalidateQueries(['my-application', id]) },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })
  const withdraw = useMutation(() => applicantService.withdraw(id), {
    onSuccess: () => { toast.success('Candidature retirée'); navigate('/dashboard/candidatures') },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })

  if (isLoading) return <div className="max-w-3xl mx-auto px-4 py-8 text-gray-500">Chargement…</div>
  if (!a) return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link to="/dashboard/candidatures" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"><FiArrowLeft className="w-4 h-4" /> Retour</Link>
      <p className="mt-4 text-gray-500">Candidature introuvable.</p>
    </div>
  )
  const docs = a.documents || []
  const canEdit = ['received', 'reviewing'].includes(a.status)
  const onPick = (e) => { const f = e.target.files?.[0]; if (f) { if (f.size > 10 * 1024 * 1024) return toast.error('Fichier trop volumineux (max 10 Mo).'); upload.mutate(f) } e.target.value = '' }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <Link to="/dashboard/candidatures" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"><FiArrowLeft className="w-4 h-4" /> Mes candidatures</Link>

      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Candidature — bien #{a.property_id}</h1>
            <p className="text-sm text-gray-500 mt-1">Déposée le {a.submitted_at ? new Date(a.submitted_at).toLocaleDateString('fr-FR') : '—'}</p>
          </div>
          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${STATUS[a.status]?.[1] || 'bg-gray-100 text-gray-700'}`}>{STATUS[a.status]?.[0] || a.status}</span>
        </div>
        {a.status === 'rejected' && a.decision_reason && <p className="mt-3 text-sm text-red-700">Motif : {a.decision_reason}</p>}
        {a.status === 'accepted' && <p className="mt-3 text-sm text-emerald-700">Félicitations, votre dossier a été retenu — l'agence vous recontactera.</p>}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Pièces justificatives</h2>
          {canEdit && (
            <div className="flex items-center gap-2">
              <select value={docType} onChange={(e) => setDocType(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
                {DOC_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <button disabled={upload.isLoading} onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
                <FiUploadCloud className="w-4 h-4" /> Ajouter
              </button>
              <input ref={fileRef} type="file" className="hidden" onChange={onPick} />
            </div>
          )}
        </div>
        {docs.length === 0 ? (
          <p className="text-gray-500 text-sm">Aucune pièce déposée. Ajoutez vos justificatifs (CIN, revenus, garant…).</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center justify-between py-3">
                <span className="inline-flex items-center gap-2 text-gray-800"><FiFile className="w-4 h-4 text-gray-400" /> {(DOC_TYPES.find(([v]) => v === d.doc_type)?.[1]) || d.doc_type} <span className="text-gray-400 text-sm">— {d.filename}</span></span>
                <div className="flex items-center gap-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${DOC_STATUS[d.status]?.[1] || 'bg-gray-100 text-gray-700'}`}>{DOC_STATUS[d.status]?.[0] || d.status}</span>
                  <button onClick={() => openDoc(applicantService.documentUrl(id, d.id))} className="text-primary-600 hover:text-primary-700 inline-flex items-center gap-1"><FiDownload className="w-4 h-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {canEdit && (
        <button onClick={() => withdraw.mutate()} disabled={withdraw.isLoading} className="text-sm text-red-600 hover:text-red-700">Retirer ma candidature</button>
      )}
    </div>
  )
}
export default MyApplicationDetail
```

- [ ] **Step 2: Route** — dans `App.jsx`, importer `MyApplicationDetail` et ajouter dans le bloc dashboard :
```jsx
          <Route path="candidatures/:id" element={<MyApplicationDetail />} />
```

- [ ] **Step 3: Build + vérif upload** — `cd frontend && npm run build`. Test manuel (mesh + front up) : depuis une candidature reçue, ajouter une pièce (upload) → apparaît « Reçue » ; la télécharger.

- [ ] **Step 4: Commit**
```bash
cd /home/younes/Documents/work/0semsar
git add frontend/src/pages/dashboard/MyApplicationDetail.jsx frontend/src/App.jsx
```
```bash
git commit -m "feat(front): candidat — détail candidature + dépôt/téléchargement des pièces (S3) + retrait"
```

---

### Task 4: Vérification + documentation

**Files:**
- Modify: `docs/emails/catalogue-emails.md` ou `docs/architecture-v2-status.md`

- [ ] **Step 1: Build complet** — `cd frontend && npm run build` (vert). Vérifier (lecture) que les nouvelles pages n'utilisent aucune couleur hex en dur (`grep -rnE "#[0-9a-fA-F]{3,6}" frontend/src/pages/dashboard/MyApplication*.jsx` → rien) et que `formatPrice` est utilisé pour les montants.

- [ ] **Step 2: Test de bout en bout (manuel, laissé à l'utilisateur)** — connecté en particulier (`demo@semsarout.ma`), ouvrir une annonce en **location** → « Déposer un dossier » → formulaire → envoi → « Mes candidatures » → détail → ajouter une pièce → l'agence (agent1@immo-casa-premium.ma) la voit et décide → le statut bascule côté candidat. Documenter ce parcours dans le doc.

- [ ] **Step 3: Doc** — noter la Vague 3 complète **backend + UI agence + UI candidat**. Dans `docs/emails/catalogue-emails.md` §2, préciser que le dépôt/suivi candidat est livré côté UI.

- [ ] **Step 4: Commit**
```bash
cd /home/younes/Documents/work/0semsar
git add docs/emails/catalogue-emails.md
```
```bash
git commit -m "docs(rental): UI candidat livrée (postuler + suivi + pièces) — Vague 3 complète"
```

---

## Self-Review

**Charte (public/dashboard)** — les pages candidat suivent le langage des pages publiques/dashboard existantes (Tailwind + tokens, `react-icons/fi`, `formatPrice`, react-query + toasts, `useAuthStore`), et NON le kit back-office. La CTA « Postuler » s'aligne sur les actions existantes de `PropertyDetail`.

**Spec coverage (Phase 6)** — point d'entrée « Postuler » sur `/annonces/:id` pour les biens `transaction_type === 'rent'` (T1) ; liste « Mes candidatures » (T2) ; détail + pièces S3 (upload binaire + téléchargement blob) + retrait (T3) ; vérif + doc (T4). Toutes les routes API candidat de la Phase 4 sont câblées.

**Type/route consistency** — `applicantService` frappe exactement les routes publiques `/gestion-locative/applications*`. L'upload envoie le `File` brut avec `?doc_type=&filename=` (le back lit `request.body()`), pas de `FormData`. Le téléchargement passe par blob (le back exige le Bearer). Les statuts (received/reviewing/accepted/rejected/withdrawn ; doc received/validated/rejected) correspondent au back.

**Sécurité/accès** — routes candidat protégées par `PrivateRoute` (dashboard) ; la CTA publique redirige vers `/connexion` si non connecté. Le back cloisonne déjà par `applicant_user_id` (le candidat ne voit que ses dossiers) et strippe les en-têtes `x-semsar-*` au BFF.

**Vérification** — `npm run build` vert + revue de charte (lecture) ; le test navigateur (postuler → suivre → pièce → décision agence) est **laissé à l'utilisateur** (comme les phases précédentes). Le mesh + le front doivent tourner ; l'agent1 (agence 1) valide/décide côté back-office pour fermer la boucle.

**Note d'exécution** — T1 modifie une page publique volumineuse (`PropertyDetail.jsx`) : lire la zone d'actions/contact existante AVANT d'insérer la CTA/modale, pour aligner exactement le style. T2 doit repérer le nav dashboard pour placer le lien « Mes candidatures » ; si absent, fallback carte sur l'accueil dashboard. `PropertyDetail.jsx` peut porter des changements non commités pré-existants — ne stager que les ajouts candidat.
