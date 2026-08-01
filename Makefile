# Fondations plateforme v2 — raccourcis (cf. PLATFORM.md)
.PHONY: infra-up infra-down libs-install gateway-run gateway-test m3a-l3achrane-install m3a-l3achrane-dev m3a-l3achrane-build m3a-l3achrane-lint

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
