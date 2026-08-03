output "server_ip" {
  description = "Adresse IPv4 publique du serveur prod."
  value       = hcloud_server.prod.ipv4_address
}
