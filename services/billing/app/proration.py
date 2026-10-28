"""Prorata d'un changement de plan en cours de période.

Reprise de StayManager (`app/services/subscription_self_service.py`, qui programmait tout
changement au terme) avec une distinction que SemsarOut doit faire :

- **Monter de gamme se paie tout de suite, au prorata du temps restant.** L'agence qui passe
  au Pro le 20 du mois ne doit pas payer un mois entier, et ne doit pas attendre le 1er pour
  publier. La période en cours n'est pas décalée : seule la différence est facturée.
- **Rétrograder est programmé au terme.** Pas de remboursement : le mois est payé, les droits
  restent jusqu'à son terme, et le plan change à l'échéance. Rembourser au prorata ouvrirait
  un va-et-vient Pro/Starter payé une fois.
"""
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal

# Un reste de période plus court ne vaut pas une facture : la différence est offerte.
MIN_PRORATED_AMOUNT = Decimal("1.00")


def remaining_ratio(period_start: datetime, period_end: datetime, now: datetime) -> Decimal:
    """Part de la période encore à courir, entre 0 et 1."""
    total = (period_end - period_start).total_seconds()
    if total <= 0:
        return Decimal("0")
    left = (period_end - now).total_seconds()
    if left <= 0:
        return Decimal("0")
    if left >= total:
        return Decimal("1")
    return (Decimal(str(left)) / Decimal(str(total))).quantize(Decimal("0.0001"))


def upgrade_amount(current_amount, new_amount, period_start: datetime,
                   period_end: datetime, now: datetime) -> Decimal:
    """Différence à payer pour la fin de la période en cours. Jamais négative."""
    delta = Decimal(str(new_amount)) - Decimal(str(current_amount))
    if delta <= 0:
        return Decimal("0.00")
    amount = (delta * remaining_ratio(period_start, period_end, now)).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP)
    return amount if amount >= MIN_PRORATED_AMOUNT else Decimal("0.00")


def is_upgrade(current_amount, new_amount) -> bool:
    return Decimal(str(new_amount)) > Decimal(str(current_amount))
