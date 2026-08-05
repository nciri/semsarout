# Programme — Livrable 1 (type → détails + specs) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La typologie du programme (multi-select) pilote les champs de l'étape Détails et du formulaire d'unité, persistés via une colonne JSON `specs` (backend), avec réordonnancement des étapes.

**Architecture:** Backend `services/programs` : colonne `specs` (JSON) sur `program` et `program_unit` + create/update/serializers. Frontend `ProgramForm.jsx` : config-driven — un module de config des champs par typologie/type d'unité + un composant `SpecFields` réutilisable ; typologie multi-select en tête de l'étape « Types de biens » (déplacée avant « Détails ») ; sections Détails et champs d'unité rendus à partir de la config.

**Tech Stack:** FastAPI + SQLAlchemy (backend), React 18 + Tailwind (frontend). Pas d'ORM migration framework (tables via `create_all`) → `ALTER TABLE` manuel.

## Global Constraints

- Français codé en dur (branche sans i18n). `npm run build` vert (frontend). Aucun test frontend sur cette branche → build + revue.
- **`services/programs` n'a AUCUN test** → vérification backend par round-trip API (curl) contre le service local.
- Persistance : colonne JSON `specs` sur `program` ET `program_unit`. Compat ascendante : `specs` nullable ; programmes/unités sans `specs` fonctionnent (sections vides).
- Suivre les patterns existants (helpers backend `to_number`, `_prog_dict`/`_unit_dict`, `_PROG_UPDATABLE`/`_UNIT_FIELDS` ; frontend Tailwind, `formData`/`setFormData`).
- Répertoire : `frontend/` et `services/programs/`. Branche : `feature/program-form-ameliorations`.

---

## File Structure

- **Backend** `services/programs/app/models.py` : `Program.specs`, `ProgramUnit.specs` (JSON).
- **Backend** `services/programs/app/main.py` : create_program, `_PROG_UPDATABLE`, add_unit, `_UNIT_FIELDS`, `_prog_dict`, `_unit_dict`.
- **Backend** DB : `ALTER TABLE program ADD COLUMN specs JSON; ALTER TABLE program_unit ADD COLUMN specs JSON;` (semsar_dev local).
- **Frontend (create)** `frontend/src/pages/dashboard/programSpecsConfig.js` : `TYPOLOGY_OPTIONS`, `UNIT_TYPES_BY_TYPOLOGY`, `DETAIL_SECTIONS`, `UNIT_SPEC_FIELDS`, `UNIT_HIDE_ROOMS`, `unitTypesForTypology()`.
- **Frontend (create)** `frontend/src/components/common/SpecFields.jsx` : rendu générique d'une liste de champs.
- **Frontend (modify)** `frontend/src/pages/dashboard/ProgramForm.jsx` : `STEPS`, `UNIT_TYPES`, `formData` (default + load + payload), l'étape « Types de biens » (typologie + filtrage), l'étape « Détails » (sections), `UnitForm`.

---

## Task 1: Backend — colonne `specs` (program + program_unit)

**Files:**
- Modify: `services/programs/app/models.py`, `services/programs/app/main.py`
- DB: `ALTER TABLE … ADD COLUMN specs JSON`

**Interfaces:**
- Produces : les endpoints programme (POST `/programs`, PUT `/programs/{id}`) et unité (POST `/programs/{id}/units`, PUT `/programs/{id}/units/{uid}`) acceptent et renvoient `specs` (objet JSON).

- [ ] **Step 1: Ajouter la colonne au modèle**

Modify `services/programs/app/models.py` :
- Dans `class Program`, après `amenities = Column(JSON)` : `specs = Column(JSON)`.
- Dans `class ProgramUnit`, après `features = Column(JSON)` : `specs = Column(JSON)`.

- [ ] **Step 2: Appliquer l'ALTER TABLE sur semsar_dev**

Run:
```bash
psql "postgresql://postgres:postgres@localhost:5432/semsar_dev" -c "ALTER TABLE programs.program ADD COLUMN IF NOT EXISTS specs JSON; ALTER TABLE programs.program_unit ADD COLUMN IF NOT EXISTS specs JSON;"
```
Expected: `ALTER TABLE` ×2. (Le schéma PostgreSQL du service programs est `programs`. Si le nom de schéma diffère, l'ajuster ; vérifier via `\dn`.)

- [ ] **Step 3: create_program accepte `specs`**

Modify `services/programs/app/main.py` — dans `create_program`, ajouter au constructeur `Program(...)` (après `video_url=...`) :

```python
        specs=data.get("specs"),
```

- [ ] **Step 4: update_program accepte `specs`**

Modify `_PROG_UPDATABLE` (liste) — ajouter `"specs"` :

```python
_PROG_UPDATABLE = ["name", "description", "program_type", "address", "city", "neighborhood",
                   "latitude", "longitude", "total_units", "available_units", "min_price",
                   "max_price", "construction_status", "amenities", "specs", "cover_image_url",
                   "brochure_url", "video_url", "status"]
```

- [ ] **Step 5: add_unit accepte `specs`**

Modify `add_unit` — dans le constructeur `ProgramUnit(...)`, après `features=...` :

```python
        specs=data.get("specs"),
```

- [ ] **Step 6: update_unit accepte `specs`**

Trouver la constante `_UNIT_FIELDS` (liste utilisée par `update_unit`) et y ajouter `"specs"` (non numérique). `update_unit` fait `setattr(u, f, to_number(...) if f in NUMERIC_UNIT_FIELDS else data[f])` → `specs` non listé dans `NUMERIC_UNIT_FIELDS` sera posé tel quel. Vérifier que `"specs"` n'est PAS dans `NUMERIC_UNIT_FIELDS`.

- [ ] **Step 7: Sérialiseurs renvoient `specs`**

Modify `_unit_dict` — ajouter `"specs": u.specs,` au dict. Modify `_prog_dict` — ajouter `"specs": p.specs,` au dict.

- [ ] **Step 8: Redémarrer le service programs + vérifier le round-trip**

Redémarrer le service programs (port depuis dev-mesh ; programs = 8516). Puis (avec un token d'agence, ex. `admin@local.test`/`admin1234`) créer/mettre à jour un programme avec `specs` et vérifier qu'il est renvoyé :
```bash
# (adapter le token). Exemple minimal :
TOK=... ; curl -s -X PUT http://localhost:8099/api/v1/programs/<ID> -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d '{"specs":{"typology":["villas"],"villas":{"has_pool":true}}}' | python3 -c "import sys,json;print(json.load(sys.stdin)['program'].get('specs'))"
```
Expected: le `specs` renvoyé contient `{"typology":["villas"],"villas":{"has_pool":true}}`. Idem pour une unité (POST/PUT units avec `specs`).

- [ ] **Step 9: Commit**

```bash
git add services/programs/app/models.py services/programs/app/main.py
git commit -m "feat(programs): colonne specs (JSON) sur program + program_unit (create/update/serializers)"
```

---

## Task 2: Frontend — config des champs + composant `SpecFields` + branchement `specs`

**Files:**
- Create: `frontend/src/pages/dashboard/programSpecsConfig.js`, `frontend/src/components/common/SpecFields.jsx`
- Modify: `frontend/src/pages/dashboard/ProgramForm.jsx` (formData default + load + payload ; ajout `land` aux `UNIT_TYPES`)

**Interfaces:**
- Produces : `TYPOLOGY_OPTIONS`, `DETAIL_SECTIONS`, `UNIT_SPEC_FIELDS`, `UNIT_HIDE_ROOMS`, `unitTypesForTypology(typology[])` ; `<SpecFields fields values onChange />`.

- [ ] **Step 1: Créer le module de config**

Create `frontend/src/pages/dashboard/programSpecsConfig.js` :

```js
export const TYPOLOGY_OPTIONS = [
  { value: 'apartments', label: 'Appartements' },
  { value: 'villas', label: 'Villas' },
  { value: 'land', label: 'Terrains' },
  { value: 'commercial', label: 'Commercial' },
]

// Types d'unité proposés par typologie (union quand plusieurs cochées).
export const UNIT_TYPES_BY_TYPOLOGY = {
  apartments: ['studio', 'apartment', 'duplex', 'penthouse'],
  villas: ['villa', 'duplex'],
  land: ['land'],
  commercial: ['commercial'],
}

export const unitTypesForTypology = (typology = []) => {
  const set = new Set()
  typology.forEach(t => (UNIT_TYPES_BY_TYPOLOGY[t] || []).forEach(u => set.add(u)))
  return [...set]
}

// Champs de l'étape Détails par typologie → formData.specs[typology].
export const DETAIL_SECTIONS = {
  apartments: { label: 'Appartements', fields: [
    { key: 'buildings_count', label: 'Nombre de bâtiments', type: 'number' },
    { key: 'floors_count', label: "Nombre d'étages", type: 'number' },
    { key: 'has_elevator', label: 'Ascenseur', type: 'bool' },
    { key: 'monthly_charges', label: 'Charges/syndic estimées (Đh/mois)', type: 'number' },
  ] },
  villas: { label: 'Villas', fields: [
    { key: 'land_surface_min', label: 'Superficie terrain min (m²)', type: 'number' },
    { key: 'land_surface_max', label: 'Superficie terrain max (m²)', type: 'number' },
    { key: 'levels', label: 'Niveaux (ex. R+1)', type: 'text' },
    { key: 'style', label: 'Style architectural', type: 'text' },
    { key: 'has_garage', label: 'Garage', type: 'bool' },
    { key: 'has_pool', label: 'Piscine', type: 'bool' },
  ] },
  land: { label: 'Terrains', fields: [
    { key: 'serviced_water', label: 'Eau', type: 'bool' },
    { key: 'serviced_electricity', label: 'Électricité', type: 'bool' },
    { key: 'serviced_sewage', label: 'Assainissement', type: 'bool' },
    { key: 'serviced_road', label: 'Voirie', type: 'bool' },
    { key: 'title_type', label: 'Type de titre foncier', type: 'text' },
    { key: 'buildability', label: 'Constructibilité (COS/CUS ou R+n)', type: 'text' },
    { key: 'subdivision_allowed', label: 'Lotissement autorisé', type: 'bool' },
  ] },
  commercial: { label: 'Commercial', fields: [
    { key: 'local_type', label: 'Type de local', type: 'select', options: [
      { value: 'office', label: 'Bureau' }, { value: 'shop', label: 'Commerce' }, { value: 'warehouse', label: 'Entrepôt' },
    ] },
    { key: 'allowed_use', label: 'Usage autorisé', type: 'text' },
    { key: 'standing', label: 'Standing', type: 'text' },
  ] },
}

const APARTMENT_UNIT_FIELDS = [
  { key: 'floor', label: 'Étage', type: 'number' },
  { key: 'orientation', label: 'Orientation', type: 'text' },
  { key: 'has_balcony', label: 'Balcon', type: 'bool' },
  { key: 'has_terrace', label: 'Terrasse', type: 'bool' },
]

// Champs specs par type d'unité → unit.specs.
export const UNIT_SPEC_FIELDS = {
  studio: APARTMENT_UNIT_FIELDS,
  apartment: APARTMENT_UNIT_FIELDS,
  duplex: APARTMENT_UNIT_FIELDS,
  penthouse: APARTMENT_UNIT_FIELDS,
  villa: [
    { key: 'land_surface', label: 'Superficie terrain (m²)', type: 'number' },
    { key: 'living_surface', label: 'Superficie habitable (m²)', type: 'number' },
    { key: 'levels', label: 'Niveaux', type: 'text' },
    { key: 'has_garden', label: 'Jardin', type: 'bool' },
    { key: 'has_pool', label: 'Piscine', type: 'bool' },
    { key: 'garage_spots', label: 'Places de garage', type: 'number' },
  ],
  land: [
    { key: 'lot_surface', label: 'Superficie lot (m²)', type: 'number' },
    { key: 'price_per_sqm', label: 'Prix/m² (Đh)', type: 'number' },
    { key: 'frontage', label: 'Façade (ml)', type: 'number' },
    { key: 'buildable', label: 'Constructible', type: 'bool' },
    { key: 'shape', label: 'Forme', type: 'text' },
  ],
  commercial: [
    { key: 'floor', label: 'Étage', type: 'number' },
    { key: 'allowed_use', label: 'Usage', type: 'text' },
  ],
}

// Types d'unité pour lesquels on masque pièces/chambres/sdb.
export const UNIT_HIDE_ROOMS = ['land']
```

- [ ] **Step 2: Créer le composant `SpecFields`**

Create `frontend/src/components/common/SpecFields.jsx` :

```jsx
// Rendu générique d'un groupe de champs specs (number / text / bool / select),
// contrôlé : `values` (objet) + `onChange(nextValues)`.
export default function SpecFields({ fields, values = {}, onChange }) {
  const set = (key, v) => onChange({ ...values, [key]: v })
  const ctrl = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent'
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {fields.map((f) => (
        <div key={f.key} className={f.type === 'bool' ? 'flex items-center gap-2' : ''}>
          {f.type === 'bool' ? (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={!!values[f.key]}
                onChange={(e) => set(f.key, e.target.checked)} className="w-4 h-4 text-primary-600 rounded" />
              {f.label}
            </label>
          ) : f.type === 'select' ? (
            <>
              <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
              <select value={values[f.key] || ''} onChange={(e) => set(f.key, e.target.value)} className={ctrl}>
                <option value="">—</option>
                {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </>
          ) : (
            <>
              <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
              <input type={f.type === 'number' ? 'number' : 'text'} value={values[f.key] ?? ''}
                onChange={(e) => set(f.key, e.target.value)} className={ctrl} />
            </>
          )}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Ajouter `land` aux `UNIT_TYPES` de ProgramForm**

Modify `frontend/src/pages/dashboard/ProgramForm.jsx` — dans `UNIT_TYPES`, ajouter (avant `commercial`) :

```js
  { value: 'land', label: 'Terrain' },
```

- [ ] **Step 4: `specs` dans le formData programme (default + load) + payload**

Modify `ProgramForm.jsx` :
- Dans le `useState({...})` du formData programme (défaut) : ajouter `specs: {},` (après `video_url: ''`).
- Dans le `onSuccess` de `useQuery` (chargement édition) : ajouter `specs: data.specs || {},`.
- S'assurer que `formData` (incluant `specs`) est bien envoyé au backend par `createMutation`/`updateMutation`. Repérer l'appel `.mutate(...)` de création/mise à jour du programme : le payload doit inclure `specs: formData.specs`. Si le payload est construit explicitement (objet dédié), y ajouter `specs: formData.specs` ; s'il envoie `formData` tel quel, `specs` est déjà inclus.

- [ ] **Step 5: Vérifier le build**

Run: `cd frontend && npm run build`  → `✓ built`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/dashboard/programSpecsConfig.js frontend/src/components/common/SpecFields.jsx frontend/src/pages/dashboard/ProgramForm.jsx
git commit -m "feat(program-form): config specs + composant SpecFields + branchement specs programme"
```

---

## Task 3: Réordonnancement des étapes + typologie multi-select + filtrage des types d'unité

**Files:**
- Modify: `frontend/src/pages/dashboard/ProgramForm.jsx`

**Interfaces:**
- Consumes : `TYPOLOGY_OPTIONS`, `unitTypesForTypology` (Task 2).

- [ ] **Step 1: Réordonner `STEPS` (Types de biens avant Détails)**

Modify `STEPS` :

```js
const STEPS = [
  { id: 1, title: 'Informations', icon: FiFile },
  { id: 2, title: 'Localisation', icon: FiMapPin },
  { id: 3, title: 'Types de biens', icon: FiPlus },
  { id: 4, title: 'Détails', icon: FiHome },
  { id: 5, title: 'Médias', icon: FiImage },
]
```

Puis **inverser les blocs de rendu** correspondants : le bloc rendu à l'étape « Détails » (aujourd'hui `currentStep === 3`) doit maintenant s'afficher à `currentStep === 4`, et le bloc « Types de biens » (aujourd'hui `currentStep === 4`) à `currentStep === 3`. Repérer les conditions de rendu par étape (`currentStep === 3` / `=== 4`) et échanger leurs numéros. Vérifier qu'aucune autre logique ne dépend en dur de ces numéros (ex. sauvegarde d'unités liée à une étape).

- [ ] **Step 2: Ajouter le sélecteur de typologie en tête de l'étape « Types de biens »**

Import en tête de fichier : `import { TYPOLOGY_OPTIONS, unitTypesForTypology } from './programSpecsConfig'`.

Au début du bloc de rendu de l'étape « Types de biens » (avant la liste des unités / le bouton d'ajout), insérer les cases à cocher de typologie liées à `formData.specs.typology` :

```jsx
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Typologie du programme *</label>
                <div className="flex flex-wrap gap-2">
                  {TYPOLOGY_OPTIONS.map((opt) => {
                    const selected = (formData.specs?.typology || []).includes(opt.value)
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          const cur = formData.specs?.typology || []
                          const next = selected ? cur.filter((t) => t !== opt.value) : [...cur, opt.value]
                          setFormData({ ...formData, specs: { ...formData.specs, typology: next } })
                        }}
                        className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                          selected ? 'bg-primary-100 text-primary-700 border-primary-300' : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-gray-400 mt-1">Détermine les détails du programme et les types d'unité disponibles.</p>
              </div>
```

- [ ] **Step 3: Filtrer les types d'unité de `UnitForm` selon la typologie**

Passer à `UnitForm` la liste des types autorisés : calculer `const allowedUnitTypes = unitTypesForTypology(formData.specs?.typology || [])` dans le composant parent, et le transmettre en prop `allowedTypes` à `<UnitForm ... allowedTypes={allowedUnitTypes} />` (aux deux endroits où `UnitForm` est rendu : ajout et édition). Dans `UnitForm`, le `<select>` du `unit_type` filtre `UNIT_TYPES` : `const types = (allowedTypes && allowedTypes.length) ? UNIT_TYPES.filter(t => allowedTypes.includes(t.value)) : UNIT_TYPES`. Utiliser `types` dans le `.map`. Si `unit_type` courant n'est pas dans `types`, laisser tel quel (édition d'une unité existante).

- [ ] **Step 4: Vérifier le build**

Run: `cd frontend && npm run build`  → `✓ built`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/dashboard/ProgramForm.jsx
git commit -m "feat(program-form): reordonnancement etapes + typologie multi-select + filtrage types d'unite"
```

---

## Task 4: Étape Détails — sections adaptatives par typologie

**Files:**
- Modify: `frontend/src/pages/dashboard/ProgramForm.jsx`

**Interfaces:**
- Consumes : `DETAIL_SECTIONS` (config), `SpecFields` (composant).

- [ ] **Step 1: Rendre une section `SpecFields` par typologie cochée**

Imports : `import SpecFields from '../../components/common/SpecFields'` et compléter l'import config avec `DETAIL_SECTIONS`.

Dans le bloc de rendu de l'étape « Détails » (après les champs génériques existants — statut, livraison, équipements), ajouter :

```jsx
              {(formData.specs?.typology || []).map((typ) => {
                const section = DETAIL_SECTIONS[typ]
                if (!section) return null
                return (
                  <div key={typ} className="border-t border-gray-100 pt-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">{section.label}</h3>
                    <SpecFields
                      fields={section.fields}
                      values={formData.specs?.[typ] || {}}
                      onChange={(vals) => setFormData({ ...formData, specs: { ...formData.specs, [typ]: vals } })}
                    />
                  </div>
                )
              })}
              {(!formData.specs?.typology || formData.specs.typology.length === 0) && (
                <p className="text-sm text-gray-400">Sélectionnez une typologie à l'étape « Types de biens » pour afficher les détails spécifiques.</p>
              )}
```

- [ ] **Step 2: Vérifier le build**

Run: `cd frontend && npm run build`  → `✓ built`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/dashboard/ProgramForm.jsx
git commit -m "feat(program-form): etape Details adaptative (sections par typologie)"
```

---

## Task 5: `UnitForm` — champs adaptatifs par type d'unité + masquage terrain + specs unité

**Files:**
- Modify: `frontend/src/pages/dashboard/ProgramForm.jsx`

**Interfaces:**
- Consumes : `UNIT_SPEC_FIELDS`, `UNIT_HIDE_ROOMS` (config), `SpecFields`.

- [ ] **Step 1: Étendre l'état `UnitForm` avec `specs` + masquer pièces pour terrain**

Modify le composant `UnitForm` :
- Import config : `import { UNIT_TYPES_BY_TYPOLOGY, UNIT_SPEC_FIELDS, UNIT_HIDE_ROOMS } from './programSpecsConfig'` (déjà partiellement importé). Import `SpecFields`.
- Le state initial `formData` de `UnitForm` (l.92) : ajouter `specs: unit?.specs || {}`.
- Calculer `const hideRooms = UNIT_HIDE_ROOMS.includes(formData.unit_type)`.
- Entourer les champs `rooms`/`bedrooms`/`bathrooms` d'une condition `{!hideRooms && ( … )}` (ne pas les afficher pour un terrain).

- [ ] **Step 2: Rendre les champs specs de l'unité**

Après les champs génériques (surface/prix/stock), avant les boutons du formulaire d'unité, ajouter :

```jsx
      {(UNIT_SPEC_FIELDS[formData.unit_type] || []).length > 0 && (
        <div className="border-t border-gray-200 pt-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Caractéristiques</h4>
          <SpecFields
            fields={UNIT_SPEC_FIELDS[formData.unit_type] || []}
            values={formData.specs || {}}
            onChange={(vals) => setFormData({ ...formData, specs: vals })}
          />
        </div>
      )}
```

- [ ] **Step 3: Inclure `specs` dans le payload d'unité**

`UnitForm.handleSubmit` appelle `onSave(formData)` : `formData.specs` est donc transmis. Vérifier que le parent (`addUnitMutation`/`updateUnitMutation`) envoie l'objet reçu tel quel (il contient `specs`). Si le parent reconstruit un payload d'unité, y ajouter `specs: data.specs`.

- [ ] **Step 4: Vérifier le build**

Run: `cd frontend && npm run build`  → `✓ built`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/dashboard/ProgramForm.jsx
git commit -m "feat(program-form): UnitForm adaptatif par type (specs unite + masquage terrain)"
```

---

## Validation finale du livrable 1

- [ ] Backend : round-trip `specs` OK sur programme et unité (curl).
- [ ] `cd frontend && npm run build` → `✓ built`.
- [ ] Manuel : créer/éditer un programme → étape « Types de biens » avant « Détails » ; cocher « Villas » + « Terrains » → l'étape Détails montre les 2 sections ; le formulaire d'unité propose villa+terrain, adapte ses champs, masque pièces/chambres pour un terrain ; enregistrer puis rouvrir → les `specs` sont bien rechargés.
