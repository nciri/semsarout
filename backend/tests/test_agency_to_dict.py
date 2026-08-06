"""Sérialisation Agency.to_dict — la clé API ne doit sortir que sur demande explicite.

Test unitaire pur (pas d'app/DB) : on appelle la méthode non liée avec un self
mocké, ce qui suffit à verrouiller le contrat de sécurité de `include_api_key`.
"""
from unittest.mock import MagicMock

from app.models.agency import Agency


def _fake_agency():
    a = MagicMock()
    a.api_key = 'secret-key-abc123'
    a.properties.count.return_value = 0
    a.created_at = None
    a.deleted_at = None
    a.anonymized_at = None
    a.is_suspended = False
    return a


def test_to_dict_excludes_api_key_by_default():
    """Sérialisation publique (listes/fiches) : jamais la clé API."""
    data = Agency.to_dict(_fake_agency())
    assert 'api_key' not in data


def test_to_dict_includes_api_key_when_requested():
    """Endpoint /my-agency (propriétaire) : la clé est incluse."""
    data = Agency.to_dict(_fake_agency(), include_api_key=True)
    assert data['api_key'] == 'secret-key-abc123'
