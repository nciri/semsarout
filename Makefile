# Fondations plateforme v2 — raccourcis (cf. PLATFORM.md)
.PHONY: seed-dev hooks infra-up infra-down libs-install gateway-run gateway-test m3a-l3achrane-install m3a-l3achrane-dev m3a-l3achrane-build m3a-l3achrane-lint

infra-up:            ## Démarre l'infra plateforme (RabbitMQ, MinIO, OTel, Prometheus, Grafana, Loki)
	docker compose -f infra/docker-compose.yml up -d

infra-down:          ## Arrête l'infra plateforme
	docker compose -f infra/docker-compose.yml down

libs-install:        ## Installe les libs partagées en éditable
	pip install -e libs/semsar_common -e libs/semsar_auth -e libs/semsar_events -e libs/semsar_storage -e libs/semsar_search -e libs/semsar_signing

gateway-run:         ## Lance le BFF/gateway sur :8080
	uvicorn app.main:app --app-dir gateway --host 0.0.0.0 --port 8080

gateway-test:        ## Tests du gateway
	pytest gateway/tests

m3a-l3achrane-install: ## Installe dépendances frontend-m3a-l3achrane
	cd frontend-m3a-l3achrane && npm install

m3a-l3achrane-dev:     ## Lance frontend-m3a-l3achrane sur :5610
	cd frontend-m3a-l3achrane && npm run dev

m3a-l3achrane-build:   ## Build frontend-m3a-l3achrane
	cd frontend-m3a-l3achrane && npm run build

m3a-l3achrane-lint:    ## Lint frontend-m3a-l3achrane
	cd frontend-m3a-l3achrane && npm run lint

hooks:               ## Active les hooks git du dépôt (.githooks/pre-push)
	git config core.hooksPath .githooks
	@echo "hooks git actifs : .githooks"

DEV_DB ?= postgresql+psycopg
DEV_HOST ?= localhost:5432/semsar_dev

seed-dev:            ## Jeux de données de DÉV (identity d'abord : les autres seeds s'y réfèrent)
	PYTHONPATH=services/identity DATABASE_URL="$(DEV_DB)://identity:identity@$(DEV_HOST)" python3 -m app.seed_semsar_demo
	PYTHONPATH=services/identity DATABASE_URL="$(DEV_DB)://identity:identity@$(DEV_HOST)" python3 -m app.seed_m3a_demo
	PYTHONPATH=services/crm DATABASE_URL="$(DEV_DB)://crm:crm@$(DEV_HOST)" python3 -m app.seed_demo
	cd services/coloc-listing && PYTHONPATH=. DATABASE_URL="$(DEV_DB)://coloc_listing:coloc_listing@$(DEV_HOST)" SERVICE_NAME=coloc-listing python3 -m app.seed_demo
	cd services/partner && PYTHONPATH=. DATABASE_URL="$(DEV_DB)://partner:partner@$(DEV_HOST)" python3 -m app.seed_demo
	@# Les seeds m3a suivants ont besoin des identifiants créés par identity : aucun événement
	@# n'étant émis à la création des comptes, on les relit en base plutôt que de les deviner.
	CAND=$$(psql "postgresql://postgres:postgres@$(DEV_HOST)" -Atc "select id from identity.user_ro where tenant='m3a-l3achrane' and email='candidat@m3a.ma'"); \
	BAIL=$$(psql "postgresql://postgres:postgres@$(DEV_HOST)" -Atc "select id from identity.user_ro where tenant='m3a-l3achrane' and email='bailleur@m3a.ma'"); \
	cd services/coloc-profile && PYTHONPATH=. DATABASE_URL="$(DEV_DB)://coloc_profile:coloc_profile@$(DEV_HOST)" M3A_CANDIDAT_USER_ID=$$CAND M3A_BAILLEUR_USER_ID=$$BAIL python3 -m app.seed_demo && cd ../.. ; \
	cd services/trust-safety && PYTHONPATH=. DATABASE_URL="$(DEV_DB)://trust_safety:trust_safety@$(DEV_HOST)" M3A_CANDIDAT_USER_ID=$$CAND M3A_BAILLEUR_USER_ID=$$BAIL python3 -m app.seed_demo
