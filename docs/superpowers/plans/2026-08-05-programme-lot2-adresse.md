# Programme — Livrable 2 (champ adresse Google-ready) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans pour implémenter tâche par tâche. Les étapes utilisent la syntaxe checkbox (`- [ ]`).

**Goal:** Remplacer l'input adresse libre de l'étape Localisation par un composant `AddressAutocomplete` réutilisable, prêt à brancher Google Places Autocomplete plus tard (payant, différé), qui remplit `address` + `latitude`/`longitude` via un callback `onSelect`.

**Architecture:** (a) Nouveau composant `frontend/src/components/common/AddressAutocomplete.jsx` — input contrôlé (`value`/`onChange`) + prop `onSelect({ address, lat, lng })`. Sans clé Google, il se comporte comme un input libre (aucun appel réseau). Le point d'entrée Google Places est documenté (commentaire + emplacement du hook) sans dépendance ni clé. (b) Câbler ce composant dans l'étape Localisation de `ProgramForm.jsx` à la place de l'input adresse actuel : `onChange` met à jour `formData.address`, `onSelect` met à jour `address` + `latitude` + `longitude` en une fois.

**Tech Stack:** React 18, Tailwind. Aucune dépendance nouvelle. Aucun changement backend (`Program.address`/`latitude`/`longitude` existent déjà).

## Global Constraints

- Français codé en dur (branche sans i18n).
- **Aucune infra de test frontend sur cette branche** → vérification par `npm run build` + revue.
- **Aucune clé Google, aucun appel réseau, aucune dépendance npm ajoutée** dans ce livrable — le branchement réel Google Places est explicitement différé (payant). Ne préparer que le point d'entrée.
- Frontend uniquement. Compat ascendante : un programme sans coordonnées s'édite normalement (saisie manuelle).
- Suivre les patterns existants (Tailwind, classes des inputs : `w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent`).
- `npm run build` vert après chaque tâche. Répertoire : `frontend/`. Branche : `feature/program-form-ameliorations`.

---

## File Structure

- Create: `frontend/src/components/common/AddressAutocomplete.jsx` — composant input adresse contrôlé + `onSelect`.
- Modify: `frontend/src/pages/dashboard/ProgramForm.jsx` — étape Localisation (`currentStep === 2`), remplacer l'input adresse (l.690-701) par `<AddressAutocomplete>` + import.

Rappels du fichier `ProgramForm.jsx` :
- `formData` a `address` (''), `latitude` (null), `longitude` (null) — l.279-283 ; chargés à l'édition l.314-318.
- L'input adresse actuel est l.690-701 dans le bloc `{currentStep === 2 && ( … )}`. Les inputs Latitude/Longitude manuels (l.703-730) **restent** (repli/ajustement manuel).

---

## Task 1: Composant `AddressAutocomplete`

**Files:**
- Create: `frontend/src/components/common/AddressAutocomplete.jsx`

**Interfaces:**
- Produces (utilisé par Task 2) : `export default function AddressAutocomplete({ value, onChange, onSelect, label, placeholder, id })`.
  - `value` (string) : l'adresse courante (contrôlé).
  - `onChange(nextAddress: string)` : appelé à chaque frappe (l'appelant met à jour `formData.address`).
  - `onSelect({ address, lat, lng })` : appelé quand une suggestion Google est choisie (branchement futur). Optionnel ; non déclenché tant que Google n'est pas branché.
  - `label`, `placeholder`, `id` : présentation.

- [ ] **Step 1: Créer le composant**

Créer `frontend/src/components/common/AddressAutocomplete.jsx` :

```jsx
import { useRef } from 'react'
import { FiMapPin } from 'react-icons/fi'

/**
 * Champ adresse contrôlé, prêt pour Google Places Autocomplete.
 *
 * Sans clé Google (cas actuel), c'est un simple input libre : la saisie remonte
 * via `onChange`. Le branchement réel Google Places (payant, différé) se fera ici :
 * initialiser `new google.maps.places.Autocomplete(inputRef.current)` dans un
 * useEffect gardé par la présence de `window.google?.maps?.places`, écouter
 * l'événement `place_changed`, puis appeler
 * `onSelect({ address: place.formatted_address, lat: ..., lng: ... })`.
 * Aucune dépendance ni clé n'est ajoutée dans ce livrable.
 */
export default function AddressAutocomplete({
  value = '',
  onChange,
  onSelect, // eslint-disable-line no-unused-vars -- point d'entrée Google Places (branchement différé)
  label = 'Adresse complète',
  placeholder = 'Adresse du projet',
  id = 'address-autocomplete',
}) {
  const inputRef = useRef(null)

  return (
    <div>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}
      <div className="relative">
        <FiMapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
        <input
          id={id}
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          autoComplete="off"
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Vérifier le build**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/common/AddressAutocomplete.jsx
git commit -m "feat(program-form): composant AddressAutocomplete (input adresse Google-ready)"
```

---

## Task 2: Câbler `AddressAutocomplete` dans l'étape Localisation

**Files:**
- Modify: `frontend/src/pages/dashboard/ProgramForm.jsx`

**Interfaces:**
- Consumes : `AddressAutocomplete` (Task 1).

- [ ] **Step 1: Importer le composant**

Ajouter en tête de `ProgramForm.jsx`, à côté des autres imports de composants (ex. `SpecFields`) :

```jsx
import AddressAutocomplete from '../../components/common/AddressAutocomplete'
```

- [ ] **Step 2: Remplacer l'input adresse par le composant**

Dans le bloc `{currentStep === 2 && ( … )}`, remplacer le `<div>` de l'adresse (l.690-701, celui avec le label « Adresse complète ») par :

```jsx
            <AddressAutocomplete
              value={formData.address}
              onChange={(address) => setFormData({ ...formData, address })}
              onSelect={({ address, lat, lng }) =>
                setFormData({ ...formData, address, latitude: lat ?? null, longitude: lng ?? null })
              }
            />
```

(`onChange` met à jour uniquement l'adresse ; `onSelect` — déclenché plus tard par Google Places — remplit adresse + coordonnées en une fois. Les champs Latitude/Longitude manuels en dessous restent inchangés pour l'ajustement manuel.)

- [ ] **Step 3: Vérifier le build**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

- [ ] **Step 4: Vérification manuelle**

Run: `cd frontend && npm run dev`
Ouvrir un programme → étape Localisation. Le champ Adresse s'affiche avec l'icône épingle, la saisie libre fonctionne (mise à jour de `formData.address`), et les champs Latitude/Longitude restent éditables manuellement. À l'édition d'un programme existant, l'adresse enregistrée se pré-remplit.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/dashboard/ProgramForm.jsx
git commit -m "feat(program-form): brancher AddressAutocomplete dans l'etape Localisation"
```

---

## Validation finale du livrable 2

- [ ] `cd frontend && npm run build` → `✓ built`.
- [ ] Manuel : saisie libre de l'adresse OK ; pré-remplissage à l'édition OK ; Latitude/Longitude manuels toujours éditables ; aucun appel réseau Google, aucune clé requise.
- [ ] Point d'entrée Google Places documenté dans `AddressAutocomplete.jsx` (branchement différé).
