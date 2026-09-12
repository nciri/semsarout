"""Le monolithe ne détient plus aucun prix : il lit le catalogue de billing.

Une grille en dur vivait dans `app/api/v1/payments.py`. Le BFF route désormais
`/api/v1/payments/*` vers le service payment, donc elle n'était plus servie — mais elle
restait le repli d'une configuration incomplète, et aurait alors prélevé un tarif périmé.
"""
import requests

from app.api.v1.payments import _service_amount


class _Resp:
    def __init__(self, payload, status=200):
        self._payload = payload
        self.status_code = status

    def json(self):
        return self._payload


def _catalogue(monkeypatch, payload, status=200):
    seen = {}

    def fake_get(url, **kwargs):
        seen['url'] = url
        seen['headers'] = kwargs.get('headers') or {}
        return _Resp(payload, status)

    monkeypatch.setattr(requests, 'get', fake_get)
    return seen


def test_prix_lu_dans_le_catalogue(monkeypatch):
    seen = _catalogue(monkeypatch, {'services': [
        {'code': 'forfait-vente', 'amount': 9900, 'is_active': True},
    ]})
    assert _service_amount('forfait-vente') == 9900.0
    assert seen['url'].endswith('/internal/service-prices')
    assert 'x-internal-token' in seen['headers']


def test_prestation_retiree_de_l_offre_refusee(monkeypatch):
    _catalogue(monkeypatch, {'services': [
        {'code': 'photos-pro', 'amount': 990, 'is_active': False},
    ]})
    assert _service_amount('photos-pro') is None


def test_code_inconnu_refuse(monkeypatch):
    _catalogue(monkeypatch, {'services': []})
    assert _service_amount('inexistant') is None


def test_catalogue_injoignable_refuse_plutot_que_deviner(monkeypatch):
    """Fail-closed : aucun montant de repli, sans quoi le paiement partirait au tarif d'hier."""
    def boom(url, **kwargs):
        raise requests.RequestException('down')

    monkeypatch.setattr(requests, 'get', boom)
    assert _service_amount('forfait-vente') is None


def test_catalogue_en_erreur_refuse(monkeypatch):
    _catalogue(monkeypatch, {}, status=403)
    assert _service_amount('forfait-vente') is None


def test_sans_service_id_aucun_appel(monkeypatch):
    def boom(url, **kwargs):
        raise AssertionError('le catalogue ne doit pas être interrogé sans code')

    monkeypatch.setattr(requests, 'get', boom)
    assert _service_amount(None) is None
