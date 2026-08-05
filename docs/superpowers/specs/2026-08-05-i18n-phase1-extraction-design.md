# i18n Phase 1 — Extraction des chaînes (semsarout) — Design

**Date :** 2026-08-05
**Branche :** `feature/i18n-arabe`
**Design parent :** `docs/superpowers/specs/2026-08-05-i18n-arabe-design.md`
**Fondation :** Phase 0 livrée (react-i18next, namespaces `common`+`backoffice`, RTL, `LanguageSwitcher`, `DirIcon`, garde-fou de parité, Vitest).

## Objectif

Externaliser **toutes** les chaînes FR codées en dur des ~139 fichiers restants du front semsarout vers des ressources JSON par namespace, **avec brouillon arabe immédiat**, en suivant les patterns de la Phase 0. À la fin de la Phase 1, l'app est **bilingue FR/AR sur toutes les surfaces** (la Phase 2 se réduit à une relecture AR + polish RTL).

## Décisions validées

1. **Stratégie AR** : **brouillon AR immédiat** par lot (assisté IA) — chaque surface migrée devient réellement bilingue ; la parité de clés reste verte naturellement.
2. **Namespaces (grossiers, un par zone)** — import statique, pas de lazy-load :
   - `common` *(existe)* : chaînes génériques + composants partagés `components/**` non spécifiques à un domaine.
   - `backoffice` *(existe)* : `pages/backoffice/**` + `components/backoffice/**`.
   - `dashboard` : `pages/dashboard/**`.
   - `public` : `pages/*.jsx` (racine, site/marketing).
   - `admin` : `pages/admin/**`.
   - `auth` : `pages/auth/**`.
   Règle : un composant hérite du namespace de son domaine ; générique → `common`.
3. **Outillage** : migration manuelle assistée (subagents) + **`i18next-parser`** comme garde-fou (détecte les `t('clé')` absents des JSON), en plus du test de parité FR/AR existant.
4. **Découpage en lots** (chacun = un cycle plan → exécution, buildable + bilingue à la livraison), dans cet ordre :
   1. **auth** (5 fichiers)
   2. **public** (19)
   3. **common + composants partagés** (~36)
   4. **backoffice** (51) — sous-découpé (core, CRM, analytics, location, boutique, juridique)
   5. **dashboard** (23)
   6. **admin** (7)

## Non-objectifs

- Pas de relecture/qualité éditoriale fine de l'AR (Phase 2) — le brouillon suffit ici.
- Pas de traduction du contenu dynamique saisi par les agents (Phase 3).
- Pas de lazy-load des namespaces (import statique conservé).
- Pas de préfixe d'URL par langue (décision d'ensemble).

## Pattern répété par lot (« la recette »)

Pour chaque fichier d'un lot :
1. **Extraire** chaque chaîne FR visible → clé `ns:section.élément` (conventions Phase 0 : `t('ns:section.key')`, `useTranslation('ns')`).
2. **Renseigner** la clé dans `locales/fr/<ns>.json` (valeur FR d'origine) ET `locales/ar/<ns>.json` (brouillon AR, arabe standard MSA).
3. **Remplacer** le texte codé en dur par `t()` dans le JSX (y compris `placeholder`, `title`, `aria-label`, options de `<select>`).
4. **RTL** : convertir les classes directionnelles Tailwind physiques en logiques (`ml/mr/pl/pr/left/right/text-left/right/rounded-l/r/border-l/r` → `ms/me/ps/pe/start/end/text-start/end/rounded-s/e/border-s/e`) ; envelopper les icônes **horizontalement directionnelles** (flèches, chevrons latéraux) avec `DirIcon`.
5. Les chaînes **hors périmètre** d'un lot (ex. données renvoyées par l'API, formats à traiter en Phase 2) restent en FR figé — documentées si visibles.

À la fin d'un lot : `npm test` (parité + tests du lot) vert, `i18next-parser` sans clé manquante, `npm run build` vert, commit.

## Garde-fous / tests

- **Parité FR/AR** (existant) : `keyParity.test.js` — étendu pour couvrir les nouveaux namespaces au fur et à mesure de leur création.
- **`i18next-parser`** : config `i18next-parser.config.js` listant les namespaces ; exécuté par lot pour détecter les clés référencées mais absentes des JSON (et signaler les clés orphelines).
- **Test de rendu par lot** : au moins un test par lot qui rend une page/écran clé du lot et vérifie le basculement FR→AR d'une chaîne représentative (pattern Phase 0 : `findByText` si chargement async).
- **Build** : `npm run build` vert à chaque lot (migration incrémentale).

## Contraintes

- Migration **incrémentale** : build + app fonctionnels après chaque lot ; surfaces non traitées restent en FR figé.
- Conventions Phase 0 respectées (clés `ns:section.key`, utilitaires Tailwind logiques natifs, `DirIcon`, police arabe déjà en place).
- Aucun secret, aucun appel réseau ajouté.
- Répertoire : `frontend/`.

## Décisions différées (reprises Phase 1/2, déjà consignées au ledger)

- Formats `Intl` locale-aware (dates/nombres) — traités quand une chaîne concernée est migrée, sinon Phase 2.
- `ToastContainer rtl` dynamique (`main.jsx`).
- Convergence `font-arabic` (config Tailwind) vs règle CSS `html[lang='ar']`.
