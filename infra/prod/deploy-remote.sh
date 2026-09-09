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
#            d'environnement, ni unité systemd, et resterait donc éternellement absent
#            de la production (cf. NEW_SERVICES).
#   - restart : tout le mesh (64 unités plain-named semsar-*.service).
set -euo pipefail

# Chemins surchargeables uniquement pour le banc d'essai (infra/prod/tests) : en
# production aucune de ces variables n'est définie, les valeurs réelles s'appliquent.
APP="${APP:-/opt/semsar}"
PIP="${PIP:-$APP/venv/bin/pip}"
DB="${DB:-semsar_prod}"
ENV_DIR="${ENV_DIR:-/etc/semsar/env}"
SYSTEMD_DIR="${SYSTEMD_DIR:-/etc/systemd/system}"

# Services introduits APRÈS le provisioning initial du serveur. Ansible ne les
# installera pas : il n'est plus dans la chaîne de déploiement. Chaque entrée
# « <service> <port> <service-gabarit> » est traitée de façon idempotente — rôle et
# schéma PostgreSQL, fichier d'environnement, unités systemd — et ne touche à RIEN
# pour les services déjà déployés. Le gabarit est un service existant DONT ON COPIE
# LES UNITÉS : la convention systemd réelle de la machine est ainsi reprise telle
# quelle plutôt que réinventée ici. Une entrée à ajouter à chaque nouveau service.
NEW_SERVICES="design3d 8526 listing"

# Migrations additives — mêmes fichiers et même ordre que
# infra/prod/ansible/tasks/post_migrations.yml, dont ce bloc est le pendant sur la
# chaîne réelle. Toutes idempotentes (IF NOT EXISTS / DO $$ … duplicate_object) :
# elles sont rejouées à chaque déploiement sans effet de bord. Une entrée par
# `services/*/db/*.sql` hors schema.sql et migrate_from_monolith.sql.
MIGRATIONS="
identity/add_tenant.sql
identity/add_rental_feature.sql
messaging/migrate_conversation.sql
rental/migrate_particulier_lease.sql
billing/migrate_commission_invoice.sql
billing/migrate_design3d.sql
"

# psql en tant que rôle postgres (patron roles/postgres d'Ansible : become_user postgres).
# Le SQL arrive par stdin, ouvert par root : les fichiers de /opt/semsar n'ont pas à
# être lisibles par postgres.
psql_stdin() {
  runuser -u postgres -- psql -v ON_ERROR_STOP=1 -q -d "$DB"
}

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

# Rôle + schéma PostgreSQL du service, sur le patron de `services/*/db/schema.sql`
# rendu idempotent (le CREATE ROLE nu du fichier ne l'est pas — c'est la raison pour
# laquelle les schema.sql ne sont jamais rejoués tels quels).
#
# Le mot de passe fait autorité DEPUIS le fichier d'environnement : s'il existe, il est
# relu et réappliqué au rôle (rejouable sans dérive) ; sinon il est tiré au sort ici et
# n'apparaît jamais ailleurs que dans ce fichier root-only.
ensure_db_role() {
  local svc="$1" role pass envf
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
    (umask 077; printf 'DATABASE_URL=postgresql+psycopg://%s:%s@localhost:5432/%s\n' "$role" "$pass" "$DB" > "$envf")
    chmod 600 "$envf"
    echo "  + $envf"
  fi
}

# Unités systemd du service, copiées de celles d'un service existant : ni le nom des
# unités, ni leur contenu ne sont devinés ici — on reprend la convention réelle de la
# machine (une unité d'API + une de relais pour le gabarit choisi) en substituant le
# nom du service et son port. Les unités déjà présentes ne sont jamais réécrites.
ensure_units() {
  local svc="$1" port="$2" tmpl_svc="$3" tmpl_port="$4" tmpl target created=0
  for tmpl in "$SYSTEMD_DIR"/semsar-"$tmpl_svc"*.service; do
    [ -e "$tmpl" ] || continue
    target="${tmpl//$tmpl_svc/$svc}"
    [ -f "$target" ] && continue
    sed -e "s/$tmpl_svc/$svc/g" -e "s/\b$tmpl_port\b/$port/g" "$tmpl" > "$target"
    chmod 644 "$target"
    echo "  + $target (copié de $tmpl)"
    created=1
  done
  if [ "$created" -eq 1 ]; then
    systemctl daemon-reload
    for target in "$SYSTEMD_DIR"/semsar-"$svc"*.service; do
      [ -e "$target" ] && systemctl enable "$(basename "$target")" >/dev/null 2>&1 || true
    done
  fi
}

echo "== 2. provisioning des services ajoutés depuis l'installation du serveur =="
set -- $NEW_SERVICES
while [ "$#" -ge 3 ]; do
  svc="$1" port="$2" tmpl_svc="$3"; shift 3
  [ -f "$APP/services/$svc/db/schema.sql" ] || { echo "  - $svc : pas de schema.sql, ignoré"; continue; }
  tmpl_port="$(sed -n 's|^.*127\.0\.0\.1:\([0-9]\{4\}\).*$|\1|p;s|^.*--port[= ]\([0-9]\{4\}\).*$|\1|p' \
      "$SYSTEMD_DIR/semsar-$tmpl_svc.service" 2>/dev/null | head -n 1)"
  echo "  · $svc (port $port, gabarit $tmpl_svc${tmpl_port:+:$tmpl_port})"
  ensure_db_role "$svc"
  if [ -n "$tmpl_port" ]; then
    ensure_units "$svc" "$port" "$tmpl_svc" "$tmpl_port"
  else
    echo "  ! gabarit semsar-$tmpl_svc.service introuvable ou port illisible :" \
         "unités de $svc NON créées (le service restera absent du mesh)" >&2
  fi
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
FAIL=0
[ "$code" = "200" ] || FAIL=1
sleep 3  # laisser les dernières unités finir leur démarrage

echo "== 5. migrations additives (ALTER sur des tables créées par create_all) =="
# Jouées après la convergence du mesh, donc après le create_all de chaque service : la
# table visée existe forcément. Placées AVANT le verdict des unités à dessein — une
# unité neuve qui ne démarre pas ne doit pas priver les autres services de la migration
# qui les répare. Un échec ici est fatal : une colonne manquante met le service concerné
# hors d'usage sur TOUTES ses routes (cf. billing.subscription_plan).
for m in $MIGRATIONS; do
  f="$APP/services/${m%%/*}/db/${m#*/}"
  if [ ! -f "$f" ]; then
    echo "  ✗ $m introuvable ($f)" >&2
    exit 1
  fi
  psql_stdin < "$f"
  echo "  ✓ $m"
done

echo "== 6. verdict (unités systemd) =="
while read -r unit; do
  state=$(systemctl is-active "$unit" 2>/dev/null || true)
  [ "$state" = "active" ] || { echo "  ✗ $unit -> $state"; FAIL=1; }
done < <(systemctl list-units 'semsar-*.service' --no-legend --plain | awk '{print $1}')
if [ "$FAIL" -ne 0 ]; then
  echo "DÉPLOIEMENT: au moins une unité KO ou gateway non-200." >&2
  exit 1
fi
echo "DÉPLOIEMENT OK : mesh actif, gateway 200, migrations additives jouées."
