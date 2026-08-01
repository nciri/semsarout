variable "hcloud_token" {
  description = "Jeton API Hetzner Cloud (secret GitHub HCLOUD_TOKEN, injecté via TF_VAR_hcloud_token)."
  type        = string
  sensitive   = true
}

variable "ssh_public_key" {
  description = "Clé publique SSH autorisée à se connecter au serveur en root (dérivée de la clé de déploiement)."
  type        = string
}

variable "server_type" {
  description = "Type de serveur Hetzner Cloud."
  type        = string
  default     = "cpx41"
}

variable "location" {
  description = "Région Hetzner Cloud où provisionner le serveur."
  type        = string
  default     = "fsn1"
}

variable "server_name" {
  description = "Nom du serveur Hetzner Cloud."
  type        = string
  default     = "semsarout-prod"
}
