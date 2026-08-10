"""Seed de démo dev — 1 partenaire (« Université Hassan II ») + membership + quelques
affiliés/vérifications/réservations/subventions/factures rattachés.

    PYTHONPATH=services/partner \
    DATABASE_URL=postgresql+psycopg://partner:partner@localhost:5432/semsar_dev \
        RABBITMQ_URL=... EVENTS_EXCHANGE=semsar.events SERVICE_NAME=partner \
        python3 -m app.seed_demo

Idempotent : upsert par clé logique (nom du partenaire, email d'affilié, numéro de
facture...) — relancer le seed ne duplique rien, il met simplement à jour les lignes
existantes.

Le compte de démo côté identity est `partenaire@m3a.ma` (tenant m3a-l3achrane, cf.
`services/identity/app/seed_m3a_demo.py`), et ce service ne connaît pas son id
numérique — le service partner n'a pas de dépendance directe sur la base identity.
`DEMO_PARTNER_USER_ID` ci-dessous DOIT correspondre à l'id réel de ce compte dans
`user_ro` (identity) une fois les deux seeds appliqués dans le même environnement ;
surchargeable via la variable d'environnement `DEMO_PARTNER_USER_ID` si l'id diffère
(ex. base déjà peuplée par d'autres seeds avant `partenaire@m3a.ma`).
"""
import os
from datetime import date, timedelta
from decimal import Decimal

from semsar_events import enqueue

from . import events
from .db import SessionLocal, init_db
from .models import (
    Affilie, Grant, Invoice, Partner, PartnerMember, Reservation, Verification, _now,
)

# Id du user identity `partenaire@m3a.ma` (tenant m3a-l3achrane) — voir docstring.
DEMO_PARTNER_USER_ID = int(os.environ.get("DEMO_PARTNER_USER_ID", "3"))

TENANT = "m3a-l3achrane"
PARTNER_NAME = "Université Hassan II"
PARTNER_TYPE = "UNIVERSITE"

AFFILIES = [
    ("Yasmine Alaoui", "yasmine.alaoui@etu.uh2c.ma", "ETU-2026-001", "ACTIVE"),
    ("Omar Fassi", "omar.fassi@etu.uh2c.ma", "ETU-2026-002", "ACTIVE"),
    ("Salma Bennis", "salma.bennis@etu.uh2c.ma", "ETU-2026-003", "PENDING"),
]

RESERVATIONS = [
    # (listing_id démo, affilié index, libellé, début dans J+, durée jours, statut)
    ("1", 0, "Réservation rentrée 2026 — Y. Alaoui", 15, 90, "RESERVED"),
    ("2", 1, "Réservation rentrée 2026 — O. Fassi", 20, 90, "CONVERTED"),
]

GRANTS = [
    # (programme, affilié index, montant, statut)
    ("Bourse logement 2026", 0, Decimal("1500.00"), "PAID"),
    ("Bourse logement 2026", 2, Decimal("1500.00"), "PLANNED"),
]

INVOICES = [
    # (numéro, période, montant, statut)
    ("UH2C-2026-01", "2026-01", Decimal("4500.00"), "SENT"),
    ("UH2C-2026-02", "2026-02", Decimal("1500.00"), "DRAFT"),
]


def _upsert_partner(db) -> Partner:
    partner = db.query(Partner).filter(Partner.tenant == TENANT, Partner.name == PARTNER_NAME).first()
    if partner is None:
        partner = Partner(name=PARTNER_NAME, type=PARTNER_TYPE, tenant=TENANT)
        db.add(partner)
        db.flush()
    else:
        partner.type = PARTNER_TYPE
    return partner


def _upsert_member(db, partner: Partner) -> PartnerMember:
    member = (
        db.query(PartnerMember)
        .filter(PartnerMember.partner_id == partner.id, PartnerMember.user_id == DEMO_PARTNER_USER_ID)
        .first()
    )
    if member is None:
        member = PartnerMember(partner_id=partner.id, user_id=DEMO_PARTNER_USER_ID, role="OWNER")
        db.add(member)
        db.flush()
    else:
        member.role = "OWNER"
    return member


def _upsert_affilies(db, partner: Partner) -> list[Affilie]:
    seeded = []
    for full_name, email, external_ref, status in AFFILIES:
        affilie = (
            db.query(Affilie)
            .filter(Affilie.partner_id == partner.id, Affilie.email == email)
            .first()
        )
        if affilie is None:
            affilie = Affilie(partner_id=partner.id, full_name=full_name, email=email,
                               external_ref=external_ref, status=status)
            db.add(affilie)
            db.flush()
            enqueue(db, "partner", affilie.id, events.AFFILIE_CREATED,
                    {"affilie_id": affilie.id, "partner_id": partner.id,
                     "full_name": affilie.full_name, "email": affilie.email})
        else:
            affilie.full_name = full_name
            affilie.external_ref = external_ref
            affilie.status = status
        seeded.append(affilie)
    return seeded


def _upsert_verifications(db, partner: Partner, affilies: list[Affilie]) -> None:
    # Une vérification "carte étudiant" pour chaque affilié actif ou pending.
    for affilie in affilies:
        verification = (
            db.query(Verification)
            .filter(Verification.partner_id == partner.id, Verification.affilie_id == affilie.id,
                    Verification.doc_type == "CARTE_ETUDIANT")
            .first()
        )
        status = "APPROVED" if affilie.status == "ACTIVE" else "PENDING"
        if verification is None:
            verification = Verification(partner_id=partner.id, affilie_id=affilie.id,
                                        doc_type="CARTE_ETUDIANT", status=status)
            db.add(verification)
            db.flush()
            if status != "PENDING":
                enqueue(db, "partner", verification.id, events.VERIFICATION_DECIDED,
                        {"verification_id": verification.id, "partner_id": partner.id,
                         "status": status})
        else:
            verification.status = status


def _upsert_reservations(db, partner: Partner, affilies: list[Affilie]) -> None:
    for listing_id, affilie_idx, label, offset_days, duration_days, status in RESERVATIONS:
        reservation = (
            db.query(Reservation)
            .filter(Reservation.partner_id == partner.id, Reservation.listing_id == listing_id,
                    Reservation.label == label)
            .first()
        )
        start = date.today() + timedelta(days=offset_days)
        end = start + timedelta(days=duration_days)
        affilie_id = affilies[affilie_idx].id if affilie_idx < len(affilies) else None
        if reservation is None:
            reservation = Reservation(partner_id=partner.id, listing_id=listing_id,
                                      affilie_id=affilie_id, label=label,
                                      start_date=start, end_date=end, status=status)
            db.add(reservation)
            db.flush()
            enqueue(db, "partner", reservation.id, events.RESERVATION_CREATED,
                    {"reservation_id": reservation.id, "partner_id": partner.id,
                     "listing_id": reservation.listing_id})
        else:
            reservation.status = status
            reservation.start_date = start
            reservation.end_date = end


def _upsert_grants(db, partner: Partner, affilies: list[Affilie]) -> None:
    for program, affilie_idx, amount, status in GRANTS:
        affilie_id = affilies[affilie_idx].id if affilie_idx < len(affilies) else None
        grant = (
            db.query(Grant)
            .filter(Grant.partner_id == partner.id, Grant.program == program,
                    Grant.affilie_id == affilie_id)
            .first()
        )
        if grant is None:
            grant = Grant(partner_id=partner.id, program=program, affilie_id=affilie_id,
                          amount=amount, status=status)
            db.add(grant)
            db.flush()
            if status == "PAID":
                enqueue(db, "partner", grant.id, events.GRANT_PAID,
                        {"grant_id": grant.id, "partner_id": partner.id, "amount": float(amount)})
        else:
            grant.amount = amount
            grant.status = status


def _upsert_invoices(db, partner: Partner) -> None:
    for number, period, amount, status in INVOICES:
        invoice = (
            db.query(Invoice)
            .filter(Invoice.partner_id == partner.id, Invoice.number == number)
            .first()
        )
        issued = _now() if status in ("SENT", "PAID", "OVERDUE") else None
        if invoice is None:
            invoice = Invoice(partner_id=partner.id, number=number, period=period,
                              amount=amount, status=status, issued_at=issued)
            db.add(invoice)
            db.flush()
            if issued is not None:
                enqueue(db, "partner", invoice.id, events.INVOICE_SENT,
                        {"invoice_id": invoice.id, "partner_id": partner.id, "number": number})
        else:
            invoice.amount = amount
            invoice.status = status
            invoice.issued_at = issued


def seed() -> str:
    init_db()
    db = SessionLocal()
    try:
        partner = _upsert_partner(db)
        _upsert_member(db, partner)
        affilies = _upsert_affilies(db, partner)
        _upsert_verifications(db, partner, affilies)
        _upsert_reservations(db, partner, affilies)
        _upsert_grants(db, partner, affilies)
        _upsert_invoices(db, partner)
        db.commit()
        print(f"Seed : partenaire « {partner.name} » ({partner.id}), "
              f"{len(affilies)} affiliés, membre OWNER user_id={DEMO_PARTNER_USER_ID}.")
        return partner.id
    finally:
        db.close()


if __name__ == "__main__":
    seed()
