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
