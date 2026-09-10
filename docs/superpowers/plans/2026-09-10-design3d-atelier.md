# Atelier éditeur de plan design3d — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre l'éditeur de plan atteignable par ses clients (agences, promoteurs), impossible à corrompre par un geste, réutilisable d'un projet à l'autre, et manipulable par lot.

**Architecture:** Aucune nouvelle brique. On travaille dans `frontend/src/components/design/` (réducteur, canevas), `frontend/src/pages/dashboard/DesignEditor.jsx` (orchestration), `frontend/src/services/design3d*.js` (local, file, API) et `services/design3d` pour une seule route de lecture supplémentaire. La validation de géométrie devient **structurée** côté client, ce qui permet des messages écrits pour un agent tout en gardant le miroir exact du serveur.

**Tech Stack:** React 18, Vite, vitest + jsdom, Playwright, react-i18next (FR/AR + RTL), IndexedDB via `idb`, FastAPI + SQLAlchemy.

**Spec:** `docs/superpowers/specs/2026-09-10-design3d-atelier-design.md`

**Branche :** `feature/design3d-atelier`, créée depuis **`feature/design3d-floorplan`** — et non depuis `develop`. Tout le code touché ici n'existe que sur la branche de la brique 1, qui n'est pas encore mergée.

## Global Constraints

- i18n **FR + AR**, parité stricte des clés ; le garde-fou `frontend/src/i18n/noHardcodedText.test.js` n'est **jamais** affaibli (aucun retrait de `MIGRATED_FILES`, aucune exclusion ajoutée).
- Cibles tactiles **`min-h-[44px]`** partout, **sauf** le bouton « Importer un plan » qui passe à `min-h-[36px]` (décision du propriétaire, Task 4).
- **Hors-ligne d'abord** : aucune fonctionnalité ne doit rendre l'éditeur dépendant du réseau, hormis l'élargissement de la liste des projets sources (Task 10), dont la dégradation est affichée.
- **Aucun travail perdu** : toute suppression est soit strictement vide (Task 8), soit explicitement confirmée (Tasks 2, 6).
- **Aucun identifiant technique** dans un message visible par l'utilisateur.
- Le réducteur de l'éditeur a été stabilisé au prix de quatre rounds de correctifs : chaque modification doit laisser le cas « sélection unique » strictement identique.
- Suites vertes exigées avant chaque commit : `npm run lint`, `npm test`, `npm run build` dans `frontend/`, plus `services/design3d` si touché. Playwright vert.
- Commits : Conventional Commits, message en français, terminés par les deux lignes :
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` puis
  `Claude-Session: https://claude.ai/code/session_01M6QLmyuUqxsemCutSzPq1v`
- Jamais `--no-verify`. **Aucun push, aucun merge, aucune PR.**

## Structure des fichiers

| Fichier | Responsabilité | Tasks |
|---|---|---|
| `frontend/src/utils/floorplan.js` | validation **structurée** + miroir chaînes du serveur | 2 |
| `frontend/src/components/design/useFloorplanEditor.js` | réducteur : garde de longueur, sélection multiple, réparation | 1, 6, 7 |
| `frontend/src/components/design/FloorplanCanvas.jsx` | gestes (rectangle, bloc), cotes décalées | 3, 6, 7 |
| `frontend/src/components/design/GeometryProblems.jsx` | **créé** — bandeau de problèmes cliquable + « Corriger » | 2 |
| `frontend/src/components/common/RedCartouche.jsx` | **créé** — carton rouge partagé (logo + titres) | 4 |
| `frontend/src/components/common/Wordmark.jsx` | consomme `RedCartouche` | 4 |
| `frontend/src/pages/backoffice/Properties.jsx` | entrée « Concevoir en 3D » dans le menu de carte | 5 |
| `frontend/src/pages/backoffice/PropertyForm.jsx` | entrée inactive jusqu'au premier enregistrement | 5 |
| `frontend/src/services/design3dLocal.js` | niveaux vides, projets connus localement | 8, 10 |
| `frontend/src/services/design3dSync.js` | suppression d'un projet vide (réutilise l'abandon) | 8 |
| `frontend/src/services/design3dApi.js` | liste des projets de l'agence | 9, 10 |
| `frontend/src/components/design/ReuseLevelDialog.jsx` | **créé** — choix projet/niveau source | 10 |
| `services/design3d/app/main.py` | `GET /design3d/projects` sans cible imposée | 9 |
| `frontend/src/pages/dashboard/DesignEditor.jsx` | orchestration : bandeau, en-tête, nettoyage, réutilisation | 2, 4, 8, 10 |

---

### Task 1: Garde de longueur minimale sur le déplacement de sommet

Un mur de longueur nulle rend le niveau définitivement insynchronisable. `MIN_WALL_M` n'existe qu'à la création (`FloorplanCanvas.jsx:26`) ; on le remonte dans le réducteur pour qu'il s'applique aussi au déplacement de sommet.

**Files:**
- Modify: `frontend/src/components/design/useFloorplanEditor.js` (`moveVertex`, ~ligne 160)
- Modify: `frontend/src/components/design/FloorplanCanvas.jsx:26` (importer la constante au lieu de la redéclarer)
- Test: `frontend/src/components/design/useFloorplanEditor.test.js`

**Interfaces:**
- Produces: `export const MIN_WALL_M = 0.05` depuis `useFloorplanEditor.js` — consommé par `FloorplanCanvas.jsx` (Tasks 6, 7).

- [ ] **Step 1: Write the failing test**

```js
import { reducer, initialState, MIN_WALL_M } from './useFloorplanEditor'

const wallState = () => ({
  ...initialState,
  geometry: {
    walls: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, thickness_m: 0.2 }],
    rooms: [], openings: [],
  },
})

it('refuse de rendre un mur plus court que le minimum en déplaçant un sommet', () => {
  const s = reducer(wallState(), {
    type: 'MOVE_VERTEX', ref: { kind: 'wall', id: 'w1', end: 'b' }, point: { x: 0, y: 0 },
  })
  expect(s.geometry.walls[0].b).toEqual({ x: 3, y: 0 })
})

it('accepte un déplacement qui laisse le mur au-dessus du minimum', () => {
  const s = reducer(wallState(), {
    type: 'MOVE_VERTEX', ref: { kind: 'wall', id: 'w1', end: 'b' }, point: { x: 1, y: 0 },
  })
  expect(s.geometry.walls[0].b).toEqual({ x: 1, y: 0 })
  expect(MIN_WALL_M).toBe(0.05)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run : `cd frontend && npx vitest run src/components/design/useFloorplanEditor.test.js`
Attendu : ÉCHEC — le premier test reçoit `{x:0,y:0}`, et `MIN_WALL_M` n'est pas exporté.

- [ ] **Step 3: Write minimal implementation**

Dans `useFloorplanEditor.js`, au-dessus de `moveVertex` :

```js
// Longueur minimale d'un mur, en mètres. Vaut à la création comme au déplacement de
// sommet : un mur de longueur nulle est refusé par le serveur, donc un niveau qui en
// contient un ne peut plus jamais être synchronisé.
export const MIN_WALL_M = 0.05
```

et `moveVertex` devient :

```js
function moveVertex(geometry, ref, point) {
  if (ref.kind === 'wall') {
    return {
      ...geometry,
      walls: geometry.walls.map((w) => {
        if (w.id !== ref.id) return w
        const moved = { ...w, [ref.end]: { x: point.x, y: point.y } }
        return wallLength(moved) < MIN_WALL_M ? w : moved
      }),
    }
  }
  return {
    ...geometry,
    rooms: geometry.rooms.map((r) =>
      r.id === ref.id ? { ...r, polygon: r.polygon.map((q, i) => (i === ref.index ? { x: point.x, y: point.y } : q)) } : r,
    ),
  }
}
```

Dans `FloorplanCanvas.jsx`, supprimer `const MIN_WALL_M = 0.05` (ligne 26) et l'ajouter à l'import existant depuis `./useFloorplanEditor`.

- [ ] **Step 4: Run tests to verify they pass**

Run : `cd frontend && npx vitest run src/components/design && npm run lint`
Attendu : tout vert, aucun avertissement.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/design/useFloorplanEditor.js frontend/src/components/design/useFloorplanEditor.test.js frontend/src/components/design/FloorplanCanvas.jsx
git commit -m "fix(design3d): empêcher un mur de longueur nulle au déplacement de sommet"
```

---

### Task 2: Problèmes de géométrie lisibles, cliquables et réparables

Le bandeau affiche aujourd'hui les chaînes du serveur, identifiants compris, et signale la conséquence (« ouverture … : mur introuvable ») en plus de la cause. On rend la validation **structurée** sans casser le miroir serveur.

**Files:**
- Modify: `frontend/src/utils/floorplan.js` (`validateGeometry`, ligne 131)
- Create: `frontend/src/components/design/GeometryProblems.jsx`
- Modify: `frontend/src/components/design/useFloorplanEditor.js` (action `REPAIR_GEOMETRY`)
- Modify: `frontend/src/pages/dashboard/DesignEditor.jsx:538-541,575`
- Modify: `frontend/src/locales/fr/dashboard.json`, `frontend/src/locales/ar/dashboard.json`
- Modify: `frontend/src/i18n/noHardcodedText.test.js` (ajouter le nouveau fichier à `MIGRATED_FILES`)
- Test: `frontend/src/utils/floorplan.test.js`, `frontend/src/components/design/GeometryProblems.test.jsx`

**Interfaces:**
- Produces: `geometryProblems(geometry, wallHeightM) -> [{ code, kind, id, derived }]` ; codes : `wall_too_short`, `wall_thickness`, `room_polygon`, `room_type`, `opening_type`, `opening_dimensions`, `opening_overflows`, `opening_orphan` (toujours `derived: true`), `geometry_too_large`, `wall_height`.
- Produces: action réducteur `{ type: 'REPAIR_GEOMETRY' }` — supprime les murs sous `MIN_WALL_M` et leurs ouvertures.
- Consumes: `MIN_WALL_M` (Task 1).

- [ ] **Step 1: Write the failing test (validation structurée)**

```js
import { geometryProblems, validateGeometry } from './floorplan'

const degenerate = {
  walls: [{ id: 'W1', a: { x: 0, y: 0 }, b: { x: 0, y: 0 }, thickness_m: 0.2 }],
  openings: [{ id: 'O1', wall_id: 'W1', type: 'door', offset_m: 1, width_m: 0.9 }],
  rooms: [],
}

it('signale la cause et marque la conséquence comme dérivée', () => {
  expect(geometryProblems(degenerate, 2.7)).toEqual([
    { code: 'wall_too_short', kind: 'wall', id: 'W1', derived: false },
    { code: 'opening_orphan', kind: 'opening', id: 'O1', derived: true },
  ])
})

it('garde le miroir exact du serveur, conséquence incluse', () => {
  expect(validateGeometry(degenerate, 2.7)).toEqual([
    'mur W1: deux points distincts requis',
    'ouverture O1: mur introuvable',
  ])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run : `cd frontend && npx vitest run src/utils/floorplan.test.js`
Attendu : ÉCHEC — `geometryProblems` n'existe pas.

- [ ] **Step 3: Implement structured validation**

`validateGeometry` conserve exactement ses libellés mais les dérive d'une liste structurée :

```js
// Problèmes structurés : même parcours que le miroir serveur, mais chaque entrée porte
// son code, l'élément concerné, et si elle n'est qu'une CONSÉQUENCE d'un autre problème
// (`derived`). L'interface n'affiche que les causes ; le miroir chaînes, lui, doit rester
// identique au serveur — conséquences comprises — sous peine de fausser la parité.
const MESSAGES = {
  geometry_too_large: () => 'geometry dépasse 512 Ko',
  wall_height: () => 'wall_height_m invalide',
  wall_too_short: (p) => `mur ${p.id}: deux points distincts requis`,
  wall_thickness: (p) => `mur ${p.id}: thickness_m dans ]0, 1]`,
  room_polygon: (p) => `pièce ${p.id}: polygone ≥ 3 points`,
  room_type: (p) => `pièce ${p.id}: type inconnu`,
  opening_orphan: (p) => `ouverture ${p.id}: mur introuvable`,
  opening_type: (p) => `ouverture ${p.id}: type inconnu`,
  opening_dimensions: (p) => `ouverture ${p.id}: dimensions invalides`,
  opening_overflows: (p) => `ouverture ${p.id}: dépasse le mur`,
}

export function validateGeometry(geometry, wallHeightM) {
  return geometryProblems(geometry, wallHeightM).map((p) => MESSAGES[p.code](p))
}
```

`geometryProblems` reprend le corps actuel de `validateGeometry` en poussant
`{ code, kind, id, derived }` au lieu de chaînes, avec `derived: true` sur le seul cas
`opening_orphan`. **L'ordre de parcours doit rester identique** (murs, pièces, ouvertures)
pour que le miroir reste exact. Les cas sans élément (`geometry_too_large`, `wall_height`)
portent `kind: null, id: null`.

- [ ] **Step 4: Run test to verify it passes**

Run : `cd frontend && npx vitest run src/utils/floorplan.test.js`
Attendu : PASS, y compris les tests de parité serveur existants.

- [ ] **Step 5: Write the failing test (bandeau)**

```jsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GeometryProblems from './GeometryProblems'

const problems = [
  { code: 'wall_too_short', kind: 'wall', id: 'a1b2c3d4e5f6', derived: false },
  { code: 'opening_orphan', kind: 'opening', id: 'ffffffff', derived: true },
]

it('affiche un texte sans identifiant technique et masque les conséquences', () => {
  render(<GeometryProblems problems={problems} onSelect={() => {}} onRepair={() => {}} />)
  expect(screen.getByText(/mur est trop court/i)).toBeInTheDocument()
  expect(screen.queryByText(/a1b2c3d4e5f6/)).not.toBeInTheDocument()
  expect(screen.queryByText(/introuvable/i)).not.toBeInTheDocument()
})

it('sélectionne l’élément fautif quand on clique le message', async () => {
  const onSelect = vi.fn()
  render(<GeometryProblems problems={problems} onSelect={onSelect} onRepair={() => {}} />)
  await userEvent.click(screen.getByText(/mur est trop court/i))
  expect(onSelect).toHaveBeenCalledWith({ kind: 'wall', id: 'a1b2c3d4e5f6' })
})

it('propose la réparation quand un mur dégénéré est présent', async () => {
  const onRepair = vi.fn()
  render(<GeometryProblems problems={problems} onSelect={() => {}} onRepair={onRepair} />)
  await userEvent.click(screen.getByRole('button', { name: /corriger/i }))
  expect(onRepair).toHaveBeenCalled()
})
```

- [ ] **Step 6: Run test to verify it fails**

Run : `cd frontend && npx vitest run src/components/design/GeometryProblems.test.jsx`
Attendu : ÉCHEC — le module n'existe pas.

- [ ] **Step 7: Implement the banner**

`GeometryProblems.jsx` rend un conteneur `role="alert"`, filtre `problems.filter((p) => !p.derived)`,
traduit chaque entrée par `t('dashboard:designEditor.problems.' + p.code)`, rend chaque ligne
comme un `<button>` de cible `min-h-[44px]` appelant `onSelect({ kind: p.kind, id: p.id })`
(uniquement quand `p.id` existe), et affiche le bouton « Corriger » seulement si un problème
`wall_too_short` est présent.

Clés FR (et équivalents AR aux mêmes chemins), sous `designEditor.problems` :

```json
{
  "wall_too_short": "Un mur est trop court pour être enregistré. Touchez pour le voir.",
  "wall_thickness": "L'épaisseur d'un mur est hors limites. Touchez pour le voir.",
  "room_polygon": "Une pièce a moins de trois points. Touchez pour la voir.",
  "room_type": "Une pièce n'a pas de type. Touchez pour la voir.",
  "opening_type": "Une ouverture n'a pas de type. Touchez pour la voir.",
  "opening_dimensions": "Les dimensions d'une ouverture sont invalides. Touchez pour la voir.",
  "opening_overflows": "Une ouverture dépasse de son mur. Touchez pour la voir.",
  "geometry_too_large": "Le plan est trop volumineux pour être enregistré.",
  "wall_height": "La hauteur sous plafond est invalide.",
  "repair": "Corriger",
  "repairConfirm": "Le mur trop court et ses ouvertures seront supprimés. Continuer ?"
}
```

- [ ] **Step 8: Add the reducer repair action**

```js
    case 'REPAIR_GEOMETRY': {
      const keep = state.geometry.walls.filter((w) => wallLength(w) >= MIN_WALL_M)
      if (keep.length === state.geometry.walls.length) return state
      const ids = new Set(keep.map((w) => w.id))
      const geometry = {
        ...state.geometry,
        walls: keep,
        openings: (state.geometry.openings || []).filter((o) => ids.has(o.wall_id)),
      }
      return { ...withGeometry(state, geometry), selection: null }
    }
```

- [ ] **Step 9: Wire it into the editor**

Dans `DesignEditor.jsx`, remplacer l'appel `validateGeometry` (ligne 538) par
`geometryProblems`, rendre `<GeometryProblems>` à la place de la liste actuelle (ligne 575)
avec `onSelect={(selection) => dispatch({ type: 'SELECT', selection })}` et un `onRepair`
qui demande confirmation (`problems.repairConfirm`) puis dispatche `REPAIR_GEOMETRY`.
Ajouter `GeometryProblems.jsx` à `MIGRATED_FILES` dans `noHardcodedText.test.js`.

- [ ] **Step 10: Run all suites**

Run : `cd frontend && npx vitest run && npm run lint && npm run build`
Attendu : tout vert ; `noHardcodedText` toujours vert.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/utils/floorplan.js frontend/src/utils/floorplan.test.js frontend/src/components/design/GeometryProblems.jsx frontend/src/components/design/GeometryProblems.test.jsx frontend/src/components/design/useFloorplanEditor.js frontend/src/pages/dashboard/DesignEditor.jsx frontend/src/locales/fr/dashboard.json frontend/src/locales/ar/dashboard.json frontend/src/i18n/noHardcodedText.test.js
git commit -m "feat(design3d): messages de géométrie lisibles, cliquables et réparables"
```

---

### Task 3: Cotes décalées perpendiculairement au mur

**Files:**
- Modify: `frontend/src/components/design/FloorplanCanvas.jsx:345-355`
- Test: `frontend/src/components/design/FloorplanCanvas.test.jsx`

**Interfaces:**
- Consumes: `isolateLtr` (déjà en place), `DEFAULT_WALL_THICKNESS_M`.

- [ ] **Step 1: Write the failing test**

```jsx
it('pose la cote à côté du mur, jamais sur son axe', () => {
  const geometry = {
    walls: [{ id: 'w1', a: { x: 0, y: 2 }, b: { x: 4, y: 2 }, thickness_m: 0.2 }],
    rooms: [], openings: [],
  }
  const { container } = render(
    <FloorplanCanvas geometry={geometry} dimensions zoom={1} pan={{ x: 0, y: 0 }} readOnly />,
  )
  const label = [...container.querySelectorAll('text')].find((t) => t.textContent.includes('4.00'))
  const y = Number(label.getAttribute('y'))
  expect(Math.abs(y - 2)).toBeGreaterThan(0.2 / 2)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run : `cd frontend && npx vitest run src/components/design/FloorplanCanvas.test.jsx`
Attendu : ÉCHEC — le décalage actuel de 6 px écran ne garantit pas de sortir de l'épaisseur du mur en unités métier.

- [ ] **Step 3: Implement the perpendicular offset**

```jsx
          {dimensions && (() => {
            // Décalage perpendiculaire au mur, vers l'extérieur : une cote posée sur le
            // trait est illisible dès que le mur est horizontal.
            const dx = w.b.x - w.a.x
            const dy = w.b.y - w.a.y
            const len = Math.hypot(dx, dy) || 1
            const off = px(10) + (w.thickness_m || DEFAULT_WALL_THICKNESS_M) / 2
            return (
              <text
                x={(w.a.x + w.b.x) / 2 + (-dy / len) * off}
                y={(w.a.y + w.b.y) / 2 + (dx / len) * off}
                fontSize={label}
                textAnchor="middle"
                fill="#1f2937"
                style={{ pointerEvents: 'none' }}
              >
                {isolateLtr(`${fmt(wallLength(w))} m`)}
              </text>
            )
          })()}
```

- [ ] **Step 4: Run tests**

Run : `cd frontend && npx vitest run src/components/design && npm run lint`
Attendu : PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/design/FloorplanCanvas.jsx frontend/src/components/design/FloorplanCanvas.test.jsx
git commit -m "feat(design3d): décaler les cotes hors du trait du mur"
```

---

### Task 4: Carton rouge partagé et en-tête de l'éditeur

**Files:**
- Create: `frontend/src/components/common/RedCartouche.jsx`
- Modify: `frontend/src/components/common/Wordmark.jsx`
- Modify: `frontend/src/pages/dashboard/DesignEditor.jsx:587,595`
- Test: `frontend/src/components/common/RedCartouche.test.jsx`

**Interfaces:**
- Produces: `<RedCartouche className>{children}</RedCartouche>` — dégradé `#C1121F → #870B15`, texte blanc, `rounded-[5px]`, `shadow-red`, `-rotate-[4deg]`.

- [ ] **Step 1: Write the failing test**

```jsx
import { render, screen } from '@testing-library/react'
import RedCartouche from './RedCartouche'

it('applique le dégradé et l’inclinaison du logo', () => {
  render(<RedCartouche>Éditeur de plan</RedCartouche>)
  const el = screen.getByText('Éditeur de plan')
  expect(el.className).toMatch(/-rotate-\[4deg\]/)
  expect(el.getAttribute('style')).toContain('#C1121F')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run : `cd frontend && npx vitest run src/components/common/RedCartouche.test.jsx`
Attendu : ÉCHEC — le module n'existe pas.

- [ ] **Step 3: Implement the shared cartouche**

```jsx
/**
 * Carton rouge du design system — le « Out » du logo et les titres qui le reprennent.
 * Une seule définition dans le dépôt : dupliquer le dégradé le ferait diverger.
 */
function RedCartouche({ children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center text-white px-[9px] py-[2px] rounded-[5px] shadow-red -rotate-[4deg] ${className}`}
      style={{ background: 'linear-gradient(150deg,#C1121F 0%,#870B15 100%)' }}
    >
      {children}
    </span>
  )
}

export default RedCartouche
```

`Wordmark.jsx` remplace son `<span>` interne par
`<RedCartouche className="text-[18px]">Out</RedCartouche>`.

- [ ] **Step 4: Apply it to the editor header**

Dans `DesignEditor.jsx`, le titre (ligne 587) devient :

```jsx
          <h1 className="text-lg font-display font-extrabold">
            <RedCartouche>{t('dashboard:designEditor.title')}</RedCartouche>
          </h1>
```

et le bouton d'import (ligne 595) passe à la hauteur du badge de synchronisation :

```jsx
          <label className="btn-secondary min-h-[36px] inline-flex items-center gap-2 cursor-pointer">
```

- [ ] **Step 5: Run tests**

Run : `cd frontend && npx vitest run && npm run lint && npm run build`
Attendu : tout vert ; le rendu du logo reste inchangé (tests existants de `Wordmark`).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/common/RedCartouche.jsx frontend/src/components/common/RedCartouche.test.jsx frontend/src/components/common/Wordmark.jsx frontend/src/pages/dashboard/DesignEditor.jsx
git commit -m "feat(design3d): titre en carton rouge et hauteurs alignées dans l'en-tête"
```

---

### Task 5: Points d'entrée dans le back-office

`Login.jsx:32` envoie tout compte d'agence vers `/backoffice`, où `Design3dEntry` n'est monté nulle part : le module est inatteignable pour ses clients.

**Files:**
- Modify: `frontend/src/pages/backoffice/Properties.jsx:152-181`
- Modify: `frontend/src/pages/backoffice/PropertyForm.jsx`
- Modify: `frontend/src/components/design/Design3dEntry.jsx` (prop `disabled`)
- Modify: `frontend/src/locales/fr/dashboard.json`, `frontend/src/locales/ar/dashboard.json`
- Test: `frontend/src/pages/backoffice/Properties.test.jsx`, `frontend/src/pages/backoffice/PropertyForm.test.jsx`

**Interfaces:**
- Produces: `Design3dEntry({ targetType, targetId, compact, disabled, className })` — `disabled` rend un `<span>` non cliquable au lieu d'un `<Link>`, avec le libellé `designEditor.entitlement.needsSave`.

- [ ] **Step 1: Write the failing tests**

```jsx
// Properties.test.jsx — suivre le patron de montage déjà utilisé dans ce fichier
it("propose « Concevoir en 3D » dans le menu d'un bien quand le module est actif", async () => {
  renderProperties({ features: ['design3d'] })
  await userEvent.click(screen.getAllByRole('button', { name: /actions/i })[0])
  expect(screen.getByText(/Concevoir en 3D/i)).toBeInTheDocument()
})

it('ne propose rien quand le module est inactif', async () => {
  renderProperties({ features: [] })
  await userEvent.click(screen.getAllByRole('button', { name: /actions/i })[0])
  expect(screen.queryByText(/Concevoir en 3D/i)).not.toBeInTheDocument()
})

// PropertyForm.test.jsx
it("désactive l'entrée tant que le bien n'est pas enregistré", () => {
  renderForm({ features: ['design3d'], propertyId: null })
  expect(screen.getByText(/enregistrez d'abord/i)).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /Concevoir en 3D/i })).not.toBeInTheDocument()
})

it("active l'entrée dès que le bien a un identifiant", () => {
  renderForm({ features: ['design3d'], propertyId: 42 })
  expect(screen.getByRole('link', { name: /Concevoir en 3D/i }))
    .toHaveAttribute('href', '/dashboard/conception?target_type=property&target_id=42')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run : `cd frontend && npx vitest run src/pages/backoffice`
Attendu : ÉCHEC — aucune entrée dans le menu, prop `disabled` inexistante.

- [ ] **Step 3: Add the `disabled` variant**

Dans `Design3dEntry.jsx`, juste avant la branche `compact` :

```jsx
  if (disabled) {
    return (
      <span
        className={`inline-flex items-center gap-2 min-h-[44px] px-3 text-gray-400 ${className}`}
        title={t('dashboard:designEditor.entitlement.needsSave')}
      >
        <FiBox className="w-4 h-4" />
        {t('dashboard:designEditor.entitlement.needsSave')}
      </span>
    )
  }
```

Clé FR sous `designEditor.entitlement` :
`"needsSave": "Concevoir en 3D — enregistrez d'abord le bien"` (et son équivalent AR).

- [ ] **Step 4: Mount it in both back-office pages**

`Properties.jsx` — dans le menu de la carte, après « Modifier » et avant
« Nouvelle transaction ». Variante pleine (le menu porte des libellés, pas des icônes) :

```jsx
              <Design3dEntry targetType="property" targetId={property.id} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 w-full" />
```

`PropertyForm.jsx` — dans la barre d'actions du formulaire :

```jsx
            <Design3dEntry targetType="property" targetId={propertyId} disabled={!propertyId} />
```

- [ ] **Step 5: Run tests**

Run : `cd frontend && npx vitest run && npm run lint && npm run build`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/backoffice/Properties.jsx frontend/src/pages/backoffice/Properties.test.jsx frontend/src/pages/backoffice/PropertyForm.jsx frontend/src/pages/backoffice/PropertyForm.test.jsx frontend/src/components/design/Design3dEntry.jsx frontend/src/locales/fr/dashboard.json frontend/src/locales/ar/dashboard.json
git commit -m "feat(design3d): rendre l'éditeur atteignable depuis le back-office"
```

---

### Task 6: Sélection multiple par rectangle

**Files:**
- Modify: `frontend/src/components/design/useFloorplanEditor.js` (sélection en liste, `SELECT_AREA`)
- Modify: `frontend/src/components/design/FloorplanCanvas.jsx:114-155` (geste + rendu du rectangle)
- Modify: `frontend/src/components/design/PropertiesPanel.jsx` (décompte)
- Test: `frontend/src/components/design/useFloorplanEditor.test.js`, `frontend/src/components/design/FloorplanCanvas.test.jsx`

**Interfaces:**
- Produces: `state.selection` reste `{kind, id} | null` pour un élément, et devient `{ kind: 'multi', items: [{kind, id}] }` à plusieurs. Toute lecture existante d'une sélection unique continue de fonctionner.
- Produces: action `{ type: 'SELECT_AREA', rect: { x1, y1, x2, y2 } }`.
- Produces: `selectionItems(selection) -> [{kind, id}]` exporté depuis `useFloorplanEditor.js` — consommé par Task 7.

- [ ] **Step 1: Write the failing test**

```js
import { reducer, initialState, selectionItems } from './useFloorplanEditor'

const grid = {
  walls: [
    { id: 'in', a: { x: 1, y: 1 }, b: { x: 2, y: 1 }, thickness_m: 0.2 },
    { id: 'half', a: { x: 1, y: 1 }, b: { x: 9, y: 1 }, thickness_m: 0.2 },
  ],
  rooms: [{ id: 'r', type: 'living', polygon: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }] }],
  openings: [{ id: 'o', wall_id: 'in', type: 'door', offset_m: 0.1, width_m: 0.5 }],
}

it('ne prend que les objets entièrement contenus dans le rectangle', () => {
  const s = reducer({ ...initialState, geometry: grid }, {
    type: 'SELECT_AREA', rect: { x1: 0, y1: 0, x2: 3, y2: 3 },
  })
  expect(selectionItems(s.selection)).toEqual([
    { kind: 'wall', id: 'in' },
    { kind: 'room', id: 'r' },
  ])
})

it('supprime toute la sélection, ouvertures des murs comprises', () => {
  let s = reducer({ ...initialState, geometry: grid }, {
    type: 'SELECT_AREA', rect: { x1: 0, y1: 0, x2: 3, y2: 3 },
  })
  s = reducer(s, { type: 'DELETE_SELECTED' })
  expect(s.geometry.walls.map((w) => w.id)).toEqual(['half'])
  expect(s.geometry.openings).toEqual([])
  expect(s.geometry.rooms).toEqual([])
})

it('laisse la sélection unique strictement inchangée', () => {
  const s = reducer({ ...initialState, geometry: grid }, {
    type: 'SELECT', selection: { kind: 'wall', id: 'in' },
  })
  expect(s.selection).toEqual({ kind: 'wall', id: 'in' })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run : `cd frontend && npx vitest run src/components/design/useFloorplanEditor.test.js`
Attendu : ÉCHEC — `SELECT_AREA` et `selectionItems` n'existent pas.

- [ ] **Step 3: Implement the selection model**

```js
export const selectionItems = (selection) =>
  !selection ? [] : selection.kind === 'multi' ? selection.items : [selection]

const inRect = (p, r) =>
  p.x >= Math.min(r.x1, r.x2) && p.x <= Math.max(r.x1, r.x2) &&
  p.y >= Math.min(r.y1, r.y2) && p.y <= Math.max(r.y1, r.y2)

// Un objet n'est pris que s'il est ENTIÈREMENT dans le rectangle : c'est la règle la plus
// prévisible, et elle tranche le cas des pièces à moitié englobées. Les ouvertures suivent
// leur mur, elles ne sont jamais prises seules.
function itemsInRect(geometry, rect) {
  const items = []
  for (const w of geometry.walls || []) {
    if (inRect(w.a, rect) && inRect(w.b, rect)) items.push({ kind: 'wall', id: w.id })
  }
  for (const r of geometry.rooms || []) {
    if ((r.polygon || []).length >= 3 && r.polygon.every((p) => inRect(p, rect))) {
      items.push({ kind: 'room', id: r.id })
    }
  }
  return items
}
```

Dans le réducteur :

```js
    case 'SELECT_AREA': {
      const items = itemsInRect(state.geometry, action.rect)
      const selection = items.length === 0 ? null
        : items.length === 1 ? items[0]
        : { kind: 'multi', items }
      return { ...state, selection, draft: null }
    }
```

`DELETE_SELECTED` applique `deleteSelected` successivement à chaque entrée de
`selectionItems(state.selection)` :

```js
    case 'DELETE_SELECTED': {
      const items = selectionItems(state.selection)
      if (items.length === 0) return state
      const geometry = items.reduce((g, item) => deleteSelected(g, item), state.geometry)
      return { ...withGeometry(state, geometry), selection: null }
    }
```

- [ ] **Step 4: Implement the gesture**

Dans `FloorplanCanvas.jsx`, avec l'outil `select` :
- `onPointerDown` sur une zone vide (ni `hitVertex`, ni `hitTest`) mémorise l'origine dans
  une ref `area.current` **au lieu** de dispatcher `SELECT` immédiatement ;
- `onPointerMove` met à jour un rectangle de brouillon, rendu en `<rect>` pointillé
  (`stroke="#2563eb"`, `fill="rgba(37,99,235,0.08)"`) ;
- `onPointerUp` dispatche `SELECT_AREA` si le pointeur a bougé (`moved.current`), sinon
  `SELECT` avec `hitTest` comme aujourd'hui.

Les deux doigts restent la navigation (branche `pointers.current.size === 2`, inchangée) et
les autres outils ne sont pas touchés.

- [ ] **Step 5: Show the count in the properties panel**

Dans `PropertiesPanel.jsx`, si `selection?.kind === 'multi'`, afficher
`t('dashboard:designEditor.selection.count', { n: selection.items.length })` au lieu du
détail d'un élément. Clé FR : `"count": "{{n}} objets sélectionnés"` (et son AR).

- [ ] **Step 6: Run tests**

Run : `cd frontend && npx vitest run src/components/design && npm run lint`

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/design/useFloorplanEditor.js frontend/src/components/design/useFloorplanEditor.test.js frontend/src/components/design/FloorplanCanvas.jsx frontend/src/components/design/FloorplanCanvas.test.jsx frontend/src/components/design/PropertiesPanel.jsx frontend/src/locales/fr/dashboard.json frontend/src/locales/ar/dashboard.json
git commit -m "feat(design3d): sélection multiple par rectangle"
```

---

### Task 7: Déplacement en bloc de la sélection

**Files:**
- Modify: `frontend/src/components/design/useFloorplanEditor.js` (action `MOVE_SELECTION`)
- Modify: `frontend/src/components/design/FloorplanCanvas.jsx` (glissé depuis un objet sélectionné)
- Test: `frontend/src/components/design/useFloorplanEditor.test.js`

**Interfaces:**
- Consumes: `selectionItems` (Task 6), `wallLength`.
- Produces: action `{ type: 'MOVE_SELECTION', delta: { x, y }, dragging }`.

- [ ] **Step 1: Write the failing test**

```js
import { wallLength } from '../../utils/floorplan'

it('translate toute la sélection sans changer les longueurs', () => {
  let s = reducer({ ...initialState, geometry: grid }, {
    type: 'SELECT_AREA', rect: { x1: 0, y1: 0, x2: 3, y2: 3 },
  })
  const before = wallLength(s.geometry.walls.find((w) => w.id === 'in'))
  s = reducer(s, { type: 'MOVE_SELECTION', delta: { x: 5, y: 0 } })
  const moved = s.geometry.walls.find((w) => w.id === 'in')
  expect(moved.a).toEqual({ x: 6, y: 1 })
  expect(wallLength(moved)).toBeCloseTo(before, 10)
  expect(s.geometry.walls.find((w) => w.id === 'half').a).toEqual({ x: 1, y: 1 })
})

it('laisse les ouvertures suivre leur mur sans traitement', () => {
  let s = reducer({ ...initialState, geometry: grid }, {
    type: 'SELECT_AREA', rect: { x1: 0, y1: 0, x2: 3, y2: 3 },
  })
  s = reducer(s, { type: 'MOVE_SELECTION', delta: { x: 5, y: 0 } })
  expect(s.geometry.openings[0]).toEqual(grid.openings[0])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run : `cd frontend && npx vitest run src/components/design/useFloorplanEditor.test.js`
Attendu : ÉCHEC — `MOVE_SELECTION` n'existe pas.

- [ ] **Step 3: Implement the block move**

```js
    case 'MOVE_SELECTION': {
      const items = selectionItems(state.selection)
      if (items.length === 0) return state
      const { x: dx, y: dy } = action.delta
      const wallIds = new Set(items.filter((i) => i.kind === 'wall').map((i) => i.id))
      const roomIds = new Set(items.filter((i) => i.kind === 'room').map((i) => i.id))
      const shift = (p) => ({ x: p.x + dx, y: p.y + dy })
      // Une translation conserve les longueurs : elle ne peut pas produire le mur
      // dégénéré que la garde de MIN_WALL_M empêche par ailleurs. Et les ouvertures,
      // positionnées par un décalage le long de leur mur, suivent sans traitement.
      const geometry = {
        ...state.geometry,
        walls: state.geometry.walls.map((w) =>
          wallIds.has(w.id) ? { ...w, a: shift(w.a), b: shift(w.b) } : w),
        rooms: state.geometry.rooms.map((r) =>
          roomIds.has(r.id) ? { ...r, polygon: r.polygon.map(shift) } : r),
      }
      const continuing = action.dragging && state.dragging
      return { ...withGeometry(state, geometry, !continuing), dragging: !!action.dragging }
    }
```

- [ ] **Step 4: Wire the gesture**

Dans `FloorplanCanvas.jsx`, avec l'outil `select` : si `onPointerDown` touche un objet
**déjà présent** dans `selectionItems(selection)`, mémoriser l'origine et dispatcher
`MOVE_SELECTION` avec `dragging: true` à chaque `onPointerMove` (delta relatif au dernier
point), puis `END_DRAG` au relâchement — même patron que le déplacement de sommet
existant, donc une seule entrée d'historique par geste.

- [ ] **Step 5: Run tests**

Run : `cd frontend && npx vitest run src/components/design && npm run lint`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/design/useFloorplanEditor.js frontend/src/components/design/useFloorplanEditor.test.js frontend/src/components/design/FloorplanCanvas.jsx
git commit -m "feat(design3d): déplacement en bloc d'une sélection multiple"
```

---

### Task 8: Suppression automatique des niveaux et projets vides

**Files:**
- Modify: `frontend/src/services/design3dLocal.js` (`isLevelEmpty`)
- Modify: `frontend/src/services/design3dSync.js` (`cleanupEmpty`)
- Modify: `frontend/src/pages/dashboard/DesignEditor.jsx` (les deux déclencheurs)
- Modify: `frontend/src/pages/dashboard/DesignProjects.jsx` (avis « projet vide supprimé »)
- Modify: `frontend/src/locales/fr/dashboard.json`, `frontend/src/locales/ar/dashboard.json`
- Test: `frontend/src/services/design3dSync.test.js`

**Interfaces:**
- Produces: `isLevelEmpty(level) -> boolean` — vrai si aucun mur, aucune pièce, aucune ouverture, **et** ni `background_image_key` ni `calibration`.
- Produces: `cleanupEmpty(projectId, { api, local }) -> { removedLevels, removedProject }`.
- Consumes: la purge locale de `discardRefusedProject` (projet jamais synchronisé), `isLevelEmpty`.

- [ ] **Step 1: Write the failing tests**

```js
import { isLevelEmpty } from './design3dLocal'
import { cleanupEmpty } from './design3dSync'

const emptyGeo = { walls: [], rooms: [], openings: [] }

it("ne considère pas vide un niveau qui porte une image ou une calibration", () => {
  expect(isLevelEmpty({ geometry: emptyGeo })).toBe(true)
  expect(isLevelEmpty({ geometry: emptyGeo, background_image_key: 'k' })).toBe(false)
  expect(isLevelEmpty({ geometry: emptyGeo, calibration: { scale: 1 } })).toBe(false)
  expect(isLevelEmpty({ geometry: { ...emptyGeo, walls: [{ id: 'w' }] } })).toBe(false)
})

it("supprime le projet quand tous ses niveaux sont vides", async () => {
  const projectId = await seedProject({ levels: [{}, {}] })
  expect(await cleanupEmpty(projectId, { api, local })).toEqual({
    removedLevels: 2, removedProject: true,
  })
  expect(await local.getProject(projectId)).toBeUndefined()
})

it("ne touche jamais un projet publié", async () => {
  const projectId = await seedProject({ status: 'ready', levels: [{}] })
  expect(await cleanupEmpty(projectId, { api, local })).toEqual({
    removedLevels: 0, removedProject: false,
  })
  expect(await local.getProject(projectId)).toBeDefined()
})

it("ne supprime que les niveaux vides quand d'autres portent du travail", async () => {
  const projectId = await seedProject({ levels: [{}, { walls: [{ id: 'w' }] }] })
  expect(await cleanupEmpty(projectId, { api, local })).toEqual({
    removedLevels: 1, removedProject: false,
  })
})

it("purge localement un projet jamais synchronisé, sans envoyer de suppression", async () => {
  const projectId = await seedProject({ synced: false, levels: [{}] })
  await cleanupEmpty(projectId, { api, local })
  expect(api.deleteProject).not.toHaveBeenCalled()
  expect(await local.pendingCount()).toBe(0)
})
```

`seedProject` est un utilitaire local au fichier de test : il écrit un projet et ses
niveaux dans `fake-indexeddb`, `synced: true` par défaut.

- [ ] **Step 2: Run tests to verify they fail**

Run : `cd frontend && npx vitest run src/services/design3dSync.test.js`
Attendu : ÉCHEC — `isLevelEmpty` et `cleanupEmpty` n'existent pas.

- [ ] **Step 3: Implement `isLevelEmpty`**

```js
// Un niveau qui porte une image de fond ou une calibration n'est PAS vide : l'agent a
// photographié un plan et l'a mis à l'échelle pour tracer plus tard, c'est du travail.
export const isLevelEmpty = (lv) => {
  const g = lv?.geometry || {}
  const none = (a) => !(a || []).length
  return none(g.walls) && none(g.rooms) && none(g.openings)
    && !lv?.background_image_key && !lv?.calibration
}
```

- [ ] **Step 4: Implement `cleanupEmpty`**

```js
/**
 * Nettoyage des niveaux laissés vides, à l'ouverture et à la sortie de l'éditeur.
 * Ne touche JAMAIS un projet publié : il est affiché sur la fiche du bien, le supprimer
 * retirerait un plan public sans que personne l'ait demandé.
 */
export async function cleanupEmpty(projectId, { api = defaultApi, local = defaultLocal } = {}) {
  const project = await local.getProject(projectId)
  const none = { removedLevels: 0, removedProject: false }
  if (!project || project.status === 'ready') return none

  const levels = await local.listLevels(projectId)
  if (levels.length === 0) return none
  const empty = levels.filter(isLevelEmpty)
  if (empty.length === 0) return none

  if (empty.length === levels.length) {
    // Jamais parvenu au serveur : purge locale, sans envoyer de suppression pour un
    // identifiant qu'il n'a jamais connu (même mécanique que l'abandon d'un projet refusé).
    if (!project.synced) {
      await discardLocalProject(projectId, { local })
    } else {
      await applyLocal({ type: 'project.delete', payload: { id: projectId } }, { local })
    }
    return { removedLevels: empty.length, removedProject: true }
  }

  for (const lv of empty) {
    await applyLocal({ type: 'level.delete', payload: { id: lv.id, project_id: projectId } }, { local })
  }
  return { removedLevels: empty.length, removedProject: false }
}
```

`discardLocalProject` est la partie purement locale extraite de `discardRefusedProject`
(suppression du projet, de ses niveaux, de ses fonds et de ses opérations en file) — la
factoriser plutôt que de la dupliquer, `discardRefusedProject` l'appelant désormais.

- [ ] **Step 5: Wire the two triggers**

Dans `DesignEditor.jsx`, un effet dépendant de `projectId` :

```jsx
  useEffect(() => {
    if (!projectId) return undefined
    // À l'ouverture : ramasse ce qu'une session interrompue (onglet fermé, tablette
    // éteinte) aurait laissé. Au démontage : le cas nominal. On ne s'appuie pas sur
    // `beforeunload`, dont l'écriture asynchrone n'est pas garantie (établi en brique 1).
    cleanupEmpty(projectId).catch(() => {})
    return () => { cleanupEmpty(projectId).catch(() => {}) }
  }, [projectId])
```

`DesignProjects.jsx` affiche `t('dashboard:designEditor.projects.emptyRemoved')` quand le
nettoyage a supprimé quelque chose au chargement de la liste.

Clé FR sous `designEditor.projects` : `"emptyRemoved": "Projet vide supprimé."` (et son AR).

- [ ] **Step 6: Run all suites**

Run : `cd frontend && npx vitest run && npm run lint && npm run build`

- [ ] **Step 7: Commit**

```bash
git add frontend/src/services/design3dLocal.js frontend/src/services/design3dSync.js frontend/src/services/design3dSync.test.js frontend/src/pages/dashboard/DesignEditor.jsx frontend/src/pages/dashboard/DesignProjects.jsx frontend/src/locales/fr/dashboard.json frontend/src/locales/ar/dashboard.json
git commit -m "feat(design3d): supprimer automatiquement les niveaux et projets vides"
```

---

### Task 9: Lister les projets de l'agence côté serveur

`GET /design3d/projects` exige aujourd'hui `target_type` et `target_id` : impossible de proposer les projets de l'agence comme sources de réutilisation.

**Files:**
- Modify: `services/design3d/app/main.py` (route `GET /design3d/projects`)
- Test: `services/design3d/tests/test_projects.py`

**Interfaces:**
- Produces: `GET /design3d/projects` sans `target_type`/`target_id` → les projets de l'agence du principal, triés par `updated_at` décroissant, bornés par `limit` (défaut 50). Le cloisonnement reste celui de `_access`.

- [ ] **Step 1: Write the failing test**

```python
def test_liste_sans_cible_renvoie_les_projets_de_l_agence(client, other_agency_client):
    client.post("/design3d/projects", json={"id": "a" * 32, "target_type": "property",
                                            "target_id": 1, "title": "A"})
    other_agency_client.post("/design3d/projects", json={"id": "b" * 32, "target_type": "property",
                                                          "target_id": 2, "title": "B"})
    r = client.get("/design3d/projects")
    assert r.status_code == 200
    assert [p["id"] for p in r.json()["projects"]] == ["a" * 32]


def test_liste_avec_cible_reste_filtree(client):
    client.post("/design3d/projects", json={"id": "c" * 32, "target_type": "property",
                                            "target_id": 7, "title": "C"})
    r = client.get("/design3d/projects", params={"target_type": "property", "target_id": 8})
    assert r.status_code == 200
    assert r.json()["projects"] == []
```

Le fixture `other_agency_client` suit le patron des tests inter-agences existants
(`tests/test_target_ownership.py`).

- [ ] **Step 2: Run test to verify it fails**

Run : `cd services/design3d && python3 -m pytest tests/test_projects.py -k sans_cible -v`
Attendu : ÉCHEC — 422, les paramètres de cible sont obligatoires.

- [ ] **Step 3: Implement**

Rendre `target_type` et `target_id` optionnels dans la signature de la route. Quand ils
sont absents, filtrer sur le tenant et l'agence du principal uniquement, trier par
`updated_at` décroissant et borner par `limit`. Quand ils sont fournis, ne rien changer au
comportement actuel. Conserver la sérialisation existante (`to_dict()`).

- [ ] **Step 4: Run tests**

Run : `cd services/design3d && python3 -m pytest -q`
Attendu : tout vert (les 81 tests existants + les 2 nouveaux).

- [ ] **Step 5: Commit**

```bash
git add services/design3d/app/main.py services/design3d/tests/test_projects.py
git commit -m "feat(design3d): lister les projets de l'agence sans cible imposée"
```

---

### Task 10: Réutiliser un niveau existant

**Files:**
- Create: `frontend/src/components/design/ReuseLevelDialog.jsx`
- Modify: `frontend/src/services/design3dApi.js` (`listAgencyProjects`)
- Modify: `frontend/src/services/design3dLocal.js` (`listKnownProjects`)
- Modify: `frontend/src/utils/floorplan.js` (`copyGeometry`)
- Modify: `frontend/src/components/design/useFloorplanEditor.js` (`REPLACE_GEOMETRY`)
- Modify: `frontend/src/pages/dashboard/DesignEditor.jsx` (bouton + dialogue)
- Modify: `frontend/src/locales/fr/dashboard.json`, `frontend/src/locales/ar/dashboard.json`
- Modify: `frontend/src/i18n/noHardcodedText.test.js`
- Test: `frontend/src/utils/floorplan.test.js`, `frontend/src/components/design/ReuseLevelDialog.test.jsx`

**Interfaces:**
- Consumes: `GET /design3d/projects` sans cible (Task 9), `newId` (`utils/floorplan.js:24`).
- Produces: `copyGeometry(geometry) -> geometry` — identifiants régénérés, lien `wall_id` des ouvertures préservé.
- Produces: `listAgencyProjects() -> [{ id, title, levels }]` (API) et `listKnownProjects() -> [...]` (IndexedDB).
- Produces: action `{ type: 'REPLACE_GEOMETRY', geometry, wallHeightM }`.

- [ ] **Step 1: Write the failing test (copie)**

```js
import { copyGeometry } from './floorplan'

it('régénère les identifiants et préserve le lien ouverture → mur', () => {
  const src = {
    walls: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, thickness_m: 0.2 }],
    openings: [{ id: 'o1', wall_id: 'w1', type: 'door', offset_m: 1, width_m: 0.9 }],
    rooms: [{ id: 'r1', type: 'living', polygon: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 2 }] }],
  }
  const out = copyGeometry(src)
  expect(out.walls[0].id).not.toBe('w1')
  expect(out.openings[0].wall_id).toBe(out.walls[0].id)
  expect(out.walls[0].a).toEqual({ x: 0, y: 0 })
  expect(out.rooms[0].id).not.toBe('r1')
  expect(src.walls[0].id).toBe('w1')
})

it('écarte une ouverture dont le mur ne fait pas partie de la copie', () => {
  const out = copyGeometry({ walls: [], rooms: [], openings: [{ id: 'o', wall_id: 'absent' }] })
  expect(out.openings).toEqual([])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run : `cd frontend && npx vitest run src/utils/floorplan.test.js`
Attendu : ÉCHEC — `copyGeometry` n'existe pas.

- [ ] **Step 3: Implement `copyGeometry`**

```js
// Copie ponctuelle et indépendante : aucun lien n'est gardé avec la source, qui n'est
// jamais modifiée. Les identifiants sont régénérés pour éviter toute collision, et la
// correspondance ouverture → mur est réécrite en conséquence.
export function copyGeometry(geometry) {
  const wallIds = new Map((geometry.walls || []).map((w) => [w.id, newId()]))
  return {
    walls: (geometry.walls || []).map((w) => ({ ...w, id: wallIds.get(w.id) })),
    rooms: (geometry.rooms || []).map((r) => ({ ...r, id: newId() })),
    openings: (geometry.openings || [])
      .filter((o) => wallIds.has(o.wall_id))
      .map((o) => ({ ...o, id: newId(), wall_id: wallIds.get(o.wall_id) })),
  }
}
```

- [ ] **Step 4: Write the failing test (dialogue)**

```jsx
it('annonce une liste limitée quand on est hors connexion', async () => {
  render(<ReuseLevelDialog online={false} local={local} api={api} onPick={() => {}} onClose={() => {}} />)
  expect(await screen.findByText(/liste limitée/i)).toBeInTheDocument()
  expect(api.listAgencyProjects).not.toHaveBeenCalled()
})

it('interroge le serveur quand on est en ligne', async () => {
  render(<ReuseLevelDialog online local={local} api={api} onPick={() => {}} onClose={() => {}} />)
  await screen.findByText(/Plan du RDC/i)
  expect(api.listAgencyProjects).toHaveBeenCalled()
})

it('remonte la géométrie et la hauteur du niveau choisi', async () => {
  const onPick = vi.fn()
  render(<ReuseLevelDialog online local={local} api={api} onPick={onPick} onClose={() => {}} />)
  await userEvent.click(await screen.findByText(/Plan du RDC/i))
  expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ wall_height_m: 2.7 }))
})
```

- [ ] **Step 5: Run test to verify it fails**

Run : `cd frontend && npx vitest run src/components/design/ReuseLevelDialog.test.jsx`
Attendu : ÉCHEC — le module n'existe pas.

- [ ] **Step 6: Implement the dialog and wiring**

`ReuseLevelDialog` liste les projets — `api.listAgencyProjects()` quand `online`,
`local.listKnownProjects()` sinon, avec la mention `designEditor.reuse.offlineLimited` —
puis leurs niveaux, et appelle `onPick(level)`. Le projet en cours est proposé aussi :
c'est le cas « autre étage ». Cibles `min-h-[44px]`.

Action réducteur :

```js
    case 'REPLACE_GEOMETRY':
      return { ...withGeometry(state, { ...EMPTY, ...action.geometry }), selection: null, draft: null }
```

Dans `DesignEditor.jsx` : un bouton `designEditor.reuse.action` ouvre le dialogue ;
`onPick` demande confirmation (`reuse.confirm`) si le niveau courant n'est pas vide, puis
dispatche `REPLACE_GEOMETRY` avec `copyGeometry(level.geometry)` et met `form.wall_height_m`
à celle de la source. Ajouter `ReuseLevelDialog.jsx` à `MIGRATED_FILES`.

Clés FR sous `designEditor.reuse` (et leurs AR) :

```json
{
  "action": "Reprendre un plan existant",
  "title": "Reprendre un plan existant",
  "offlineLimited": "Liste limitée aux plans déjà présents sur cet appareil, faute de connexion.",
  "empty": "Aucun autre plan disponible.",
  "confirm": "Le plan actuel de ce niveau sera remplacé. Continuer ?"
}
```

- [ ] **Step 7: Run all suites**

Run : `cd frontend && npx vitest run && npm run lint && npm run build && npx playwright test`
Attendu : tout vert.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/design/ReuseLevelDialog.jsx frontend/src/components/design/ReuseLevelDialog.test.jsx frontend/src/services/design3dApi.js frontend/src/services/design3dLocal.js frontend/src/utils/floorplan.js frontend/src/utils/floorplan.test.js frontend/src/components/design/useFloorplanEditor.js frontend/src/pages/dashboard/DesignEditor.jsx frontend/src/locales/fr/dashboard.json frontend/src/locales/ar/dashboard.json frontend/src/i18n/noHardcodedText.test.js
git commit -m "feat(design3d): reprendre le plan d'un autre niveau ou d'un autre projet"
```

---

## Vérifications finales (après Task 10)

- [ ] `cd frontend && npm run lint && npx vitest run && npm run build && npx playwright test`
- [ ] `cd services/design3d && python3 -m pytest -q`
- [ ] `python3 tools/check_env_examples.py`
- [ ] Parité FR/AR : même nombre de clés sous `designEditor.problems`, `designEditor.reuse`, `designEditor.selection`, `designEditor.entitlement`, `designEditor.projects`.
- [ ] `grep -rn "MIN_WALL_M" frontend/src` : une seule définition, dans `useFloorplanEditor.js`.
- [ ] **À faire par le propriétaire, non automatisable** : revue sur iPad et tablette Android réels — geste du rectangle et déplacement en bloc au doigt, lisibilité des cotes décalées, et **confort de visée du bouton « Importer un plan » passé à 36 px** (point ajouté à la checklist appareils par décision du propriétaire).
