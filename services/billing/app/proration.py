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
from datetime import datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

# Un reste de période plus court ne vaut pas une facture : la différence est offerte.
MIN_PRORATED_AMOUNT = Decimal("1.00")


CYCLE_DAYS = {"monthly": 30, "yearly": 365}


def cycle_days(billing_cycle: str | None) -> int:
    return CYCLE_DAYS.get(billing_cycle or "monthly", 30)


def remaining_ratio(period_end: datetime, now: datetime, billing_cycle: str | None) -> Decimal:
    """Temps restant jusqu'au terme, exprimé en cycles (0 si le terme est passé).

    La période se déduit du terme moins la durée du cycle : `start_date` est le début de
    l'abonnement, pas celui du mois en cours — après un an, le ratio calculé depuis elle
    serait presque nul et la montée de gamme quasi gratuite.
    """
    total = timedelta(days=cycle_days(billing_cycle)).total_seconds()
    if total <= 0:
        return Decimal("0")
    left = (period_end - now).total_seconds()
    if left <= 0:
        return Decimal("0")
    # Pas de plafond à 1 : si le terme est à plus d'un cycle (période prolongée, cycle
    # changé à la main), la différence est due pour TOUT le temps restant. Plafonner
    # offrirait les mois au-delà du premier.
    return (Decimal(str(left)) / Decimal(str(total))).quantize(Decimal("0.0001"))


def upgrade_amount(current_amount, new_amount, period_end: datetime, now: datetime,
                   billing_cycle: str | None = "monthly") -> Decimal:
    """Différence à payer pour la fin de la période en cours. Jamais négative."""
    delta = Decimal(str(new_amount)) - Decimal(str(current_amount))
    if delta <= 0:
        return Decimal("0.00")
    amount = (delta * remaining_ratio(period_end, now, billing_cycle)).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP)
    return amount if amount >= MIN_PRORATED_AMOUNT else Decimal("0.00")


def is_upgrade(current_amount, new_amount) -> bool:
    return Decimal(str(new_amount)) > Decimal(str(current_amount))
