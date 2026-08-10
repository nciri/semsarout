# Charges de copropriété + Đh + Déposer une annonce — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter les charges de copropriété (vente + location, masquées pour terrain) dans semsarout et m3a-l3achrane, aligner la devise m3a sur `Đh`, et créer l'écran « Déposer une annonce » (wizard) dans m3a.

**Architecture:** Colonnes dédiées `is_condo`/`condo_fees` (semsarout `Property`, coloc `Listing`), exposées par `to_dict`. Saisie via formulaires semsarout (composant partagé) et via un wizard m3a qui orchestre le cycle backend existant `POST /listings` → `/media` → `/submit`. Affichage sur les pages détail et la carte m3a (« +cc »). Devise m3a : `Đh` au lieu de `MAD` (affichage seul).

**Tech Stack:** Flask + SQLAlchemy (monolithe semsarout), FastAPI + SQLAlchemy + Pydantic (coloc-listing), React + Vite (frontend/ et frontend-m3a-l3achrane/), Vitest (frontend/), `node --test` (m3a), pytest (backends).

## Global Constraints

- Devise affichée m3a : `Đh` (symbole `frontend/src/utils/currency.js` côté semsarout). Le champ ISO `currency: 'MAD'` en données reste inchangé.
- Nommage colonnes : `is_condo` (BOOLEAN) + `condo_fees` (NUMERIC). Distincts des charges locatives coloc `charges_included`/`charges_amount` (non modifiés).
- Terrain = `property_type === 'land'` (semsarout uniquement ; coloc n'a pas de terrain). Sur terrain : bloc masqué, backend force `is_condo=false`/`condo_fees=null`.
- `is_condo` coché par défaut sur les biens non-terrain. Montant `condo_fees` optionnel (pas de champ requis).
- m3a `housing_gender` : `MIXTE_FAMILIAL` interdit (refusé serveur) → seulement `FEMININ`/`MASCULIN`.
- i18n : parité FR/AR obligatoire dans les deux apps (tests de parité existants).
- Gate par app : `lint` + `test` + `build` verts (frontends) ; `pytest` vert (backends).
- Commits : Conventional Commits, pas d'attribution IA.

---

## LOT 1 — Devise m3a : `MAD` → `Đh`

### Task 1.1: Formateur `formatMad` → `Đh`

**Files:**
- Modify: `frontend-m3a-l3achrane/src/lib/format.js`
- Test: `frontend-m3a-l3achrane/src/lib/format.test.mjs`

- [ ] **Step 1: Mettre à jour les assertions du test (rouge d'abord)**

Dans `format.test.mjs`, remplacer `MAD` par `Đh` dans les attendus :
```js
assert.equal(formatMad(2300), `2${NB}300${NB}Đh${NB}/mois`)
assert.equal(formatMad(950), `950${NB}Đh${NB}/mois`)
assert.equal(formatMad(12000), `12${NB}000${NB}Đh${NB}/mois`)
assert.equal(formatMad(2300, { suffix: false }), `2${NB}300${NB}Đh`)
```

- [ ] **Step 2: Lancer le test → échec**

Run: `cd frontend-m3a-l3achrane && node --test src/lib/format.test.mjs`
Expected: FAIL (attendu `Đh`, obtenu `MAD`).

- [ ] **Step 3: Corriger le formateur**

Dans `format.js`, ligne 5 :
```js
const base = `${grouped}${NB}Đh`
```

- [ ] **Step 4: Lancer le test → succès**

Run: `cd frontend-m3a-l3achrane && node --test src/lib/format.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend-m3a-l3achrane/src/lib/format.js frontend-m3a-l3achrane/src/lib/format.test.mjs
git commit -m "refactor(m3a): affiche Đh au lieu de MAD dans formatMad"
```

### Task 1.2: i18n `MAD` → `Đh` (FR + AR) + PriceTag

**Files:**
- Modify: `frontend-m3a-l3achrane/src/locales/fr/app.json`, `locales/ar/app.json`
- Modify: `frontend-m3a-l3achrane/src/locales/fr/web.json`, `locales/ar/web.json`
- Inspect/Modify: `frontend-m3a-l3achrane/src/ds/listing/PriceTag.jsx`

- [ ] **Step 1: Remplacer les chaînes visibles `MAD` → `Đh`**

Dans `app.json` (FR et AR) : `candidatures.rentLabel` (« Loyer (Đh) »), `candidatures.depositLabel` (« Caution (Đh) »), `payButton` (« Payer {{amount}} Đh »), `listingSubtitle` (« … {{prix}} Đh/mois »). Dans `web.json` (FR et AR) : chips budget (`"1 500 Đh"`…) et `budgetUnitNote` (« Đh / mois, charges comprises »). Adapter l'équivalent arabe (garder « درهم » si c'est la forme AR actuelle — vérifier chaque valeur AR et remplacer uniquement les occurrences latines `MAD`).

- [ ] **Step 2: Vérifier PriceTag**

Lire `src/ds/listing/PriceTag.jsx` : s'il contient un littéral `MAD`, le remplacer par `Đh` ; s'il consomme `formatMad`, aucune modif.

- [ ] **Step 3: Vérifier l'absence de `MAD` visible résiduel**

Run: `cd frontend-m3a-l3achrane && grep -rn "MAD" src/ | grep -v "currency" | grep -viE "\.test\."`
Expected: aucune chaîne d'affichage (seules restent `currency: 'MAD'` en données/mocks).

- [ ] **Step 4: Parité i18n + build**

Run: `cd frontend-m3a-l3achrane && node --test src/i18n/ && npm run build`
Expected: parité FR/AR OK, build OK.

- [ ] **Step 5: Commit**

```bash
git add frontend-m3a-l3achrane/src/locales frontend-m3a-l3achrane/src/ds/listing/PriceTag.jsx
git commit -m "refactor(m3a): libellés de prix en Đh (i18n FR/AR + PriceTag)"
```

---

## LOT 2 — Charges de copropriété

### Task 2.1: Backend semsarout — colonnes + API + garde terrain

**Files:**
- Modify: `backend/app/models/property.py:22` (colonnes), `:95` (to_dict)
- Modify: `backend/app/api/v1/properties.py` (create ~L482, update `updatable_fields` ~L533)
- Test: `backend/tests/test_property_condo.py` (create)
- Doc: `backend/migrations/ALTER_condo.sql` (prod)

**Interfaces:**
- Produces: `Property.is_condo: bool`, `Property.condo_fees: float|None`, sérialisés dans `to_dict()` sous les clés `is_condo`, `condo_fees`.

- [ ] **Step 1: Test unitaire `to_dict` (rouge)**

Créer `backend/tests/test_property_condo.py` :
```python
from app.models.property import Property


def _prop(**kw):
    base = dict(reference="R1", title="T", property_type="apartment",
                transaction_type="sale", price=100000, city="Casablanca", owner_id=1)
    base.update(kw)
    return Property(**base)


def test_to_dict_exposes_condo_fields():
    p = _prop(is_condo=True, condo_fees=800)
    d = p.to_dict(include_images=False)
    assert d["is_condo"] is True
    assert d["condo_fees"] == 800.0


def test_to_dict_condo_defaults():
    p = _prop()
    d = p.to_dict(include_images=False)
    assert d["is_condo"] in (False, None)
    assert d["condo_fees"] is None
```

- [ ] **Step 2: Lancer → échec**

Run: `cd backend && python -m pytest tests/test_property_condo.py -v`
Expected: FAIL (`is_condo` inexistant).

- [ ] **Step 3: Ajouter les colonnes au modèle**

`property.py`, après la ligne 22 (`charges = …`) :
```python
    # Copropriété : indicateur + charges mensuelles (vente ou location).
    is_condo = db.Column(db.Boolean, default=False)
    condo_fees = db.Column(db.Numeric(10, 2))  # charges de copropriété mensuelles
```
Dans `to_dict`, après la clé `'charges'` (ligne 95) :
```python
            'is_condo': bool(self.is_condo),
            'condo_fees': float(self.condo_fees) if self.condo_fees else None,
```

- [ ] **Step 4: Lancer → succès**

Run: `cd backend && python -m pytest tests/test_property_condo.py -v`
Expected: PASS.

- [ ] **Step 5: Câbler l'API create + update avec garde terrain**

Dans `properties.py`, dans le `Property(...)` de create, après `charges=data.get('charges'),` :
```python
        is_condo=(data.get('is_condo', True) and data.get('property_type') != 'land'),
        condo_fees=(None if data.get('property_type') == 'land' else data.get('condo_fees')),
```
Dans `updatable_fields`, ajouter `'is_condo', 'condo_fees'`. Juste après la boucle `for field in updatable_fields`, ajouter la garde terrain :
```python
    if property.property_type == 'land':
        property.is_condo = False
        property.condo_fees = None
```

- [ ] **Step 6: ALTER prod (doc)**

Créer `backend/migrations/ALTER_condo.sql` :
```sql
-- Charges de copropriété (Property). create_all couvre les bases neuves ;
-- ce script ajoute les colonnes aux bases existantes (prod).
ALTER TABLE properties ADD COLUMN IF NOT EXISTS is_condo BOOLEAN DEFAULT false;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS condo_fees NUMERIC(10,2);
```

- [ ] **Step 7: Miroir microservice**

Ajouter les deux mêmes colonnes à `services/listing/app/models.py` (après `charges = Column(Numeric(10, 2))`) :
```python
    is_condo = Column(Boolean, default=False)
    condo_fees = Column(Numeric(10, 2))
```
(Vérifier que `Boolean` est importé ; sinon l'ajouter à l'import SQLAlchemy.)

- [ ] **Step 8: Tests backend + commit**

Run: `cd backend && python -m pytest tests/test_property_condo.py -v`
Expected: PASS.
```bash
git add backend/app/models/property.py backend/app/api/v1/properties.py \
        backend/tests/test_property_condo.py backend/migrations/ALTER_condo.sql \
        services/listing/app/models.py
git commit -m "feat(properties): charges de copropriété (is_condo + condo_fees, garde terrain)"
```

### Task 2.2: Backend coloc — colonnes + schema + API

**Files:**
- Modify: `services/coloc-listing/app/models.py:77` (colonnes), `:106` (to_dict)
- Modify: `services/coloc-listing/app/schemas.py` (`ListingCreateIn`, `ListingUpdateIn`)
- Modify: `services/coloc-listing/app/main.py` (create_listing mapping)
- Modify: `services/coloc-listing/db/schema.sql` (table listings)
- Create: `services/coloc-listing/db/migrate_condo.sql`
- Test: `services/coloc-listing/tests/test_condo.py`

**Interfaces:**
- Consumes: fixtures `client`, `headers` (`services/coloc-listing/tests/conftest.py`).
- Produces: `to_dict()` renvoie `is_condo: bool`, `condo_fees: float|None`. `ListingCreateIn.is_condo: bool = True`, `ListingCreateIn.condo_fees: Decimal | None`.

- [ ] **Step 1: Test API (rouge)**

Créer `services/coloc-listing/tests/test_condo.py` :
```python
def _payload(**kw):
    body = {
        "property": {"city": "Casablanca", "property_type": "APPARTEMENT"},
        "title": "Chambre lumineuse", "bed_type": "CHAMBRE_INDIVIDUELLE",
        "rent": 2500, "housing_gender": "FEMININ", "capacity": 2,
    }
    body.update(kw)
    return body


def test_create_persists_condo_fields(client, headers):
    r = client.post("/listings", json=_payload(is_condo=True, condo_fees=800), headers=headers())
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["is_condo"] is True
    assert d["condo_fees"] == 800.0


def test_create_condo_default_true(client, headers):
    r = client.post("/listings", json=_payload(), headers=headers())
    assert r.status_code == 201, r.text
    assert r.json()["is_condo"] is True
```

- [ ] **Step 2: Lancer → échec**

Run: `cd services/coloc-listing && python -m pytest tests/test_condo.py -v`
Expected: FAIL (clé `is_condo` absente).

- [ ] **Step 3: Modèle + to_dict**

`models.py`, après la ligne 77 (`charges_amount = …`) :
```python
    is_condo = Column(Boolean, default=True, nullable=False)
    condo_fees = Column(Numeric(12, 2))
```
Dans `to_dict`, après `"charges_amount": …` (ligne 108) :
```python
            "is_condo": self.is_condo,
            "condo_fees": float(self.condo_fees) if self.condo_fees is not None else None,
```

- [ ] **Step 4: Schémas Pydantic**

`schemas.py`, dans `ListingCreateIn` (après `charges_amount`) :
```python
    is_condo: bool = True
    condo_fees: Decimal | None = None
```
Dans `ListingUpdateIn` (après `charges_amount`) :
```python
    is_condo: bool | None = None
    condo_fees: Decimal | None = None
```

- [ ] **Step 5: Mapping create_listing**

`main.py`, dans le `Listing(...)` de `create_listing`, après `charges_amount=body.charges_amount,` :
```python
                      is_condo=body.is_condo, condo_fees=body.condo_fees,
```

- [ ] **Step 6: schema.sql + migration prod**

Ajouter à la table `listings` de `services/coloc-listing/db/schema.sql` :
```sql
    is_condo    BOOLEAN NOT NULL DEFAULT true,
    condo_fees  NUMERIC(12,2),
```
Créer `services/coloc-listing/db/migrate_condo.sql` :
```sql
-- Charges de copropriété (Listing coloc). create_all couvre les bases neuves.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS is_condo BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS condo_fees NUMERIC(12,2);
```

- [ ] **Step 7: Lancer → succès + commit**

Run: `cd services/coloc-listing && python -m pytest tests/test_condo.py -v`
Expected: PASS.
```bash
git add services/coloc-listing/app/models.py services/coloc-listing/app/schemas.py \
        services/coloc-listing/app/main.py services/coloc-listing/db/schema.sql \
        services/coloc-listing/db/migrate_condo.sql services/coloc-listing/tests/test_condo.py
git commit -m "feat(coloc-listing): charges de copropriété (is_condo + condo_fees)"
```

### Task 2.3: semsarout — composant `CondoFeesField` + intégration 3 formulaires

**Files:**
- Create: `frontend/src/components/property/CondoFeesField.jsx`
- Modify: `frontend/src/pages/dashboard/CreateProperty.jsx`
- Modify: `frontend/src/pages/SellProperty.jsx`
- Modify: `frontend/src/pages/backoffice/PropertyForm.jsx`

**Interfaces:**
- Produces: `<CondoFeesField propertyType isCondo condoFees onChangeIsCondo onChangeCondoFees t />` — masqué si `propertyType === 'land'`.

- [ ] **Step 1: Composant partagé**

Créer `CondoFeesField.jsx` (suivre la skill `form-design` : champ optionnel → pas d'astérisque) :
```jsx
import { DIRHAM_SYMBOL } from '../../utils/currency'

/** Bloc copropriété : masqué pour un terrain ; checkbox + montant mensuel. */
export function CondoFeesField({ propertyType, isCondo, condoFees, onToggle, onAmount }) {
  if (propertyType === 'land') return null
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={!!isCondo} onChange={(e) => onToggle(e.target.checked)} />
        Bien en copropriété
      </label>
      {isCondo && (
        <div>
          <label className="block text-sm text-gray-700">Charges de copropriété ({DIRHAM_SYMBOL}/mois)</label>
          <input type="number" min="0" value={condoFees ?? ''} placeholder="800"
                 onChange={(e) => onAmount(e.target.value === '' ? null : Number(e.target.value))}
                 className="mt-1 w-full rounded-lg border px-3 py-2" />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Intégrer dans `CreateProperty.jsx`**

- État initial (reset L44-59) : `is_condo` défaut `true`, `condo_fees` défaut `''`/`null`.
- Dans la section prix (~L210-237), monter `<CondoFeesField propertyType={watch('property_type')} isCondo={watch('is_condo')} condoFees={watch('condo_fees')} onToggle={(v)=>setValue('is_condo',v)} onAmount={(v)=>setValue('condo_fees',v)} />`.
- Payload `onSubmit` (L98-107) : ajouter `is_condo`, `condo_fees`.
(Adapter aux noms de `watch`/`setValue`/état réels du fichier ; le composant reste identique.)

- [ ] **Step 3: Intégrer dans `SellProperty.jsx` et `backoffice/PropertyForm.jsx`**

Même montage : injecter `<CondoFeesField …>` près du type/prix, brancher sur l'état local du wizard/formulaire, inclure `is_condo`/`condo_fees` dans le payload de soumission. Sur `SellProperty` (vente), le bloc s'affiche comme ailleurs (masqué si terrain).

- [ ] **Step 4: Build**

Run: `cd frontend && npm run build`
Expected: OK.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/property/CondoFeesField.jsx \
        frontend/src/pages/dashboard/CreateProperty.jsx \
        frontend/src/pages/SellProperty.jsx frontend/src/pages/backoffice/PropertyForm.jsx
git commit -m "feat(frontend): saisie charges de copropriété dans les 3 formulaires de bien"
```

### Task 2.4: semsarout — affichage détail

**Files:**
- Modify: `frontend/src/pages/PropertyDetail.jsx` (section « Détails » ~L534-555)

- [ ] **Step 1: Ligne d'affichage conditionnelle**

Dans la section « Détails », ajouter une ligne quand `property.is_condo` (utiliser l'util devise existant, ex. `priceWithSymbol` ou `formatCurrency`) :
```jsx
{property.is_condo && (
  <DetailRow label="Charges de copropriété"
             value={property.condo_fees ? `${priceWithSymbol(property.condo_fees)}/mois` : '—'} />
)}
```
(Réutiliser le composant de ligne/label déjà présent dans cette section ; `priceWithSymbol` depuis `constants/pricing`.)

- [ ] **Step 2: Build + commit**

Run: `cd frontend && npm run build` → OK.
```bash
git add frontend/src/pages/PropertyDetail.jsx
git commit -m "feat(frontend): affiche les charges de copropriété sur la page détail"
```

### Task 2.5: m3a — mapper + détail + carte (« +cc »)

**Files:**
- Modify: `frontend-m3a-l3achrane/src/services/mappers.js` (`mapListingHit`, `mapListingDetail`)
- Modify: `frontend-m3a-l3achrane/src/surfaces/web/ListingDetail.jsx`
- Modify: `frontend-m3a-l3achrane/src/ds/listing/ListingCard.jsx` (+ `PriceTag.jsx` si besoin)
- Test: `frontend-m3a-l3achrane/src/services/mappers.test.mjs`

**Interfaces:**
- Produces: objets mappés avec `isCondo: bool`, `condoFees: number|null`, et `prixAffiche = prixMad + (isCondo ? condoFees : 0)`.

- [ ] **Step 1: Test mapper (rouge)**

Ajouter à `mappers.test.mjs` (le fixture de `mapListingDetail` fournit `rent: 2200`) :
```js
test('mapListingDetail expose isCondo/condoFees', () => {
  const l = mapListingDetail({ ...detailFixture, is_condo: true, condo_fees: 800 })
  assert.equal(l.isCondo, true)
  assert.equal(l.condoFees, 800)
})
```

- [ ] **Step 2: Lancer → échec**

Run: `cd frontend-m3a-l3achrane && node --test src/services/mappers.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Exposer dans le mapper**

Dans `mapListingHit` (retour) et `mapListingDetail` (retour), ajouter :
```js
    isCondo: (hit ?? d).is_condo ?? false,
    condoFees: (hit ?? d).condo_fees ?? null,
```
(Adapter à la variable locale : `hit` dans `mapListingHit`, `d` dans `mapListingDetail`.)

- [ ] **Step 4: Détail m3a**

Dans `ListingDetail.jsx`, sous le `PriceTag` (L245), afficher si `listing.isCondo` :
```jsx
{listing.isCondo && (
  <div className="condo-fees-line">
    {t('web:listing.condoFeesLabel')} : {formatMad(listing.condoFees ?? 0, { suffix: true })}
  </div>
)}
```

- [ ] **Step 5: Carte « +cc »**

Dans `ListingCard.jsx`, calculer le total et le marqueur : quand `item.isCondo && item.condoFees > 0`, afficher `prixMad + condoFees` avec un « +cc » à côté (période `/mois`). Sinon, affichage inchangé. Exemple :
```jsx
const total = item.prixMad + (item.isCondo && item.condoFees ? item.condoFees : 0)
const cc = item.isCondo && item.condoFees > 0
// … <PriceTag amount={total} period="/mois" /> {cc && <span className="cc-badge">{t('web:listing.chargesComprisesShort')}</span>}
```

- [ ] **Step 6: Tests + build + commit**

Run: `cd frontend-m3a-l3achrane && node --test src/services/mappers.test.mjs && npm run build`
Expected: PASS + OK.
```bash
git add frontend-m3a-l3achrane/src/services/mappers.js frontend-m3a-l3achrane/src/services/mappers.test.mjs \
        frontend-m3a-l3achrane/src/surfaces/web/ListingDetail.jsx frontend-m3a-l3achrane/src/ds/listing/ListingCard.jsx
git commit -m "feat(m3a): charges de copropriété (détail + carte +cc)"
```

### Task 2.6: i18n Lot 2 (FR + AR, deux apps)

**Files:**
- Modify: `frontend/src/locales/{fr,ar}/dashboard.json` (+ `public.json` si SellProperty/detail l'utilisent)
- Modify: `frontend-m3a-l3achrane/src/locales/{fr,ar}/web.json`

- [ ] **Step 1: Clés semsarout**

Ajouter (FR + AR) : `condoToggle` (« Bien en copropriété »), `condoFeesLabel` (« Charges de copropriété »), unité déjà via symbole `Đh`. Câbler les libellés du `CondoFeesField`/détail sur ces clés (remplacer les libellés en dur des tâches 2.3/2.4).

- [ ] **Step 2: Clés m3a**

Dans `web.json` (FR + AR) : `listing.condoFeesLabel` (« Charges de copropriété »), `listing.chargesComprisesShort` (« +cc »).

- [ ] **Step 3: Parité + build**

Run: `cd frontend-m3a-l3achrane && node --test src/i18n/ && npm run build` ; `cd ../frontend && npm run build`.
Expected: parité OK, builds OK.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/locales frontend-m3a-l3achrane/src/locales
git commit -m "i18n: libellés charges de copropriété (FR/AR, semsarout + m3a)"
```

---

## LOT 3 — « Déposer une annonce » (m3a)

### Task 3.1: DS — `Textarea` + `Checkbox`

**Files:**
- Create: `frontend-m3a-l3achrane/src/ds/core/Textarea.jsx`, `Checkbox.jsx`
- Modify: `frontend-m3a-l3achrane/src/ds/core/index.js`

**Interfaces:**
- Produces: `<Textarea label value onChange rows />`, `<Checkbox label checked onChange />`. Exportés via `ds/core/index.js` (donc `ds/index.js`).

- [ ] **Step 1: Composants (calqués sur `Input.jsx`)**

Lire `Input.jsx` pour reprendre le style/tokens, puis créer `Textarea.jsx` (`<textarea>` multi-lignes, mêmes classes/vars) et `Checkbox.jsx` (`<input type="checkbox">` + label). Ajouter à `ds/core/index.js` :
```js
export { Textarea } from './Textarea.jsx'
export { Checkbox } from './Checkbox.jsx'
```

- [ ] **Step 2: Build + commit**

Run: `cd frontend-m3a-l3achrane && npm run build` → OK.
```bash
git add frontend-m3a-l3achrane/src/ds/core
git commit -m "feat(m3a-ds): composants Textarea et Checkbox"
```

### Task 3.2: Service — création / upload / media / submit

**Files:**
- Modify: `frontend-m3a-l3achrane/src/services/index.js`

**Interfaces:**
- Produces :
  - `createListing(payload) -> Promise<{id, ...}>` (`POST /listings`)
  - `uploadPhoto(file) -> Promise<string>` (URL ; `POST /uploads`, multipart)
  - `addListingMedia(id, {url, position, media_type}) -> Promise<void>` (`POST /listings/{id}/media`)
  - `submitListing(id) -> Promise<{status, ...}>` (`POST /listings/{id}/submit`)

- [ ] **Step 1: Ajouter les fonctions service**

```js
export async function createListing(payload) {
  const { data } = await api.post('/listings', payload)
  return data
}
export async function uploadPhoto(file) {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post('/uploads', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  return data.url
}
export async function addListingMedia(id, media) {
  await api.post(`/listings/${id}/media`, media)
}
export async function submitListing(id) {
  const { data } = await api.post(`/listings/${id}/submit`)
  return data
}
```
(Vérifier le nom du champ multipart attendu par `services/listing` `POST /uploads` ; ajuster `'file'` si besoin.)

- [ ] **Step 2: Commit**

```bash
git add frontend-m3a-l3achrane/src/services/index.js
git commit -m "feat(m3a): service création d'annonce (create/upload/media/submit)"
```

### Task 3.3: Wizard — coquille + 4 étapes + validation

**Files:**
- Create: `frontend-m3a-l3achrane/src/surfaces/app/PublierAnnonce.jsx` (coquille wizard + état)
- Create: `frontend-m3a-l3achrane/src/surfaces/app/publier/{StepBien,StepLogement,StepPrix,StepDispoPhotos}.jsx`

**Interfaces:**
- Consumes: DS `Input`, `Select`, `Textarea`, `Checkbox`, `Button` ; `CondoFeesField` équivalent (réutiliser l'idée du Lot 2, ici avec DS m3a et sans terrain).
- Produces: état `form` couvrant `ListingCreateIn` + `is_condo`/`condo_fees` + `photos: [{file, media_type, position}]`, et `publish()` (Task 3.4).

- [ ] **Step 1: Coquille wizard**

`PublierAnnonce.jsx` : état `step` (0..3), objet `form` (valeurs par défaut : `is_condo: true`, `currency: 'MAD'`, `capacity: 1`, `housing_gender: 'FEMININ'`, `photos: []`), navigation `Suivant`/`Retour`, barre de progression « Étape X/4 ». Chaque `Suivant` appelle `validateStep(step, form)` (bloque si invalide).

- [ ] **Step 2: `validateStep` (champs requis)**

```js
export function validateStep(step, f) {
  const errs = {}
  if (step === 0) { if (!f.city) errs.city = true; if (!f.property_type) errs.property_type = true }
  if (step === 1) { if (!f.title) errs.title = true; if (!f.bed_type) errs.bed_type = true; if (!f.housing_gender) errs.housing_gender = true }
  if (step === 2) { if (!(Number(f.rent) > 0)) errs.rent = true }
  return errs
}
```

- [ ] **Step 3: Étapes**

- `StepBien` : `city*`, `neighborhood`, `address`, `property_type*` (Select des 6 valeurs), `floor`, `area_m2`, quelques `amenities` (Checkbox → `form.amenities[key]=true`).
- `StepLogement` : `title*`, `description` (Textarea), `bed_type*` (Select 5 valeurs), `housing_gender*` (Select FEMININ/MASCULIN), `furnished` (Checkbox), `capacity` (1-8).
- `StepPrix` : `rent*` (Đh), `charges_included` (Checkbox) → `charges_amount`, `deposit`, puis bloc copropriété (`is_condo` Checkbox coché par défaut → `condo_fees`).
- `StepDispoPhotos` : `available_from` (date), `duration_min_months`, `duration_max_months`, sélecteur de photos (input file multiple → `form.photos` avec `media_type` par défaut `AUTRE`, `position` = index) + aperçus.

- [ ] **Step 4: Build + commit**

Run: `cd frontend-m3a-l3achrane && npm run build` → OK.
```bash
git add frontend-m3a-l3achrane/src/surfaces/app/PublierAnnonce.jsx frontend-m3a-l3achrane/src/surfaces/app/publier
git commit -m "feat(m3a): wizard Déposer une annonce (4 étapes + validation)"
```

### Task 3.4: Orchestration « Publier » + écran succès

**Files:**
- Modify: `frontend-m3a-l3achrane/src/surfaces/app/PublierAnnonce.jsx`
- Test: `frontend-m3a-l3achrane/src/surfaces/app/publier/publish.test.mjs`

**Interfaces:**
- Consumes: `createListing`, `uploadPhoto`, `addListingMedia`, `submitListing` (Task 3.2).
- Produces: `buildCreatePayload(form) -> object` (pur) et `publish(form, services) -> Promise<{ok, id}>`.

- [ ] **Step 1: Test de `buildCreatePayload` + `publish` (rouge)**

Créer `publish.test.mjs` :
```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCreatePayload, publish } from './orchestrate.mjs'

test('buildCreatePayload structure property + listing', () => {
  const p = buildCreatePayload({ city: 'Casa', property_type: 'APPARTEMENT', title: 'T',
    bed_type: 'CHAMBRE_INDIVIDUELLE', housing_gender: 'FEMININ', rent: 2500,
    is_condo: true, condo_fees: 800, photos: [] })
  assert.equal(p.property.city, 'Casa')
  assert.equal(p.is_condo, true)
  assert.equal(p.condo_fees, 800)
})

test('publish enchaîne create → media → submit', async () => {
  const calls = []
  const services = {
    createListing: async (pl) => { calls.push('create'); return { id: 'L1' } },
    uploadPhoto: async () => { calls.push('upload'); return '/uploads/photos/x.jpg' },
    addListingMedia: async () => { calls.push('media') },
    submitListing: async (id) => { calls.push('submit:' + id); return { status: 'EN_MODERATION' } },
  }
  const form = { city: 'Casa', property_type: 'APPARTEMENT', title: 'T', bed_type: 'CHAMBRE_INDIVIDUELLE',
    housing_gender: 'FEMININ', rent: 2500, is_condo: false,
    photos: [{ file: {}, media_type: 'CHAMBRE', position: 0 }] }
  const res = await publish(form, services)
  assert.deepEqual(calls, ['create', 'upload', 'media', 'submit:L1'])
  assert.equal(res.ok, true)
})
```

- [ ] **Step 2: Lancer → échec**

Run: `cd frontend-m3a-l3achrane && node --test src/surfaces/app/publier/publish.test.mjs`
Expected: FAIL (module absent).

- [ ] **Step 3: Implémenter `orchestrate.mjs`**

Créer `src/surfaces/app/publier/orchestrate.mjs` :
```js
export function buildCreatePayload(f) {
  return {
    property: { city: f.city, neighborhood: f.neighborhood || null, address: f.address || null,
                property_type: f.property_type, floor: f.floor ?? null, area_m2: f.area_m2 ?? null,
                amenities: f.amenities || {} },
    title: f.title, description: f.description || '', bed_type: f.bed_type,
    rent: Number(f.rent), charges_included: !!f.charges_included,
    charges_amount: f.charges_amount ?? null, deposit: f.deposit ?? null,
    furnished: !!f.furnished, housing_gender: f.housing_gender, capacity: Number(f.capacity || 1),
    available_from: f.available_from || null, duration_min_months: f.duration_min_months ?? null,
    duration_max_months: f.duration_max_months ?? null,
    is_condo: !!f.is_condo, condo_fees: f.is_condo ? (f.condo_fees ?? null) : null,
  }
}

export async function publish(form, s) {
  const listing = await s.createListing(buildCreatePayload(form))
  for (const [i, ph] of (form.photos || []).entries()) {
    const url = await s.uploadPhoto(ph.file)
    await s.addListingMedia(listing.id, { url, position: ph.position ?? i, media_type: ph.media_type || 'AUTRE' })
  }
  await s.submitListing(listing.id)
  return { ok: true, id: listing.id }
}
```

- [ ] **Step 4: Lancer → succès**

Run: `cd frontend-m3a-l3achrane && node --test src/surfaces/app/publier/publish.test.mjs`
Expected: PASS.

- [ ] **Step 5: Brancher dans le wizard + écran succès**

Dans `PublierAnnonce.jsx`, le bouton « Publier » (dernière étape) appelle `publish(form, { createListing, uploadPhoto, addListingMedia, submitListing })` ; en succès → écran « Annonce envoyée en modération » ; en échec → message d'erreur invitant à réessayer (l'annonce reste en brouillon).

- [ ] **Step 6: Build + commit**

Run: `cd frontend-m3a-l3achrane && npm run build` → OK.
```bash
git add frontend-m3a-l3achrane/src/surfaces/app/publier/orchestrate.mjs \
        frontend-m3a-l3achrane/src/surfaces/app/publier/publish.test.mjs \
        frontend-m3a-l3achrane/src/surfaces/app/PublierAnnonce.jsx
git commit -m "feat(m3a): orchestration Publier (create → upload → media → submit)"
```

### Task 3.5: Route `/espace/publier` + entrée de nav

**Files:**
- Modify: `frontend-m3a-l3achrane/src/App.jsx`
- Modify: `frontend-m3a-l3achrane/src/surfaces/app/AppLayout.jsx`

- [ ] **Step 1: Route**

Dans `App.jsx`, sous `<Route path="/espace" element={<AppLayout />}>`, ajouter :
```jsx
<Route path="publier" element={<PublierAnnonce />} />
```
(+ import lazy cohérent avec les autres écrans du dossier.)

- [ ] **Step 2: Entrée de nav**

Dans `AppLayout.jsx`, ajouter une entrée `publish: '/espace/publier'` à l'objet de nav + le lien/label correspondant (« Déposer une annonce »).

- [ ] **Step 3: Build + commit**

Run: `cd frontend-m3a-l3achrane && npm run build` → OK.
```bash
git add frontend-m3a-l3achrane/src/App.jsx frontend-m3a-l3achrane/src/surfaces/app/AppLayout.jsx
git commit -m "feat(m3a): route et nav /espace/publier"
```

### Task 3.6: i18n wizard (FR + AR)

**Files:**
- Modify: `frontend-m3a-l3achrane/src/locales/{fr,ar}/app.json`

- [ ] **Step 1: Clés**

Sous une clé `publier` : titres des 4 étapes, libellés de champs, options d'enum (types de bien, couchage, genre, type de média), boutons (`Suivant`, `Retour`, `Publier`), messages de validation, écran de succès. Miroir AR complet.

- [ ] **Step 2: Remplacer les libellés en dur des tâches 3.3/3.4 par `t('app:publier.…')`.**

- [ ] **Step 3: Parité + build + commit**

Run: `cd frontend-m3a-l3achrane && node --test src/i18n/ && npm run lint && npm run build`
Expected: parité OK, lint 0/0, build OK.
```bash
git add frontend-m3a-l3achrane/src/locales frontend-m3a-l3achrane/src/surfaces/app
git commit -m "i18n(m3a): wizard Déposer une annonce (FR/AR)"
```

---

## Gate final (tous lots)

- [ ] `cd frontend-m3a-l3achrane && npm run lint && npm test && npm run build` → verts.
- [ ] `cd frontend && npm run build` (et `npm test` si touché) → verts.
- [ ] `cd backend && python -m pytest tests/test_property_condo.py -v` → vert.
- [ ] `cd services/coloc-listing && python -m pytest tests/test_condo.py -v` → vert.
- [ ] Parité i18n m3a verte.
- [ ] `git log --oneline` : commits par lot, messages conventionnels, pas d'attribution IA.

## Self-review coverage (spec → tâches)

- Lot 1 (Đh) → 1.1, 1.2. Lot 2 données/backend → 2.1, 2.2 ; forms → 2.3 ; affichage → 2.4 (semsarout), 2.5 (m3a) ; i18n → 2.6. Lot 3 → 3.1 (DS), 3.2 (service), 3.3 (wizard), 3.4 (publish), 3.5 (route/nav), 3.6 (i18n). Garde terrain → 2.1. Back-office m3a lecture seule → couvert par 2.5 (affichage détail/carte partagé) ; pas d'éditeur (hors périmètre spec).
