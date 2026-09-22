"""Constats de la page « Biens immobiliers » du back-office — fonctions pures, testées sans base.

- `match_price_ref` : fourchette de prix au m² du quartier (référentiel `geo.neighborhood_price_ref`),
  choisie avec la même priorité que geo (`pricing.price_position`) : type exact, sinon tous types.
- `status_check` : statut affiché contredit par les dossiers de transaction du bien. Un statut faux
  fausse le reste (stock, recherche) : on le signale, l'agent corrige en un clic.
"""

# À partir de l'offre (vente) ou de la candidature (location), le bien est engagé : « sous option ».
# Avant (contact, visite), rien n'empêche de le garder en ligne.
_ENGAGED_STAGES = {"offer", "negotiation", "compromise", "final_act",
                   "application", "verification", "move_in"}


def _num(v):
    return float(v) if v is not None else None


def match_price_ref(refs: list[dict], city, neighborhood, transaction_type, property_type) -> dict | None:
    if not (city and neighborhood):
        return None
    cands = [r for r in refs if r.get("city") == city and r.get("neighborhood") == neighborhood
             and r.get("transaction_type") == transaction_type and r.get("avg_price_sqm")]
    ref = (next((r for r in cands if r.get("property_type") == property_type), None)
           or next((r for r in cands if not r.get("property_type")), None))
    if ref is None:
        return None
    avg = float(ref["avg_price_sqm"])
    # Mêmes bornes par défaut que geo quand le référentiel ne donne que la moyenne.
    return {"avg": avg, "min": _num(ref.get("min_price_sqm")) or round(avg * 0.8, 2),
            "max": _num(ref.get("max_price_sqm")) or round(avg * 1.2, 2)}


def brief_transaction(t: dict) -> dict:
    amount = next((t[k] for k in ("final_price", "offer_price", "asking_price") if t.get(k) is not None), None)
    return {"id": t.get("id"), "stage": t.get("stage"), "status": t.get("status"),
            "transaction_type": t.get("transaction_type"), "amount": amount,
            "probability": t.get("probability"), "closed_at": t.get("closed_at"),
            "expected_closing_date": t.get("expected_closing_date")}


def status_check(status: str, txns: list[dict]) -> dict | None:
    """`expected` = statut que les dossiers impliquent ; `tone` crit quand un dossier est clos
    (gagné/perdu : un fait), warn quand c'est une déduction d'un dossier en cours ou absent."""
    won = sorted((t for t in txns if t.get("status") == "won"), key=lambda t: t.get("closed_at") or "", reverse=True)
    active = [t for t in txns if t.get("status") == "active"]
    if won:
        t = won[0]
        expected = "rented" if t.get("transaction_type") == "rent" else "sold"
        if status == expected:
            return None
        return {"reason": "won", "expected": expected, "tone": "crit",
                "transaction": brief_transaction(t), "open_count": len(active)}
    if status in ("sold", "rented"):
        if active:
            t = max(active, key=lambda t: t.get("probability") or 0)
            return {"reason": "open_deal", "tone": "warn", "transaction": brief_transaction(t),
                    "expected": "pending" if t.get("stage") in _ENGAGED_STAGES else "active"}
        if txns:  # tous perdus : rien ne justifie plus le statut clos
            t = max(txns, key=lambda t: t.get("closed_at") or "")
            return {"reason": "lost", "expected": "active", "tone": "crit", "transaction": brief_transaction(t)}
        return None  # clos sans dossier : conclu hors plateforme, rien à contredire
    if status == "pending" and not active:
        return {"reason": "no_deal", "expected": "active", "tone": "warn", "transaction": None}
    return None
