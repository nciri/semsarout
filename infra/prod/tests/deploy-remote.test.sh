#!/usr/bin/env bash
# Banc d'essai de infra/prod/deploy-remote.sh — la SEULE chaîne de déploiement réellement
# branchée (deploy.yml → ssh → ce script). Elle ne peut pas être jouée contre la
# production, et un correctif d'infra qu'on ne peut pas exercer n'est pas vérifié : le
# script tourne donc ici sur une arborescence jetable, avec psql/systemctl/curl/pip
# simulés, et l'on vérifie ce qu'il aurait fait sur le serveur.
#
# Les fixtures modélisent le serveur RÉEL, pas une réinvention : les unités systemd sont
# les gabarits TEMPLATE effectivement installés par le rôle Ansible mesh
# (infra/prod/ansible/roles/mesh/templates/semsar-app@.service.j2 /
# semsar-relay@.service.j2 — copiés/rendus depuis le dépôt ci-dessous, pas réinventés),
# et le fichier d'environnement partagé est l'unique secrets.env
# (roles/base/templates/secrets.env.j2), jamais un urls.env séparé qui n'existe nulle
# part dans le dépôt.
#
# Couvre : provisionnement d'un service ajouté après l'installation (rôle + schéma
# PostgreSQL, fichiers d'environnement app-<svc>.env/relay-<svc>.env root-only,
# instanciation des unités template), diffusion de l'URL inter-services dans
# secrets.env, migrations additives résilientes (une migration héritée qui échoue ne
# doit pas empêcher les suivantes de tourner, ni faire disparaître l'échec global), et
# surtout IDEMPOTENCE — une seconde exécution ne doit rien changer, ni pour le nouveau
# service ni pour les services déjà déployés.
#
#   bash infra/prod/tests/deploy-remote.test.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SCRIPT="$ROOT/infra/prod/deploy-remote.sh"
FAILURES=0

ok() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
ko() { printf '  \033[31m✗\033[0m %s\n' "$1"; FAILURES=$((FAILURES + 1)); }
check() { if [ "$2" = "$3" ]; then ok "$1"; else ko "$1 (attendu: $3 / obtenu: $2)"; fi; }
contains() { if grep -qF -- "$2" "$3" 2>/dev/null; then ok "$1"; else ko "$1"; fi; }
absent() { if [ -e "$3" ] && grep -qF -- "$2" "$3" 2>/dev/null; then ko "$1"; else ok "$1"; fi; }
file_absent() { if [ -e "$2" ]; then ko "$1"; else ok "$1"; fi; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# --- serveur simulé -----------------------------------------------------------
BIN="$TMP/bin"; mkdir -p "$BIN"
export SQL_LOG="$TMP/sql.log" SYSTEMCTL_LOG="$TMP/systemctl.log" CURL_LOG="$TMP/curl.log"

cat > "$BIN/runuser" <<'STUB'
#!/usr/bin/env bash
# runuser -u postgres -- psql … : le banc d'essai n'a ni root ni accès à un rôle
# postgres réel, donc on ne peut pas rejouer un vrai serveur. On simule néanmoins un
# psql qui EXÉCUTE (au sens : journalise le SQL reçu ET échoue réellement) plutôt
# qu'un psql qui avale tout sans jamais échouer : toute requête référençant
# public.subscriptions / public.subscription_plans échoue avec un code de sortie non
# nul (comme un vrai serveur PostgreSQL le ferait — ces tables du monolithe legacy
# n'existent pas sur semsar_prod, cf. commentaire deploy-remote.sh §5). Tout le reste
# réussit, comme le ferait un serveur convergé pour du SQL idempotent visant des
# tables déjà créées par create_all.
sql="$(cat)"
{ echo "--- psql $* ---"; printf '%s\n' "$sql"; } >> "$SQL_LOG"
if printf '%s' "$sql" | grep -qiE 'public\.(subscriptions|subscription_plans)'; then
  echo 'psql:<stdin>: ERROR:  relation "public.subscriptions" does not exist' >&2
  exit 1
fi
STUB
cat > "$BIN/systemctl" <<'STUB'
#!/usr/bin/env bash
echo "systemctl $*" >> "$SYSTEMCTL_LOG"
case "$1" in
  is-active) echo active ;;
  list-units) for u in $(cat "$UNITS_LIST" 2>/dev/null); do echo "$u loaded active running $u"; done ;;
  daemon-reload) : ;;
  enable)
    unit="${*: -1}"
    case "$unit" in
      *@*.service)
        # Un vrai systemd refuse d'activer une instance dont le gabarit n'existe pas :
        # `Failed to enable unit: Unit … does not exist.` (code de sortie non nul).
        tmpl="${unit%%@*}@.service"
        if [ ! -f "$SYSTEMD_DIR/$tmpl" ]; then
          echo "Failed to enable unit: Unit file $tmpl does not exist." >&2
          exit 1
        fi
        ;;
    esac
    grep -qxF "$unit" "$UNITS_LIST" 2>/dev/null || echo "$unit" >> "$UNITS_LIST"
    ;;
esac
STUB
cat > "$BIN/curl" <<'STUB'
#!/usr/bin/env bash
# Journalise l'URL demandée et répond 200, sauf si CURL_FAIL_MATCH la couvre.
url="${*: -1}"
echo "$url" >> "$CURL_LOG"
case "${CURL_FAIL_MATCH:-}" in
  "") echo 200 ;;
  *) case "$url" in *"$CURL_FAIL_MATCH"*) echo 502 ;; *) echo 200 ;; esac ;;
esac
STUB
cat > "$BIN/pip" <<'STUB'
#!/usr/bin/env bash
exit 0
STUB
chmod +x "$BIN"/*
export PATH="$BIN:$PATH"

# Arborescence : le code rsync-é (réel, depuis le dépôt) + l'état du serveur.
export APP="$TMP/opt/semsar" PIP="$BIN/pip" DB=semsar_test
export ENV_DIR="$TMP/etc/semsar/env" SYSTEMD_DIR="$TMP/etc/systemd/system"
export SECRETS_FILE="$TMP/etc/semsar/secrets.env"
mkdir -p "$APP" "$ENV_DIR" "$SYSTEMD_DIR" "$(dirname "$SECRETS_FILE")"
cp -r "$ROOT/services" "$APP/services"
mkdir -p "$APP/libs" "$APP/gateway"
export UNITS_LIST="$TMP/units"

# secrets.env : fichier UNIQUE (roles/base/templates/secrets.env.j2) — un extrait
# minimal mais réaliste (mots de passe PG + URLs inter-services cohabitent).
cat > "$SECRETS_FILE" <<'ENVF'
PG_PASSWORD_LISTING=existant
RABBITMQ_URL=amqp://semsar:x@localhost:5672/
LISTING_URL=http://localhost:8012
BILLING_URL=http://localhost:8508
ENVF
chmod 600 "$SECRETS_FILE"

# Unités TEMPLATE réelles, dérivées des gabarits Ansible du dépôt (pas réinventées) :
# c'est la convention systemd effective de la machine — semsar-app@.service et
# semsar-relay@.service, jamais de semsar-<svc>.service nommé en clair.
render_unit() {
  sed -e 's#{{ *semsar_user *}}#semsar#g' -e 's#{{ *semsar_group *}}#semsar#g' \
      -e "s#{{ *semsar_app_dir *}}#$APP#g" -e "s#{{ *semsar_secrets_file *}}#$SECRETS_FILE#g" \
      -e "s#{{ *semsar_env_dir *}}#$ENV_DIR#g" -e "s#{{ *semsar_venv_dir *}}#$APP/venv#g" \
      "$1"
}
render_unit "$ROOT/infra/prod/ansible/roles/mesh/templates/semsar-app@.service.j2" \
  > "$SYSTEMD_DIR/semsar-app@.service"
render_unit "$ROOT/infra/prod/ansible/roles/mesh/templates/semsar-relay@.service.j2" \
  > "$SYSTEMD_DIR/semsar-relay@.service"

# Un service déjà déployé (listing) : ses fichiers d'environnement suivent la
# convention réelle app-<svc>.env / relay-<svc>.env (env-app.j2 / env-relay.j2), et
# ses instances sont déjà "chargées" côté systemd (UNITS_LIST).
printf 'SERVICE_NAME=listing\nPORT=8012\nTRUST_GATEWAY_HEADERS=true\nDATABASE_URL=postgresql+psycopg://listing:MOTDEPASSEEXISTANT@localhost:5432/semsar_test\n' \
  > "$ENV_DIR/app-listing.env"
chmod 600 "$ENV_DIR/app-listing.env"
printf 'SERVICE_NAME=listing\nDATABASE_URL=postgresql+psycopg://listing:MOTDEPASSEEXISTANT@localhost:5432/semsar_test\nPYTHONPATH=%s/services/listing\n' "$APP" \
  > "$ENV_DIR/relay-listing.env"
chmod 600 "$ENV_DIR/relay-listing.env"
printf 'semsar-app@listing.service\nsemsar-relay@listing.service\n' > "$UNITS_LIST"

# --- exécution 1 --------------------------------------------------------------
echo "== exécution 1 (serveur sans design3d) =="
bash "$SCRIPT" > "$TMP/run1.out" 2>&1
run1_status=$?
# Le déploiement DOIT échouer ici : la migration héritée identity/add_rental_feature.sql
# vise des tables (public.subscriptions/subscription_plans) absentes de semsar_prod —
# préexistant, hors périmètre de ce correctif (cf. rapport) — mais elle ne doit ni
# arrêter les migrations suivantes ni faire disparaître l'échec global (vérifié plus bas).
if [ "$run1_status" -ne 0 ]; then
  ok "le déploiement échoue (migration héritée identity/add_rental_feature.sql cassée)"
else
  ko "le déploiement échoue (migration héritée identity/add_rental_feature.sql cassée)"
  sed 's/^/      /' "$TMP/run1.out"
fi

contains "rôle PostgreSQL design3d créé si absent" "CREATE ROLE design3d LOGIN PASSWORD" "$SQL_LOG"
contains "schéma design3d créé" "CREATE SCHEMA IF NOT EXISTS design3d" "$SQL_LOG"
contains "search_path du rôle posé" "ALTER ROLE design3d SET search_path = design3d" "$SQL_LOG"
contains "migration billing/migrate_design3d.sql jouée" "has_design3d" "$SQL_LOG"
contains "migration billing/migrate_commission_invoice.sql jouée" "commission" "$SQL_LOG"

# --- défaut n°3 (nom de fichier d'environnement) -------------------------------
if [ -f "$ENV_DIR/app-design3d.env" ]; then
  ok "fichier d'environnement app-design3d.env créé (nom attendu par semsar-app@.service.j2)"
  check "il est root-only (0600)" "$(stat -c '%a' "$ENV_DIR/app-design3d.env")" "600"
  contains "il porte le DATABASE_URL du rôle" "postgresql+psycopg://design3d:" "$ENV_DIR/app-design3d.env"
  contains "il porte le PORT du service" "PORT=8526" "$ENV_DIR/app-design3d.env"
  pass1="$(sed -n 's|^DATABASE_URL=postgresql+psycopg://design3d:\([^@]*\)@.*|\1|p' "$ENV_DIR/app-design3d.env")"
  if [ "${#pass1}" -ge 32 ]; then ok "le mot de passe est tiré au sort (${#pass1} caractères)"
  else ko "mot de passe trop court ou absent (${#pass1})"; fi
else
  ko "fichier d'environnement app-design3d.env créé"; pass1=""
fi
file_absent "aucun fichier design3d.env fantôme (mauvais nom, ignoré de l'unité)" "$ENV_DIR/design3d.env"

if [ -f "$ENV_DIR/relay-design3d.env" ]; then
  ok "fichier d'environnement relay-design3d.env créé (design3d a un relais outbox)"
  check "il est root-only (0600)" "$(stat -c '%a' "$ENV_DIR/relay-design3d.env")" "600"
  contains "il porte le même DATABASE_URL" "postgresql+psycopg://design3d:$pass1@" "$ENV_DIR/relay-design3d.env"
else
  ko "fichier d'environnement relay-design3d.env créé"
fi

# --- défaut n°1 (unités template, pas de copie de gabarit nommé en clair) -----
contains "l'instance semsar-app@design3d.service est activée+démarrée" \
  "systemctl enable --now semsar-app@design3d.service" "$SYSTEMCTL_LOG"
contains "l'instance semsar-relay@design3d.service est activée+démarrée" \
  "systemctl enable --now semsar-relay@design3d.service" "$SYSTEMCTL_LOG"
file_absent "aucune unité semsar-design3d.service copiée-renommée n'est créée" \
  "$SYSTEMD_DIR/semsar-design3d.service"
file_absent "aucune unité semsar-design3d-relay.service copiée-renommée n'est créée" \
  "$SYSTEMD_DIR/semsar-design3d-relay.service"

# --- défaut n°2 (secrets.env unique, pas de urls.env fantôme) -----------------
contains "DESIGN3D_URL diffusée dans le fichier réellement lu par les unités (secrets.env)" \
  "DESIGN3D_URL=http://localhost:8526" "$SECRETS_FILE"
file_absent "aucun fichier urls.env fantôme n'est créé" "$TMP/etc/semsar/urls.env"
contains "le routage BFF vers design3d est vérifié" "/api/v1/public/design3d/by-target" "$CURL_LOG"

# Le service déjà déployé n'a été touché en rien.
check "le mot de passe du service déjà déployé est inchangé" \
  "$(sed -n 's|^DATABASE_URL=postgresql+psycopg://listing:\([^@]*\)@.*|\1|p' "$ENV_DIR/app-listing.env")" \
  "MOTDEPASSEEXISTANT"
absent "aucun CREATE ROLE pour un service déjà déployé" "CREATE ROLE listing" "$SQL_LOG"

# --- défaut n°4 (ordre des migrations : une migration héritée ne doit pas bloquer
#     les suivantes, ni faire disparaître l'échec global) ----------------------
contains "la migration héritée sur les tables monolithe échoue réellement" \
  "public.subscriptions" "$SQL_LOG"
contains "…mais migrate_design3d.sql tourne quand même ensuite" "has_design3d" "$SQL_LOG"
contains "…et migrate_commission_invoice.sql aussi" "commission" "$SQL_LOG"
contains "l'échec de la migration héritée reste visible" "add_rental_feature.sql a échoué" "$TMP/run1.out"
if grep -q "DÉPLOIEMENT OK" "$TMP/run1.out"; then
  ko "le déploiement global reste en échec malgré la convergence du mesh"
else
  ok "le déploiement global reste en échec malgré la convergence du mesh"
fi

# --- exécution 2 : idempotence ------------------------------------------------
echo "== exécution 2 (rejeu sur le même serveur) =="
before_units_dir="$(md5sum "$SYSTEMD_DIR"/*.service | sort)"
before_secrets="$(md5sum "$SECRETS_FILE")"
before_env="$(md5sum "$ENV_DIR"/*.env | sort)"
: > "$SQL_LOG"

bash "$SCRIPT" > "$TMP/run2.out" 2>&1
# (le script sort toujours en erreur : la migration héritée échoue à chaque rejeu —
# c'est un défaut préexistant hors périmètre, cf. rapport. On ne vérifie ici que
# l'idempotence de ce qui est sous notre contrôle.)

check "aucun fichier d'unité systemd modifié (gabarits inchangés, pas de copie)" \
  "$(md5sum "$SYSTEMD_DIR"/*.service | sort)" "$before_units_dir"
check "aucun fichier d'environnement modifié" "$(md5sum "$ENV_DIR"/*.env | sort)" "$before_env"
check "secrets.env inchangé (pas de doublon de DESIGN3D_URL)" "$(md5sum "$SECRETS_FILE")" "$before_secrets"
check "les URLs des services déjà déployés sont intactes" "$(grep -c '^LISTING_URL=' "$SECRETS_FILE")" "1"
check "le mot de passe de design3d est conservé" \
  "$(sed -n 's|^DATABASE_URL=postgresql+psycopg://design3d:\([^@]*\)@.*|\1|p' "$ENV_DIR/app-design3d.env")" "$pass1"
# Le CREATE ROLE est toujours ÉMIS — il est gardé côté SQL (`IF NOT EXISTS`), pas côté
# shell. Ce qui compte est qu'aucun mot de passe neuf ne soit tiré au rejeu : le rôle
# se voit réappliquer celui du fichier d'environnement, donc rien ne se désynchronise.
contains "le rôle est créé/mis à jour sous garde SQL" "IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles" "$SQL_LOG"
if [ -n "$pass1" ] && grep -qF "PASSWORD '$pass1'" "$SQL_LOG"; then
  ok "le rejeu réapplique le mot de passe existant, sans en tirer un nouveau"
else
  ko "le rejeu réapplique le mot de passe existant, sans en tirer un nouveau"
fi
contains "les migrations additives sont rejouées (idempotentes)" "has_design3d" "$SQL_LOG"

# --- exécution 3 : le contrôle de routage BFF doit mordre ---------------------
echo "== exécution 3 (BFF ne routant pas vers design3d) =="
if CURL_FAIL_MATCH="/api/v1/public/design3d" bash "$SCRIPT" > "$TMP/run3.out" 2>&1; then
  ko "un BFF qui ne route pas vers design3d fait échouer le déploiement"
else
  ok "un BFF qui ne route pas vers design3d fait échouer le déploiement"
fi
contains "et le dit explicitement" "le BFF ne route pas vers design3d" "$TMP/run3.out"

# --- exécution 4 : le gabarit systemd manquant doit faire échouer bruyamment --
echo "== exécution 4 (gabarit semsar-app@.service absent du serveur) =="
mv "$SYSTEMD_DIR/semsar-app@.service" "$TMP/semsar-app@.service.bak"
if bash "$SCRIPT" > "$TMP/run4.out" 2>&1; then
  ko "un gabarit systemd absent fait échouer le déploiement (au lieu d'un simple avertissement)"
else
  ok "un gabarit systemd absent fait échouer le déploiement (au lieu d'un simple avertissement)"
fi
contains "et le dit explicitement" "gabarit systemd" "$TMP/run4.out"
mv "$TMP/semsar-app@.service.bak" "$SYSTEMD_DIR/semsar-app@.service"

# --- garde-fou : aucun secret en dur dans le script ---------------------------
if grep -nE "PASSWORD *'[A-Za-z0-9]{6,}'" "$SCRIPT" | grep -v '\$pass' > /dev/null; then
  ko "un mot de passe littéral figure dans le script"
else
  ok "aucun mot de passe littéral dans le script"
fi

echo
if [ "$FAILURES" -eq 0 ]; then
  echo "deploy-remote.sh : tout est vert."
else
  echo "deploy-remote.sh : $FAILURES vérification(s) en échec." >&2
fi
exit "$FAILURES"
