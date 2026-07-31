# Fondations plateforme v2 — raccourcis (cf. PLATFORM.md)
.PHONY: infra-up infra-down libs-install gateway-run gateway-test

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

m3a-install:         ## Installe dépendances frontend-m3a-l3chrane
	cd frontend-m3a-l3chrane && npm install

m3a-dev:             ## Lance frontend-m3a-l3chrane sur :5610
	cd frontend-m3a-l3chrane && npm run dev

m3a-build:           ## Build frontend-m3a-l3chrane
	cd frontend-m3a-l3chrane && npm run build

m3a-lint:            ## Lint frontend-m3a-l3chrane
	cd frontend-m3a-l3chrane && npm run lint
