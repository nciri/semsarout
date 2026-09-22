#!/usr/bin/env bash
# Étapes serveur du déploiement co-location (exécuté par .github/workflows/deploy.yml
# via SSH, APRÈS le rsync du code + des fronts). Idempotent : suppose le mesh déjà
# installé (cf. memory/prod-colocation-tabiblib) et ne provisionne que ce qui manque.
#
#   - venv : réinstall éditable (récupère les nouvelles dépendances des pyproject) ;
#            le code Python est déjà « live » car installé en -e et rsync-é.
#   - migrations : les services créent leurs tables manquantes au démarrage
#            (SQLAlchemy create_all / init_db). Les db/schema.sql NE sont PAS rejoués
#            (CREATE ROLE non gardé → non idempotents), mais les migrations ADDITIVES
#            (ALTER idempotents) sont jouées ici, après convergence du mesh — c'est la
#            seule chaîne réellement branchée : infra/prod/ansible n'est appelé par
#            aucun workflow, y ranger une migration revient à ne pas la jouer.
#   - provisioning : rien pour les services déjà en place ; un service AJOUTÉ au dépôt
#            après l'installation initiale du serveur n'a ni rôle PostgreSQL, ni fichier
#            d'environnement, ni instance systemd, et resterait donc éternellement absent
#            de la production (cf. NEW_SERVICES).
#   - restart : tout le mesh. Les 64 unités du serveur réel sont NOMMÉES EN CLAIR
#            (semsar-<svc>.service, semsar-<svc>-relay.service) : il n'y a AUCUNE unité
#            template sur la machine. Une version antérieure de ce fichier affirmait
#            l'inverse et instanciait semsar-app@<svc>.service ; le gabarit n'existant
#            pas, design3d n'a jamais été instancié et chaque déploiement sortait en
#            erreur (constaté par inspection SSH le 2026-09-16). On écrit donc les
#            unités manquantes, sur le patron des unités déjà installées.
set -euo pipefail

# Chemins surchargeables uniquement pour le banc d'essai (infra/prod/tests) : en
# production aucune de ces variables n'est définie, les valeurs réelles s'appliquent.
APP="${APP:-/opt/semsar}"
PIP="${PIP:-$APP/venv/bin/pip}"
DB="${DB:-semsar_prod}"
ENV_DIR="${ENV_DIR:-/etc/semsar/env}"
SYSTEMD_DIR="${SYSTEMD_DIR:-/etc/systemd/system}"
VENV="${VENV:-$APP/venv}"
# Fichiers d'environnement partagés par TOUTES les unités du serveur réel, dans cet
# ordre (cf. EnvironmentFile= des unités installées) : common.env (JWT, RabbitMQ, S3,
# ENVIRONMENT, TENANT_HOSTS) puis urls.env (toutes les *_URL inter-services).
# Une version antérieure écrivait les URL dans /etc/semsar/secrets.env, qu'AUCUNE unité
# ne lit : DESIGN3D_URL y a dormi sans effet et le BFF a répondu 404 (2026-09-16).
COMMON_ENV="${COMMON_ENV:-/etc/semsar/common.env}"
URLS_FILE="${URLS_FILE:-/etc/semsar/urls.env}"

# Services introduits APRÈS le provisioning initial du serveur. Ansible ne les
# installera pas : il n'est plus dans la chaîne de déploiement. Chaque entrée
# « <service> <port> » est traitée de façon idempotente — rôle et schéma PostgreSQL,
# fichiers d'environnement, instances systemd du template — et ne touche à RIEN pour
# les services déjà déployés. Une entrée à ajouter à chaque nouveau service.
NEW_SERVICES="design3d 8526"

# Migrations additives — mêmes fichiers que infra/prod/ansible/tasks/post_migrations.yml
# (dont ce bloc est le pendant sur la chaîne réelle), mais PAS le même ordre : ce
# bloc-ci les rejoue une par une et n'arrête jamais la séquence sur l'échec d'une
# seule (cf. boucle plus bas) — l'ordre n'a donc plus d'importance pour la robustesse,
# il reste néanmoins conservé pour minimiser le diff avec le playbook. Toutes
# idempotentes (IF NOT EXISTS / DO $$ … duplicate_object) : elles sont rejouées à
# chaque déploiement sans effet de bord tant qu'elles réussissent. Une entrée par
# `services/*/db/*.sql` hors schema.sql et migrate_from_monolith.sql.
#
# Toute colonne MAPPÉE par un modèle SQLAlchemy doit y figurer : init_db() ne fait qu'un
# create_all, qui n'ALTERe JAMAIS une table existante. Une colonne mappée dont l'ALTER n'est
# pas joué ici n'est donc pas un détail cosmétique, c'est une panne totale de tous les chemins
# qui lisent le modèle (identity.agency_ro.features_synced_at → UndefinedColumn sur chaque
# /auth/login et /auth/refresh d'un compte d'agence, donc tous les agents dehors).
# add_features_synced_at.sql est placée AVANT identity/add_rental_feature.sql, la seule entrée
# dont l'échec est connu : la boucle plus bas n'arrête jamais la séquence, mais rien ne justifie
# de faire dépendre une migration critique de cette propriété.
#
# identity/reset_features_sync_design3d.sql est en QUEUE de liste, et c'est la seule entrée dont
# la position est contrainte : elle réamorce le repli auto-réparateur d'identity pour que les
# agences Pro existantes reçoivent `design3d`, ce qui n'a de sens qu'une fois l'entitlement
# activé côté billing par billing/migrate_design3d_entitlement.sql.
MIGRATIONS="
identity/add_tenant.sql
identity/add_features_synced_at.sql
identity/add_features_until.sql
identity/migrate_didit.sql
identity/add_rental_feature.sql
messaging/migrate_conversation.sql
messaging/migrate_notification.sql
rental/migrate_particulier_lease.sql
listing/migrate_condo.sql
listing/migrate_price_period.sql
coloc-listing/migrate_condo.sql
billing/migrate_commission_invoice.sql
billing/migrate_design3d.sql
billing/migrate_design3d_entitlement.sql
billing/migrate_payment_failure.sql
billing/migrate_pricing.sql
billing/migrate_plans.sql
identity/reset_features_sync_design3d.sql
marketplace/add_cart_agency.sql
"

# psql en tant que rôle postgres (patron roles/postgres d'Ansible : become_user postgres).
# Le SQL arrive par stdin, ouvert par root : les fichiers de /opt/semsar n'ont pas à
# être lisibles par postgres.
psql_stdin() {
  runuser -u postgres -- psql -v ON_ERROR_STOP=1 -q -d "$DB"
}

# Verdict global du déploiement — posé tôt car les provisioning/migrations peuvent
# désormais échouer sans arrêter le script (cf. plus bas) : ils ne doivent pas pour
# autant échouer *silencieusement*.
FAIL=0

echo "== 1. venv : réinstallation éditable (nouvelles dépendances) =="
for lib in semsar_common semsar_auth semsar_events semsar_storage semsar_search semsar_signing; do
  [ -d "$APP/libs/$lib" ] && $PIP install -q -e "$APP/libs/$lib"
done
$PIP install -q -e "$APP/gateway"
for d in "$APP"/services/*/; do
  [ -f "$d/pyproject.toml" ] || continue
  case "$d" in *_template*/) continue ;; esac
  $PIP install -q -e "$d"
done

# Rôle + schéma PostgreSQL du service (sur le patron de `services/*/db/schema.sql`
# rendu idempotent — le CREATE ROLE nu du fichier ne l'est pas, c'est pourquoi les
# schema.sql ne sont jamais rejoués tels quels), PUIS son fichier d'environnement.
#
# UN SEUL fichier par service sur le serveur réel : /etc/semsar/env/<svc>.env, lu à la
# fois par l'unité API et par son relais (`EnvironmentFile=-/etc/semsar/env/<svc>.env`
# dans les deux). Il n'y a ni app-<svc>.env ni relay-<svc>.env : ceux qu'une version
# antérieure a écrits (app-design3d.env) ne sont lus par personne.
#
# Le mot de passe fait autorité DEPUIS <svc>.env : s'il existe déjà, il est relu et
# réappliqué au rôle (rejouable sans dérive) ; sinon il est tiré au sort ici et
# n'apparaît jamais ailleurs que dans ce fichier root-only.
ensure_db_and_env() {
  local svc="$1" port="$2" role pass envf
  role="${svc//-/_}"
  envf="$ENV_DIR/$svc.env"
  pass=""
  if [ -f "$envf" ]; then
    pass="$(sed -n 's|^DATABASE_URL=postgresql+psycopg://[^:]*:\([^@]*\)@.*|\1|p' "$envf" | head -n 1)"
  fi
  # `od` plutôt qu'un pipe tronqué par `head` : sous `set -o pipefail`, un SIGPIPE
  # ferait échouer le déploiement entier.
  [ -n "$pass" ] || pass="$(od -An -tx1 -N24 /dev/urandom | tr -d ' \n')"
  psql_stdin <<SQL
DO \$do\$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$role') THEN
      CREATE ROLE $role LOGIN PASSWORD '$pass';
   ELSE
      ALTER ROLE $role WITH PASSWORD '$pass';
   END IF;
END
\$do\$;
CREATE SCHEMA IF NOT EXISTS $role AUTHORIZATION $role;
ALTER ROLE $role SET search_path = $role;
GRANT ALL ON SCHEMA $role TO $role;
SQL

  if [ ! -f "$envf" ]; then
    mkdir -p "$ENV_DIR"
    (umask 077; {
      printf 'SERVICE_NAME=%s\n' "$svc"
      printf 'PORT=%s\n' "$port"
      printf 'TRUST_GATEWAY_HEADERS=true\n'
      printf 'DATABASE_URL=postgresql+psycopg://%s:%s@localhost:5432/%s\n' "$role" "$pass" "$DB"
    } > "$envf")
    chmod 600 "$envf"
    echo "  + $envf"
  fi
}

# URL inter-services. Toutes les unités lisent /etc/semsar/urls.env (cf. plus haut) :
# sans l'entrée du service, le BFF a l'URL amont à None et répond 404 sur TOUTES ses
# routes — le service tourne, mais reste injoignable, silencieusement.
# Ajout seul, jamais de réécriture d'une entrée existante.
ensure_service_url() {
  local svc="$1" port="$2" var
  var="$(printf '%s' "$svc" | tr '[:lower:]-' '[:upper:]_')_URL"
  if grep -q "^$var=" "$URLS_FILE" 2>/dev/null; then
    return 0
  fi
  if [ ! -f "$URLS_FILE" ]; then
    mkdir -p "$(dirname "$URLS_FILE")"
    (umask 077; : > "$URLS_FILE")
  fi
  printf '%s=http://localhost:%s\n' "$var" "$port" >> "$URLS_FILE"
  echo "  + $var dans $URLS_FILE"
}

# Unités systemd du service, à la convention EXACTE des 64 unités déjà installées :
# semsar-<svc>.service (API) et semsar-<svc>-relay.service (relais outbox), nommées en
# clair. Le contenu est copié du patron réel (semsar-billing.service /
# semsar-billing-relay.service lus sur la machine le 2026-09-16) : mêmes EnvironmentFile
# dans le même ordre, mêmes Restart/OOMScoreAdjust, uvicorn --app-dir pour l'API et
# `python -m app.relay` avec PYTHONPATH pour le relais.
#
# Écriture seulement si l'unité MANQUE : une unité déjà installée fait autorité et n'est
# jamais réécrite (ce script ne doit rien changer pour les services déjà déployés).
write_unit() {
  local path="$1" content="$2" name
  name="$(basename "$path")"
  if [ -f "$path" ]; then
    echo "  = $name déjà installée, inchangée"
  else
    printf '%s' "$content" > "$path"
    # Relecture AVANT enable : systemd ignore une unité qu'il n'a pas encore vue.
    systemctl daemon-reload
    echo "  + $path"
  fi
  if systemctl enable --now "$name" >/dev/null 2>&1; then
    echo "  + $name active"
  else
    echo "  ✗ échec de l'activation de $name" >&2
    FAIL=1
  fi
}

ensure_units() {
  local svc="$1" port="$2"
  write_unit "$SYSTEMD_DIR/semsar-$svc.service" "[Unit]
Description=semsar $svc (API)
After=network.target postgresql.service docker.service
[Service]
EnvironmentFile=$COMMON_ENV
EnvironmentFile=$URLS_FILE
EnvironmentFile=-$ENV_DIR/$svc.env
Environment=SERVICE_NAME=$svc
ExecStart=$VENV/bin/uvicorn app.main:app --app-dir $APP/services/$svc --host 127.0.0.1 --port $port
Restart=always
RestartSec=3
OOMScoreAdjust=500
[Install]
WantedBy=multi-user.target
"

  if [ -f "$APP/services/$svc/app/relay.py" ]; then
    write_unit "$SYSTEMD_DIR/semsar-$svc-relay.service" "[Unit]
Description=semsar $svc-relay
After=network.target postgresql.service docker.service
[Service]
EnvironmentFile=$COMMON_ENV
EnvironmentFile=$URLS_FILE
EnvironmentFile=-$ENV_DIR/$svc.env
Environment=SERVICE_NAME=$svc
Environment=PYTHONPATH=$APP/services/$svc
ExecStart=$VENV/bin/python -m app.relay
Restart=always
RestartSec=5
OOMScoreAdjust=600
[Install]
WantedBy=multi-user.target
"
  fi
}

echo "== 2. provisioning des services ajoutés depuis l'installation du serveur =="
set -- $NEW_SERVICES
while [ "$#" -ge 2 ]; do
  svc="$1" port="$2"; shift 2
  [ -f "$APP/services/$svc/db/schema.sql" ] || { echo "  - $svc : pas de schema.sql, ignoré"; continue; }
  echo "  · $svc (port $port)"
  ensure_db_and_env "$svc" "$port"
  ensure_service_url "$svc" "$port"
  ensure_units "$svc" "$port"
done

echo "== 3. redémarrage du mesh (create_all au boot = migrations légères) =="
systemctl daemon-reload
systemctl restart 'semsar-*.service'

echo "== 4. santé (attente de convergence du mesh) =="
# 64 unités redémarrent : on laisse converger, puis on vérifie le gateway (poll) et les unités.
code=000
for _ in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8099/health 2>/dev/null || true)
  [ "$code" = "200" ] && break
  sleep 3
done
echo "  gateway/BFF health: ${code:-000}"
[ "$code" = "200" ] || FAIL=1
sleep 3  # laisser les dernières unités finir leur démarrage

# Un service peut être « active » et rester injoignable À TRAVERS le BFF si son URL
# manque à secrets.env : le routage y est conditionné à l'URL amont et retombe sinon
# sur un 404 sans repli. Le contrôle d'unités seul ne l'aurait jamais vu. Ces lectures
# ne demandent ni authentification ni entitlement et répondent 200 sur une cible
# inexistante — une entrée par service dont le routage BFF doit être prouvé.
ROUTING_CHECKS="design3d:/api/v1/public/design3d/by-target?target_type=property&target_id=0"
for rc in $ROUTING_CHECKS; do
  rc_svc="${rc%%:*}"; rc_path="${rc#*:}"
  rc_code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:8099$rc_path" 2>/dev/null || true)
  echo "  routage BFF -> $rc_svc: ${rc_code:-000}"
  [ "$rc_code" = "200" ] || { echo "  ✗ le BFF ne route pas vers $rc_svc" >&2; FAIL=1; }
done

echo "== 5. migrations additives (ALTER sur des tables créées par create_all) =="
# Jouées après la convergence du mesh, donc après le create_all de chaque service : la
# table visée existe forcément (pour les migrations dont le schéma appartient à un
# service du mesh).
#
# identity/add_rental_feature.sql fait exception : elle interroge public.subscriptions
# / public.subscription_plans, des tables du monolithe LEGACY qui n'ont jamais été (et
# ne seront pas) migrées sur semsar_prod — les tables réelles sont billing.subscription
# / billing.subscription_plan (schéma dédié, singulier). Réécrire cette migration pour
# viser billing.* est hors périmètre de ce lot (design3d). Sans traitement particulier,
# son échec est donc systématique et ferait sortir CHAQUE déploiement en erreur, y
# compris un déploiement par ailleurs parfaitement sain — personne ne pourrait plus
# distinguer un déploiement réussi d'un déploiement raté.
#
# Le critère qui suit ne rend PAS cette migration inconditionnellement non bloquante
# (ça masquerait une vraie régression qui la ferait échouer différemment) : seul un
# échec dont le message psql confirme PRÉCISÉMENT cette cause connue (relation
# "public.subscriptions" ou "public.subscription_plans" absente) est absorbé et loggé
# comme tel ; tout autre échec — sur cette migration comme sur n'importe quelle autre —
# reste fatal et visible. L'échec d'UNE migration (fatal ou absorbé) ne doit jamais
# arrêter les suivantes : une colonne manquante sur un autre service resterait alors
# non réparée à chaque déploiement.
KNOWN_MISSING_LEGACY_TABLE_ERROR='relation "public\.(subscriptions|subscription_plans)" does not exist'
MIGRATION_FAIL=0
for m in $MIGRATIONS; do
  f="$APP/services/${m%%/*}/db/${m#*/}"
  if [ ! -f "$f" ]; then
    echo "  ✗ $m introuvable ($f)" >&2
    MIGRATION_FAIL=1
    continue
  fi
  errfile="$(mktemp)"
  if psql_stdin < "$f" 2>"$errfile"; then
    echo "  ✓ $m"
  elif grep -qE "$KNOWN_MISSING_LEGACY_TABLE_ERROR" "$errfile"; then
    cat "$errfile" >&2
    echo "  ~ $m a échoué pour une cause connue et non bloquante (table monolithe" \
         "legacy jamais migrée sur semsar_prod) — ignoré, à traiter séparément" >&2
  else
    cat "$errfile" >&2
    echo "  ✗ $m a échoué (voir le message psql ci-dessus)" >&2
    MIGRATION_FAIL=1
  fi
  rm -f "$errfile"
done
[ "$MIGRATION_FAIL" -eq 0 ] || FAIL=1

echo "== 6. verdict (unités systemd) =="
while read -r unit; do
  state=$(systemctl is-active "$unit" 2>/dev/null || true)
  [ "$state" = "active" ] || { echo "  ✗ $unit -> $state"; FAIL=1; }
done < <(systemctl list-units 'semsar-*.service' --no-legend --plain | awk '{print $1}')
if [ "$FAIL" -ne 0 ]; then
  echo "DÉPLOIEMENT: au moins une vérification a échoué (unité, gateway, routage BFF ou migration)." >&2
  exit 1
fi
echo "DÉPLOIEMENT OK : mesh actif, gateway 200, migrations additives jouées."
