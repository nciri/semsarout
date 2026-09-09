#!/usr/bin/env bash
# Banc d'essai de infra/prod/deploy-remote.sh — la SEULE chaîne de déploiement réellement
# branchée (deploy.yml → ssh → ce script). Elle ne peut pas être jouée contre la
# production, et un correctif d'infra qu'on ne peut pas exercer n'est pas vérifié : le
# script tourne donc ici sur une arborescence jetable, avec psql/systemctl/curl/pip
# simulés, et l'on vérifie ce qu'il aurait fait sur le serveur.
#
# Couvre : provisionnement d'un service ajouté après l'installation (rôle + schéma
# PostgreSQL, fichier d'environnement root-only, unités systemd copiées du gabarit),
# diffusion des URLs inter-services, migrations additives, et surtout IDEMPOTENCE —
# une seconde exécution ne doit rien changer, ni pour le nouveau service ni pour les
# services déjà déployés.
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
absent() { if grep -qF -- "$2" "$3" 2>/dev/null; then ko "$1"; else ok "$1"; fi; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# --- serveur simulé -----------------------------------------------------------
BIN="$TMP/bin"; mkdir -p "$BIN"
export SQL_LOG="$TMP/sql.log" SYSTEMCTL_LOG="$TMP/systemctl.log" CURL_LOG="$TMP/curl.log"

cat > "$BIN/runuser" <<'STUB'
#!/usr/bin/env bash
# runuser -u postgres -- psql … : on journalise le SQL reçu sur stdin.
{ echo "--- psql $* ---"; cat; } >> "$SQL_LOG"
STUB
cat > "$BIN/systemctl" <<'STUB'
#!/usr/bin/env bash
echo "systemctl $*" >> "$SYSTEMCTL_LOG"
case "$1" in
  is-active) echo active ;;
  list-units) for u in $(cat "$UNITS_LIST" 2>/dev/null); do echo "$u loaded active running $u"; done ;;
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
export URLS_ENV="$TMP/etc/semsar/urls.env"
mkdir -p "$APP" "$ENV_DIR" "$SYSTEMD_DIR"
printf 'LISTING_URL=http://localhost:8012\nBILLING_URL=http://localhost:8508\n' > "$URLS_ENV"
cp -r "$ROOT/services" "$APP/services"
mkdir -p "$APP/libs" "$APP/gateway"
export UNITS_LIST="$TMP/units"

# Un service déjà déployé, qui sert de gabarit : ses unités sont celles de la machine.
cat > "$SYSTEMD_DIR/semsar-listing.service" <<'UNIT'
[Unit]
Description=SemsarOut listing (API)
[Service]
EnvironmentFile=/etc/semsar/common.env
EnvironmentFile=/etc/semsar/urls.env
EnvironmentFile=/etc/semsar/env/listing.env
WorkingDirectory=/opt/semsar/services/listing
ExecStart=/opt/semsar/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8012
[Install]
WantedBy=multi-user.target
UNIT
cat > "$SYSTEMD_DIR/semsar-listing-relay.service" <<'UNIT'
[Unit]
Description=SemsarOut listing (relais outbox)
[Service]
EnvironmentFile=/etc/semsar/env/listing.env
WorkingDirectory=/opt/semsar/services/listing
ExecStart=/opt/semsar/venv/bin/python -m app.relay
[Install]
WantedBy=multi-user.target
UNIT
printf 'DATABASE_URL=postgresql+psycopg://listing:MOTDEPASSEEXISTANT@localhost:5432/semsar_test\n' \
  > "$ENV_DIR/listing.env"
chmod 600 "$ENV_DIR/listing.env"
printf 'semsar-listing.service\nsemsar-listing-relay.service\n' > "$UNITS_LIST"

# --- exécution 1 --------------------------------------------------------------
echo "== exécution 1 (serveur sans design3d) =="
if ! bash "$SCRIPT" > "$TMP/run1.out" 2>&1; then
  ko "le script sort en erreur"; sed 's/^/      /' "$TMP/run1.out"
else
  ok "le script s'exécute sans erreur"
fi

contains "rôle PostgreSQL design3d créé si absent" "CREATE ROLE design3d LOGIN PASSWORD" "$SQL_LOG"
contains "schéma design3d créé" "CREATE SCHEMA IF NOT EXISTS design3d" "$SQL_LOG"
contains "search_path du rôle posé" "ALTER ROLE design3d SET search_path = design3d" "$SQL_LOG"
contains "migration billing/migrate_design3d.sql jouée" "has_design3d" "$SQL_LOG"
contains "migration billing/migrate_commission_invoice.sql jouée" "commission" "$SQL_LOG"

if [ -f "$ENV_DIR/design3d.env" ]; then
  ok "fichier d'environnement design3d.env créé"
  check "il est root-only (0600)" "$(stat -c '%a' "$ENV_DIR/design3d.env")" "600"
  contains "il porte le DATABASE_URL du rôle" "postgresql+psycopg://design3d:" "$ENV_DIR/design3d.env"
  pass1="$(sed -n 's|^DATABASE_URL=postgresql+psycopg://design3d:\([^@]*\)@.*|\1|p' "$ENV_DIR/design3d.env")"
  if [ "${#pass1}" -ge 32 ]; then ok "le mot de passe est tiré au sort (${#pass1} caractères)"
  else ko "mot de passe trop court ou absent (${#pass1})"; fi
else
  ko "fichier d'environnement design3d.env créé"; pass1=""
fi

for u in semsar-design3d.service semsar-design3d-relay.service; do
  if [ -f "$SYSTEMD_DIR/$u" ]; then ok "unité $u créée depuis le gabarit"; else ko "unité $u créée depuis le gabarit"; fi
done
contains "le port du service y remplace celui du gabarit" "--port 8526" "$SYSTEMD_DIR/semsar-design3d.service"
absent "aucune trace du service gabarit dans l'unité" "listing" "$SYSTEMD_DIR/semsar-design3d.service"
contains "le répertoire de travail suit" "/opt/semsar/services/design3d" "$SYSTEMD_DIR/semsar-design3d.service"
contains "le fichier d'environnement suit" "/etc/semsar/env/design3d.env" "$SYSTEMD_DIR/semsar-design3d.service"

contains "DESIGN3D_URL diffusée aux units (urls.env)" "DESIGN3D_URL=http://localhost:8526" "$URLS_ENV"
contains "le routage BFF vers design3d est vérifié" "/api/v1/public/design3d/by-target" "$CURL_LOG"

# Le service déjà déployé n'a été touché en rien.
check "le mot de passe du service déjà déployé est inchangé" \
  "$(sed -n 's|^DATABASE_URL=postgresql+psycopg://listing:\([^@]*\)@.*|\1|p' "$ENV_DIR/listing.env")" \
  "MOTDEPASSEEXISTANT"
absent "aucun CREATE ROLE pour un service déjà déployé" "CREATE ROLE listing" "$SQL_LOG"

# --- exécution 2 : idempotence ------------------------------------------------
echo "== exécution 2 (rejeu sur le même serveur) =="
printf 'semsar-listing.service\nsemsar-listing-relay.service\nsemsar-design3d.service\nsemsar-design3d-relay.service\n' \
  > "$UNITS_LIST"
before_units="$(md5sum "$SYSTEMD_DIR"/*.service | sort)"
before_urls="$(md5sum "$URLS_ENV")"
before_env="$(md5sum "$ENV_DIR"/*.env | sort)"
: > "$SQL_LOG"

if ! bash "$SCRIPT" > "$TMP/run2.out" 2>&1; then
  ko "le rejeu sort en erreur"; sed 's/^/      /' "$TMP/run2.out"
else
  ok "le rejeu s'exécute sans erreur"
fi

check "aucune unité systemd modifiée" "$(md5sum "$SYSTEMD_DIR"/*.service | sort)" "$before_units"
check "aucun fichier d'environnement modifié" "$(md5sum "$ENV_DIR"/*.env | sort)" "$before_env"
check "urls.env inchangé (pas de doublon de DESIGN3D_URL)" "$(md5sum "$URLS_ENV")" "$before_urls"
check "les URLs des services déjà déployés sont intactes" "$(grep -c '^LISTING_URL=' "$URLS_ENV")" "1"
check "le mot de passe de design3d est conservé" \
  "$(sed -n 's|^DATABASE_URL=postgresql+psycopg://design3d:\([^@]*\)@.*|\1|p' "$ENV_DIR/design3d.env")" "$pass1"
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
