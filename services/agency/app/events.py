"""Types d'événements publiés par agency (routing keys de l'exchange topic).

Émis lors de la modération d'agence (super-admin, délégué par trust-safety). Consommés par
identity pour resynchroniser `agency_ro` (blocage login `_login_blocked`).
"""
AGENCY_SUSPENDED = "agency.suspended"
AGENCY_UNSUSPENDED = "agency.unsuspended"
AGENCY_DELETED = "agency.deleted"
AGENCY_RESTORED = "agency.restored"
AGENCY_ANONYMIZED = "agency.anonymized"
