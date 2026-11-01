# Payeur d'une intervention et rail d'argent — plan d'implémentation

> **Pour les agents d'exécution :** SOUS-COMPÉTENCE REQUISE — utiliser
> superpowers:subagent-driven-development (recommandé) ou
> superpowers:executing-plans pour dérouler ce plan tâche par tâche. Les étapes
> sont des cases à cocher (`- [ ]`).

**But :** faire qu'une intervention nomme son client et son payeur, et que son
coût atteigne le relevé de celui qui le doit — CRG du propriétaire, retenue sur
caution, ou liste à refacturer.

**Architecture :** `directory` porte le payeur et une estampille `charged_at` ;
`rental` lit les interventions au moment de préparer un CRG, puis les estampille
par appel interne ; `directory` ne gagne aucun appel sortant. Le CRG passe par un
brouillon validé par l'agence avant tout envoi. Les tâches d'exploitation des
séjours gagnent un type, sans table neuve.

**Pile :** FastAPI + SQLAlchemy + PostgreSQL (SQLite en test), React 18 +
react-query v3 + i18next FR/AR + Tailwind, vitest/@testing-library, pytest.

**Spec :** `docs/superpowers/specs/2026-10-30-interventions-payeur-gerance-design.md`

**Découpage :** le lot F (types de tâches d'exploitation) est indépendant des
lots A→E et peut être livré seul, avant ou après. Les lots A→E se suivent :
B consomme les endpoints internes de A, C et D consomment l'estampille de A,
E rend visible ce que A→D produisent.

## Contraintes globales

- `create_all` n'`ALTER`e **jamais** : toute colonne neuve exige un script
  `services/<svc>/db/migrate_*.sql` **et** son ajout à `MIGRATIONS` dans
  `infra/prod/deploy-remote.sh`. Un oubli est une panne totale des chemins qui
  lisent le modèle, pas un détail cosmétique.
- Tout `ALTER TABLE` est `ADD COLUMN IF NOT EXISTS`, tout index
  `CREATE INDEX IF NOT EXISTS` : les scripts sont rejoués à chaque déploiement.
- Aucune clé étrangère entre services. Les liens inter-services sont des entiers
  nus (`client_id`, `lease_id`, `work_order_id`).
- Cloisonnement : toute requête filtre sur `agency_id` issu du `Principal`.
  `/internal/*` est gardé par `x-internal-token == settings.internal_token`.
- Rôles : `x-semsar-roles` est le seul slug primaire. Le jeu administrateur reste
  `_WO_ADMIN_ROLES = {"admin", "agency_admin"}` + `is_superadmin`, inchangé.
- Aucun texte en dur côté front : chaque libellé a sa clé dans
  `frontend/src/locales/fr/backoffice.json` **et**
  `frontend/src/locales/ar/backoffice.json`. `src/i18n/noHardcodedText.test.js`
  surveille les fichiers listés ; tout fichier neuf de `pages/backoffice` doit y
  être ajouté.
- Montants en dirhams, affichés par le formateur existant (`f.dh`).
- Porte de qualité avant toute fin de tâche : `npm run lint` (eslint avec
  `--report-unused-disable-directives --max-warnings 0`), `npx vitest run`,
  `npm run build`, et `pytest` du service touché.
- Jamais d'attribution IA dans un message de commit.
- Un changement logique par commit, Conventional Commits.

## Points de vigilance

Cinq classes d'entrée que la spec implique et qu'aucune tâche n'exercerait
spontanément. Chacune a son test, posé dans la tâche qui détient le code.

1. **`cost_final` réécrit après estampille** — une intervention déjà portée sur un
   CRG envoyé doit refuser la modification de son coût, de son payeur et de son
   mode, sinon un document signé devient faux. *(Tâche 3)*
2. **`crg_expense` sur un bien sans mandat** — la dépense n'a aucun CRG où
   atterrir ; elle doit rester visible dans « non affectées », jamais disparaître.
   *(Tâche 4)*
3. **`directory` injoignable pendant la préparation d'un CRG** — un brouillon créé
   avec `expenses = 0` par échec silencieux produirait un net faux. La préparation
   doit échouer et réessayer au passage suivant. *(Tâche 5)*
4. **Double validation du même brouillon** — deux clics concurrents ne doivent
   produire ni deux envois, ni deux estampilles. *(Tâche 6)*
5. **Lignes de `cleaning_task` antérieures à `kind`** — elles valent `menage`, et
   `ensure_tasks` ne doit pas créer un doublon pour une réservation qui a déjà sa
   rotation. *(Tâche 14)*

---

## Structure des fichiers

**Lot A — le payeur (`services/directory`)**
- Créer : `services/directory/db/migrate_payeur_intervention.sql`
- Créer : `services/directory/app/payeur.py` — règles pures : nature → payeur
  proposé, mode par défaut, droit de modifier.
- Créer : `services/directory/tests/conftest.py` — client de test + session SQLite.
- Modifier : `services/directory/app/models.py` (colonnes de `WorkOrder`)
- Modifier : `services/directory/app/main.py` (création, modification, liste,
  endpoints internes)
- Modifier : `services/directory/tests/test_directory.py`
- Créer : `services/directory/tests/test_payeur.py`
- Modifier : `infra/prod/deploy-remote.sh` (liste `MIGRATIONS`)

**Lot B — CRG avec dépenses et brouillon (`services/rental`, `services/notification`)**
- Créer : `services/rental/db/migrate_crg_depenses.sql`
- Créer : `services/rental/app/depenses.py` — client interne vers `directory`
  (lecture des dépenses imputables, estampillage).
- Modifier : `services/rental/app/models.py` (`CrgReport.expenses`, `.status`)
- Modifier : `services/rental/app/main.py` (`_crg_aggregate`, `due-crg`,
  `crg-sent`, `due-crg-send`, validation back-office)
- Modifier : `services/notification/app/scheduler.py` (`_job_crg_reports`)
- Modifier : `services/notification/app/templates/crg_report.html`
- Créer : `services/rental/tests/test_crg_depenses.py`

**Lot C — retenue sur caution (`services/rental`)**
- Créer : `services/rental/db/migrate_retenue_intervention.sql`
- Modifier : `services/rental/app/models.py` (`DeductionLine.work_order_id`)
- Modifier : `services/rental/app/main.py` (suggestions, acceptation)
- Créer : `services/rental/tests/test_retenue_intervention.py`

**Lot D — refacturation (`services/directory`)**
- Modifier : `services/directory/app/main.py` (solde d'une refacturation)
- Modifier : `services/directory/tests/test_payeur.py`

**Lot E — front**
- Modifier : `frontend/src/services/rentalService.js`, le service des
  interventions
- Modifier : `frontend/src/pages/backoffice/artisans/WorkOrdersList.jsx`,
  `WorkOrderDetail.jsx`
- Créer : `frontend/src/pages/backoffice/rental/ExpensesList.jsx` + son test
- Modifier : `frontend/src/pages/backoffice/rental/RentalLayout.jsx`,
  `MandateDetail.jsx`, `SettlementEditor.jsx`
- Modifier : `frontend/src/locales/{fr,ar}/backoffice.json`,
  `frontend/src/i18n/noHardcodedText.test.js`, `frontend/src/App.jsx`

**Lot F — types de tâches d'exploitation (`services/staymanager`, front)**
- Créer : `services/staymanager/db/migrate_type_tache_exploitation.sql`
- Modifier : `services/staymanager/app/models.py`, `app/cleaning.py`,
  `app/main.py`, `tests/test_menage.py`
- Modifier : `frontend/src/pages/backoffice/sejours/CleaningPanel.jsx`,
  `StaysLayout.jsx`, `Sejours.test.jsx`, locales

---

## Lot A — Le payeur

### Tâche 1 : Les colonnes du payeur

**Fichiers :**
- Créer : `services/directory/db/migrate_payeur_intervention.sql`
- Modifier : `services/directory/app/models.py:30-50` (classe `WorkOrder`)
- Modifier : `services/directory/app/main.py` (`_wo_dict`)
- Modifier : `infra/prod/deploy-remote.sh` (liste `MIGRATIONS`)
- Créer : `services/directory/tests/conftest.py`
- Créer : `services/directory/tests/test_payeur.py`

**Interfaces :**
- Consomme : rien.
- Produit : les colonnes `client_id`, `lease_id`, `nature`, `payer`,
  `charge_mode`, `third_party_label`, `payer_set_by`, `payer_set_at`,
  `charged_at`, `charged_ref`, `settled_at`, `settled_by`, `settled_method` sur
  `WorkOrder`, et leur présence dans la charge utile de `_wo_dict`.

- [ ] **Étape 1 : écrire le test qui échoue**

```python
# services/directory/tests/test_payeur.py
def test_la_charge_utile_porte_le_payeur(client, db_session):
    wo = _wo_en_base(db_session, title="Chauffe-eau", trade="plombier", property_id=7)
    r = client.get(f"/backoffice/work-orders/{wo.id}")
    assert r.status_code == 200
    body = r.json()["work_order"]
    for champ in ("client_id", "lease_id", "nature", "payer", "charge_mode",
                  "third_party_label", "charged_at", "settled_at"):
        assert champ in body
```

`conftest.py` reprend la forme de `services/rental/tests/conftest.py` : mapping
`BigInteger → INTEGER` sur SQLite, session sur `tmp_path`, `get_db` et
`get_principal` surchargés, `Principal(sub="10", roles=["admin"], agency_id=4)`.
Un helper `_wo_en_base(db_session, **champs)` insère un `WorkOrder` avec
`agency_id=4`.

- [ ] **Étape 2 : lancer le test pour vérifier qu'il échoue**

Run : `cd services/directory && pytest tests/test_payeur.py -v`
Attendu : FAIL — `KeyError: 'client_id'` (ou `AssertionError` sur le premier champ).

- [ ] **Étape 3 : ajouter les colonnes à `WorkOrder` dans `services/directory/app/models.py`**

`client_id = Column(BigInteger, nullable=True, index=True)`,
`lease_id = Column(Integer, nullable=True, index=True)`,
`nature = Column(String(20), nullable=True)`,
`payer = Column(String(20), nullable=True)`,
`charge_mode = Column(String(24), nullable=True)`,
`third_party_label = Column(String(120), nullable=True)`,
`payer_set_by = Column(Integer, nullable=True)`,
`payer_set_at = Column(DateTime, nullable=True)`,
`charged_at = Column(DateTime, nullable=True, index=True)`,
`charged_ref = Column(String(40), nullable=True)`,
`settled_at = Column(DateTime, nullable=True)`,
`settled_by = Column(Integer, nullable=True)`,
`settled_method = Column(String(24), nullable=True)`.

Toutes nullables : l'historique reste valide et tombe dans « non affectées ».

- [ ] **Étape 4 : exposer les colonnes dans `_wo_dict`**

Ajouter les treize champs à la charge utile, dates via le formateur ISO déjà
utilisé dans ce fichier.

- [ ] **Étape 5 : écrire la migration `services/directory/db/migrate_payeur_intervention.sql`**

Un `ALTER TABLE directory.work_order ADD COLUMN IF NOT EXISTS …` par colonne,
suivi de `CREATE INDEX IF NOT EXISTS` sur `client_id`, `lease_id`, `charged_at`.
Un commentaire `--` en tête dit à quoi sert le lot, comme
`services/staymanager/db/migrate_contrat_sejour.sql`.

- [ ] **Étape 6 : inscrire `directory/migrate_payeur_intervention.sql` dans `MIGRATIONS`**

En fin de liste dans `infra/prod/deploy-remote.sh` — l'ordre n'est contraint que
pour `identity/reset_features_sync_design3d.sql`.

- [ ] **Étape 7 : lancer les tests**

Run : `cd services/directory && pytest -v`
Attendu : PASS, y compris les quatre tests existants de `test_directory.py`.

- [ ] **Étape 8 : commit**

```bash
git add services/directory/db services/directory/app/models.py services/directory/app/main.py \
        services/directory/tests infra/prod/deploy-remote.sh
git commit -m "feat(directory): porter le payeur sur une intervention"
```

### Tâche 2 : La nature propose le payeur, la création l'exige

**Fichiers :**
- Créer : `services/directory/app/payeur.py`
- Modifier : `services/directory/app/main.py:246-277` (`create_work_order`)
- Modifier : `services/directory/tests/test_payeur.py`

**Interfaces :**
- Consomme : les colonnes de la tâche 1.
- Produit :
  - `NATURES: tuple[str, ...] = ("structurel", "entretien", "degat_occupant")`
  - `PAYERS: tuple[str, ...] = ("owner", "tenant", "agency", "third_party")`
  - `CHARGE_MODES: tuple[str, ...] = ("crg_expense", "deposit_deduction", "to_rebill", "direct", "absorbed")`
  - `SETTLE_METHODS: tuple[str, ...] = ("encaisse", "impute_commission", "regularisation", "abandonne")`
  - `def payeur_propose(nature: str, a_un_bail: bool) -> str`
  - `def mode_propose(payer: str, a_un_bail: bool, a_un_mandat: bool) -> str`
  - `def refus_de_creation(data: dict) -> str | None` — message d'erreur ou `None`.

- [ ] **Étape 1 : écrire les tests qui échouent**

```python
def test_la_nature_propose_le_payeur():
    assert payeur_propose("structurel", a_un_bail=True) == "owner"
    assert payeur_propose("degat_occupant", a_un_bail=True) == "tenant"
    # Sans locataire, un entretien courant retombe sur le propriétaire.
    assert payeur_propose("entretien", a_un_bail=True) == "tenant"
    assert payeur_propose("entretien", a_un_bail=False) == "owner"

def test_le_mode_suit_le_payeur_et_le_contexte():
    assert mode_propose("owner", a_un_bail=True, a_un_mandat=True) == "crg_expense"
    # Pas de mandat de gérance : aucun CRG où imputer.
    assert mode_propose("owner", a_un_bail=False, a_un_mandat=False) == "to_rebill"
    assert mode_propose("tenant", a_un_bail=True, a_un_mandat=True) == "to_rebill"
    assert mode_propose("agency", a_un_bail=True, a_un_mandat=True) == "absorbed"
    assert mode_propose("third_party", a_un_bail=True, a_un_mandat=True) == "to_rebill"

def test_une_intervention_sans_client_est_refusee():
    base = {"title": "Vitre", "trade": "vitrier", "property_id": 7, "client_id": 3,
            "nature": "degat_occupant", "payer": "tenant", "charge_mode": "to_rebill"}
    assert refus_de_creation(base) is None
    assert refus_de_creation({**base, "client_id": None}) is not None
    assert refus_de_creation({**base, "nature": "inconnue"}) is not None
    assert refus_de_creation({**base, "payer": "voisin"}) is not None
    assert refus_de_creation({**base, "charge_mode": "virement"}) is not None
    # Un tiers sans nom n'est pas un destinataire.
    assert refus_de_creation({**base, "payer": "third_party", "third_party_label": None}) is not None

def test_la_creation_refuse_sans_client(client):
    r = client.post("/backoffice/work-orders", json={
        "title": "Vitre", "trade": "vitrier", "property_id": 7,
        "nature": "degat_occupant", "payer": "tenant", "charge_mode": "to_rebill"})
    assert r.status_code == 400

def test_la_creation_trace_qui_a_choisi_le_payeur(client, db_session):
    r = client.post("/backoffice/work-orders", json={
        "title": "Chauffe-eau", "trade": "plombier", "property_id": 7, "client_id": 3,
        "nature": "structurel", "payer": "owner", "charge_mode": "crg_expense"})
    assert r.status_code == 201
    wo = r.json()["work_order"]
    assert wo["payer"] == "owner" and wo["charge_mode"] == "crg_expense"
    assert wo["payer_set_by"] == 10 and wo["payer_set_at"] is not None
```

- [ ] **Étape 2 : lancer les tests pour vérifier qu'ils échouent**

Run : `cd services/directory && pytest tests/test_payeur.py -v`
Attendu : FAIL — `ImportError` sur `app.payeur`.

- [ ] **Étape 3 : écrire `services/directory/app/payeur.py`**

Les quatre tuples ci-dessus, puis les trois fonctions. `refus_de_creation` rend
un message en français (les erreurs de ce service le sont déjà) ; elle refuse :
`client_id` absent dès que `property_id` est présent, `nature` hors `NATURES`,
`payer` hors `PAYERS`, `charge_mode` hors `CHARGE_MODES`, `third_party_label`
vide quand `payer == "third_party"`.

- [ ] **Étape 4 : brancher dans `create_work_order`**

Refuser **avant toute écriture** par `err(message, 400)` — même forme que les
refus existants du fichier. Poser `payer_set_by = int(principal.sub)` et
`payer_set_at = datetime.utcnow()` quand `payer` est fourni. `nature`, `payer` et
`charge_mode` restent facultatifs côté API pour ne pas casser les appelants
existants, mais dès que l'un est fourni les trois sont validés ensemble.

- [ ] **Étape 5 : lancer les tests**

Run : `cd services/directory && pytest -v`
Attendu : PASS.

- [ ] **Étape 6 : commit**

```bash
git add services/directory/app/payeur.py services/directory/app/main.py services/directory/tests
git commit -m "feat(directory): la nature des travaux propose le payeur"
```

### Tâche 3 : Le verrou d'une dépense déjà partie

**Fichiers :**
- Modifier : `services/directory/app/payeur.py`
- Modifier : `services/directory/app/main.py:286-327` (`update_work_order`)
- Modifier : `services/directory/tests/test_payeur.py`

**Interfaces :**
- Consomme : `charged_at`, `charged_ref`, `settled_at` (tâche 1), `_is_wo_admin`
  et `_wo_is_sealed` existants de `main.py`.
- Produit : `def refus_de_modification(principal, wo, data: dict) -> str | None`.

- [ ] **Étape 1 : écrire les tests qui échouent** *(point de vigilance 1)*

```python
def test_une_depense_deja_portee_ne_se_reecrit_plus():
    patron = _principal("admin")
    porte = _wo("done", charged_at=datetime(2026, 10, 5), charged_ref="crg:12")
    assert refus_de_modification(patron, porte, {"cost_final": "500"}) is not None
    assert refus_de_modification(patron, porte, {"payer": "tenant"}) is not None
    assert refus_de_modification(patron, porte, {"charge_mode": "to_rebill"}) is not None
    # Une note reste modifiable : elle ne figure sur aucun relevé.
    assert refus_de_modification(patron, porte, {"notes": "revu avec le plombier"}) is None

def test_changer_le_payeur_apres_achevement_releve_de_l_administration():
    agent, patron = _principal("agent"), _principal("admin")
    acheve = _wo("done")
    assert refus_de_modification(agent, acheve, {"payer": "owner"}) is not None
    assert refus_de_modification(patron, acheve, {"payer": "owner"}) is None
    # Avant l'achèvement, l'agent garde la main.
    assert refus_de_modification(agent, _wo("scheduled"), {"payer": "owner"}) is None

def test_l_api_refuse_la_reecriture_d_une_depense_portee(client, db_session):
    wo = _wo_en_base(db_session, status="done", cost_final=Decimal("450"),
                     charged_at=datetime(2026, 10, 5), charged_ref="crg:12")
    r = client.put(f"/backoffice/work-orders/{wo.id}", json={"cost_final": 900})
    assert r.status_code == 403
    db_session.refresh(wo)
    assert wo.cost_final == Decimal("450")
```

- [ ] **Étape 2 : lancer les tests pour vérifier qu'ils échouent**

Run : `cd services/directory && pytest tests/test_payeur.py -v`
Attendu : FAIL — `refus_de_modification` introuvable, et le `PUT` écrit 900.

- [ ] **Étape 3 : écrire `refus_de_modification`**

Rend un message quand `wo.charged_at` ou `wo.settled_at` n'est pas nul et que
`data` touche l'un de `cost_final`, `cost_estimate`, `payer`, `charge_mode`,
`nature`, `client_id`, `lease_id`, `third_party_label` ; quand `wo.status` vaut
`done` et que `data` touche `payer` ou `charge_mode` sans que
`_is_wo_admin(principal)` ; et en validant les valeurs comme à la création.

- [ ] **Étape 4 : brancher dans `update_work_order`**

Appeler `refus_de_modification` **avant toute écriture**, renvoyer `err(msg, 403)`
(400 pour une valeur inconnue). Le scellement existant (`_wo_is_sealed`) reste en
place : les deux verrous cohabitent.

- [ ] **Étape 5 : lancer les tests**

Run : `cd services/directory && pytest -v`
Attendu : PASS.

- [ ] **Étape 6 : commit**

```bash
git add services/directory/app services/directory/tests
git commit -m "fix(directory): verrouiller une dépense déjà portée sur un relevé"
```

### Tâche 4 : Ce que l'extérieur peut lire et estampiller

**Fichiers :**
- Modifier : `services/directory/app/main.py` (endpoints internes,
  `list_work_orders`)
- Modifier : `services/directory/tests/test_payeur.py`

**Interfaces :**
- Consomme : tâches 1 à 3.
- Produit :
  - `GET /internal/work-orders/chargeable?property_ids=1,2,3&mode=crg_expense`
    → `{"work_orders": [{"id", "property_id", "title", "trade", "artisan_name",
    "completed_at", "cost_final"}]}` — uniquement `status == "done"`,
    `cost_final` non nul, `charged_at` nul, `charge_mode` égal au `mode` demandé.
  - `POST /internal/work-orders/charged` avec `{"ids": [1, 2], "ref": "crg:12"}`
    → `{"stamped": 2}` — idempotent : une intervention déjà estampillée est
    ignorée, pas réécrite.
  - `GET /backoffice/work-orders?pending=1` → les interventions `done` avec
    `cost_final`, `charged_at` nul et `settled_at` nul, chacune portant
    `waiting_days` (entier) et un `charge_mode` éventuellement nul.
  - `GET /backoffice/work-orders?lease_id=12` → les interventions d'un bail, pour
    sa fiche (tâche 13).
  - Aucune route de passerelle à ajouter : le préfixe
    `/api/v1/backoffice/work-orders` est déjà routé vers `directory`
    (`gateway/app/main.py:412-418`).

- [ ] **Étape 1 : écrire les tests qui échouent** *(point de vigilance 2)*

```python
def test_les_depenses_imputables_s_arretent_aux_non_estampillees(client, db_session):
    a = _wo_en_base(db_session, property_id=7, status="done", cost_final=Decimal("450"),
                    charge_mode="crg_expense", completed_at=datetime(2026, 10, 2))
    _wo_en_base(db_session, property_id=7, status="done", cost_final=Decimal("300"),
                charge_mode="crg_expense", charged_at=datetime(2026, 10, 5))
    _wo_en_base(db_session, property_id=7, status="scheduled", charge_mode="crg_expense")
    r = client.get("/internal/work-orders/chargeable?property_ids=7&mode=crg_expense",
                   headers={"x-internal-token": TOKEN})
    assert [w["id"] for w in r.json()["work_orders"]] == [a.id]

def test_l_estampille_est_idempotente(client, db_session):
    wo = _wo_en_base(db_session, status="done", cost_final=Decimal("450"),
                     charge_mode="crg_expense")
    h = {"x-internal-token": TOKEN}
    assert client.post("/internal/work-orders/charged",
                       json={"ids": [wo.id], "ref": "crg:12"}, headers=h).json()["stamped"] == 1
    assert client.post("/internal/work-orders/charged",
                       json={"ids": [wo.id], "ref": "crg:13"}, headers=h).json()["stamped"] == 0
    db_session.refresh(wo)
    assert wo.charged_ref == "crg:12"

def test_une_depense_sans_mandat_reste_visible(client, db_session):
    # Bien sans mandat de gérance : aucun CRG ne la prendra, elle ne doit pas disparaître.
    _wo_en_base(db_session, property_id=99, status="done", cost_final=Decimal("8000"),
                charge_mode="crg_expense", completed_at=datetime(2026, 8, 1))
    # Et une intervention achevée dont personne n'a choisi le mode y figure aussi.
    _wo_en_base(db_session, property_id=99, status="done", cost_final=Decimal("120"),
                charge_mode=None, completed_at=datetime(2026, 10, 1))
    rows = client.get("/backoffice/work-orders?pending=1").json()["work_orders"]
    assert len(rows) == 2
    assert all(isinstance(w["waiting_days"], int) for w in rows)

def test_l_internal_exige_son_jeton(client):
    assert client.get(
        "/internal/work-orders/chargeable?property_ids=7&mode=crg_expense").status_code == 403
```

- [ ] **Étape 2 : lancer les tests pour vérifier qu'ils échouent**

Run : `cd services/directory && pytest tests/test_payeur.py -v`
Attendu : FAIL — 404 sur les deux routes internes.

- [ ] **Étape 3 : implémenter les deux endpoints internes et le filtre `pending`**

Les routes internes suivent la forme des `/internal/*` de `services/rental` :
en-tête `x-internal-token` comparé à `settings.internal_token`, sinon
`err("Forbidden", 403)`. `waiting_days` se calcule depuis `completed_at` (ou
`updated_at` s'il est nul).

- [ ] **Étape 4 : lancer les tests**

Run : `cd services/directory && pytest -v`
Attendu : PASS.

- [ ] **Étape 5 : commit**

```bash
git add services/directory/app/main.py services/directory/tests
git commit -m "feat(directory): servir et estampiller les dépenses imputables"
```

---

## Lot B — Le CRG : dépenses et brouillon

### Tâche 5 : Le CRG compte les dépenses

**Fichiers :**
- Créer : `services/rental/db/migrate_crg_depenses.sql`
- Créer : `services/rental/app/depenses.py`
- Modifier : `services/rental/app/models.py:92-108` (`CrgReport`)
- Modifier : `services/rental/app/main.py:810-845` (`_crg_aggregate`)
- Modifier : `infra/prod/deploy-remote.sh`
- Créer : `services/rental/tests/test_crg_depenses.py`

**Interfaces :**
- Consomme : `GET /internal/work-orders/chargeable` et
  `POST /internal/work-orders/charged` (tâche 4).
- Produit :
  - `CrgReport.expenses` (`Numeric(12, 2)`, défaut 0),
    `CrgReport.status` (`String(10)`, défaut `"draft"`).
  - `services/rental/app/depenses.py` :
    `def imputables(property_ids: list[int], mode: str = "crg_expense") -> list[dict]`
    (lève `DepensesIndisponibles` si `directory` ne répond pas) et
    `def estampiller(ids: list[int], ref: str) -> int`.
  - `_crg_aggregate(db, mnd, y, m)` rend en plus `expenses` et `expense_lines`,
    et `net = rent_collected − fees − expenses`.

- [ ] **Étape 1 : écrire les tests qui échouent** *(point de vigilance 3)*

```python
# services/rental/tests/test_crg_depenses.py
def test_le_net_retire_les_depenses(db_session, monkeypatch):
    mnd = _mandat(db_session, property_id=7, fee_pct=8)
    _loyer_encaisse(db_session, mnd, 2026, 9, montant=6000)
    monkeypatch.setattr(depenses, "imputables",
                        lambda ids, mode="crg_expense": [
                            {"id": 4, "title": "Chauffe-eau", "cost_final": 1200,
                             "completed_at": "2026-09-14T00:00:00", "property_id": 7}])
    agg = _crg_aggregate(db_session, mnd, 2026, 9)
    assert agg["rent_collected"] == 6000 and agg["fees"] == 480
    assert agg["expenses"] == 1200 and agg["net"] == 4320
    assert [l["id"] for l in agg["expense_lines"]] == [4]

def test_directory_injoignable_ne_produit_pas_un_net_faux(db_session, monkeypatch):
    mnd = _mandat(db_session, property_id=7, fee_pct=8)
    _loyer_encaisse(db_session, mnd, 2026, 9, montant=6000)
    def _tombe(ids, mode="crg_expense"):
        raise depenses.DepensesIndisponibles("directory muet")
    monkeypatch.setattr(depenses, "imputables", _tombe)
    with pytest.raises(depenses.DepensesIndisponibles):
        _crg_aggregate(db_session, mnd, 2026, 9)
```

- [ ] **Étape 2 : lancer les tests pour vérifier qu'ils échouent**

Run : `cd services/rental && pytest tests/test_crg_depenses.py -v`
Attendu : FAIL — `ImportError` sur `app.depenses`.

- [ ] **Étape 3 : écrire `services/rental/app/depenses.py`**

`httpx` synchrone, URL depuis les réglages du service (même forme que les autres
clients internes du dépôt), en-tête `x-internal-token`, délai 10 s. Toute
`httpx.HTTPError`, tout statut ≠ 200 et tout corps illisible lèvent
`DepensesIndisponibles` — **jamais** une liste vide, qui produirait un net faux.

- [ ] **Étape 4 : ajouter `expenses` et `status` au modèle, et les compter dans `_crg_aggregate`**

`expenses` = somme des `cost_final` des lignes rendues ;
`net = round(collected − fees − expenses, 2)`.

- [ ] **Étape 5 : écrire la migration et l'inscrire**

`services/rental/db/migrate_crg_depenses.sql` :
`ADD COLUMN IF NOT EXISTS expenses NUMERIC(12,2) DEFAULT 0`,
`ADD COLUMN IF NOT EXISTS status VARCHAR(10) DEFAULT 'draft'`, puis
`UPDATE rental.crg_report SET status = 'sent' WHERE sent_at IS NOT NULL;`.
Ajouter `rental/migrate_crg_depenses.sql` à `MIGRATIONS`.

- [ ] **Étape 6 : lancer les tests**

Run : `cd services/rental && pytest -v`
Attendu : PASS.

- [ ] **Étape 7 : commit**

```bash
git add services/rental/db services/rental/app services/rental/tests infra/prod/deploy-remote.sh
git commit -m "feat(rental): porter les dépenses d'intervention au CRG"
```

### Tâche 6 : Le brouillon, sa validation, son envoi

**Fichiers :**
- Modifier : `services/rental/app/main.py:249-268` (`due-crg`),
  `:825-845` (`crg-sent`), `:846-886` (liste du CRG)
- Modifier : `services/rental/tests/test_crg_depenses.py`

**Interfaces :**
- Consomme : tâche 5.
- Produit :
  - `GET /internal/mandates/due-crg` crée désormais les **brouillons** manquants
    et rend `{"drafts": [{"mandate_id", "crg_id", "agency_id", "period_label"}]}`.
    Le filtre `rent_collected > 0` est conservé : une dépense sans loyer attend le
    premier CRG où un loyer rentre (décision B de la spec).
  - `GET /internal/mandates/due-crg-send` → les brouillons validés non envoyés,
    avec `{"mandate_id", "crg_id", "landlord_client_id", "period_label",
    "rent_collected", "fees", "expenses", "net"}`.
  - `POST /internal/mandates/{mandate_id}/crg-sent` avec `{"crg_id": 12}` marque
    `status = "sent"`, pose `sent_at`, et estampille les interventions portées via
    `depenses.estampiller(ids, f"crg:{crg_id}")`. Idempotent : un CRG déjà `sent`
    rend `{"ok": True}` sans réécrire ni réestampiller.
  - `POST /backoffice/gestion-locative/crg/{crg_id}/validate` → passe le
    brouillon en `validated`, avec `{"excluded_work_order_ids": [...]}` facultatif
    qui retire des lignes et recalcule `expenses` et `net`.
  - `GET /backoffice/gestion-locative/mandates/{mandate_id}/crg` rend en plus
    `status`, `expenses` et, pour un brouillon, `expense_lines`.

- [ ] **Étape 1 : écrire les tests qui échouent** *(point de vigilance 4)*

```python
def test_le_crg_nait_brouillon_et_ne_part_pas_seul(client, db_session, monkeypatch):
    mnd = _mandat(db_session, property_id=7, fee_pct=8)
    _loyer_encaisse(db_session, mnd, 2026, 9, montant=6000)
    monkeypatch.setattr(depenses, "imputables", lambda ids, mode="crg_expense": [])
    r = client.get("/internal/mandates/due-crg", headers={"x-internal-token": TOKEN})
    crg_id = r.json()["drafts"][0]["crg_id"]
    assert db_session.get(CrgReport, crg_id).status == "draft"
    # Tant qu'il n'est pas validé, rien n'est à envoyer.
    assert client.get("/internal/mandates/due-crg-send",
                      headers={"x-internal-token": TOKEN}).json()["reports"] == []

def test_la_validation_ecarte_une_ligne_et_recalcule(client, db_session, monkeypatch):
    # 6000 de loyer, 8 % d'honoraires, deux dépenses de 1200 et 300.
    crg_id = _brouillon(client, db_session, monkeypatch, loyer=6000,
                        depenses_=[(4, 1200), (5, 300)])
    r = client.post(f"/backoffice/gestion-locative/crg/{crg_id}/validate",
                    json={"excluded_work_order_ids": [5]})
    assert r.status_code == 200
    crg = db_session.get(CrgReport, crg_id)
    assert crg.status == "validated" and crg.expenses == Decimal("1200")
    assert crg.net == Decimal("4320")

def test_deux_envois_concurrents_n_estampillent_qu_une_fois(client, db_session, monkeypatch):
    crg_id = _brouillon(client, db_session, monkeypatch, loyer=6000, depenses_=[(4, 1200)])
    client.post(f"/backoffice/gestion-locative/crg/{crg_id}/validate", json={})
    appels = []
    monkeypatch.setattr(depenses, "estampiller",
                        lambda ids, ref: appels.append((tuple(ids), ref)) or len(ids))
    h = {"x-internal-token": TOKEN}
    mandate_id = _mandat_id(db_session, crg_id)
    for _ in range(2):
        client.post(f"/internal/mandates/{mandate_id}/crg-sent",
                    json={"crg_id": crg_id}, headers=h)
    assert appels == [((4,), f"crg:{crg_id}")]
    assert db_session.get(CrgReport, crg_id).status == "sent"
```

- [ ] **Étape 2 : lancer les tests pour vérifier qu'ils échouent**

Run : `cd services/rental && pytest tests/test_crg_depenses.py -v`
Attendu : FAIL — `KeyError: 'drafts'`, puis 404 sur `/crg/{id}/validate`.

- [ ] **Étape 3 : implémenter le cycle brouillon → validé → envoyé**

`status` ∈ `draft` | `validated` | `sent`. Les interventions portées par un
brouillon se relisent à l'envoi par `depenses.imputables` filtré sur les biens du
mandat, moins les exclusions enregistrées — la spec ne stocke pas de table de
lignes. L'idempotence tient à la garde `if crg.status == "sent": return
{"ok": True}` **avant** tout estampillage.

- [ ] **Étape 4 : lancer les tests**

Run : `cd services/rental && pytest -v`
Attendu : PASS.

- [ ] **Étape 5 : commit**

```bash
git add services/rental/app/main.py services/rental/tests
git commit -m "feat(rental): valider un CRG avant de l'envoyer au propriétaire"
```

### Tâche 7 : Le planificateur prépare, puis envoie ce qui est validé

**Fichiers :**
- Modifier : `services/notification/app/scheduler.py:202-227` (`_job_crg_reports`)
- Modifier : `services/notification/app/templates/crg_report.html`

**Interfaces :**
- Consomme : `due-crg` (prépare), `due-crg-send` (à envoyer), `crg-sent`
  (tâche 6).
- Produit : `_job_crg_reports(db) -> int` ne compte plus que les CRG **envoyés**.

- [ ] **Étape 1 : préparer les brouillons sans écrire au propriétaire**

Le job appelle `GET /internal/mandates/due-crg` pour créer les brouillons, et
n'envoie **rien** au propriétaire à ce stade.

- [ ] **Étape 2 : envoyer les brouillons validés**

Second appel, `GET /internal/mandates/due-crg-send` : pour chaque entrée, envoyer
`crg_report.html` au propriétaire comme aujourd'hui, puis
`POST /internal/mandates/{id}/crg-sent` avec `{"crg_id": …}`.

- [ ] **Étape 3 : ajouter les dépenses au gabarit**

`crg_report.html` reçoit `expenses` et affiche la ligne « Dépenses » entre les
honoraires et le net. Le gabarit reste lisible sans dépense (`expenses = 0`).

- [ ] **Étape 4 : lancer les tests du service**

Run : `cd services/notification && pytest -v`
Attendu : PASS.

- [ ] **Étape 5 : commit**

```bash
git add services/notification/app
git commit -m "feat(notification): n'envoyer un CRG qu'une fois validé"
```

---

## Lot C — La retenue sur caution

### Tâche 8 : Suggérer une retenue, l'accepter une seule fois

**Fichiers :**
- Créer : `services/rental/db/migrate_retenue_intervention.sql`
- Modifier : `services/rental/app/models.py:193-203` (`DeductionLine`)
- Modifier : `services/rental/app/main.py:1504-1582` (décompte et lignes)
- Modifier : `infra/prod/deploy-remote.sh`
- Créer : `services/rental/tests/test_retenue_intervention.py`

**Interfaces :**
- Consomme : `depenses.imputables(..., mode="deposit_deduction")`,
  `depenses.estampiller` (tâche 5).
- Produit :
  - `DeductionLine.work_order_id` (`BigInteger`, nullable).
  - `GET /backoffice/gestion-locative/settlements/{sid}/suggestions` →
    `{"suggestions": [{"work_order_id", "label", "amount", "completed_at"}]}` —
    les interventions `deposit_deduction` du bail, non estampillées, pas déjà
    posées en ligne.
  - `POST /backoffice/gestion-locative/settlements/{sid}/suggestions/{work_order_id}/accept`
    → crée la `deduction_line`, recalcule les totaux du décompte, estampille
    l'intervention (`settlement:{sid}`). Refuse 409 si la ligne existe déjà, 403
    si le décompte est `finalized`.

- [ ] **Étape 1 : écrire les tests qui échouent**

```python
def test_les_suggestions_ne_proposent_pas_une_retenue_deja_posee(client, db_session, monkeypatch):
    bail, dec = _bail_et_decompte(db_session, deposit=5000)
    monkeypatch.setattr(depenses, "imputables", lambda ids, mode: [
        {"id": 4, "title": "Vitre salon", "cost_final": 600, "completed_at": "2026-10-02T00:00:00"},
        {"id": 5, "title": "Serrure", "cost_final": 300, "completed_at": "2026-10-03T00:00:00"}])
    _ligne(db_session, dec, work_order_id=5, amount=300)
    r = client.get(f"/backoffice/gestion-locative/settlements/{dec.id}/suggestions")
    assert [s["work_order_id"] for s in r.json()["suggestions"]] == [4]

def test_accepter_une_suggestion_cree_la_ligne_et_estampille(client, db_session, monkeypatch):
    bail, dec = _bail_et_decompte(db_session, deposit=5000)
    monkeypatch.setattr(depenses, "imputables", lambda ids, mode: [
        {"id": 4, "title": "Vitre salon", "cost_final": 600, "completed_at": "2026-10-02T00:00:00"}])
    vus = []
    monkeypatch.setattr(depenses, "estampiller", lambda ids, ref: vus.append((ids, ref)) or len(ids))
    r = client.post(f"/backoffice/gestion-locative/settlements/{dec.id}/suggestions/4/accept")
    assert r.status_code == 201
    db_session.refresh(dec)
    assert dec.total_deductions == Decimal("600") and dec.refunded_amount == Decimal("4400")
    assert vus == [([4], f"settlement:{dec.id}")]
    # Deuxième acceptation : refusée, pas de doublon.
    assert client.post(
        f"/backoffice/gestion-locative/settlements/{dec.id}/suggestions/4/accept").status_code == 409

def test_un_decompte_finalise_n_accepte_plus_rien(client, db_session, monkeypatch):
    bail, dec = _bail_et_decompte(db_session, deposit=5000, status="finalized")
    monkeypatch.setattr(depenses, "imputables", lambda ids, mode: [
        {"id": 4, "title": "Vitre", "cost_final": 600, "completed_at": "2026-10-02T00:00:00"}])
    assert client.post(
        f"/backoffice/gestion-locative/settlements/{dec.id}/suggestions/4/accept").status_code == 403
```

- [ ] **Étape 2 : lancer les tests pour vérifier qu'ils échouent**

Run : `cd services/rental && pytest tests/test_retenue_intervention.py -v`
Attendu : FAIL — 404 sur `/suggestions`.

- [ ] **Étape 3 : ajouter `work_order_id` et les deux endpoints**

Le recalcul des totaux réutilise le chemin déjà en place pour
`POST /settlements/{sid}/lines` : ne pas dupliquer la formule, l'appeler.

- [ ] **Étape 4 : écrire la migration et l'inscrire**

`ADD COLUMN IF NOT EXISTS work_order_id BIGINT` sur `rental.deduction_line`, puis
`CREATE UNIQUE INDEX IF NOT EXISTS uq_deduction_line_wo ON rental.deduction_line(settlement_id, work_order_id) WHERE work_order_id IS NOT NULL;`.
Ajouter `rental/migrate_retenue_intervention.sql` à `MIGRATIONS`.

- [ ] **Étape 5 : lancer les tests**

Run : `cd services/rental && pytest -v`
Attendu : PASS.

- [ ] **Étape 6 : commit**

```bash
git add services/rental/db services/rental/app services/rental/tests infra/prod/deploy-remote.sh
git commit -m "feat(rental): proposer une retenue de caution depuis l'intervention"
```

---

## Lot D — Solder une refacturation

### Tâche 9 : Dire comment la refacturation a été réglée

**Fichiers :**
- Modifier : `services/directory/app/main.py`
- Modifier : `services/directory/tests/test_payeur.py`

**Interfaces :**
- Consomme : `settled_at`, `settled_by`, `settled_method` (tâche 1),
  `SETTLE_METHODS` (tâche 2).
- Produit : `POST /backoffice/work-orders/{wid}/settle` avec
  `{"method": "encaisse"}` → pose `settled_at`, `settled_by`, `settled_method`
  et rend l'intervention. Refuse 400 une méthode inconnue, 409 une intervention
  déjà soldée, 400 une intervention dont `charge_mode != "to_rebill"`.

- [ ] **Étape 1 : écrire les tests qui échouent**

```python
def test_solder_une_refacturation(client, db_session):
    wo = _wo_en_base(db_session, status="done", cost_final=Decimal("600"),
                     charge_mode="to_rebill")
    r = client.post(f"/backoffice/work-orders/{wo.id}/settle", json={"method": "encaisse"})
    assert r.status_code == 200
    db_session.refresh(wo)
    assert wo.settled_method == "encaisse" and wo.settled_by == 10 and wo.settled_at is not None
    # Une seule fois.
    assert client.post(f"/backoffice/work-orders/{wo.id}/settle",
                       json={"method": "abandonne"}).status_code == 409

def test_on_ne_solde_que_ce_qui_est_a_refacturer(client, db_session):
    wo = _wo_en_base(db_session, status="done", cost_final=Decimal("600"),
                     charge_mode="crg_expense")
    assert client.post(f"/backoffice/work-orders/{wo.id}/settle",
                       json={"method": "encaisse"}).status_code == 400
    sans_methode = _wo_en_base(db_session, status="done", cost_final=Decimal("600"),
                               charge_mode="to_rebill")
    assert client.post(f"/backoffice/work-orders/{sans_methode.id}/settle",
                       json={"method": "troc"}).status_code == 400
```

- [ ] **Étape 2 : lancer les tests pour vérifier qu'ils échouent**

Run : `cd services/directory && pytest tests/test_payeur.py -v`
Attendu : FAIL — 404 sur `/settle`.

- [ ] **Étape 3 : implémenter l'endpoint**

- [ ] **Étape 4 : lancer les tests**

Run : `cd services/directory && pytest -v`
Attendu : PASS.

- [ ] **Étape 5 : commit**

```bash
git add services/directory/app/main.py services/directory/tests
git commit -m "feat(directory): solder une intervention à refacturer"
```

---

## Lot E — Le front

### Tâche 10 : Le formulaire de création nomme le client et le payeur

**Fichiers :**
- Modifier : `frontend/src/pages/backoffice/artisans/WorkOrdersList.jsx`
- Modifier : `frontend/src/pages/backoffice/artisans/WorkOrderDetail.jsx`
- Modifier : `frontend/src/services/rentalService.js` (bail en cours d'un bien)
- Modifier : `frontend/src/locales/{fr,ar}/backoffice.json`
- Modifier : `frontend/src/pages/backoffice/tiers/ArtisansAndWorkOrders.test.jsx`

**Interfaces :**
- Consomme : `POST /backoffice/work-orders` (tâche 2) et
  `GET /backoffice/gestion-locative/leases?property_id=` existant.
- Produit : un `EMPTY_FORM` étendu de `client_id`, `nature`, `payer`,
  `charge_mode`, `third_party_label`.

- [ ] **Étape 1 : écrire les tests qui échouent**

```jsx
it('exige un client et propose le payeur selon la nature', async () => {
  renderPage()
  await userEvent.click(screen.getByRole('button', { name: 'Nouvelle intervention' }))
  await userEvent.type(screen.getByLabelText('Intitulé'), 'Chauffe-eau')
  await userEvent.selectOptions(await screen.findByLabelText('Bien concerné'), '5')
  // Sans client, la création reste fermée.
  expect(screen.getByRole('button', { name: 'Créer l’intervention' })).toBeDisabled()
  await userEvent.selectOptions(screen.getByLabelText('Client concerné'), '3')
  await userEvent.selectOptions(screen.getByLabelText('Nature des travaux'), 'structurel')
  // La nature propose le propriétaire, et le mode suit.
  expect(screen.getByLabelText('Qui paie')).toHaveValue('owner')
  expect(screen.getByLabelText('Règlement')).toHaveValue('crg_expense')
  await userEvent.click(screen.getByRole('button', { name: 'Créer l’intervention' }))
  await vi.waitFor(() => expect(api.post).toHaveBeenCalledWith('/backoffice/work-orders',
    expect.objectContaining({ property_id: 5, client_id: 3, nature: 'structurel',
      payer: 'owner', charge_mode: 'crg_expense' })))
})

it('affiche le bail en cours du bien sans le faire saisir', async () => {
  renderPage()
  await userEvent.click(screen.getByRole('button', { name: 'Nouvelle intervention' }))
  await userEvent.selectOptions(await screen.findByLabelText('Bien concerné'), '5')
  expect(await screen.findByText(/Loué à Karim Benali/)).toBeInTheDocument()
  expect(screen.queryByLabelText('Bail')).not.toBeInTheDocument()
})
```

- [ ] **Étape 2 : lancer les tests pour vérifier qu'ils échouent**

Run : `cd frontend && npx vitest run src/pages/backoffice/tiers`
Attendu : FAIL — `Client concerné` introuvable.

- [ ] **Étape 3 : étendre la fenêtre de création**

Le bail du bien s'affiche en texte (« Loué à <locataire> jusqu'au <date> » /
« Pas de bail en cours »), il ne se saisit pas. `payer` et `charge_mode` se
pré-remplissent depuis la nature et la présence d'un bail, en miroir de
`services/directory/app/payeur.py` ; le champ « Tiers » n'apparaît que pour
`payer === 'third_party'`.

- [ ] **Étape 4 : montrer sur la fiche d'intervention qui paie et où la dépense est partie**

Dans `WorkOrderDetail.jsx`, un bloc « Règlement » : le client concerné, le
payeur, le mode, et — quand `charged_ref` est renseigné — où la dépense a
atterri (`crg:<id>` mène au mandat, `settlement:<id>` au décompte). Test :

```jsx
it('dit où la dépense a atterri', async () => {
  svc.getWorkOrder.mockResolvedValue({ work_order: { id: 4, title: 'Chauffe-eau',
    payer: 'owner', charge_mode: 'crg_expense', charged_ref: 'crg:12',
    cost_final: 1200, status: 'done' } })
  renderDetail()
  expect(await screen.findByText('Propriétaire')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /compte rendu/i })).toBeInTheDocument()
})
```

- [ ] **Étape 5 : ajouter les clés FR et AR**

Sous `backoffice:thirdParties.workOrders.create.*` et
`…workOrders.detail.payment.*`. La parité est testée par `src/i18n/*.test.js`.

- [ ] **Étape 6 : lancer lint, tests et build**

Run : `cd frontend && ./node_modules/.bin/eslint src --ext js,jsx --report-unused-disable-directives --max-warnings 0 && npx vitest run && npm run build`
Attendu : 0 erreur, tous les tests au vert, build réussi.

- [ ] **Étape 7 : commit**

```bash
git add frontend/src
git commit -m "feat(tiers): nommer le client et le payeur à la création d'une intervention"
```

### Tâche 11 : L'écran des dépenses en attente

**Fichiers :**
- Créer : `frontend/src/pages/backoffice/rental/ExpensesList.jsx` + `.test.jsx`
- Modifier : `frontend/src/pages/backoffice/rental/RentalLayout.jsx`,
  `frontend/src/App.jsx`, `frontend/src/i18n/noHardcodedText.test.js`, locales

**Interfaces :**
- Consomme : `GET /backoffice/work-orders?pending=1` (tâche 4),
  `POST /backoffice/work-orders/{wid}/settle` (tâche 9).
- Produit : la route `rental/depenses` et son entrée de navigation.

- [ ] **Étape 1 : écrire les tests qui échouent**

```jsx
it('alerte sur une dépense qui dort depuis plus de 60 jours', async () => {
  svc.listPending.mockResolvedValue({ work_orders: [
    { id: 4, title: 'Peinture', cost_final: 8000, waiting_days: 91, charge_mode: 'crg_expense' },
    { id: 5, title: 'Vitre', cost_final: 600, waiting_days: 3, charge_mode: 'to_rebill' }] })
  renderPage()
  expect(await screen.findByText('Peinture')).toBeInTheDocument()
  expect(screen.getByText('91 jours')).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('1')
})

it('solde une refacturation après confirmation', async () => {
  svc.listPending.mockResolvedValue({ work_orders: [
    { id: 5, title: 'Vitre', cost_final: 600, waiting_days: 3, charge_mode: 'to_rebill' }] })
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: 'Solder Vitre' }))
  expect(svc.settle).not.toHaveBeenCalled()
  await userEvent.selectOptions(screen.getByLabelText('Comment'), 'encaisse')
  await userEvent.click(screen.getByRole('button', { name: 'Confirmer' }))
  await vi.waitFor(() => expect(svc.settle).toHaveBeenCalledWith(5, { method: 'encaisse' }))
})

it('signale une intervention achevée dont personne n’a choisi le règlement', async () => {
  svc.listPending.mockResolvedValue({ work_orders: [
    { id: 6, title: 'Serrure', cost_final: 120, waiting_days: 2, charge_mode: null }] })
  renderPage()
  expect(await screen.findByText('Règlement à choisir')).toBeInTheDocument()
})
```

- [ ] **Étape 2 : lancer les tests pour vérifier qu'ils échouent**

Run : `cd frontend && npx vitest run src/pages/backoffice/rental/ExpensesList.test.jsx`
Attendu : FAIL — module introuvable.

- [ ] **Étape 3 : écrire l'écran**

Kit maison : `PageHeader`, `Toolbar`, `SearchInput`, `DataTable`, `Alert`,
`EmptyState`, `IconAction`, et `useConfirm()` pour le solde — jamais
`window.confirm`. L'âge se lit depuis `waiting_days`, l'alerte se déclenche
au-delà de 60 jours.

- [ ] **Étape 4 : brancher la route et la navigation**

- [ ] **Étape 5 : ajouter le fichier à `noHardcodedText.test.js` et les clés FR/AR**

- [ ] **Étape 6 : lancer lint, tests et build**

Run : `cd frontend && ./node_modules/.bin/eslint src --ext js,jsx --report-unused-disable-directives --max-warnings 0 && npx vitest run && npm run build`
Attendu : tout au vert.

- [ ] **Étape 7 : commit**

```bash
git add frontend/src
git commit -m "feat(rental): écran des dépenses d'intervention en attente"
```

### Tâche 12 : Le brouillon de CRG, relu puis envoyé

**Fichiers :**
- Modifier : `frontend/src/pages/backoffice/rental/MandateDetail.jsx`,
  `frontend/src/services/rentalService.js`, locales
- Créer : `frontend/src/pages/backoffice/rental/MandateDetail.test.jsx`

**Interfaces :**
- Consomme : `GET /mandates/{id}/crg` enrichi et
  `POST /crg/{crg_id}/validate` (tâche 6).

- [ ] **Étape 1 : écrire les tests qui échouent**

```jsx
it('montre les dépenses du brouillon et permet d’en écarter une', async () => {
  svc.listCrg.mockResolvedValue({ reports: [{ id: 12, period_label: 'Septembre 2026',
    status: 'draft', rent_collected: 6000, fees: 480, expenses: 1500, net: 4020,
    expense_lines: [{ id: 4, title: 'Chauffe-eau', cost_final: 1200 },
                    { id: 5, title: 'Serrure', cost_final: 300 }] }] })
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: 'Écarter Serrure' }))
  await userEvent.click(screen.getByRole('button', { name: 'Valider le compte rendu' }))
  await vi.waitFor(() => expect(svc.validateCrg).toHaveBeenCalledWith(12,
    { excluded_work_order_ids: [5] }))
})

it('un compte rendu envoyé ne se valide plus', async () => {
  svc.listCrg.mockResolvedValue({ reports: [{ id: 11, period_label: 'Août 2026',
    status: 'sent', rent_collected: 6000, fees: 480, expenses: 0, net: 5520 }] })
  renderPage()
  expect(await screen.findByText('Août 2026')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Valider le compte rendu' })).not.toBeInTheDocument()
})
```

- [ ] **Étape 2 : lancer les tests pour vérifier qu'ils échouent**

Run : `cd frontend && npx vitest run src/pages/backoffice/rental/MandateDetail.test.jsx`
Attendu : FAIL.

- [ ] **Étape 3 : afficher le brouillon et son action**

Les colonnes existantes (`period_label`, `collected`, `net`) gagnent `expenses`
et un `StatusBadge` de statut. Un brouillon déplie ses lignes de dépense, chacune
avec une action « Écarter » ; l'action de validation n'existe que pour un `draft`.

- [ ] **Étape 4 : clés FR/AR**

- [ ] **Étape 5 : lancer lint, tests et build**

- [ ] **Étape 6 : commit**

```bash
git add frontend/src
git commit -m "feat(rental): relire le compte rendu de gérance avant envoi"
```

### Tâche 13 : Les retenues suggérées au décompte

**Fichiers :**
- Modifier : `frontend/src/pages/backoffice/rental/SettlementEditor.jsx`,
  `frontend/src/pages/backoffice/rental/LeasePanel.jsx`,
  `frontend/src/services/rentalService.js`, locales
- Créer : `frontend/src/pages/backoffice/rental/SettlementEditor.test.jsx`

**Interfaces :**
- Consomme : les deux endpoints de la tâche 8, et
  `GET /backoffice/work-orders?lease_id=` (tâche 4).

- [ ] **Étape 1 : écrire les tests qui échouent**

```jsx
it('propose les interventions du bail et n’en pose une qu’à l’acceptation', async () => {
  svc.listSuggestions.mockResolvedValue({ suggestions: [
    { work_order_id: 4, label: 'Vitre salon', amount: 600, completed_at: '2026-10-02T00:00:00' }] })
  renderEditor()
  expect(await screen.findByText('Vitre salon')).toBeInTheDocument()
  expect(svc.acceptSuggestion).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Retenir Vitre salon' }))
  await vi.waitFor(() => expect(svc.acceptSuggestion).toHaveBeenCalledWith(expect.anything(), 4))
})

it('ne propose rien sur un décompte finalisé', async () => {
  svc.getSettlement.mockResolvedValue({ settlement: { id: 3, status: 'finalized' } })
  svc.listSuggestions.mockResolvedValue({ suggestions: [] })
  renderEditor()
  expect(await screen.findByText('Décompte finalisé')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^Retenir/ })).not.toBeInTheDocument()
})
```

- [ ] **Étape 2 : lancer les tests pour vérifier qu'ils échouent**

Run : `cd frontend && npx vitest run src/pages/backoffice/rental/SettlementEditor.test.jsx`
Attendu : FAIL.

- [ ] **Étape 3 : afficher les suggestions au-dessus des lignes du décompte**

Un bloc distinct des lignes posées, visuellement clair sur le fait que rien n'est
retenu avant le clic.

- [ ] **Étape 4 : lister les interventions du bail sur sa fiche**

Dans `LeasePanel.jsx`, un bloc « Interventions » : les interventions du bail avec
leur payeur, leur mode, et le total déjà retenu sur la caution. Test :

```jsx
it('montre le total déjà retenu sur la caution', async () => {
  svc.listLeaseWorkOrders.mockResolvedValue({ work_orders: [
    { id: 4, title: 'Vitre salon', cost_final: 600, charge_mode: 'deposit_deduction',
      charged_ref: 'settlement:3' },
    { id: 5, title: 'Serrure', cost_final: 300, charge_mode: 'to_rebill', charged_ref: null }] })
  renderPanel()
  expect(await screen.findByText('Vitre salon')).toBeInTheDocument()
  expect(screen.getByText('600 Đh')).toBeInTheDocument()
})
```

- [ ] **Étape 5 : clés FR/AR**

- [ ] **Étape 6 : lancer lint, tests et build**

- [ ] **Étape 7 : commit**

```bash
git add frontend/src
git commit -m "feat(rental): suggérer les retenues de caution au décompte"
```

---

## Lot F — Les types de tâches d'exploitation

### Tâche 14 : Une tâche d'exploitation porte un type

**Fichiers :**
- Créer : `services/staymanager/db/migrate_type_tache_exploitation.sql`
- Modifier : `services/staymanager/app/models.py:204-206` (contrainte et colonne),
  `app/cleaning.py:66-85` (`ensure_tasks`), `app/main.py` (filtre et création)
- Modifier : `services/staymanager/tests/test_menage.py`
- Modifier : `infra/prod/deploy-remote.sh`

**Interfaces :**
- Consomme : rien.
- Produit : `CleaningTask.kind` (`String(20)`, défaut `"menage"`),
  `KINDS = ("menage", "linge", "accueil", "conciergerie", "controle")`, l'unicité
  `(reservation_id, kind)`, le paramètre `kind` sur
  `GET /backoffice/stays/cleanings` et sur sa création.

- [ ] **Étape 1 : écrire les tests qui échouent** *(point de vigilance 5)*

```python
def test_une_tache_sans_type_vaut_un_menage(client, db_session):
    t = _tache(db_session, property_id=7, scheduled_date=date(2026, 10, 30))
    assert client.get(f"/backoffice/stays/cleanings/{t.id}").json()["task"]["kind"] == "menage"

def test_un_sejour_porte_son_menage_et_son_accueil(client, db_session):
    sejour = _reservation(db_session, check_out=datetime(2026, 11, 2))
    _tache(db_session, reservation_id=sejour.id, kind="accueil",
           scheduled_date=date(2026, 10, 30))
    # La rotation de ménage reste à créer : l'accueil ne la bloque pas.
    assert ensure_tasks(db_session, AGENCY, today=date(2026, 10, 30)) == 1
    kinds = sorted(t.kind for t in db_session.query(CleaningTask)
                   .filter(CleaningTask.reservation_id == sejour.id))
    assert kinds == ["accueil", "menage"]
    # Et un second passage ne duplique rien.
    assert ensure_tasks(db_session, AGENCY, today=date(2026, 10, 30)) == 0

def test_le_filtre_de_type(client, db_session):
    _tache(db_session, property_id=7, kind="menage", scheduled_date=date(2026, 10, 30))
    _tache(db_session, property_id=7, kind="linge", scheduled_date=date(2026, 10, 30))
    rows = client.get("/backoffice/stays/cleanings?kind=linge").json()["tasks"]
    assert [t["kind"] for t in rows] == ["linge"]

def test_un_type_inconnu_est_refuse(client):
    assert client.post("/backoffice/stays/cleanings", json={
        "property_id": 7, "scheduled_date": "2026-10-30", "kind": "jardinage"}).status_code == 400
```

- [ ] **Étape 2 : lancer les tests pour vérifier qu'ils échouent**

Run : `cd services/staymanager && pytest tests/test_menage.py -v`
Attendu : FAIL — `KeyError: 'kind'`.

- [ ] **Étape 3 : ajouter `kind`, changer la contrainte, corriger `ensure_tasks`**

L'unicité devient `UniqueConstraint("reservation_id", "kind")`. Dans
`ensure_tasks`, la clé de dédoublonnage devient l'ensemble des
`reservation_id` **des tâches `kind == "menage"`** : c'est le point exact où une
tâche d'accueil supprimerait aujourd'hui la rotation.

- [ ] **Étape 4 : écrire la migration et l'inscrire**

`ADD COLUMN IF NOT EXISTS kind VARCHAR(20) DEFAULT 'menage'`,
`UPDATE staymanager.cleaning_task SET kind = 'menage' WHERE kind IS NULL`,
`ALTER TABLE staymanager.cleaning_task DROP CONSTRAINT IF EXISTS uq_cleaning_task_reservation`,
puis
`CREATE UNIQUE INDEX IF NOT EXISTS uq_cleaning_task_reservation_kind ON staymanager.cleaning_task(reservation_id, kind) WHERE reservation_id IS NOT NULL;`.
Ajouter `staymanager/migrate_type_tache_exploitation.sql` à `MIGRATIONS`.

- [ ] **Étape 5 : lancer les tests**

Run : `cd services/staymanager && pytest -v`
Attendu : PASS (les 120 tests existants compris).

- [ ] **Étape 6 : commit**

```bash
git add services/staymanager infra/prod/deploy-remote.sh
git commit -m "feat(staymanager): typer les tâches d'exploitation d'un séjour"
```

### Tâche 15 : L'écran d'exploitation sort du ménage

**Fichiers :**
- Modifier : `frontend/src/pages/backoffice/sejours/CleaningPanel.jsx`,
  `StaysLayout.jsx`, `Sejours.test.jsx`, `frontend/src/services/stayService.js`,
  locales

**Interfaces :**
- Consomme : le paramètre `kind` (tâche 14).
- Produit : la rubrique « Exploitation » gagne un filtre de type et une entrée
  **Maintenance** menant aux interventions des biens exploités en courte durée
  (`/backoffice/tiers/artisans`), sans dupliquer l'écran de Tiers.

- [ ] **Étape 1 : écrire les tests qui échouent**

```jsx
it('filtre les tâches par type', async () => {
  renderPanel()
  await userEvent.selectOptions(await screen.findByLabelText('Type de tâche'), 'linge')
  await vi.waitFor(() => expect(svc.listCleanings)
    .toHaveBeenCalledWith(expect.objectContaining({ kind: 'linge' })))
})

it('mène à la maintenance des biens exploités', async () => {
  renderLayout()
  expect(screen.getByRole('link', { name: 'Maintenance' }))
    .toHaveAttribute('href', expect.stringContaining('/backoffice/tiers/artisans'))
})
```

- [ ] **Étape 2 : lancer les tests pour vérifier qu'ils échouent**

Run : `cd frontend && npx vitest run src/pages/backoffice/sejours`
Attendu : FAIL.

- [ ] **Étape 3 : ajouter le filtre, renommer la rubrique, ajouter l'entrée**

Le titre de l'écran devient « Tâches d'exploitation » (clé neuve), le ménage n'est
plus qu'une valeur de son filtre. L'entrée de navigation rejoint le groupe
`operations` de `NAV` dans `StaysLayout.jsx`.

- [ ] **Étape 4 : clés FR/AR pour les cinq types et les libellés neufs**

- [ ] **Étape 5 : lancer lint, tests et build**

Run : `cd frontend && ./node_modules/.bin/eslint src --ext js,jsx --report-unused-disable-directives --max-warnings 0 && npx vitest run && npm run build`
Attendu : tout au vert.

- [ ] **Étape 6 : commit**

```bash
git add frontend/src
git commit -m "feat(sejours): l'exploitation d'un séjour couvre plus que le ménage"
```

---

## Clôture

- [ ] Mettre à jour `docs/integration-staymanager.md` : une entrée de journal par
      lot livré, dans la forme des points 14 à 18 déjà présents.
- [ ] Vérifier que les quatre nouvelles migrations figurent dans `MIGRATIONS` de
      `infra/prod/deploy-remote.sh` et que `scripts/dev-mesh-up.sh` les rejoue
      sans erreur sur une base neuve.
- [ ] Porte finale : `pytest` de `directory`, `rental`, `staymanager`,
      `notification` ; `npm run lint`, `npx vitest run`, `npm run build`. Le hook
      `pre-push` rejoue l'ensemble.
