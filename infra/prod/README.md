# Infra prod — Hetzner

Serveur unique Hetzner Cloud provisionné par Terraform (`infra/prod/terraform`) et
configuré par Ansible (`infra/prod/ansible`, tâche G2). Le déploiement est automatisé
par `.github/workflows/deploy.yml` à chaque push sur `main`.

## Secrets GitHub à créer

Dans **Settings → Secrets and variables → Actions** du dépôt :

| Secret | Description |
| --- | --- |
| `HCLOUD_TOKEN` | Jeton API Hetzner Cloud (droits lecture/écriture sur le projet). |
| `TF_BACKEND_ACCESS_KEY` | Access key du bucket Hetzner Object Storage (state Terraform). |
| `TF_BACKEND_SECRET_KEY` | Secret key correspondante. |
| `DEPLOY_SSH_PRIVATE_KEY` | Clé privée SSH (ed25519 recommandé) utilisée à la fois pour provisionner la clé publique autorisée sur le serveur (Terraform, via `ssh-keygen -y`) et pour la connexion Ansible. |
| `JWT_SECRET_KEY_PROD` | Secret JWT applicatif utilisé en prod (passé en extra-var Ansible). |

La clé publique injectée dans `hcloud_ssh_key` est dérivée automatiquement de
`DEPLOY_SSH_PRIVATE_KEY` par le job `terraform` (`ssh-keygen -y`) : un seul secret à
gérer et à faire tourner, pas de risque de désynchronisation entre paire de clés.

## Créer le bucket de state (une seule fois)

1. Dans la console Hetzner Cloud, activer **Object Storage** sur le projet et créer un
   bucket `semsarout-tfstate` en région `fsn1`.
2. Générer une paire de clés d'accès S3-compatibles pour ce bucket ; les stocker dans
   `TF_BACKEND_ACCESS_KEY` / `TF_BACKEND_SECRET_KEY`.
3. Aucune autre action manuelle : `terraform init` du workflow pointe vers
   `https://fsn1.your-objectstorage.com`, bucket `semsarout-tfstate`, clé d'état
   `semsarout/prod.tfstate`.

## DNS

Une fois le premier `terraform apply` exécuté, récupérer l'IP du serveur (output
`server_ip`, visible dans les logs du job `terraform` ou via
`terraform output -raw server_ip` en local) et créer les enregistrements A suivants
chez le registrar/DNS de chaque domaine :

| Domaine | Type | Valeur |
| --- | --- | --- |
| `semsarout.com` | A | `<server_ip>` |
| `www.semsarout.com` | A | `<server_ip>` |
| `m3a-l3achrane.ma` | A | `<server_ip>` |
| `www.m3a-l3achrane.ma` | A | `<server_ip>` |

Traefik (configuré par Ansible, tâche G2) obtient les certificats Let's Encrypt pour
ces quatre hôtes ; la propagation DNS doit être effective avant le premier
déploiement pour que la validation ACME HTTP-01 réussisse.

## Premier déploiement

1. Créer les 5 secrets ci-dessus et le bucket de state.
2. Pointer les DNS (voir ci-dessus) — au minimum avant le premier run Ansible, la
   partie Terraform ne dépend pas du DNS.
3. Déclencher le workflow manuellement : onglet **Actions → Deploy prod (Hetzner) →
   Run workflow** (branche `main`), ou pousser/merger sur `main`.
4. Suivre les deux jobs : `terraform` (provisionning du serveur) puis `deploy`
   (Ansible : PostgreSQL natif, mesh systemd, Traefik TLS, fronts).

Les runs suivants (push sur `main`) redéploient automatiquement : Terraform est
idempotent (`apply` ne recrée rien si rien n'a changé) et le playbook Ansible est
conçu pour être rejoué sans casser un serveur déjà provisionné.

## Premiers déploiements — pièges connus

1. **Vérifier réellement `https://<domaine>/api/...` après déploiement**, pas
   seulement le health check local du BFF (`http://127.0.0.1:8099/health`) : un
   health check local vert ne garantit pas que Traefik atteint le BFF côté
   utilisateurs.
2. **DNS** : les 4 enregistrements A (apex + `www` pour les deux domaines,
   cf. section DNS ci-dessus) doivent être propagés **avant** le tout premier
   run Ansible, sinon la validation ACME HTTP-01 de Let's Encrypt échoue —
   Traefik réessaie silencieusement en arrière-plan sans faire échouer le
   playbook.
3. Le healthcheck Ansible traverse désormais Traefik jusqu'au BFF
   (`infra/prod/ansible/tasks/healthcheck.yml`), mais cela ne remplace pas un
   test depuis l'extérieur du serveur (résolution DNS réelle, chemin réseau
   Hetzner) une fois le déploiement terminé.
4. **`SIGN_API_URL` / `SIGN_API_KEY`** doivent être renseignés manuellement
   dans `/etc/semsar/secrets.env` puis les services `rental`/`selling`
   redémarrés (`systemctl restart semsar-app@rental semsar-app@selling`) —
   ces valeurs ne sont pas générées par le playbook.
5. **Rotation des secrets** : `secrets.env` n'est généré que s'il est absent
   sur le serveur (idempotence des rôles PostgreSQL). Changer
   `JWT_SECRET_KEY_PROD` côté GitHub ne se propage donc pas tout seul au
   prochain run. Et supprimer le fichier pour forcer une régénération
   régénère **aussi** les mots de passe PostgreSQL (désynchronisation avec
   les rôles déjà créés) — à ne faire qu'en connaissance de cause.
6. Si le dépôt GitHub applicatif (`semsar_git_repo`) passe privé, le clone
   HTTPS anonyme utilisé par le rôle `base` casse : prévoir une deploy key ou
   un token avant de changer la visibilité.
7. La stack d'observabilité (otel/prometheus/loki/grafana) est
   **volontairement** non démarrée en prod pour ce premier déploiement (poids
   inutile) — voir le commentaire dans `compose.prod.yml.j2`.

> **Note Terraform** : `infra/prod/terraform/backend.tf` utilise la syntaxe
> `backend "s3" {}` (singulier) avec les paramètres S3-compatibles fournis via
> `-backend-config` dans le workflow. Cette forme est dépréciée dans les
> versions récentes de Terraform (>1.6) au profit de blocs de configuration
> distincts — à migrer si le pin de version (`~1.6` dans
> `.github/workflows/deploy.yml`) est relevé.

## Rollback

En cas de déploiement cassé :

```bash
git revert <commit-cassé>
git push origin main
```

Le push déclenche un nouveau run du workflow qui redéploie l'état précédent (code
applicatif + configuration). Aucune action manuelle sur le serveur n'est nécessaire
sauf si le problème vient d'un changement d'infrastructure Terraform incompatible —
dans ce cas, revert le commit Terraform fautif avant de relancer.
