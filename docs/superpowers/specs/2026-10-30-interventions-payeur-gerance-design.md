# Spec — Qui paie l'intervention, et par quel rail l'argent passe

**Date :** 2026-10-30
**Branche :** `feat/staymanager-natif` (ou une branche dédiée depuis `develop`)
**Services touchés :** `directory`, `rental`, `staymanager`, `gateway`, front back-office

## Intention

Une agence immobilière marocaine fait réparer, entretenir, nettoyer. Chaque geste
technique a un coût, et ce coût a un propriétaire : le bailleur, le locataire,
le vendeur, l'hôte, ou l'agence elle-même. Aujourd'hui SemsarOut sait créer une
intervention (`directory.work_order`) et sait la rattacher à un bien, mais il ne
sait pas **pour qui** elle est faite ni **qui la règle**. Le coût final est saisi
puis s'arrête là : il n'arrive sur aucun relevé, aucun décompte, aucune quittance.

Le constat qui commande cette conception : les rails d'argent existent déjà, au
complet, dans `services/rental`. Le mandat, le bail, la quittance de loyer, le
compte rendu de gérance, la régularisation de charges, le décompte de caution,
tout est en place et déjà servi en PDF. Il ne faut donc **pas** construire un
circuit comptable neuf. Il faut brancher l'intervention sur les rails existants
et fermer les trois trous qui empêchent l'argent d'y arriver.

### L'état réel des rails (vérifié dans le code, pas supposé)

`services/rental/app/main.py` sert déjà :

| Rail | Endpoint | État |
|---|---|---|
| Mandat de gestion | `/backoffice/gestion-locative/mandates` (+ PDF, signature) | complet |
| Bail | `/leases` (+ PDF, signature, révision, bail de particulier) | complet |
| Échéancier de loyer | `/internal/rent-periods/generate` | complet |
| Encaissement | `POST /rent-periods/{id}/pay` | complet |
| **Quittance de loyer** | `GET /rent-periods/{id}/receipt.pdf` | complet |
| Relance d'impayé | `/internal/rent-periods/due-reminders` + `reminder-sent` | complet |
| **Avis de virement au propriétaire** | `/internal/rent-periods/due-payouts` + `payout-sent` | complet |
| **Compte rendu de gérance (CRG)** | `/mandates/{id}/crg`, `/crg/{id}.pdf`, `crg-sent` | **incomplet : aucune dépense** |
| Régularisation de charges | `/leases/{id}/charge-regularizations` (+ envoi) | complet |
| État des lieux | `/leases/{id}/inventories` (+ comparaison, photos, PDF) | complet |
| Décompte de caution | `/leases/{id}/settlement`, `/settlements/{sid}/lines` | complet |

La gérance locative n'est donc pas à écrire : elle est à **alimenter**. Le CRG
calcule aujourd'hui `net = rent_collected − fees` (`main.py:820`). Il manque le
troisième terme, celui que le propriétaire attend le plus : ce que l'agence a
dépensé pour son bien.

## Objectifs

1. Une intervention nomme **le client concerné** et, si le bien est loué, **le bail
   en cours** — donc le locataire et sa caution.
2. Une intervention porte un **payeur** et un **mode de règlement**, proposés par la
   nature des travaux, modifiables par l'agent, et **qui ont une conséquence**.
3. Le coût d'une intervention achevée atteint le relevé de celui qui le doit :
   ligne de dépense au CRG du propriétaire, ligne de retenue au décompte de
   caution du locataire sortant, ou liste « à refacturer » pour un locataire en
   place.
4. L'exploitation d'un bien en courte durée couvre plus que le ménage : une tâche
   d'exploitation porte un type.
5. Aucune intervention achevée et chiffrée ne peut rester sans destinataire : elle
   est visible dans une liste de dépenses non affectées.

## Non-objectifs

- Pas de comptabilité en partie double, pas de grand livre, pas de moteur de TVA.
- Pas d'encaissement en ligne d'une intervention (ni carte, ni virement initié).
- Pas de portail artisan, pas de facture d'artisan dématérialisée ni d'OCR.
- Pas de module syndic : la charge de copropriété reste ce que décrit
  `2026-08-10-charges-copropriete-design.md`, l'intervention ne la remplace pas.
- Pas de refonte des écrans de gérance existants.

## Anti-objectifs (l'échec, même si ça marche techniquement)

- Un coût final saisi qui n'arrive sur aucun relevé. C'est l'état actuel ; le
  reproduire avec un champ `payer` décoratif en plus serait pire, parce que
  l'agence croirait l'affaire réglée.
- Un CRG qui ne correspond pas à ce que le propriétaire a réellement reçu sur son
  compte. Un CRG faux est plus coûteux qu'un CRG absent.
- Une table `maintenance_task` et une table `concierge_task` à côté de
  `cleaning_task`, avec trois écrans jumeaux à maintenir.
- Une retenue sur caution posée automatiquement, sans qu'un humain la valide : au
  Maroc comme ailleurs, c'est le terrain d'un contentieux.

## Le modèle

### Les rattachements

`directory.work_order` gagne deux liens, en plus de `property_id` qui existe déjà :

- `client_id` — le client concerné (`crm.client`), celui chez qui ou pour qui on
  intervient. **Obligatoire** à la création dès lors que le bien est connu : c'est
  le reproche d'origine, une intervention sans client ne dit pas pour qui elle est
  faite.
- `lease_id` — le bail en cours sur ce bien au moment de l'intervention
  (`rental.lease`), nul si le bien n'est pas loué. Il donne le locataire, la
  caution, et le mandat (donc le CRG).

Rattachement **souple**, pas de clé étrangère entre services : `directory` ne
connaît ni `crm` ni `rental` au niveau du schéma. Le bail est résolu à
l'affichage via l'endpoint interne `GET /internal/leases/{lease_id}`, déjà présent.

### La nature des travaux

`nature` ∈ `structurel` | `entretien` | `degat_occupant`

C'est la nature qui **propose** le payeur. La ligne de partage marocaine usuelle :

| Nature | Exemples | Payeur proposé |
|---|---|---|
| `structurel` | chauffe-eau, toiture, plomberie encastrée, installation électrique, menuiserie extérieure | propriétaire |
| `entretien` | ramonage, débouchage, entretien de climatiseur, petites fournitures | locataire si un bail court, sinon propriétaire |
| `degat_occupant` | vitre cassée, porte forcée, dégât d'eau par négligence, nettoyage hors normes au départ | locataire |

La proposition est une **valeur par défaut affichée, pas une contrainte**. L'agence
tranche, et sa décision est tracée (`payer_set_by`, `payer_set_at`).

### Le payeur et le mode de règlement

`payer` ∈ `owner` | `tenant` | `agency` | `third_party`
`charge_mode` ∈ `crg_expense` | `deposit_deduction` | `to_rebill` | `direct` | `absorbed`

| `charge_mode` | Ce que ça veut dire | Le rail existant utilisé |
|---|---|---|
| `crg_expense` | l'agence a avancé l'artisan, elle se rembourse sur les loyers du propriétaire | ligne de dépense au CRG du mois d'achèvement |
| `deposit_deduction` | retenue au départ du locataire | `deduction_line` du `deposit_settlement` du bail, **pré-remplie, jamais finalisée seule** |
| `to_rebill` | locataire en place, à refacturer hors caution | liste « à refacturer », réglée à la main (voir *Ce qui est volontairement laissé à la main*) |
| `direct` | l'agence a mis en relation, le client règle l'artisan lui-même | aucune écriture, l'agence coordonne et trace |
| `absorbed` | geste commercial, reprise sous garantie de l'artisan, remise en état d'un bien vacant au frais de l'agence | aucune écriture, le coût reste à l'agence |

`third_party` existe pour le cas syndic/assurance : l'agence avance, mais le
destinataire n'est ni le bailleur ni l'occupant. Il n'a pas de rail automatique ;
il tombe dans `to_rebill` avec un libellé de tiers.

### Les cas métier couverts

1. **Bien en gérance, locataire en place, panne de chauffe-eau.** `structurel` →
   propriétaire → `crg_expense`. L'agence paie le plombier, la dépense apparaît au
   CRG du mois, le net du propriétaire baisse d'autant, le PDF du CRG la détaille.
2. **Vitre cassée par le locataire, bail en cours.** `degat_occupant` → locataire
   → `to_rebill`. L'intervention apparaît dans la liste à refacturer jusqu'à ce
   qu'un humain la solde.
3. **Même vitre, constatée à l'état des lieux de sortie.** `degat_occupant` →
   locataire → `deposit_deduction`. Une ligne de retenue pré-remplie attend dans
   le décompte, rattachable à l'élément dégradé (`deduction_line.item_id` existe).
4. **Bien vacant remis en état avant relocation** (peinture, nettoyage profond).
   `entretien` → propriétaire → `crg_expense`. Pas de locataire, donc pas de bail :
   `lease_id` nul, le mandat suffit à trouver le CRG. Sans loyer encaissé ce
   mois-là, la dépense attend le premier CRG où un loyer rentre (décision B).
5. **Bien en vente, mise en valeur avant visites.** Payeur = propriétaire vendeur,
   mais il n'y a pas de mandat de gérance donc pas de CRG → `to_rebill` (réglé à la
   signature, souvent par imputation sur la commission) ou `absorbed` si l'agence
   l'offre pour vendre plus vite.
6. **Courte durée (StayManager), panne dans un bien exploité.** Payeur = hôte
   propriétaire. Si un mandat existe → `crg_expense` ; sinon `to_rebill`.
7. **Charge de copropriété.** `third_party` → `to_rebill`, tracé, jamais imputé au
   locataire automatiquement.
8. **Simple mise en relation, hors mandat.** `direct`. Zéro écriture, l'agence
   garde seulement la trace du service rendu.
9. **Reprise sous garantie de l'artisan.** `absorbed`, coût 0, mais l'intervention
   existe — c'est l'historique du bien et la preuve que l'artisan est repassé.

### Les verrous

Les règles de retrait déjà posées (`_can_delete_wo`, `_wo_is_sealed`,
`_status_change_refusal` dans `services/directory/app/main.py`) restent telles
quelles, et deux s'y ajoutent :

- Une intervention dont la dépense est **déjà portée** sur un CRG envoyé
  (`crg_report.sent_at` non nul) ou sur un décompte finalisé
  (`deposit_settlement.status == 'finalized'`) ne change plus ni de payeur, ni de
  mode, ni de coût final. Le relevé est parti chez le client ; le modifier en base
  ferait mentir un document signé.
- Changer `payer` ou `charge_mode` sur une intervention achevée relève de
  l'administration (`admin`, `superadmin`), comme le retrait d'un bon engagé.
  Un `agent` les choisit à la création et jusqu'à l'achèvement.

## La gérance locative : ce qui manque vraiment

Trois trous, et un seul est structurel.

### 1. Le CRG ignore les dépenses (structurel)

`crg_report` ne porte que `rent_collected`, `fees`, `net`. Un propriétaire qui
reçoit un CRG sans ligne de dépense ne comprend pas pourquoi son virement est plus
petit que son loyer.

**Décision :** `crg_report` gagne `expenses` (`Numeric(12,2)`, défaut 0) et
`net` devient `rent_collected − fees − expenses`. Les **lignes** de dépense ne sont
pas stockées dans une table de lignes : elles sont lues depuis les interventions du
mandat (join par `property_id`, que portent `mandate` et `work_order`) dont
`charge_mode = 'crg_expense'`, `status = 'done'`, `cost_final` renseigné et
**`charged_at` nul**. Pas de table neuve, pas de recopie à maintenir ; `expenses`
n'est qu'un instantané figé au moment où le CRG est émis, comme `deposit_amount`
l'est déjà sur le décompte de caution.

La sélection se fait sur `charged_at IS NULL`, **pas** sur le mois de
`completed_at`. C'est la différence entre un modèle qui tient et un modèle qui perd
de l'argent : une intervention achevée le 28 mais chiffrée le 3 du mois suivant,
après l'envoi du CRG, ne serait jamais reprise par aucun mois si l'on filtrait sur
`completed_at`. Au moment de l'émission, le CRG estampille chaque intervention
qu'il porte (`charged_at`, `charged_ref = "crg:<id>"`) ; une intervention en retard
tombe simplement sur le CRG suivant, avec sa date réelle affichée en clair.

Le PDF du CRG détaille ces lignes : date, intitulé, artisan, montant.

### 2. Rien ne dit à l'agence ce qui reste à refacturer

Un écran manque, pas une table : la liste des interventions achevées dont la
dépense n'a atteint personne — `to_rebill` non soldées, et surtout
`charge_mode` nul sur une intervention `done` avec un `cost_final`. C'est le
garde-fou de l'anti-objectif n°1.

### 3. La quittance ne sait rien des interventions

Volontairement. Une quittance de loyer atteste un loyer payé ; y glisser une
réparation la fragilise juridiquement. La refacturation d'une intervention à un
locataire en place passe par un document distinct, ou par la régularisation de
charges annuelle si la nature s'y prête. **Non-objectif assumé.**

## L'exploitation en courte durée : plus que le ménage

Aujourd'hui la rubrique « Exploitation » des séjours ne contient que **Ménage** et
**Messages**. La maintenance existe, mais ailleurs (onglet Tiers → Artisans &
interventions) ; la conciergerie n'existe pas.

**Décision :** `cleaning_task` reste la table, et gagne
`kind` ∈ `menage` | `linge` | `accueil` | `conciergerie` | `controle`
(défaut `menage`, ce qui laisse les lignes existantes justes). La rotation générée
au départ d'un voyageur reste un `menage` ; les autres types se créent à la main
ou par modèle. L'écran devient « Tâches d'exploitation » avec un filtre de type, et
le ménage n'est plus qu'une de ses valeurs.

La **maintenance ne rejoint pas** `cleaning_task` : une intervention d'artisan a un
devis, un coût, un payeur et un artisan tiers — c'est `work_order`, et tout ce
document sert à ça. La rubrique Exploitation gagne à la place une entrée
**Maintenance** qui affiche les interventions des biens exploités en courte durée,
filtrées, sans dupliquer l'écran de Tiers.

Pourquoi un champ et non des tables : une tâche de linge, d'accueil ou de contrôle
a exactement la forme d'un ménage — un bien, une date, un assigné, un statut, un
rapport avec photos. Trois tables jumelles coûteraient trois écrans, trois séries
de tests et trois migrations pour un seul comportement.

## Le front

- **Création d'une intervention** (popup de `WorkOrdersList.jsx`) : le bien reste
  obligatoire, le client devient obligatoire, le bail se déduit du bien (affiché,
  non saisi : « Loué à <locataire> jusqu'au <date> » ou « Pas de bail en cours »),
  la nature se choisit, le payeur et le mode sont **pré-remplis par la nature** et
  modifiables. Pas de champ de plus que nécessaire : le mode découle du couple
  (payeur, bail présent) dans tous les cas sauf deux, et seuls ces deux-là ouvrent
  un choix.
- **Fiche d'intervention** : qui paie, par quel rail, et où la dépense a atterri
  (lien vers le CRG du mois ou vers le décompte de caution).
- **Fiche de bail** : les interventions du bail, et le total déjà retenu.
- **CRG** : le brouillon du mois — loyers encaissés, honoraires, lignes de dépense
  avec leur total, chacune pouvant être écartée — puis une action d'envoi.
- **Dépenses non affectées** : la liste du trou n°2, dans la gérance locative, avec
  l'âge de chaque dépense en attente et une alerte au-delà de 60 jours.
- **Séjours → Exploitation** : filtre de type sur les tâches, entrée Maintenance.

Thème SemsarOut, kit `components/backoffice/ui.jsx`, i18n FR/AR en parité, aucun
texte en dur (`noHardcodedText.test.js` surveille les fichiers listés).

## La migration

`create_all` ne fait aucun `ALTER` : chaque script ci-dessous doit être ajouté à
`MIGRATIONS` dans `infra/prod/deploy-remote.sh`, et la liste est relue par
`scripts/dev-mesh-up.sh`.

- `directory/add_work_order_payer.sql` — `client_id BIGINT`, `lease_id INTEGER`,
  `nature VARCHAR(20)`, `payer VARCHAR(20)`, `charge_mode VARCHAR(24)`,
  `third_party_label VARCHAR(120)`, `payer_set_by INTEGER`,
  `payer_set_at TIMESTAMP`, `charged_at TIMESTAMP`, `charged_ref VARCHAR(40)`,
  `settled_at TIMESTAMP`, `settled_by INTEGER`, `settled_method VARCHAR(24)`,
  + index sur `client_id`, `lease_id` et `charged_at`. Toutes les colonnes
  nullables : les lignes existantes restent valides et tombent dans « dépenses non
  affectées », ce qui est exactement leur statut.
- `rental/add_crg_expenses.sql` — `expenses NUMERIC(12,2) DEFAULT 0` et
  `status VARCHAR(10) DEFAULT 'draft'` sur `crg_report`, puis
  `UPDATE crg_report SET status = 'sent' WHERE sent_at IS NOT NULL` : les CRG déjà
  partis le restent, et gardent `net = rent_collected − fees` avec `expenses = 0`.
- `rental/add_deduction_line_work_order.sql` — `work_order_id BIGINT` sur
  `deduction_line`, + index unique partiel `(settlement_id, work_order_id)` quand
  `work_order_id` n'est pas nul : c'est la clé qui empêche de poser deux fois la
  même retenue.
- `staymanager/add_cleaning_task_kind.sql` — `kind VARCHAR(20) DEFAULT 'menage'`
  sur `cleaning_task`, **et** remplacement de `uq_cleaning_task_reservation` par
  une unicité sur `(reservation_id, kind)` : sans ça un séjour ne peut pas porter à
  la fois son ménage de rotation et une tâche d'accueil, et une tâche d'accueil
  créée d'avance empêcherait la génération du ménage.

Aucune colonne n'est supprimée, aucune n'est rendue `NOT NULL` : l'obligation du
client est posée au niveau de l'API de création, pas du schéma, pour que
l'historique déjà en base ne bloque pas la migration.

## Ce qui est volontairement laissé à la main

`to_rebill` ne déclenche aucune écriture automatique. Une intervention à
refacturer apparaît dans une liste, avec son montant et son destinataire, et un
humain la solde en indiquant comment (encaissé, imputé sur la commission, ajouté à
la régularisation annuelle, abandonné). **Raison :** les trois rails automatiques
couvrent les cas fréquents et vérifiables ; le quatrième couvrirait une dizaine de
situations où l'argent passe différemment selon le client, et une mécanique devinée
y produirait des écritures fausses plus vite qu'elle ne ferait gagner du temps.
À ouvrir quand l'agence aura six mois de pratique et saura ce qu'elle répète.

De même, aucune retenue sur caution n'est finalisée sans geste humain : la ligne
est pré-remplie, le décompte reste à finaliser et à signer par les rails de
signature déjà en place.

## Décisions prises à la relecture

Une relecture par un constructeur neuf, qui n'a eu que ce document et le code, a
rendu neuf questions. Sept se tranchent ici sans changer ce que l'agence obtient ;
deux restent ouvertes (section suivante).

1. **L'estampille `charged_at`.** Voir le trou n°1 : c'est elle qui rend la règle
   « déjà porté sur un relevé parti » lisible localement, sans que `directory`
   interroge `rental`.
2. **Le sens des lectures entre services.** `rental` lit les interventions au
   moment de calculer un CRG (endpoint interne de `directory`), puis `rental`
   **estampille** les interventions qu'il a portées (second endpoint interne de
   `directory`). `directory` ne gagne aucun appel sortant : il n'a aujourd'hui
   qu'un relais d'événements (`relay.py`), et lui donner une dépendance vers
   `rental` pour vérifier un `sent_at` serait la dépendance la plus coûteuse du
   lot pour le plus petit gain.
3. **`to_rebill` se solde en base.** `settled_at`, `settled_by`,
   `settled_method` ∈ `encaisse` | `impute_commission` | `regularisation` |
   `abandonne`. Sans colonne, la liste « à refacturer » ne pourrait jamais se
   vider, et l'anti-objectif n°1 reviendrait déguisé en écran.
4. **`deposit_deduction` est une suggestion jusqu'à ce qu'un humain l'accepte.**
   Le décompte affiche les interventions candidates du bail ; accepter crée une
   vraie `deduction_line` portant `work_order_id` (clé d'idempotence) et estampille
   l'intervention (`charged_ref = "settlement:<id>"`). Si aucun décompte n'existe
   encore, la suggestion attend : rien ne se crée dans le vide.
5. **`client_id` est la partie *concernée*, pas la partie *redevable*.** Le
   redevable se déduit de `payer` : le bailleur du mandat, le locataire du bail, ou
   le tiers nommé par `third_party_label`. À la création, le client est **proposé**
   depuis le mandat ou le bail du bien et reste modifiable — un bien en colocation
   a plusieurs occupants, c'est le bail qui tranche.
6. **`uq_cleaning_task_reservation` devient `(reservation_id, kind)`**, et la clé
   de dédoublonnage de `ensure_tasks` (`services/staymanager/app/cleaning.py`)
   devient le couple au lieu du seul `reservation_id`.
7. **Les rôles.** `_WO_ADMIN_ROLES` existant est conservé tel quel, et le
   scellement actuel (`_wo_is_sealed`) reste en vigueur **en plus** du nouveau
   verrou : l'un protège le coût final, l'autre protège un relevé déjà envoyé.
   Rappel factuel : `agency_admin` figure dans ce jeu mais n'existe pas dans la
   table `roles` — seuls `superadmin` et `admin` l'activent réellement.

Deux points que la relecture a vérifiés et qui n'ont pas besoin d'être décidés : le
join mandat↔intervention passe par `property_id`, porté par les deux tables ; et
`GET /internal/leases/{lease_id}` existe bien (`services/rental/app/main.py:597`).

## Les deux décisions prises par l'agence

### A. Le CRG passe par un brouillon à valider

Aujourd'hui un `crg_report` **n'existe qu'une fois l'e-mail envoyé** :
`_job_crg_reports` (`services/notification/app/scheduler.py:202`) appelle
`POST /internal/mandates/{id}/crg-sent`, qui crée la ligne avec
`sent_at = utcnow()`. Il n'y a ni brouillon, ni validation par l'agence, ni
bouton d'émission dans le back-office.

**Décision de l'agence : un brouillon à valider.** Le CRG se prépare, l'agence voit
les loyers encaissés, ses honoraires et les dépenses du mois, corrige, puis
l'envoie. Aucun montant ne part chez un propriétaire sans qu'un humain l'ait vu.

Ce que ça implique, et qui fait le poids du lot :

- `crg_report.status` ∈ `draft` | `sent`, et `sent_at` ne vaut plus création mais
  envoi. Les lignes déjà en base ont `sent_at` non nul : la migration les passe en
  `sent`, elles restent exactes.
- `/internal/mandates/due-crg` cesse d'être le déclencheur d'un envoi : il devient
  le déclencheur d'une **création de brouillon**. Le job du planificateur
  (`_job_crg_reports`, `services/notification/app/scheduler.py:202`) prépare, et
  **notifie l'agence** qu'un CRG attend sa validation, au lieu d'écrire au
  propriétaire.
- Deux actions neuves au back-office : valider et envoyer un brouillon, et le
  corriger avant envoi (honoraires, dépenses retenues ou écartées).
- L'estampille `charged_at` se pose à **l'envoi**, pas à la préparation : une
  dépense écartée d'un brouillon reste disponible pour le mois suivant.
- `/internal/mandates/{id}/crg-sent` garde sa forme pour ne pas casser le
  planificateur, mais marque l'envoi d'un brouillon existant au lieu de créer la
  ligne.

### B. Une dépense sans loyer attend le prochain CRG

**Décision de l'agence : report, pas de net négatif.** Un bien vacant dont la
remise en état est au frais du propriétaire garde sa dépense en attente — elle
s'impute sur le premier CRG où un loyer rentre. `due-crg` conserve donc son filtre
`rent_collected > 0` (`services/rental/app/main.py:263`) et aucun document n'a à
dire « le propriétaire doit de l'argent ».

Le risque de ce choix est nommé : une remise en état de 8 000 Đh peut dormir des
mois avant d'apparaître sur un relevé. Le garde-fou est donc **obligatoire**, pas
optionnel : l'écran « dépenses non affectées » affiche l'**âge** de chaque dépense
en attente et alerte au-delà de 60 jours. Une dépense qui dort doit se voir, sinon
ce choix devient l'anti-objectif n°1 avec un délai.

## Les décisions laissées au constructeur

- La forme exacte de la projection du bail côté `directory` (appel interne à la
  demande, ou table `lease_ro` alimentée par événement, comme `property_ro` l'est
  déjà dans `crm` et `rental`). L'appel interne suffit tant qu'on n'affiche pas de
  liste triée par bail ; la projection devient utile au premier tri.
- Le découpage en lots et en commits, un changement logique par commit.
- La représentation visuelle de « dépenses non affectées » (le kit a déjà
  `StatCard`, `DataTable`, `Alert` et la barre d'avancement de `WorkOrdersList`).
- Le nom servi à l'utilisateur pour `charge_mode` : les libellés FR/AR sont à
  écrire, les slugs ci-dessus sont des slugs.

## La porte de qualité

Avant de déclarer quoi que ce soit fini : `npm run lint`, les tests front
(`vitest`), `npm run build`, et `pytest` des services touchés — `directory`,
`rental`, `staymanager`. Le hook `pre-push` (`.githooks/pre-push`) rejoue tout.

Deux séries de tests sont obligatoires, parce qu'elles gardent les anti-objectifs :

1. La règle du payeur proposé par la nature, et le refus de modifier un payeur
   dont la dépense est déjà partie chez le client (CRG envoyé, décompte finalisé).
2. Le calcul du CRG avec dépenses : `net = rent_collected − fees − expenses`, et
   l'absence de double imputation **comme** de perte : une intervention achevée le
   28 et chiffrée après l'envoi du CRG du mois n'est pas sélectionnée par ce
   CRG-là, et se retrouve sur le suivant parce que la sélection se fait sur
   `charged_at IS NULL`, pas sur `completed_at` (voir ci-dessous).
