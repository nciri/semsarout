#!/usr/bin/env bash
# Banc d'essai de infra/prod/deploy-remote.sh — la SEULE chaîne de déploiement réellement
# branchée (deploy.yml → ssh → ce script). Elle ne peut pas être jouée contre la
# production, et un correctif d'infra qu'on ne peut pas exercer n'est pas vérifié : le
# script tourne donc ici sur une arborescence jetable, avec psql/systemctl/curl/pip
# simulés, et l'on vérifie ce qu'il aurait fait sur le serveur.
#
# Les fixtures modélisent le serveur RÉEL — celui qu'on a sous SSH, PAS les gabarits
# Ansible du dépôt. La distinction a coûté un déploiement : les fixtures rendaient
# elles-mêmes semsar-app@.service.j2 / semsar-relay@.service.j2, donc le banc d'essai
# validait une machine imaginaire pendant que la vraie sortait en erreur. Inspection du
# 2026-09-16 sur 46.62.203.126, qui fait foi ici :
#   - 64 unités NOMMÉES EN CLAIR (semsar-<svc>.service, semsar-<svc>-relay.service) ;
#     aucune unité template, aucun « @ » dans /etc/systemd/system ;
#   - un SEUL fichier d'environnement par service, /etc/semsar/env/<svc>.env, lu par
#     l'API comme par son relais (ni app-<svc>.env ni relay-<svc>.env) ;
#   - les URL inter-services vivent dans /etc/semsar/urls.env (et les secrets partagés
#     dans /etc/semsar/common.env) ; secrets.env n'est lu par AUCUNE unité.
#
# Couvre : provisionnement d'un service ajouté après l'installation (rôle + schéma
# PostgreSQL, fichier d'environnement <svc>.env root-only, écriture des unités
# manquantes à la convention nommée en clair), diffusion de l'URL inter-services dans
# urls.env, migrations additives résilientes (l'échec CONNU d'une migration
# héritée visant des tables du monolithe jamais migrées sur semsar_prod n'empêche ni
# les suivantes de tourner ni le déploiement nominal de sortir en succès — mais une
# VRAIE migration cassée, elle, reste fatale et visible, jamais confondue avec le cas
# légitime), et surtout IDEMPOTENCE — une seconde exécution ne doit rien changer, ni
# pour le nouveau service ni pour les services déjà déployés.
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

# --- garde-fou : MIGRATIONS porte une entrée par migration additive sur disque ---
# L'en-tête de MIGRATIONS dans deploy-remote.sh énonce l'invariant « une entrée par
# `services/*/db/*.sql` hors schema.sql et migrate_from_monolith.sql », mais rien ne le
# vérifiait jusqu'ici — c'est précisément ce qui a laissé passer identity/
# add_features_synced_at.sql (corrigé en f6fc320) puis cinq autres. Une migration
# additive absente de MIGRATIONS n'est JAMAIS jouée en production : create_all crée les
# tables manquantes mais n'ALTERe jamais une table existante.
# Exclusion motivée, pas une liste d'exceptions à rallonge :
#  - schema.sql n'est jamais rejoué tel quel (son CREATE ROLE nu n'est pas idempotent,
#    cf. le commentaire au-dessus de `ensure_db_and_env` dans deploy-remote.sh) ;
#  - migrate_from_monolith.sql vise la bascule depuis le monolithe legacy, hors
#    périmètre du mesh (jouée une fois, hors de ce script).
echo "== garde-fou : une entrée MIGRATIONS par migration additive sur disque =="
declared_migrations="$(sed -n '/^MIGRATIONS="$/,/^"$/p' "$SCRIPT" | sed '1d;$d' | sort)"
disk_migrations="$(find "$ROOT/services" -path '*/db/*.sql' \
  ! -name 'schema.sql' ! -name 'migrate_from_monolith.sql' \
  | sed -E 's#.*/services/([^/]+)/db/#\1/#' | sort)"
missing_migrations="$(comm -23 <(printf '%s\n' "$disk_migrations") <(printf '%s\n' "$declared_migrations"))"
if [ -z "$missing_migrations" ]; then
  ok "toute migration additive sur disque figure dans MIGRATIONS"
else
  ko "toute migration additive sur disque figure dans MIGRATIONS"
  echo "$missing_migrations" | sed 's/^/      manquante: /'
fi

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
# qu'un psql qui avale tout sans jamais échouer :
#  - toute requête référençant public.subscriptions / public.subscription_plans
#    échoue avec le message d'erreur PostgreSQL réaliste pour une relation absente
#    (comme un vrai serveur le ferait — ces tables du monolithe legacy n'existent pas
#    sur semsar_prod, cf. commentaire deploy-remote.sh §5) ;
#  - une requête marquée TEST_GENUINE_FAILURE_MARKER (injectée par le banc d'essai
#    dans une copie de travail d'une migration, sans rapport avec le monolithe legacy)
#    échoue avec une AUTRE erreur, pour vérifier qu'une vraie casse n'est jamais
#    confondue avec le cas légitime connu ;
#  - tout le reste réussit, comme le ferait un serveur convergé pour du SQL idempotent
#    visant des tables déjà créées par create_all.
sql="$(cat)"
{ echo "--- psql $* ---"; printf '%s\n' "$sql"; } >> "$SQL_LOG"
if printf '%s' "$sql" | grep -qiE 'public\.(subscriptions|subscription_plans)'; then
  echo 'psql:<stdin>: ERROR:  relation "public.subscriptions" does not exist' >&2
  exit 1
fi
if printf '%s' "$sql" | grep -q 'TEST_GENUINE_FAILURE_MARKER'; then
  echo 'psql:<stdin>: ERROR:  syntax error at or near "BROKEN"' >&2
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
export COMMON_ENV="$TMP/etc/semsar/common.env" URLS_FILE="$TMP/etc/semsar/urls.env"
export VENV="$APP/venv"
mkdir -p "$APP" "$ENV_DIR" "$SYSTEMD_DIR" "$(dirname "$URLS_FILE")"
cp -r "$ROOT/services" "$APP/services"
mkdir -p "$APP/libs" "$APP/gateway"
export UNITS_LIST="$TMP/units"

# common.env + urls.env : les deux fichiers que TOUTES les unités du serveur lisent,
# dans cet ordre. Les URL inter-services sont dans urls.env, jamais dans secrets.env.
cat > "$COMMON_ENV" <<'ENVF'
ENVIRONMENT=prod
RABBITMQ_URL=amqp://semsar:x@localhost:5672/
ENVF
chmod 600 "$COMMON_ENV"
cat > "$URLS_FILE" <<'ENVF'
LISTING_URL=http://localhost:8012
BILLING_URL=http://localhost:8508
ENVF
chmod 600 "$URLS_FILE"

# Unités du serveur réel, recopiées telles quelles depuis /etc/systemd/system (patron
# semsar-billing.service / semsar-billing-relay.service, lu en SSH le 2026-09-16) :
# nommées EN CLAIR, jamais de gabarit template.
cat > "$SYSTEMD_DIR/semsar-listing.service" <<UNIT
[Unit]
Description=semsar listing (API)
After=network.target postgresql.service docker.service
[Service]
EnvironmentFile=$COMMON_ENV
EnvironmentFile=$URLS_FILE
EnvironmentFile=-$ENV_DIR/listing.env
Environment=SERVICE_NAME=listing
ExecStart=$APP/venv/bin/uvicorn app.main:app --app-dir $APP/services/listing --host 127.0.0.1 --port 8012
Restart=always
RestartSec=3
OOMScoreAdjust=500
[Install]
WantedBy=multi-user.target
UNIT
cat > "$SYSTEMD_DIR/semsar-listing-relay.service" <<UNIT
[Unit]
Description=semsar listing-relay
After=network.target postgresql.service docker.service
[Service]
EnvironmentFile=$COMMON_ENV
EnvironmentFile=$URLS_FILE
EnvironmentFile=-$ENV_DIR/listing.env
Environment=SERVICE_NAME=listing
Environment=PYTHONPATH=$APP/services/listing
ExecStart=$APP/venv/bin/python -m app.relay
Restart=always
RestartSec=5
OOMScoreAdjust=600
[Install]
WantedBy=multi-user.target
UNIT

# Un service déjà déployé (listing) : UN SEUL fichier d'environnement, <svc>.env, lu par
# son API comme par son relais. Ses unités sont déjà "chargées" côté systemd (UNITS_LIST).
printf 'SERVICE_NAME=listing\nPORT=8012\nTRUST_GATEWAY_HEADERS=true\nDATABASE_URL=postgresql+psycopg://listing:MOTDEPASSEEXISTANT@localhost:5432/semsar_test\n' \
  > "$ENV_DIR/listing.env"
chmod 600 "$ENV_DIR/listing.env"
printf 'semsar-listing.service\nsemsar-listing-relay.service\n' > "$UNITS_LIST"

# --- exécution 1 --------------------------------------------------------------
echo "== exécution 1 (déploiement nominal, serveur sans design3d) =="
bash "$SCRIPT" > "$TMP/run1.out" 2>&1
run1_status=$?
# Un déploiement NOMINAL doit sortir en SUCCÈS : la migration héritée identity/
# add_rental_feature.sql vise des tables (public.subscriptions/subscription_plans)
# qui n'ont jamais été et ne seront pas migrées sur semsar_prod — son échec pour
# CETTE cause précise est connu et absorbé (cf. deploy-remote.sh §5), pas fatal.
# Sans ça, CHAQUE déploiement sortirait en erreur, y compris un déploiement par
# ailleurs parfaitement sain — personne ne pourrait plus distinguer un déploiement
# réussi d'un déploiement raté.
if [ "$run1_status" -eq 0 ]; then
  ok "un déploiement nominal sort en succès (l'échec connu et non bloquant n'y fait pas obstacle)"
else
  ko "un déploiement nominal sort en succès (l'échec connu et non bloquant n'y fait pas obstacle)"
  sed 's/^/      /' "$TMP/run1.out"
fi
contains "…et le dit explicitement" "DÉPLOIEMENT OK" "$TMP/run1.out"

contains "rôle PostgreSQL design3d créé si absent" "CREATE ROLE design3d LOGIN PASSWORD" "$SQL_LOG"
contains "schéma design3d créé" "CREATE SCHEMA IF NOT EXISTS design3d" "$SQL_LOG"
contains "search_path du rôle posé" "ALTER ROLE design3d SET search_path = design3d" "$SQL_LOG"
contains "migration billing/migrate_design3d.sql jouée" "has_design3d" "$SQL_LOG"
contains "migration billing/migrate_design3d_entitlement.sql jouée (pro/enterprise activés)" \
  "IN ('pro', 'enterprise')" "$SQL_LOG"
contains "migration billing/migrate_commission_invoice.sql jouée" "commission" "$SQL_LOG"
# La colonne `features_synced_at` est MAPPÉE par identity (app/models.py::AgencyRO) : sans sa
# migration dans MIGRATIONS, chaque /auth/login et /auth/refresh d'un compte d'agence SELECTe une
# colonne inexistante (UndefinedColumn) et tous les comptes d'agence sont dehors dès le
# déploiement. Une colonne mappée dont l'ALTER n'est pas joué est une panne totale, pas un détail.
contains "migration identity/add_features_synced_at.sql jouée (colonne mappée par AgencyRO)" \
  "ADD COLUMN IF NOT EXISTS features_synced_at" "$SQL_LOG"

# A4 : activer `has_design3d` sur les plans pro/enterprise ne suffit pas — rien ne réémet
# `billing.subscription.activated`, et le repli synchrone d'identity ne se déclenche que si
# `features_synced_at IS NULL`, que add_features_synced_at.sql a justement estampillé. Sans
# réamorçage du marqueur, une agence Pro existante ne verrait jamais le module 3D avant sa
# prochaine activation d'abonnement (jusqu'à un an en facturation annuelle).
contains "migration identity/reset_features_sync_design3d.sql jouée (réamorce le repli)" \
  "SET features_synced_at = NULL" "$SQL_LOG"
# L'ordre compte ici, contrairement au reste de la liste : réamorcer AVANT que billing n'ait
# activé l'entitlement laisserait la première agence à se connecter dans l'intervalle
# réestampiller une liste encore sans design3d — et le seul chemin capable de lui accorder le
# module se rééteindrait, pour de bon.
ent_line="$(grep -n "IN ('pro', 'enterprise')" "$SQL_LOG" | head -n 1 | cut -d: -f1)"
reset_line="$(grep -n 'SET features_synced_at = NULL' "$SQL_LOG" | head -n 1 | cut -d: -f1)"
if [ -n "$ent_line" ] && [ -n "$reset_line" ] && [ "$reset_line" -gt "$ent_line" ]; then
  ok "…et APRÈS billing/migrate_design3d_entitlement.sql (l'ordre compte ici)"
else
  ko "…et APRÈS billing/migrate_design3d_entitlement.sql (l'ordre compte ici)"
fi

# --- défaut n°3 (nom de fichier d'environnement) -------------------------------
if [ -f "$ENV_DIR/design3d.env" ]; then
  ok "fichier d'environnement design3d.env créé (nom lu par les unités du serveur)"
  check "il est root-only (0600)" "$(stat -c '%a' "$ENV_DIR/design3d.env")" "600"
  contains "il porte le DATABASE_URL du rôle" "postgresql+psycopg://design3d:" "$ENV_DIR/design3d.env"
  contains "il porte le PORT du service" "PORT=8526" "$ENV_DIR/design3d.env"
  pass1="$(sed -n 's|^DATABASE_URL=postgresql+psycopg://design3d:\([^@]*\)@.*|\1|p' "$ENV_DIR/design3d.env")"
  if [ "${#pass1}" -ge 32 ]; then ok "le mot de passe est tiré au sort (${#pass1} caractères)"
  else ko "mot de passe trop court ou absent (${#pass1})"; fi
else
  ko "fichier d'environnement design3d.env créé"; pass1=""
fi
# Les deux noms qu'une version antérieure écrivait, que RIEN sur le serveur ne lit : les
# recréer ferait croire le service configuré alors qu'il démarrerait sans DATABASE_URL.
file_absent "aucun app-design3d.env fantôme (nom lu par personne)" "$ENV_DIR/app-design3d.env"
file_absent "aucun relay-design3d.env fantôme (nom lu par personne)" "$ENV_DIR/relay-design3d.env"

# --- défaut n°1 (unités nommées en clair, écrites si manquantes) ---------------
if [ -f "$SYSTEMD_DIR/semsar-design3d.service" ]; then
  ok "l'unité API semsar-design3d.service est écrite (le serveur n'a pas de gabarit template)"
  contains "elle lit l'environnement du service" "EnvironmentFile=-$ENV_DIR/design3d.env" \
    "$SYSTEMD_DIR/semsar-design3d.service"
  contains "elle lit les URL inter-services" "EnvironmentFile=$URLS_FILE" \
    "$SYSTEMD_DIR/semsar-design3d.service"
  contains "elle sert le bon service sur le bon port" \
    "--app-dir $APP/services/design3d --host 127.0.0.1 --port 8526" \
    "$SYSTEMD_DIR/semsar-design3d.service"
else
  ko "l'unité API semsar-design3d.service est écrite"
fi
if [ -f "$SYSTEMD_DIR/semsar-design3d-relay.service" ]; then
  ok "l'unité de relais semsar-design3d-relay.service est écrite (design3d a un relay.py)"
  contains "elle lance le relais outbox" "ExecStart=$VENV/bin/python -m app.relay" \
    "$SYSTEMD_DIR/semsar-design3d-relay.service"
  contains "…avec le PYTHONPATH du service" "PYTHONPATH=$APP/services/design3d" \
    "$SYSTEMD_DIR/semsar-design3d-relay.service"
else
  ko "l'unité de relais semsar-design3d-relay.service est écrite"
fi
contains "l'unité API est activée+démarrée" \
  "systemctl enable --now semsar-design3d.service" "$SYSTEMCTL_LOG"
contains "l'unité de relais est activée+démarrée" \
  "systemctl enable --now semsar-design3d-relay.service" "$SYSTEMCTL_LOG"
file_absent "aucune instance de gabarit template (inexistant sur le serveur)" \
  "$SYSTEMD_DIR/semsar-app@design3d.service"
absent "…et aucun enable d'une instance semsar-app@" "semsar-app@" "$SYSTEMCTL_LOG"

# --- défaut n°2 (urls.env, le fichier réellement lu — pas secrets.env) --------
contains "DESIGN3D_URL diffusée dans le fichier réellement lu par les unités (urls.env)" \
  "DESIGN3D_URL=http://localhost:8526" "$URLS_FILE"
file_absent "aucun secrets.env fantôme n'est créé (aucune unité ne le lit)" "$TMP/etc/semsar/secrets.env"
contains "le routage BFF vers design3d est vérifié" "/api/v1/public/design3d/by-target" "$CURL_LOG"

# Le service déjà déployé n'a été touché en rien.
check "le mot de passe du service déjà déployé est inchangé" \
  "$(sed -n 's|^DATABASE_URL=postgresql+psycopg://listing:\([^@]*\)@.*|\1|p' "$ENV_DIR/listing.env")" \
  "MOTDEPASSEEXISTANT"
absent "aucun CREATE ROLE pour un service déjà déployé" "CREATE ROLE listing" "$SQL_LOG"

# --- défaut n°4 (migration héritée : échec connu absorbé, pas fatal, mais visible ;
#     les suivantes tournent quand même) ---------------------------------------
contains "la migration héritée sur les tables monolithe échoue réellement" \
  "public.subscriptions" "$SQL_LOG"
contains "…mais migrate_design3d.sql tourne quand même ensuite" "has_design3d" "$SQL_LOG"
contains "…et migrate_commission_invoice.sql aussi" "commission" "$SQL_LOG"
contains "l'échec connu reste visible dans les logs (pas juste avalé en silence)" \
  "add_rental_feature.sql a échoué pour une cause connue et non bloquante" "$TMP/run1.out"
absent "…mais n'est PAS compté comme un échec fatal" \
  "identity/add_rental_feature.sql a échoué (voir le message psql" "$TMP/run1.out"

# --- une VRAIE migration cassée (sans rapport avec le monolithe legacy) doit rester
#     fatale : le même mécanisme qui absorbe le cas connu ne doit rien absorber
#     d'autre. Copie de travail corrompue d'une migration existante, restaurée après. -
echo "== exécution 1bis (une migration réellement cassée, sans rapport avec le monolithe) =="
messaging_migration="$APP/services/messaging/db/migrate_conversation.sql"
cp "$messaging_migration" "$TMP/migrate_conversation.sql.bak"
printf -- '-- TEST_GENUINE_FAILURE_MARKER\nSELECT BROKEN SQL;\n' > "$messaging_migration"
: > "$SQL_LOG"
bash "$SCRIPT" > "$TMP/run_genuine.out" 2>&1
genuine_status=$?
cp "$TMP/migrate_conversation.sql.bak" "$messaging_migration"

if [ "$genuine_status" -ne 0 ]; then
  ok "une migration réellement cassée fait toujours échouer le déploiement"
else
  ko "une migration réellement cassée fait toujours échouer le déploiement"
  sed 's/^/      /' "$TMP/run_genuine.out"
fi
contains "…et le dit explicitement, comme un échec fatal (pas un avertissement)" \
  "messaging/migrate_conversation.sql a échoué (voir le message psql" "$TMP/run_genuine.out"
absent "…sans être confondue avec le cas légitime connu (message différent)" \
  "messaging/migrate_conversation.sql a échoué pour une cause connue" "$TMP/run_genuine.out"
contains "les migrations suivantes tournent quand même après cet échec fatal" \
  "has_design3d" "$SQL_LOG"
contains "…y compris migrate_design3d_entitlement.sql" "IN ('pro', 'enterprise')" "$SQL_LOG"

# --- exécution 2 : idempotence ------------------------------------------------
echo "== exécution 2 (rejeu sur le même serveur) =="
before_units_dir="$(md5sum "$SYSTEMD_DIR"/*.service | sort)"
before_urls="$(md5sum "$URLS_FILE")"
before_env="$(md5sum "$ENV_DIR"/*.env | sort)"
: > "$SQL_LOG"

bash "$SCRIPT" > "$TMP/run2.out" 2>&1
run2_status=$?
if [ "$run2_status" -eq 0 ]; then
  ok "le rejeu reste un déploiement nominal en succès"
else
  ko "le rejeu reste un déploiement nominal en succès"
fi

check "aucun fichier d'unité systemd modifié (celles déjà écrites ne sont pas réécrites)" \
  "$(md5sum "$SYSTEMD_DIR"/*.service | sort)" "$before_units_dir"
check "aucun fichier d'environnement modifié" "$(md5sum "$ENV_DIR"/*.env | sort)" "$before_env"
check "urls.env inchangé (pas de doublon de DESIGN3D_URL)" "$(md5sum "$URLS_FILE")" "$before_urls"
check "les URLs des services déjà déployés sont intactes" "$(grep -c '^LISTING_URL=' "$URLS_FILE")" "1"
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
contains "…migrate_design3d_entitlement.sql aussi, sans effet de bord au rejeu" \
  "IN ('pro', 'enterprise')" "$SQL_LOG"
# Les cinq migrations ajoutées par A5 (identity/migrate_didit.sql, listing/migrate_condo.sql,
# listing/migrate_price_period.sql, coloc-listing/migrate_condo.sql,
# messaging/migrate_notification.sql) sont rejouées ici sans erreur pour la SECONDE fois
# consécutive (run1 puis run2) : run2_status déjà vérifié à 0 ci-dessus le prouve pour
# l'ensemble de MIGRATIONS, mais on vérifie aussi que chacune est bien réémise (donc pas
# silencieusement sautée) et non pas la cause d'un échec absorbé par erreur.
contains "…identity/migrate_didit.sql rejouée au 2e passage sans erreur" \
  "ADD COLUMN IF NOT EXISTS didit_session_id" "$SQL_LOG"
contains "…listing/migrate_condo.sql rejouée au 2e passage sans erreur" \
  "listing.property ADD COLUMN IF NOT EXISTS is_condo" "$SQL_LOG"
contains "…listing/migrate_price_period.sql rejouée au 2e passage sans erreur" \
  "listing.property ADD COLUMN IF NOT EXISTS price_period" "$SQL_LOG"
contains "…coloc-listing/migrate_condo.sql rejouée au 2e passage sans erreur" \
  "coloc_listing.listings ADD COLUMN IF NOT EXISTS is_condo" "$SQL_LOG"
contains "…messaging/migrate_notification.sql rejouée au 2e passage sans erreur" \
  "messaging.conversation" "$SQL_LOG"
contains "…et son ALTER de colonne tenant précisément" \
  "ADD COLUMN IF NOT EXISTS tenant" "$SQL_LOG"

# --- exécution 3 : le contrôle de routage BFF doit mordre ---------------------
echo "== exécution 3 (BFF ne routant pas vers design3d) =="
if CURL_FAIL_MATCH="/api/v1/public/design3d" bash "$SCRIPT" > "$TMP/run3.out" 2>&1; then
  ko "un BFF qui ne route pas vers design3d fait échouer le déploiement"
else
  ok "un BFF qui ne route pas vers design3d fait échouer le déploiement"
fi
contains "et le dit explicitement" "le BFF ne route pas vers design3d" "$TMP/run3.out"

# --- exécution 4 : une unité installée à la main fait autorité -----------------
# Le serveur porte 64 unités posées hors de ce script ; les réécrire silencieusement
# effacerait tout réglage local (port, OOMScoreAdjust, dépendances ajoutées après coup).
echo "== exécution 4 (unité déjà installée, personnalisée à la main) =="
printf '# MARQUEUR_REGLAGE_LOCAL\n%s' "$(cat "$SYSTEMD_DIR/semsar-design3d.service")" \
  > "$TMP/unit-custom" && mv "$TMP/unit-custom" "$SYSTEMD_DIR/semsar-design3d.service"
bash "$SCRIPT" > "$TMP/run4.out" 2>&1
contains "une unité déjà installée n'est jamais réécrite" \
  "# MARQUEUR_REGLAGE_LOCAL" "$SYSTEMD_DIR/semsar-design3d.service"
contains "…et le script le dit" "déjà installée, inchangée" "$TMP/run4.out"

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
