# Programme — Livrable 3 (liste des lots) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dans l'éditeur de plan interactif des lots, vider le formulaire après enregistrement et afficher sous le formulaire la liste des lots avec des actions Modifier / Dupliquer / Supprimer (icônes + infobulles).

**Architecture:** Modifications ciblées de `frontend/src/pages/dashboard/ProgramPlanEditor.jsx` : (a) `handleSaveLot` réinitialise la sélection après création ; (b) `handleDeleteLot` prend le lot en argument ; (c) helpers purs `nextReference`/`offsetZone`/`duplicateLotPayload` + `handleDuplicateLot` ; (d) une liste des lots (JSX) sous le panneau formulaire.

**Tech Stack:** React 18, react-query non requis ici, Tailwind, `lotPlanService`.

## Global Constraints

- Français codé en dur (branche sans i18n).
- **Aucune infra de test frontend sur cette branche** (issue de `develop`) → vérification par `npm run build` + revue ; les helpers purs sont extraits pour lisibilité/testabilité future (pas d'ajout de Vitest ici).
- Frontend uniquement, aucun changement backend.
- Suivre les patterns existants (helpers `num`/`clamp01`, `upsertLotLocal`/`removeLotLocal`/`recomputeCounts`/`pushHistory`, `LOT_TYPES`, `LOT_STATUS`).
- `npm run build` vert après chaque tâche.
- Répertoire : `frontend/`. Branche : `feature/program-form-ameliorations`.

---

## File Structure

- Modify: `frontend/src/pages/dashboard/ProgramPlanEditor.jsx` (imports, handlers, JSX de la liste).

Rappels du fichier :
- `EMPTY_FORM` (l.20), `LOT_TYPES` (l.10), `LOT_STATUS` (importé), `clamp01`/`num` (helpers), `selectLot(lot)` (l.174 — charge un lot dans le formulaire), `handleSaveLot` (l.256), `handleDeleteLot` (l.294), `resetSelection` (l.107), `upsertLotLocal`/`removeLotLocal`/`recomputeCounts`/`pushHistory`. `lots = activePlan?.lots`. Le panneau formulaire est rendu quand `(creating || selectedLot)`.

---

## Task 1: Vider le formulaire après création + suppression par lot + helpers de duplication

**Files:**
- Modify: `frontend/src/pages/dashboard/ProgramPlanEditor.jsx`

**Interfaces:**
- Produces (utilisés par Task 2) : `nextReference(ref) -> string`, `offsetZone(zone) -> zone`, `duplicateLotPayload(lot) -> payload`, `handleDuplicateLot(lot)`, `handleDeleteLot(lot)` (signature avec argument).

- [ ] **Step 1: Vider le formulaire après création réussie**

Dans `handleSaveLot`, branche `if (creating)` — remplacer la ligne :

```js
        setDraft([]); setCreating(false); selectLot(lot)
```

par :

```js
        setDraft([]); resetSelection()
```

(Après ajout d'un lot, le formulaire se vide et le mode revient neutre — prêt pour le lot suivant. L'undo `pushHistory` en dessous reste inchangé.)

- [ ] **Step 2: Généraliser `handleDeleteLot` pour prendre un lot en argument**

Remplacer la signature et le corps de `handleDeleteLot` (l.294) : utiliser un paramètre `lot` au lieu de `selectedLot`.

```js
  const handleDeleteLot = async (lot) => {
    if (!lot) return
    if (!window.confirm('Supprimer ce lot ?')) return
    const before = { ...lot, zone: cloneZone(lot.zone) }
    try {
      await lotPlanService.deleteLot(programId, lot.id)
      removeLotLocal(activePlan.id, lot.id); recomputeCounts(activePlan.id)
      if (selectedLotId === lot.id) resetSelection()
      pushHistory(async () => {
        const re = await lotPlanService.createLot(programId, {
          plan_id: activePlan.id, zone: before.zone, reference: before.reference, title: before.title,
          lot_type: before.lot_type, surface: before.surface, rooms: before.rooms, bedrooms: before.bedrooms,
          bathrooms: before.bathrooms, floor: before.floor, price: before.price, status: before.status,
          description: before.description
        })
        upsertLotLocal(activePlan.id, re); recomputeCounts(activePlan.id)
      })
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur lors de la suppression')
    }
  }
```

(Garde le même comportement d'undo. `resetSelection()` seulement si on supprime le lot actuellement sélectionné.)

Mettre à jour le bouton Supprimer **du panneau formulaire** pour passer le lot explicitement. Chercher :

```jsx
                  {selectedLot && (
                    <button onClick={handleDeleteLot} className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg"><FiTrash2 className="w-4 h-4" /></button>
```

et remplacer `onClick={handleDeleteLot}` par `onClick={() => handleDeleteLot(selectedLot)}`.

- [ ] **Step 3: Ajouter les helpers purs de duplication + `handleDuplicateLot`**

Ajouter les helpers purs à côté des autres helpers module (après `num`/`clamp01`, avant le composant) :

```js
// Duplication d'un lot : référence suffixée, zone légèrement décalée (à repositionner),
// statut remis à "available" (un nouveau lot physique est disponible).
const DUP_OFFSET = 0.03
export const nextReference = (ref) => `${ref || 'LOT'}-copie`
export const offsetZone = (zone) => (zone || []).map(p => ({ x: clamp01(p.x + DUP_OFFSET), y: clamp01(p.y + DUP_OFFSET) }))
export const duplicateLotPayload = (lot) => ({
  reference: nextReference(lot.reference), title: lot.title || '', lot_type: lot.lot_type || 'apartment',
  surface: lot.surface ?? null, rooms: lot.rooms ?? null, bedrooms: lot.bedrooms ?? null,
  bathrooms: lot.bathrooms ?? null, floor: lot.floor ?? null, price: lot.price ?? null,
  status: 'available', description: lot.description || '', zone: offsetZone(lot.zone),
})
```

Ajouter le handler `handleDuplicateLot` dans le composant, à côté de `handleDeleteLot` :

```js
  const handleDuplicateLot = async (lot) => {
    try {
      const created = await lotPlanService.createLot(programId, {
        ...duplicateLotPayload(lot), plan_id: activePlan.id,
      })
      upsertLotLocal(activePlan.id, created); recomputeCounts(activePlan.id)
      pushHistory(async () => {
        await lotPlanService.deleteLot(programId, created.id)
        removeLotLocal(activePlan.id, created.id); recomputeCounts(activePlan.id)
      })
      toast.success('Lot dupliqué')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur lors de la duplication')
    }
  }
```

- [ ] **Step 4: Vérifier le build**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/dashboard/ProgramPlanEditor.jsx
git commit -m "feat(program-lots): vider le form apres creation + suppression par lot + helpers duplication"
```

---

## Task 2: Liste des lots avec actions (Modifier / Dupliquer / Supprimer)

**Files:**
- Modify: `frontend/src/pages/dashboard/ProgramPlanEditor.jsx`

**Interfaces:**
- Consumes : `selectLot(lot)`, `handleDuplicateLot(lot)`, `handleDeleteLot(lot)`, `LOT_TYPES`, `LOT_STATUS`, `lots`, `selectedLotId`.

- [ ] **Step 1: Importer `FiCopy`**

Modifier le bloc d'imports react-icons (l.4-7) — ajouter `FiCopy` et `FiEdit3` est déjà présent :

```jsx
  FiArrowLeft, FiPlus, FiTrash2, FiSave, FiX, FiImage,
  FiEdit3, FiMousePointer, FiCheck, FiRotateCcw, FiZoomIn, FiZoomOut, FiCopy
} from 'react-icons/fi'
```

- [ ] **Step 2: Ajouter la liste des lots sous le panneau formulaire**

Dans la colonne de droite (panneau formulaire), **juste après** la fermeture du bloc `{(creating || selectedLot) ? ( … ) : ( … )}` (le panneau formulaire), insérer la liste. Repère : chercher la fin du panneau formulaire (le `</div>` qui ferme le conteneur du panneau, juste avant la fermeture de la colonne de droite). Insérer ce bloc juste après ce panneau :

```jsx
          {/* Liste des lots du plan actif */}
          {lots.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 mt-4">
              <h3 className="font-semibold text-gray-900 mb-3">Lots ({lots.length})</h3>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {lots.map(lot => {
                  const st = LOT_STATUS[lot.status] || LOT_STATUS.available
                  const typeLabel = LOT_TYPES.find(t => t.value === lot.lot_type)?.label || lot.lot_type
                  return (
                    <div
                      key={lot.id}
                      className={`flex items-center justify-between gap-2 p-2 rounded-lg ${lot.id === selectedLotId ? 'bg-primary-50 border border-primary-200' : 'bg-gray-50'}`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {lot.reference || '—'}{lot.title ? ` · ${lot.title}` : ''}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {typeLabel}{lot.surface ? ` · ${lot.surface} m²` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.bg} ${st.text}`}>{st.label}</span>
                        <button title="Modifier" onClick={() => selectLot(lot)}
                          className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-gray-200 rounded-lg">
                          <FiEdit3 className="w-4 h-4" />
                        </button>
                        <button title="Dupliquer" onClick={() => handleDuplicateLot(lot)}
                          className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-gray-200 rounded-lg">
                          <FiCopy className="w-4 h-4" />
                        </button>
                        <button title="Supprimer" onClick={() => handleDeleteLot(lot)}
                          className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-100 rounded-lg">
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
```

- [ ] **Step 3: Vérifier le build**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

- [ ] **Step 4: Vérification manuelle**

Run: `cd frontend && npm run dev`
Ouvrir un programme → éditeur de plan des lots. Dessiner un lot, l'enregistrer : le formulaire se vide, le lot apparaît dans la liste dessous. Boutons de la liste :
- **Modifier** (crayon) → charge le lot dans le formulaire.
- **Dupliquer** (copie) → un nouveau lot « <réf>-copie » apparaît, zone décalée à repositionner.
- **Supprimer** (corbeille) → confirmation puis retrait de la liste.
Infobulles présentes au survol (attribut `title`).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/dashboard/ProgramPlanEditor.jsx
git commit -m "feat(program-lots): liste des lots avec actions modifier/dupliquer/supprimer"
```

---

## Validation finale du livrable 3

- [ ] `cd frontend && npm run build` → `✓ built`.
- [ ] Manuel : création → form vidé + lot listé ; Modifier charge le form ; Dupliquer crée « -copie » (zone décalée) ; Supprimer retire (avec confirmation + undo Ctrl+Z fonctionnel) ; infobulles OK.
