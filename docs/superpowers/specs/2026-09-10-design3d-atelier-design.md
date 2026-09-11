# Éditeur de plan design3d — atelier d'ergonomie et de réutilisation

**Date** : 2026-09-10
**Branche visée** : à créer depuis `develop` après merge de `feature/design3d-floorplan`
**Spec précédente** : `docs/superpowers/specs/2026-09-08-design3d-floorplan-design.md` (brique 1)

## Contexte

La brique 1 a livré l'éditeur de plan 2D tactile, hors-ligne d'abord, sa visionneuse
publique et la chaîne d'entitlement. L'exécution réelle du module — mesh local, éditeur
piloté au doigt, fiche publique — a fait apparaître des manques que ni la spécification
ni les relectures n'avaient vus, parce qu'ils ne se voient qu'à l'usage :

- le module est **inatteignable** pour ses propres clients : son point d'entrée vit dans
  l'espace particulier alors que les comptes d'agence sont redirigés vers le back-office ;
- un geste banal (glisser un sommet sur l'autre) rend un niveau **définitivement
  insynchronisable**, et les messages qui en résultent sont illisibles — l'un d'eux est
  même faux ;
- les cotes se posent **sur** le trait des murs ;
- il n'existe aucun moyen de **réutiliser** un plan déjà tracé, ni d'un autre étage ni
  d'un autre projet, ce qui condamne l'agent à tout refaire ;
- la sélection est unitaire : aucun moyen de nettoyer plusieurs objets d'un geste.

Cet atelier corrige ces cinq points et ajoute la suppression automatique des niveaux
laissés vides.

## Hors périmètre

**Importer un dessin à la main et en générer un plan.** Fonctionnalité décidée, mais
traitée comme un chantier distinct, immédiatement après celui-ci. Le bouton
« Importer un plan » existant (image de fond + calibration) en est le socle ; rien
n'est à défaire ici pour le préparer.

---

## A. Accès et points d'entrée

### Ce qui est déjà acquis

Aucun verrou n'est à ajouter. `services/identity/app/auth.py:86` renvoie une liste de
fonctionnalités vide dès qu'un compte n'a pas d'agence, et les abonnements sont portés
par l'agence : un particulier ne peut pas voir l'entrée, et `Design3dEntry` s'efface
déjà en l'absence de l'entitlement. Le problème est un problème de **placement**.

### Ce qui change

`Design3dEntry` (composant existant, réutilisé tel quel) est monté à deux endroits
nouveaux, tous deux dans le back-office — là où `frontend/src/pages/auth/Login.jsx:32`
envoie les comptes d'agence :

1. **Liste des biens** (`pages/backoffice/Properties.jsx`) — une entrée
   « Concevoir en 3D » dans le menu de la carte, aux côtés de « Nouvelle transaction ».
2. **Fiche du bien** (`pages/backoffice/PropertyForm.jsx`) — présente dès la création,
   mais **inactive** tant que le bien n'a pas d'identifiant, avec un libellé qui dit
   pourquoi. Elle s'active dès le premier enregistrement.

Les promoteurs sont déjà servis par `pages/dashboard/ProgramPlanEditor.jsx` (variante
pleine sur un lot sélectionné) : inchangé.

L'entrée existante de `pages/dashboard/MyProperties.jsx` est **conservée** : invisible
aux particuliers par construction, elle reste le chemin des agences qui passent par
cette page.

### Décision arbitrée

À la création d'une annonce, le bien n'a pas encore d'identifiant et un projet de
conception cible un identifiant existant. Le bouton est donc présent mais inactif
jusqu'au premier enregistrement. Écarté : l'enregistrement automatique en brouillon
(crée des brouillons involontaires) et le plan sans cible rattaché plus tard (exigerait
de rendre la cible optionnelle côté serveur, donc de rouvrir la règle de propriété de
cible qui vient d'être sécurisée).

---

## B. Messages et états invalides

### Cause racine

`frontend/src/components/design/useFloorplanEditor.js:160-166` (`moveVertex`) applique
la nouvelle position d'un sommet **sans aucune garde de longueur**. `MIN_WALL_M` n'existe
qu'à la création du mur (`FloorplanCanvas.jsx:257`). Glisser un sommet sur l'autre
produit donc un mur de longueur nulle, que le serveur refuse — et le niveau ne peut
plus jamais être synchronisé.

Vérifié en exécutant le validateur serveur : **un seul mur dégénéré produit deux
messages**, parce qu'un mur invalide est écarté de la table de correspondance et que ses
ouvertures sont ensuite déclarées « mur introuvable ». Le second message est donc faux
du point de vue de l'utilisateur : le mur est bien là, à l'écran.

### Ce qui change

1. **Empêcher l'état.** Garde de longueur minimale sur le déplacement de sommet, comme
   à la création. C'est le correctif principal : aucun message ne rattrape un plan
   qu'on ne peut plus enregistrer.
2. **Messages écrits pour un agent.** Le client possède déjà le miroir de la validation
   (`frontend/src/utils/floorplan.js`) : il produit lui-même le texte affiché, sans
   changement serveur et sans réseau. Plus aucun identifiant technique visible.
   « Un mur est trop court pour être enregistré. » remplace
   « mur 287b5e4d…: deux points distincts requis ».
3. **Ne signaler que la cause.** La conséquence dérivée (« ouverture … : mur
   introuvable ») n'est plus affichée : un seul message par défaut réel, sans doublon.
4. **Le message est cliquable** et sélectionne l'objet fautif en le centrant dans la
   vue. C'est le seul moyen utile de désigner un élément dont l'identifiant ne veut rien
   dire pour l'utilisateur.
5. **Sortir du cul-de-sac.** Le bandeau gagne une action « Corriger » : suppression du
   mur dégénéré et de ses ouvertures, après confirmation, puis reprise de la
   synchronisation. Nécessaire pour les niveaux déjà bloqués sur les appareils.
6. Les messages **serveur** restent inchangés — utiles aux journaux et aux appels
   directs. Seul l'affichage change.

Tests : aucun identifiant ne doit apparaître dans un message visible ; le message
cliquable sélectionne bien l'élément ; la garde rend l'état invalide impossible à créer.

---

## C. Multi-sélection

### Geste

Le modèle de gestes actuel laisse la place libre : **deux doigts = navigation**
(`FloorplanCanvas.jsx:119-133`), et avec l'outil Sélectionner un glissé sur une zone
vide ne sert à rien aujourd'hui.

- Outil Sélectionner + glissé depuis une zone **vide** → rectangle de sélection.
- Appui sans mouvement → sélection unique, comportement actuel inchangé.
- Glissé depuis un objet **déjà sélectionné** → déplacement du bloc.

Identique à la souris et au doigt. Aucun conflit avec la navigation ni avec les outils
de tracé, qui ne sont pas touchés.

### Règle de prise

Un objet n'est pris que s'il est **entièrement** contenu dans le rectangle : les deux
extrémités pour un mur, tous les sommets pour une pièce. Prévisible, et cela règle le
cas des pièces à moitié englobées — elles ne sont pas prises. Les ouvertures suivent
leur mur et ne sont jamais prises seules.

### Modèle et opérations

La sélection devient une **liste**. À un seul élément, tout se comporte comme
aujourd'hui : le panneau de propriétés n'est pas modifié. À plusieurs, il affiche un
décompte.

- **Suppression** : en cascade, un mur emporte ses ouvertures (règle déjà en place).
- **Déplacement en bloc** : translation de tous les sommets d'un même vecteur. Une
  translation **conserve les longueurs** : elle ne peut donc pas fabriquer le mur
  dégénéré du point B. Les ouvertures, positionnées par un décalage le long de leur mur,
  suivent sans traitement.
- **Annulation** : une seule entrée d'historique par opération, comme le déplacement de
  sommet existant.

Écarté : la modification en lot d'une propriété commune (épaisseur, type de pièce). Elle
demanderait un panneau multi-objets, une validation par lot et une annulation groupée —
un chantier à part.

---

## D. Cotes

Les libellés se posent aujourd'hui au milieu du mur, décalés de six pixels vers le haut
(`FloorplanCanvas.jsx:345-355`), donc **sur le trait** dès que le mur est horizontal.

Ils sont désormais décalés **perpendiculairement au mur, vers l'extérieur de la pièce**,
d'une distance fixe en pixels écran (indépendante du zoom). Aucun déplacement manuel,
aucune donnée supplémentaire à stocker ni à valider.

Écarté : le déplacement au doigt des cotes (ajouterait un champ à la géométrie, une
validation serveur et un cas de conflit) et la simple bascule d'un côté à l'autre (ne
règle pas le chevauchement quand deux murs sont proches).

L'isolation LTR des libellés (`isolateLtr`, corrigée en amont) est conservée : la cote
se lit nombre puis unité, y compris en arabe.

---

## E. Réutiliser un niveau existant

### Besoin

Éviter de retracer un plan déjà fait — pour un autre étage du même projet comme pour un
autre projet de l'agence.

### Source et comportement réseau

- **En ligne** : tous les projets de l'agence sont proposés, avec leurs niveaux.
- **Hors ligne** : seuls les projets déjà présents sur la tablette, avec une mention
  explicite que la liste est limitée faute de réseau.

Écarté : exiger le réseau (l'agent en chantier perd la fonction) et précharger les plans
de l'agence (coûteux en 3G/4G et en stockage pour des données non demandées).

### Ce que la copie emporte

La **géométrie** (murs, pièces, ouvertures) et la **hauteur sous plafond**. Ni l'image
de fond ni la calibration : elles appartiennent au relevé d'un niveau précis et n'ont
pas de sens transposées ailleurs.

La copie est **ponctuelle et indépendante** : aucun lien n'est conservé avec la source,
qui n'est jamais modifiée. Les identifiants des objets copiés sont régénérés pour éviter
toute collision.

### Interface serveur

Lister les projets de l'agence sans cible imposée nécessite une capacité que
`GET /design3d/projects` n'a pas aujourd'hui (il filtre sur `target_type`/`target_id`).
Le cloisonnement par agence de `_access` (`services/design3d/app/main.py:59-64`) reste
la seule autorisation : on ne lit jamais que les projets de sa propre agence.

Le nettoyage de la section H ne s'applique **qu'au projet en cours d'édition** : ouvrir
la liste des niveaux d'un autre projet ne le modifie ni ne le supprime.

---

## G. En-tête de l'éditeur

- **Titre en carton rouge.** « Éditeur de plan » reprend le traitement du « Out » du
  logo (`components/common/Wordmark.jsx`) : dégradé `#C1121F → #870B15`, texte blanc,
  coins arrondis, ombre rouge, **et l'inclinaison de −4°**. Ce style est **extrait dans
  un composant partagé** plutôt que recopié, pour qu'il n'existe qu'une définition du
  carton rouge dans le dépôt.
  Décision prise sur rendu comparé : l'inclinaison est conservée pour l'unité de marque.
  Elle a un coût connu et assumé — le titre penché rompt la ligne de base commune avec
  le badge de synchronisation et le bouton voisins, qui paraissent légèrement de travers
  par contamination optique.
- **Hauteurs alignées.** Le bouton « Importer un plan » passe de `min-h-[44px]` à
  `min-h-[36px]`, la hauteur du badge de synchronisation.
  **Décision du propriétaire, contre ma recommandation** : ces 44 px sont la cible
  tactile minimale appliquée partout dans ce module. Le compromis est assumé ; la revue
  sur tablette réelle doit vérifier **spécifiquement** que ce bouton reste confortable
  à viser au doigt, et c'est un point ajouté à la checklist appareils.

## H. Suppression automatique des niveaux vides

### Définition

Un niveau est **vide** s'il n'a aucun mur, aucune pièce et aucune ouverture, **et** ni
image de fond ni calibration. Un niveau portant une image calibrée n'est pas vide :
l'agent a photographié un plan et l'a mis à l'échelle pour tracer plus tard, c'est du
travail réel.

### Règle

En quittant l'éditeur, chaque niveau vide du projet en cours est supprimé. Si tous les
niveaux sont vides, **le projet est supprimé aussi**.

**Exception : jamais un projet publié.** Un projet au statut `ready` est affiché sur la
fiche du bien, visible des acheteurs ; aucune suppression automatique ne s'y applique.

### Mise en œuvre

- La suppression passe par la file de synchronisation habituelle.
- Si le projet n'a jamais atteint le serveur — créé hors connexion, création encore en
  attente — il est retiré **localement**, ses opérations en file purgées, sans envoyer de
  suppression pour un identifiant inconnu du serveur. La mécanique de
  `discardRefusedProject` (`services/design3dSync.js`) est réutilisée.
- **Deux déclencheurs** : au démontage de l'éditeur (navigation normale) et **aussi à
  l'ouverture**, pour ramasser ce qu'une session interrompue aurait laissé. On ne peut
  pas compter sur l'événement de fermeture de page — établi pendant la brique 1.
- **Pas silencieux** : la liste des projets signale « projet vide supprimé ». Une
  suppression automatique invisible fait douter les utilisateurs de leurs données.

---

## Contraintes transverses

- **i18n** FR + AR, parité stricte des clés ; le garde-fou
  `frontend/src/i18n/noHardcodedText.test.js` n'est jamais affaibli.
- **Hors-ligne d'abord** : aucune fonctionnalité de cet atelier ne doit rendre l'éditeur
  dépendant du réseau, hormis l'élargissement de la liste des projets sources (E), dont
  la dégradation est explicite à l'écran.
- **Tactile** : cibles de 44 px partout, à la seule exception assumée du bouton
  « Importer un plan » (G).
- **Aucun travail perdu** : toute suppression est soit strictement vide (H), soit
  explicitement confirmée (B, C).
- **Tests** : pour chaque point, un test rouge sans le correctif. Les gestes de
  sélection et de déplacement sont couverts en Playwright sur les formats tablette déjà
  en place.

## Risques

- **Multi-sélection et déplacement en bloc** touchent le réducteur de l'éditeur, le
  cœur le plus sollicité du module. Le passage de la sélection unique à une liste doit
  laisser le cas à un élément strictement identique, sous peine de régressions diffuses.
- **La suppression automatique est destructive.** La définition de « vide » est le seul
  rempart : elle doit être testée dans les deux sens — ce qui doit disparaître, et
  surtout ce qui ne doit pas.
- **La réutilisation lit d'autres projets.** Le cloisonnement par agence est déjà en
  place, mais toute nouvelle route de lecture doit être vérifiée sur le cas
  inter-agences, comme l'a été la propriété de cible.
