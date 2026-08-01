# State distant S3-compatible (Hetzner Object Storage).
# Tous les paramètres (bucket, endpoint, region, key, credentials) sont fournis
# à `terraform init` via `-backend-config`, jamais en dur ici — voir
# .github/workflows/deploy.yml et infra/prod/README.md.
terraform {
  backend "s3" {}
}
