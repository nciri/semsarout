#!/usr/bin/env bash
# Démarrage local de toute la stack v2 (infra + monolithe + services + relais + workers).
# Idempotent : tue ce qui écoute sur les ports puis relance. Voir docs/architecture-v2-status.md.
set -u
cd "$(dirname "$0")/.." || exit 1
ROOT="$(pwd)"
LOG="${TMPDIR:-/tmp}/semsar-mesh"; mkdir -p "$LOG"
DBHOST="localhost:5432/semsar_dev"
ADMIN="postgresql://postgres:postgres@localhost:5432/semsar_dev"
RMQ="amqp://semsar:semsar@localhost:5672/"; EX="semsar.events"
JWT="PURGED-DEV-SECRET"; ITOK="change-me-internal"; MONO="http://localhost:7000"
OS="http://localhost:9200"; BFF_PORT=8099

role() { echo "${1/-/_}"; }                                   # trust-safety -> trust_safety
dburl() { echo "postgresql+psycopg://$(role "$1"):$(role "$1")@$DBHOST"; }
kill_port() { fuser -k "$1/tcp" 2>/dev/null; }
kill_pat() { # tue un process par motif de cmdline (hors ce script)
  python3 - "$1" <<'PY'
import os,signal,sys
pat=sys.argv[1]; me,pp=os.getpid(),os.getppid()
for pid in os.listdir('/proc'):
    if not pid.isdigit(): continue
    p=int(pid)
    if p in (me,pp): continue
    try: c=open(f'/proc/{pid}/cmdline','rb').read().decode('utf-8','ignore').replace(chr(0),' ')
    except: continue
    if pat in c:
        try: os.kill(p,signal.SIGTERM)
        except: pass
PY
}

echo "== 1. Infra (RabbitMQ, MinIO) =="
[ -f infra/.env ] || cp infra/.env.example infra/.env
docker compose -f infra/docker-compose.yml up -d rabbitmq minio >/dev/null 2>&1
for i in $(seq 1 30); do docker exec semsar-rabbitmq rabbitmq-diagnostics -q ping >/dev/null 2>&1 && break; sleep 1; done
echo "   rabbitmq/minio ok (opensearch/postgres supposés déjà up)"

echo "== 2. Monolithe (:7000) — DÉCOMMISSIONNÉ =="
# La coupure finale est faite : le BFF ne route plus rien vers le monolithe (repli retiré),
# tous les services v2 sont souverains. Pour comparer au contrat (tools/contract_test.py), relancer
# le monolithe manuellement :  ( cd backend; set -a; source .env; set +a; venv/bin/python run.py )
echo "   (non démarré — voir docs/architecture-v2-status.md)"

echo "== 3. Services (uvicorn) =="
# svc:port  (rôle DB = svc avec - -> _)
SVCS="identity:8501 notification:8502 analytics:8504 contract:8505 legal:8506 payment:8507 billing:8508 \
catalog:8009 marketplace:8010 directory:8011 listing:8012 crm:8013 search:8103 geo:8509 \
messaging:8510 trust-safety:8511 agency:8512 audit:8513 transactions:8514 buyer:8515 programs:8516 staymanager:8517 \
rental:8518"
S3="S3_ENDPOINT_URL=http://localhost:9000 S3_ACCESS_KEY=semsar S3_SECRET_KEY=semsar-secret AWS_ACCESS_KEY_ID=semsar AWS_SECRET_ACCESS_KEY=semsar-secret"
# Masquage (§6) : listing/search lisent les comptes cachés depuis trust-safety (souverain),
# plus le monolithe — prérequis au décommissionnement.
TS_HIDDEN="MODERATION_HIDDEN_URL=http://localhost:8511/internal/moderation/hidden"
for pair in $SVCS; do
  svc="${pair%%:*}"; port="${pair##*:}"
  kill_port "$port"
  extra=""; [ "$svc" = "contract" ] && extra="$S3 IDENTITY_URL=http://localhost:8501"; [ "$svc" = "identity" ] && extra="JWT_SECRET_KEY=$JWT"
  case "$svc" in
    billing) extra="IDENTITY_URL=http://localhost:8501";;
    agency)  extra="IDENTITY_URL=http://localhost:8501 LISTING_URL=http://localhost:8012";;
    buyer)   extra="LISTING_URL=http://localhost:8012";;
    programs) extra="BILLING_URL=http://localhost:8508";;
    staymanager) extra="BILLING_URL=http://localhost:8508";;
    crm|transactions) extra="IDENTITY_URL=http://localhost:8501";;
    analytics) extra="TRANSACTIONS_URL=http://localhost:8514 CRM_URL=http://localhost:8013 IDENTITY_URL=http://localhost:8501 LISTING_URL=http://localhost:8012 GEO_URL=http://localhost:8509 BILLING_URL=http://localhost:8508 AUDIT_URL=http://localhost:8513 AGENCY_URL=http://localhost:8512";;
    trust-safety) extra="IDENTITY_URL=http://localhost:8501 AGENCY_URL=http://localhost:8512";;
    rental)
      # SIGN_API_URL/SIGN_API_KEY (3a9dSign) restent un secret local, jamais en dur ici — lus depuis
      # le .env gitignoré du service (sous-shell pour ne pas polluer l'env du script parent).
      SIGN_VARS="$( [ -f services/rental/.env ] && ( set -a; . services/rental/.env; set +a; \
        echo "SIGN_API_URL=${SIGN_API_URL:-} SIGN_API_KEY=${SIGN_API_KEY:-}" ) )"
      extra="IDENTITY_URL=http://localhost:8501 CRM_URL=http://localhost:8013 LISTING_URL=http://localhost:8012 $S3 RENTAL_DOCS_BUCKET=semsar-rental-docs $SIGN_VARS";;
  esac
  case "$svc" in listing|search) extra="$extra $TS_HIDDEN";; esac
  [ "$svc" = "listing" ] && extra="$extra AGENCY_URL=http://localhost:8512 IDENTITY_URL=http://localhost:8501 $S3 MEDIA_BUCKET=semsar-media"
  env SERVICE_NAME="$svc" DATABASE_URL="$(dburl "$svc")" TRUST_GATEWAY_HEADERS=true \
      INTERNAL_TOKEN="$ITOK" MONOLITH_URL="$MONO" RABBITMQ_URL="$RMQ" EVENTS_EXCHANGE="$EX" \
      OPENSEARCH_URL="$OS" $extra \
      nohup python3 -m uvicorn app.main:app --app-dir "services/$svc" --host 127.0.0.1 --port "$port" \
      > "$LOG/$svc.log" 2>&1 &
done
sleep 6

echo "== 4. BFF (:$BFF_PORT, auth locale) =="
kill_port "$BFF_PORT"; sleep 1
env UPSTREAM_URL="$MONO" JWT_SECRET_KEY="$JWT" INTERNAL_TOKEN="$ITOK" \
  CATALOG_URL=http://localhost:8009 DIRECTORY_URL=http://localhost:8011 LISTING_URL=http://localhost:8012 \
  SEARCH_URL=http://localhost:8103 CRM_URL=http://localhost:8013 MARKETPLACE_URL=http://localhost:8010 \
  GEO_URL=http://localhost:8509 MESSAGING_URL=http://localhost:8510 TRUST_SAFETY_URL=http://localhost:8511 \
  AGENCY_URL=http://localhost:8512 AUDIT_URL=http://localhost:8513 IDENTITY_URL=http://localhost:8501 \
  ANALYTICS_URL=http://localhost:8504 CONTRACT_URL=http://localhost:8505 LEGAL_URL=http://localhost:8506 \
  PAYMENT_URL=http://localhost:8507 BILLING_URL=http://localhost:8508 TRANSACTIONS_URL=http://localhost:8514 \
  BUYER_URL=http://localhost:8515 PROGRAMS_URL=http://localhost:8516 STAYMANAGER_URL=http://localhost:8517 \
  RENTAL_URL=http://localhost:8518 \
  nohup python3 -m uvicorn app.main:app --app-dir gateway --host 127.0.0.1 --port "$BFF_PORT" \
  > "$LOG/bff.log" 2>&1 &
sleep 4

echo "== 5. Mesh événementiel (relais + workers + consumers monolithe) =="
kill_pat "-m app.relay"; kill_pat "-m app.worker"; kill_pat "-m app.scheduler"; kill_pat "consume_users.py"; kill_pat "relay_outbox.py"; sleep 2
relay() { env SERVICE_NAME="$1" DATABASE_URL="$(dburl "$1")" RABBITMQ_URL="$RMQ" EVENTS_EXCHANGE="$EX" \
  PYTHONPATH="services/$1" nohup python3 -m app.relay > "$LOG/$1-relay.log" 2>&1 & }
worker() { env SERVICE_NAME="$1" DATABASE_URL="$(dburl "$1")" RABBITMQ_URL="$RMQ" EVENTS_EXCHANGE="$EX" \
  OPENSEARCH_URL="$OS" MONOLITH_URL="$MONO" INTERNAL_TOKEN="$ITOK" \
  PYTHONPATH="services/$1" nohup python3 -m app.worker > "$LOG/$1-worker.log" 2>&1 & }
for r in listing catalog identity contract payment billing transactions programs agency crm directory rental; do relay "$r"; done
for w in search crm marketplace geo agency messaging analytics billing notification identity audit transactions legal contract rental; do worker "$w"; done
# Ordonnanceur (Vague 2) : emails temporels (rappels de visite J-1, …).
env SERVICE_NAME=notification DATABASE_URL="$(dburl notification)" RABBITMQ_URL="$RMQ" EVENTS_EXCHANGE="$EX" \
  OPENSEARCH_URL="$OS" INTERNAL_TOKEN="$ITOK" CRM_URL=http://localhost:8013 BILLING_URL=http://localhost:8508 \
  AGENCY_URL=http://localhost:8512 IDENTITY_URL=http://localhost:8501 RENTAL_URL=http://localhost:8518 \
  PYTHONPATH="services/notification" \
  nohup python3 -m app.scheduler > "$LOG/notification-scheduler.log" 2>&1 &
# Monolithe décommissionné : consume_users.py / relay_outbox.py (sync transitoire) ne sont plus lancés.
sleep 5

echo "== 6. Santé =="
for e in "monolithe:7000:/api/v1/properties?per_page=1" "BFF:$BFF_PORT:/health" \
  identity:8501 catalog:8009 marketplace:8010 directory:8011 listing:8012 crm:8013 search:8103 \
  geo:8509 messaging:8510 trust-safety:8511 agency:8512 audit:8513 notification:8502 analytics:8504 \
  contract:8505 legal:8506 payment:8507 billing:8508 transactions:8514 buyer:8515 programs:8516 staymanager:8517 \
  rental:8518; do
  n="${e%%:*}"; rest="${e#*:}"; p="${rest%%:*}"; path="${rest#*:}"; [ "$path" = "$p" ] && path="/health"
  printf "   %-13s -> %s\n" "$n" "$(curl -s -o /dev/null -w '%{http_code}' -m3 "http://localhost:$p$path")"
done
echo "Logs : $LOG/  ·  Frontend : http://localhost:5600  ·  Vérif : tools/contract_test.py"
