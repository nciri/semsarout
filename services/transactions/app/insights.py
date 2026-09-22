"""Constats du pipeline : ce qui, dans un dossier en cours, demande une action de l'agent.

Fonctions pures sur des dicts (les lignes de l'agence pour un type) : testables sans base.
Un constat = `{code, severity, params}` ; le texte est traduit côté front à partir du code.
Sévérités : `crit` (le dossier ne peut pas aboutir en l'état), `warn` (à faire), `info` (à vérifier).
"""
from datetime import datetime

SEVERITY_ORDER = {"crit": 0, "warn": 1, "info": 2}

STALE_WARN_DAYS = 21
STALE_CRIT_DAYS = 30
# Une vente qui n'a pas dépassé l'offre ne se signe pas en moins de six semaines.
EARLY_SALE_STAGES = ("contact", "visit", "offer")
UNREALISTIC_CLOSE_DAYS = 45
ARCHIVED_REASON = "Archived"


def amount_of(t: dict) -> float:
    """Montant d'un dossier : prix final, sinon l'offre, sinon le prix demandé."""
    for k in ("final_price", "offer_price", "asking_price"):
        if t.get(k) is not None:
            return float(t[k])
    return 0.0


def days_between(start: datetime | None, end: datetime) -> int | None:
    return (end - start).days if start else None


def _day(v: datetime | None) -> str | None:
    return v.date().isoformat() if v else None


def _flag(code: str, severity: str, **params) -> dict:
    return {"code": code, "severity": severity, "params": params}


def flags_for(t: dict, rows: list[dict], now: datetime) -> list[dict]:
    """Constats d'un dossier actif `t`, au regard des autres dossiers `rows` de même type."""
    out: list[dict] = []
    others = [o for o in rows if o["id"] != t["id"]]
    same_prop = [o for o in others if o.get("property_id") == t.get("property_id")]

    dup = next((o for o in same_prop if o.get("client_id") == t.get("client_id")
                and o.get("status") in ("active", "won")), None)
    if dup:
        out.append(_flag("duplicate", "crit", ref=dup["reference"], status=dup["status"],
                         date=_day(dup.get("closed_at")), amount=amount_of(dup)))

    days = days_between(t.get("stage_entered_at"), now)
    if days is not None and days > STALE_WARN_DAYS:
        out.append(_flag("stale", "crit" if days > STALE_CRIT_DAYS else "warn",
                         days=days, stage=t.get("stage")))

    ecd = t.get("expected_closing_date")
    to_close = (ecd.date() - now.date()).days if ecd else None
    if to_close is not None and to_close < 0:
        out.append(_flag("overdue", "warn", date=_day(ecd), days=-to_close))
    elif (to_close is not None and t.get("transaction_type") == "sale"
          and t.get("stage") in EARLY_SALE_STAGES and to_close <= UNREALISTIC_CLOSE_DAYS):
        out.append(_flag("unrealistic_close", "warn", date=_day(ecd), days=to_close,
                         stage=t.get("stage")))

    if (t.get("probability") or 0) >= 100:
        out.append(_flag("certain_not_closed", "warn", date=_day(ecd), stage=t.get("stage")))

    if t.get("transaction_type") == "rent":
        rival = next((o for o in same_prop if o.get("status") == "active"
                      and o.get("client_id") != t.get("client_id")), None)
        if rival:
            out.append(_flag("rival_applicant", "warn", ref=rival["reference"],
                             client=rival.get("client_name"), stage=rival.get("stage")))

    lost = sorted((o for o in same_prop if o.get("status") == "lost"
                   and o.get("lost_reason") != ARCHIVED_REASON),
                  key=lambda o: o.get("closed_at") or datetime.min, reverse=True)
    if lost:
        o = lost[0]
        out.append(_flag("lost_before", "info", ref=o["reference"], stage=o.get("stage"),
                         date=_day(o.get("closed_at")), reason=o.get("lost_reason"),
                         amount=amount_of(o)))

    # Le catalogue dit le bien déjà vendu ou loué alors que le dossier court encore.
    if t.get("property_status") in ("sold", "rented"):
        out.append(_flag("property_status", "info", status=t["property_status"]))

    return sorted(out, key=lambda f: SEVERITY_ORDER[f["severity"]])


def closed_recent(rows: list[dict], now: datetime, days: int = 30) -> list[dict]:
    """Sorties (gagnées/perdues) des `days` derniers jours ; un archivage n'est pas une perte."""
    out = []
    for o in rows:
        closed = o.get("closed_at")
        if (o.get("status") in ("won", "lost") and closed and (now - closed).days <= days
                and o.get("lost_reason") != ARCHIVED_REASON):
            out.append({"id": o["id"], "reference": o["reference"], "status": o["status"],
                        "stage": o.get("stage"), "amount": amount_of(o),
                        "closed_at": closed.isoformat(), "lost_reason": o.get("lost_reason"),
                        "property_title": o.get("property_title"), "agent_id": o.get("agent_id")})
    return sorted(out, key=lambda o: o["closed_at"], reverse=True)
