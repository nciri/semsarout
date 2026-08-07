"""Machine à états du séquestre `ColocPayment` (dépôt/loyer).

Cadrage : ceci modélise l'ÉTAT d'un séquestre (bloqué / libéré / remboursé), pas un
mouvement d'argent réel — aucun PSP n'est intégré (voir README du service).
"""

PAYMENT_STATUSES = frozenset({"pending", "escrowed", "released", "refunded"})

_TRANSITIONS: dict[str, frozenset[str]] = {
    "pending": frozenset({"escrowed"}),
    "escrowed": frozenset({"released", "refunded"}),
    "released": frozenset(),   # état terminal
    "refunded": frozenset(),   # état terminal
}


class PaymentTransitionError(ValueError):
    pass


def assert_payment_transition(current: str, target: str) -> None:
    if target not in _TRANSITIONS.get(current, frozenset()):
        raise PaymentTransitionError(f"transition interdite : {current} → {target}")
