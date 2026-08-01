# Plan G — Infra Hetzner & CD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Production Hetzner tout-en-un provisionnée par Terraform + Ansible, déployée automatiquement par GitHub Actions au merge `develop` → `main`.

**Architecture:** Un serveur Hetzner Cloud (Ubuntu 24.04) : PostgreSQL 16 **natif** (+ extensions + un rôle/schéma par service), infra en docker compose (RabbitMQ, MinIO, OpenSearch, Traefik TLS), ~25 services FastAPI en **systemd + venv** (mêmes env que `scripts/dev-mesh-up.sh`), fronts buildés servis en statique. Le workflow `deploy.yml` (push sur `main`) exécute `terraform apply` (state distant S3-compatible) puis Ansible par SSH.

**Tech Stack:** Terraform `hcloud` provider, Ansible (roles), GitHub Actions, Traefik v3 (Let's Encrypt), systemd, nginx (statique).

## Global Constraints

- Domaines : **`semsarout.com`** (tenant `semsar`, défaut) et **`m3a-l3achrane.ma`** (tenant `m3a-l3achrane`) ; `/api` et `/uploads` sur chaque domaine → BFF :8099 ; pas de sous-domaine API.
- Gateway prod : `TENANT_HOSTS="m3a-l3achrane.ma=m3a-l3achrane,www.m3a-l3achrane.ma=m3a-l3achrane"`, `TENANT_DEV_HEADER` **absent** (défaut False), `ENVIRONMENT=prod`.
- **Aucun secret dans le dépôt** : tout vient des secrets GitHub Actions ou est généré sur le serveur (root-only `/etc/semsar/secrets.env`). `.tfvars` réels et clés SSH jamais commités.
- PostgreSQL natif sur le serveur — jamais conteneurisé (ADR-0002).
- Nommage : `m3a-l3achrane` en entier partout.
- Idempotence : rejouer Ansible sur un serveur déjà provisionné ne casse rien.
- Secrets GitHub requis (documentés dans `infra/prod/README.md`) : `HCLOUD_TOKEN`, `TF_BACKEND_ACCESS_KEY`, `TF_BACKEND_SECRET_KEY`, `DEPLOY_SSH_PRIVATE_KEY`, `JWT_SECRET_KEY_PROD`.

---

### Task G1: Terraform (infra/prod/terraform) + workflow deploy.yml

**Files:**
- Create: `infra/prod/terraform/{versions.tf,backend.tf,main.tf,variables.tf,outputs.tf}`
- Create: `.github/workflows/deploy.yml`
- Create: `infra/prod/README.md`

**Interfaces:**
- Produces: output Terraform `server_ip` (IPv4) consommé par le job Ansible ; ressources : `hcloud_ssh_key` (clé publique en variable), `hcloud_firewall` (22/80/443 entrants, tout sortant), `hcloud_server` (var `server_type`, défaut `cpx41`, image `ubuntu-24.04`, location var défaut `fsn1`, firewall + clé attachés).
- Backend S3-compatible (Hetzner Object Storage) : bucket var, key `semsarout/prod.tfstate`, endpoint var, credentials via env `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` (posés par le workflow depuis les secrets), `skip_*` flags requis pour un backend non-AWS.
- `deploy.yml` : `on: push: branches: [main]` + `workflow_dispatch`. Job `terraform` : init/validate/apply `-auto-approve`, expose `server_ip` en output de job. Job `deploy` (needs terraform) : installe Ansible, écrit la clé SSH depuis le secret (fichier 600), génère l'inventaire avec l'IP, `ansible-playbook infra/prod/ansible/playbook.yml` avec `JWT_SECRET_KEY` et domaines en extra-vars. Aucune interpolation `${{ }}` d'entrée non fiable dans les `run:` (uniquement secrets et outputs internes, passés via `env:`).

- [ ] Step 1: écrire les fichiers Terraform (provider hcloud `~> 1.45`, variables typées avec descriptions, pas de valeur sensible en défaut)
- [ ] Step 2: `terraform -chdir=infra/prod/terraform init -backend=false && terraform -chdir=infra/prod/terraform validate` → Success
- [ ] Step 3: écrire `deploy.yml` (deux jobs, secrets via `env:`), valider la syntaxe YAML (`python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/deploy.yml'))"`)
- [ ] Step 4: écrire `infra/prod/README.md` : secrets GitHub à créer, bucket state à créer une fois, DNS à pointer (A records des 2 domaines + www vers l'IP), premier déploiement, rollback (`git revert` sur main)
- [ ] Step 5: commit `feat(infra): terraform hetzner + workflow deploy (CD main)`

### Task G2: Ansible (infra/prod/ansible)

**Files:**
- Create: `infra/prod/ansible/playbook.yml`, `infra/prod/ansible/ansible.cfg`, `infra/prod/ansible/templates/*`, rôles `base`, `postgres`, `docker_infra`, `mesh`, `frontends`

**Interfaces:**
- Consumes: inventaire généré par deploy.yml (`server_ip`), extra-vars `jwt_secret_key`, `semsar_domain=semsarout.com`, `m3a_l3achrane_domain=m3a-l3achrane.ma`.
- Produces: serveur opérationnel — healthcheck final `curl -f https://{{ semsar_domain }}/api/v1/../health` (via BFF :8099 en local d'abord, puis via Traefik).

Contenu par rôle :
- `base` : paquets (git, python3.12-venv, ufw, curl), user `semsar` (non-root, owner de `/opt/semsar`), ufw allow 22/80/443, clone/pull du dépôt sur `main` dans `/opt/semsar/app`, `/etc/semsar/secrets.env` (0600, root) généré si absent : mots de passe PG par service (random), `RABBITMQ_PASS`, `MINIO_ROOT_PASSWORD` (random), `JWT_SECRET_KEY` (extra-var).
- `postgres` : dépôt PGDG, PostgreSQL 16 natif + `postgis postgresql-16-postgis-3 postgresql-16-pgvector` + pg_trgm/pgcrypto (extensions SQL), base `semsar_prod`, exécution idempotente des `services/*/db/schema.sql` (rôle+schéma par service — mots de passe depuis secrets.env, remplaçant les valeurs d'exemple) puis des migrations additives (`add_tenant.sql`, `add_rental_feature.sql`).
- `docker_infra` : docker + compose plugin, `infra/docker-compose.yml` (rabbitmq, minio, opensearch) + fichier compose prod additionnel avec Traefik v3 (entrypoints 80/443, resolver Let's Encrypt, redirection http→https) et nginx statique montant les deux `dist/`. Routage Traefik : pour chaque domaine, priorité aux `PathPrefix(/api, /uploads)` → `host.docker.internal:8099` (ou IP passerelle docker), sinon nginx du front correspondant.
- `mesh` : venv `/opt/semsar/venv` (libs éditables + tous les services), template systemd `semsar@.service` (uvicorn par service, `EnvironmentFile=/etc/semsar/secrets.env` + env par service identiques à `dev-mesh-up.sh` : DATABASE_URL par rôle, RABBITMQ_URL, JWT_SECRET_KEY, TENANT_HOSTS et ENVIRONMENT=prod pour le gateway), unités relays/workers (`relay_outbox`, workers notification/search), `systemctl enable --now`, restart ciblé au redéploiement (handler sur changement de code).
- `frontends` : node 20 (NodeSource), `npm ci && npm run build` des deux fronts, dist copiés vers `/opt/semsar/www/{semsarout,m3a-l3achrane}`.

- [ ] Step 1: écrire ansible.cfg + playbook + rôles (idempotents : `creates=`, `state=present`, handlers)
- [ ] Step 2: `ansible-playbook --syntax-check infra/prod/ansible/playbook.yml` → OK (installer ansible-core localement si absent : `pip install ansible-core` dans un venv du scratchpad)
- [ ] Step 3: `ansible-lint` si disponible (sinon noter) ; relire chaque template Jinja pour variables non définies
- [ ] Step 4: commit `feat(infra): provisioning ansible du serveur prod (PG natif + mesh systemd + traefik TLS)`

### Task G3: Gate

- [ ] `terraform validate` OK, syntax-check Ansible OK, YAML deploy.yml valide, `git log` propre, aucun secret ni IP en dur dans le diff (`git diff main..HEAD -- infra/ .github/ | grep -iE "password|secret|token"` ne montre que des noms de variables)
- [ ] Revue subagent du diff complet infra (spec + qualité)
