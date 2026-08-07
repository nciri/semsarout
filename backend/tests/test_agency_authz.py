"""Autorisation de gestion d'agence — `is_agency_admin`.

Test unitaire pur (pas d'app/DB) : la fonction ne lit que des attributs.
Contrat : gérer l'agence (voir/régénérer la clé API, éditer) est réservé au
propriétaire (`owner_id`) ou à un admin plateforme (`account_role == 'admin'`),
avec un fallback non-régressif pour les agences historiques sans propriétaire.
"""
from unittest.mock import MagicMock

from app.api.v1.agencies import is_agency_admin


def _user(uid, account_role='agent', agency_id=1):
    u = MagicMock()
    u.id = uid
    u.account_role = account_role
    u.agency_id = agency_id
    return u


def _agency(aid=1, owner_id=None):
    a = MagicMock()
    a.id = aid
    a.owner_id = owner_id
    return a


def test_owner_can_manage():
    assert is_agency_admin(_user(7), _agency(owner_id=7)) is True


def test_platform_admin_can_manage():
    assert is_agency_admin(_user(9, account_role='admin'), _agency(owner_id=7)) is True


def test_non_owner_member_cannot_manage():
    # Agence avec un propriétaire, membre différent, non-admin → refusé.
    assert is_agency_admin(_user(8, agency_id=1), _agency(aid=1, owner_id=7)) is False


def test_legacy_agency_without_owner_allows_member():
    # Fallback non-régressif : owner_id absent → un membre peut gérer.
    assert is_agency_admin(_user(8, agency_id=1), _agency(aid=1, owner_id=None)) is True


def test_none_inputs():
    assert is_agency_admin(None, _agency()) is False
    assert is_agency_admin(_user(1), None) is False
