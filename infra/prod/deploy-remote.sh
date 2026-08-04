#!/usr/bin/env bash
# Étapes serveur du déploiement co-location (exécuté par .github/workflows/deploy.yml
# via SSH, APRÈS le rsync du code + des fronts). Idempotent, sans provisioning :
# suppose le mesh déjà installé (cf. infra/prod/ansible + memory/prod-colocation-tabiblib).
#
#   - venv : réinstall éditable (récupère les nouvelles dépendances des pyproject) ;
#            le code Python est déjà « live » car installé en -e et rsync-é.
#   - migrations : les services créent leurs tables manquantes au démarrage
#            (SQLAlchemy create_all / init_db). Les db/schema.sql NE sont PAS rejoués
#            (CREATE ROLE non gardé → non idempotents). Un changement DDL sur une table
#            existante (ALTER) reste une migration MANUELLE.
#   - restart : tout le mesh (64 unités plain-named semsar-*.service).
set -euo pipefail

APP=/opt/semsar
PIP="$APP/venv/bin/pip"

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

echo "== 2. redémarrage du mesh (create_all au boot = migrations légères) =="
systemctl daemon-reload
systemctl restart 'semsar-*.service'

echo "== 3. santé (attente de convergence du mesh) =="
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
while read -r unit; do
  state=$(systemctl is-active "$unit" 2>/dev/null || true)
  [ "$state" = "active" ] || { echo "  ✗ $unit -> $state"; FAIL=1; }
done < <(systemctl list-units 'semsar-*.service' --no-legend --plain | awk '{print $1}')
if [ "$FAIL" -ne 0 ]; then
  echo "DÉPLOIEMENT: au moins une unité KO ou gateway non-200." >&2
  exit 1
fi
echo "DÉPLOIEMENT OK : mesh actif, gateway 200."
