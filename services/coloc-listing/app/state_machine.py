"""Machine à états des annonces — portée de m3a-l3achrane (domain/state_machine.py).

9 statuts, transitions strictes. RESERVEE/LOUEE/EXPIREE/SUSPENDUE seront pilotés
par d'autres services (booking, trust) via événements — plans E/F.
"""

STATUSES = frozenset({
    "BROUILLON", "EN_MODERATION", "PUBLIEE", "RESERVEE", "LOUEE",
    "EXPIREE", "ARCHIVEE", "REJETEE", "SUSPENDUE",
})

EDITABLE_STATUSES = {"BROUILLON", "REJETEE"}

_TRANSITIONS: dict[str, frozenset[str]] = {
    "BROUILLON": frozenset({"EN_MODERATION", "ARCHIVEE"}),
    "EN_MODERATION": frozenset({"PUBLIEE", "REJETEE", "BROUILLON"}),
    "PUBLIEE": frozenset({"RESERVEE", "EXPIREE", "SUSPENDUE", "ARCHIVEE"}),
    "RESERVEE": frozenset({"LOUEE", "PUBLIEE", "ARCHIVEE"}),
    "LOUEE": frozenset({"EXPIREE", "ARCHIVEE"}),
    "REJETEE": frozenset({"BROUILLON", "ARCHIVEE"}),
    "SUSPENDUE": frozenset({"PUBLIEE", "ARCHIVEE"}),
    "EXPIREE": frozenset({"BROUILLON", "ARCHIVEE"}),
    "ARCHIVEE": frozenset(),  # état terminal
}


class TransitionError(ValueError):
    pass


def assert_transition(current: str, target: str) -> None:
    if target not in _TRANSITIONS[current]:
        raise TransitionError(f"transition interdite : {current} → {target}")
