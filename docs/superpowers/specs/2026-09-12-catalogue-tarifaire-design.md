# Catalogue tarifaire administrable — conception

Date : 2026-09-12.

Décisions de l'utilisateur, prises pendant la conception :

- l'UI gouverne **tout ce qui est facturable** ; les libellés et descriptions, eux, vivent
  uniquement dans les catalogues i18n ;
- une intention de paiement **fige** son prix ; une intention `pending` de plus de 24 h n'est
  pas réutilisée, mais un paiement réellement encaissé est toujours honoré ;
- **aucun prix de repli** côté frontend : catalogue injoignable, la page dit que les tarifs sont
  momentanément indisponibles ;
- les prestations photo payables sont **les options elles-mêmes** : 360° à 500, drone à 800,
  vidéo à 1200. La photo seule (`photos-pro`, 990) disparaît de l'offre.

## 1. Constat de départ

Les prix vivent aujourd'hui dans quatre endroits, dont un seul fait autorité sur ce qui est
réellement prélevé :

| Endroit | Contenu | Rôle |
|---|---|---|
| `frontend/src/constants/pricing.js` | forfait, options média, gestion locative, repli abonnements | affichage |
| `frontend/src/pages/Checkout.jsx::SERVICES` | liste payable, libellés FR en dur | affichage |
| `services/payment/app/main.py::SERVICE_PRICES` | forfait + packs photo | **autorité de facturation** |
| `backend/app/api/v1/payments.py` | doublon du monolithe legacy | mort, mais présent |

Les abonnements agence sont à part : leurs prix sont en base (`billing.subscription_plan`,
servis par `GET /subscription-plans`), sans aucune UI d'édition — ils sont semés par script.

Conséquence déjà constatée : porter le forfait de 4 900 à 9 900 a demandé de toucher huit
endroits ; en oublier un aurait affiché un prix et prélevé l'autre.

`services/catalog` et l'écran `AdminProducts` ne conviennent pas : ils gèrent le mobilier de la
marketplace. Le propriétaire naturel est **billing**, qui possède déjà plans, factures et
abonnements.

## 2. Modèle

### 2.1 `billing.service_price`

| Colonne | Type | Rôle |
|---|---|---|
| `code` | `varchar(40)` PK | identifiant stable, celui que porte `Payment.service_id` |
| `amount` | `numeric(10,2)` | montant, strictement positif |
| `currency` | `varchar(3)` | `MAD` |
| `kind` | `varchar(20)` | `one_off` \| `recurring_monthly` |
| `is_active` | `boolean` | une prestation retirée de l'offre reste en base |
| `updated_at` | `timestamp` | |
| `updated_by` | `integer` | identifiant du superadmin auteur |

Les abonnements gardent `subscription_plan` : cette table porte bien plus qu'un prix (quotas,
indicateurs `has_*`), et la dupliquer refabriquerait le défaut qu'on supprime. L'UI édite les
deux tables, en deux sections d'un même écran.

### 2.2 `billing.price_change` (historique)

`id`, `code`, `old_amount`, `new_amount`, `changed_by`, `changed_at`. Une ligne par écriture,
plans compris (`code` valant alors `plan:<slug>:monthly` ou `plan:<slug>:yearly`).

Le service `audit` n'est **pas** utilisé : son `audit.logged` attend un `id` de ligne déjà créée
par l'émetteur, contrat inadapté ici. L'historique est donc local à billing et affiché dans
l'écran d'administration, là où il sert.

### 2.3 Valeurs semées

| `code` | `amount` | `kind` | Note |
|---|---|---|---|
| `forfait-vente` | 9900 | `one_off` | |
| `photos-pro-360` | 500 | `one_off` | ex-pack à 1490 |
| `photos-pro-drone` | 800 | `one_off` | ex-pack à 1790 |
| `photos-pro-video` | 1200 | `one_off` | nouvelle prestation payable |
| `photos-pro` | 990 | `one_off` | **`is_active = false`** |
| `staymanager-manage` | 179 | `recurring_monthly` | par bien |
| `staymanager-automate` | 299 | `recurring_monthly` | par bien |
| `staymanager-optimize` | 449 | `recurring_monthly` | par bien |

`photos-pro` est désactivée et non supprimée : des paiements passés portent ce `service_id`, et
leur historique doit rester lisible. Les codes existants sont conservés pour la même raison —
renommer `photos-pro-360` casserait la lecture des paiements déjà encaissés.

`mise-en-location` n'entre pas au catalogue : son tarif est « un mois de loyer », donc variable,
et rien ne le prélève en ligne aujourd'hui. La page Services continue de l'annoncer par un texte
i18n, sans montant.

## 3. Écriture (superadmin)

- `PUT /admin/service-prices/{code}` — corps `{amount}`. Refus si `amount <= 0`, si le code est
  inconnu, ou si l'appelant n'est pas superadmin.
- `PATCH /admin/service-prices/{code}` — corps `{is_active}`, pour retirer une prestation de
  l'offre sans perdre l'historique.
- `PUT /admin/subscription-plans/{id}` — corps `{price_monthly, price_yearly}`.

Chaque écriture consigne une ligne dans `price_change` **dans la même transaction** que la
mutation : un prix modifié sans trace serait un prix dont personne ne peut dire d'où il vient.

## 4. Lecture

- `GET /pricing` (billing, public, sans authentification) : les prestations actives et les plans
  actifs. Une seule requête pour tout le site.
- `payment` reçoit une projection locale `ServicePriceRO`, alimentée par l'événement
  `billing.service_price.changed` — exactement le patron de son `PlanRO` actuel, alimenté par
  `billing.subscription.activated`. `POST /payments/create-intent` résout le montant depuis cette
  projection.

**Fail-closed.** Code inconnu, prestation inactive ou projection vide : `create-intent` refuse
en 422 avec un message en français. Aucun montant par défaut, aucun montant venu du client — un
prix deviné est un prix faux, et ici c'est de l'argent.

Amorçage de la projection : billing expose `GET /internal/service-prices`, que payment appelle au
démarrage si sa projection est vide. Sans cela, un payment neuf refuserait tout paiement jusqu'au
premier changement de prix.

## 5. Prix figé sur l'intention

`Payment.amount` est déjà écrit à la création de l'intention : le client paie ce qu'il a vu, même
si un administrateur change le tarif entre-temps.

- Une intention `pending` de moins de 24 h pour le même `service_id` et le même compte est
  réutilisée telle quelle, prix compris.
- Au-delà de 24 h, elle n'est plus réutilisée : une nouvelle intention est créée au prix courant.
  L'ancienne reste en base, sans être ni annulée ni facturée.
- Un webhook de succès est **toujours** honoré, quel que soit l'âge de l'intention. Refuser un
  encaissement réel pour une règle d'expiration créerait un client débité sans prestation.

## 6. Frontend

- Un hook `usePricing()` (react-query, clé `pricing`) lit `GET /pricing`. Il remplace tous les
  nombres de `constants/pricing.js`, qui disparaît ; ses deux aides de formatage
  (`priceLabel`, `priceWithSymbol`) rejoignent `utils/currency.js`.
- Tarifs indisponibles (requête en échec) : chaque surface affiche un message i18n et un renvoi
  vers le contact, jamais un montant.
- Les libellés et descriptions FR en dur partent dans les catalogues i18n FR **et** AR :
  `constants/services.js` (`label`, `shortLabel`, `description`) et
  `Checkout.jsx::SERVICES` (`name`, `description`). Après quoi le catalogue ne porte que des
  montants, l'i18n que des mots.
- Nouvel écran `pages/admin/AdminPricing.jsx` : deux sections (prestations, abonnements), montant
  éditable, bascule d'activité, et les dix derniers changements avec auteur et date.
- Le pack `photos-pro` disparaît de `Checkout.jsx` ; `photos-pro-video` y entre.

## 7. Invariants

- I1 — Un seul endroit détient un montant : `billing.service_price` pour les prestations,
  `billing.subscription_plan` pour les abonnements. Aucun montant en dur ailleurs, frontend
  compris.
- I2 — Ce qui est affiché et ce qui est prélevé viennent de la même source.
- I3 — Un prix introuvable ou inactif fait refuser le paiement ; il n'est jamais remplacé par un
  défaut.
- I4 — Un montant ne change jamais sans une ligne d'historique, écrite dans la même transaction.
- I5 — Le client paie le prix affiché à la création de son intention.
- I6 — Un paiement encaissé par la passerelle est toujours honoré.
- I7 — Un code déjà porté par un paiement passé n'est jamais renommé ni supprimé.

## 8. Tests attendus

- billing : écriture refusée hors superadmin, sur montant nul ou négatif, sur code inconnu ;
  ligne d'historique écrite avec l'ancien et le nouveau montant ; `GET /pricing` n'expose que
  l'actif ; l'événement de changement porte le code et le nouveau montant.
- payment : montant résolu depuis la projection ; 422 sur code inconnu, sur prestation inactive
  et sur projection vide ; amorçage depuis `GET /internal/service-prices` ; réutilisation d'une
  intention de moins de 24 h, création d'une neuve au-delà ; webhook de succès honoré sur une
  intention âgée.
- frontend : `usePricing` alimente les surfaces tarifaires ; message d'indisponibilité sans
  montant quand la requête échoue ; écran d'administration (édition, bascule, historique) ;
  garde `noHardcodedText` verte sur les fichiers touchés.
- infra : la migration figure dans `MIGRATIONS` (garde-fou existant).

## 9. Hors périmètre

- Prix par ville ou par agence, remises, codes promotionnels.
- Dates d'effet programmées : le changement est immédiat. L'historique permet de dire ce qui
  valait quand, ce qui suffit au besoin exprimé.
- Prix des produits de la marketplace (`services/catalog`), qui ont déjà leur propre écran.
- Suppression du monolithe legacy `backend/` : ses prix en dur ne sont plus servis, la ligne est
  seulement retirée.
