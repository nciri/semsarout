# Internationalisation (FR + Arabe) — Design

**Date :** 2026-08-05
**Portée :** frontends `frontend/` (semsarout) et `frontend-m3a-l3achrane/`, + un service backend de traduction du contenu dynamique.

## Objectif

Rendre semsarout et m3a-l3achrane bilingues **français (défaut) + arabe standard (MSA)**, avec support **RTL complet** sur le site public **et** le back-office, en couvrant l'UI, le contenu éditorial, **et** le contenu saisi par les agents (via traduction automatique à la volée).

## Décisions validées

1. **Périmètre** : UI + contenu éditorial + contenu dynamique (saisi par les agents).
2. **Mécanisme des traductions statiques** : fichiers **JSON par langue** (`fr.json`, `ar.json`), pas de colonnes multilingues.
3. **Contenu dynamique** (saisi par les agents, inexistant au build) : **traduction automatique à l'affichage**, mise en **cache**.
4. **Langues** : FR (défaut) + AR (arabe standard moderne). Deux langues.
5. **Moteur de traduction dynamique** : **Azure Translator** (quota gratuit 2M car./mois, large avec cache) + cache.
6. **Bascule de langue** : **préférence mémorisée** (localStorage + profil pour les connectés), **mêmes URLs** (pas de préfixe `/ar`, pas d'enjeu SEO retenu).
7. **Framework** : **react-i18next** sur les deux fronts.
8. **RTL + AR s'appliquent au site public ET au back-office.**

## Non-objectifs

- Pas de préfixe d'URL par langue ni d'indexation SEO arabe dédiée.
- Pas de colonnes multilingues en base pour le contenu dynamique.
- Pas de darija ni d'anglais (FR + AR MSA uniquement).
- Pas de traduction du contenu dynamique **à l'écriture** (on traduit à l'affichage, avec cache).

## Architecture (5 briques)

### 1. Runtime i18n (par frontend)
- `react-i18next` + `i18next-browser-languagedetector`.
- Ressources sous `src/locales/{fr,ar}/<namespace>.json`. Namespaces par domaine pour lazy-load et lisibilité : `common`, `marketing` (site public), `backoffice`, `forms`, `analytics`. (Le découpage exact des namespaces est arrêté en Phase 0.)
- Init i18n : langue par défaut `fr`, fallback `fr`, détection ordre `localStorage → navigator`.
- Langue mémorisée dans `localStorage` (clé `lang`). Pour les utilisateurs connectés : synchronisée avec le **profil** (service identity) — voir Phase 3.
- À chaque changement de langue : mise à jour de `document.documentElement.lang` et `dir`.

### 2. RTL
- `dir="rtl"` sur `<html>` quand langue = AR (via un effet sur le changement de langue).
- **Propriétés logiques Tailwind** : remplacer les utilitaires directionnels physiques (`ml-*`, `mr-*`, `pl-*`, `pr-*`, `left-*`, `right-*`, `text-left/right`, `rounded-l/r`) par leurs équivalents logiques (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `text-start/end`, `rounded-s/e`). Tailwind ≥ 3.3 fournit ces utilitaires nativement ; sinon plugin `tailwindcss-rtl`. Le choix exact (natif vs plugin) est tranché en Phase 0 selon la version Tailwind installée.
- **Miroir des icônes directionnelles** : un helper/wrapper qui applique `scale-x-[-1]` (ou choisit l'icône opposée) en RTL pour chevrons/flèches (`FiChevronLeft/Right`, `FiArrowLeft/Right`).
- **Police arabe** : Noto Sans Arabic (ou Cairo), chargée en plus de la police latine, appliquée quand `lang=ar`.
- **Formats** : nombres/dates via `Intl.NumberFormat`/`Intl.DateTimeFormat` avec la locale active. Convention marocaine : chiffres arabes **occidentaux** (`1 500 000`) même en AR. La devise (Đh / MAD) reste, formatage locale-aware (centralisé dans `utils/currency.js`).

### 3. Extraction des chaînes
- Remplacement du texte FR codé en dur dans le JSX par `t('namespace:clé')` ; les valeurs FR actuelles peuplent `fr.json`.
- Outillage : `i18next-parser` pour extraire/synchroniser les clés ; migration par lots par surface.
- Convention de clés : `namespace:section.element` (ex. `backoffice:clients.newButton`).

### 4. Traductions AR des JSON
- `ar.json` par namespace, généré par **brouillon IA (Claude)** à partir de `fr.json`, puis **relecture humaine** (les libellés d'UI exigent de la précision).
- Un glossaire de termes métier (bien, mandat, commission, séquestre…) fige la terminologie AR.

### 5. Service de traduction du contenu dynamique (backend)
- Nouveau service mesh **`translation`** (schéma/rôle PostgreSQL dédiés, convention ADR-0002).
- Endpoint interne/BFF : `POST /translate { texts: string[], target: "ar" }` → pour chaque texte : clé de cache = `hash(text)+target` ; hit → renvoie ; miss → **Azure Translator** → stocke → renvoie.
- **Table cache** `translation_cache(text_hash, source_lang, target_lang, source_text, translated_text, created_at)`.
- **Clé Azure** : secret (`AZURE_TRANSLATOR_KEY`/région) dans `/etc/semsar/env/translation.env` (prod) et `.env` (local), jamais en dur.
- **Frontend** : hook (`useContentTranslation`) qui, en langue AR, traduit par lot les champs de contenu **saisis par les agents** (titre/description de bien, notes visibles…) via le BFF, avec cache côté client (react-query). Les champs UI passent par les JSON, pas par ce service.
- **Invalidation** : cache clé = hash du texte → un texte modifié produit un nouveau hash (nouvelle entrée) ; l'ancienne reste, inoffensive.

## Découpage en phases (sous-projets)

Chaque phase = un cycle spec → plan → implémentation distinct. Chemin critique **0 → 1 → 2**, **3 en parallèle** dès la fin de 0, **4** à la fin.

### Phase 0 — Fondation i18n + RTL (semsarout) — *détaillée ci-dessous*
Infrastructure complète + preuve sur une **surface témoin** (coquille back-office : TopBar + Sidebar + une page).
**Livrable :** bascule FR↔AR fonctionnelle, surface témoin correcte en RTL. **Dépend de :** rien.

### Phase 1 — Extraction complète des chaînes (semsarout)
Externaliser tout le texte FR (~139 fichiers restants) vers `fr.json`, par lots (public / CRM / analytics / location / boutique / juridique / paramètres), outillé i18next-parser.
**Livrable :** 100 % des chaînes UI en `t()`, app fonctionnelle en FR via i18n. **Dépend de :** Phase 0.

### Phase 2 — Traductions arabes + polish RTL (semsarout)
Produire `ar.json` (IA + relecture) ; corriger les cas RTL réels (débordements, troncatures, composants miroir, graphiques).
**Livrable :** semsarout pleinement utilisable en AR, RTL propre. **Dépend de :** Phase 1.

### Phase 3 — Service de traduction du contenu dynamique (backend + câblage)
Service `translation` (schéma/rôle, table cache, Azure, route BFF) + hook front pour les champs saisis par les agents + persistance de la langue dans le profil (identity).
**Livrable :** contenu dynamique en AR via Azure + cache. **Dépend de :** Phase 0 (indépendant de 1/2).

### Phase 4 — Frontend m3a-l3achrane
Même fondation i18n+RTL, extraction (~33 fichiers), `ar.json`, polish RTL. Réutilise 0→2 et le service de 3.
**Livrable :** m3a-l3achrane bilingue FR/AR + RTL. **Dépend de :** Phases 0 et 3.

## Détail de la Phase 0 (fondation)

### Fichiers créés (semsarout)
- `src/i18n/index.js` — init react-i18next (langues, fallback, détecteur, backend de ressources).
- `src/i18n/rtl.js` — helpers : `isRtl(lang)`, application de `dir`/`lang` sur `<html>`, miroir d'icônes.
- `src/locales/fr/common.json`, `src/locales/ar/common.json` — namespace `common` (surface témoin).
- `src/locales/fr/backoffice.json`, `src/locales/ar/backoffice.json` — surface témoin back-office.
- `src/components/common/LanguageSwitcher.jsx` — sélecteur FR/AR.
- (éventuel) `src/hooks/useDirection.js` — expose la direction courante aux composants.

### Fichiers modifiés (semsarout)
- `src/main.jsx` — importer `./i18n` avant le rendu ; envelopper si besoin.
- `index.html` — `lang`/`dir` initiaux gérés au runtime (valeur par défaut `fr`/`ltr`).
- `tailwind.config.js` — activer/documenter les utilitaires logiques (ou ajouter le plugin RTL) ; déclarer la police arabe.
- `src/index.css` (ou équivalent) — `@font-face`/import de la police arabe, application conditionnelle.
- Surface témoin : `TopBar`, `SidebarNav`/`BackofficeLayout`, une page (ex. tableau de bord back-office) — remplacer le texte codé en dur par `t()` et les classes directionnelles par des logiques.

### Comportement attendu
- Au chargement : langue = valeur `localStorage.lang` sinon `fr`.
- Le sélecteur bascule la langue → l'UI de la surface témoin se traduit, `<html dir>` passe `rtl` en AR, la mise en page est miroir et lisible, la police arabe s'applique.
- Les surfaces non encore migrées restent en FR (codées en dur) sans casser — migration incrémentale.

### Décisions techniques à trancher en Phase 0 (dans le plan)
- Tailwind : utilitaires logiques natifs (si version ≥ 3.3) **ou** plugin `tailwindcss-rtl`.
- Backend de ressources i18next : import statique groupé **ou** lazy-load par namespace (`i18next-http-backend` / imports dynamiques).
- Liste exacte des namespaces.

## Tests
- **Unitaires** : `rtl.js` (`isRtl`, application dir), rendu du `LanguageSwitcher`, présence des clés dans `fr.json`/`ar.json` (pas de clé manquante entre langues).
- **Composants** : la surface témoin rend le bon texte selon la langue et applique `dir` correctement (jsdom).
- **Garde-fou** : test qui vérifie la **parité des clés** entre `fr` et `ar` par namespace (échoue si une clé manque d'un côté).
- Les phases suivantes ajoutent leurs propres tests (extraction : lint anti-texte-codé-en-dur ; service translation : cache hit/miss, appel Azure mocké).

## Contraintes
- Secrets Azure jamais commités (`.env` gitignoré + `.env.example`).
- Migration **incrémentale** : à tout moment l'app doit builder et fonctionner (surfaces non migrées = FR figé).
- Suivre les patterns existants (Tailwind, structure des composants, react-query).
