"""Modèles du service billing (schéma `billing`) — parité `backend/app/models/subscription.py`.

SubscriptionPlan/Subscription reproduisent les `to_dict` du monolithe (routes legacy). Invoice est
créé par `change-plan` (chorégraphie paiement v2 : facture *unpaid* + `billing.invoice.created`).
"""
from datetime import datetime

from sqlalchemy import (
    Boolean, Column, DateTime, ForeignKey, Integer, Numeric, String, Text,
)

from .db import Base


class SubscriptionPlan(Base):
    __tablename__ = "subscription_plan"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(50), nullable=False)
    slug = Column(String(50), unique=True, nullable=False)
    description = Column(Text)
    # `agency` ou `individual` : les deux publics partagent cette table, et sans ce champ la
    # page d'une agence afficherait les offres particuliers, et l'inverse.
    audience = Column(String(20), nullable=False, default="agency", server_default="agency")
    max_listings = Column(Integer, nullable=False)
    max_featured = Column(Integer, default=0)
    max_urgent = Column(Integer, default=0)
    has_api_access = Column(Boolean, default=False)
    has_csv_import = Column(Boolean, default=False)
    has_staymanager_sync = Column(Boolean, default=False)
    has_lead_contact = Column(Boolean, default=True)
    has_analytics = Column(Boolean, default=False)
    has_priority_support = Column(Boolean, default=False)
    has_dedicated_account_manager = Column(Boolean, default=False)
    has_programs = Column(Boolean, default=False)
    max_programs = Column(Integer, default=0)
    has_contracts = Column(Boolean, default=False)
    has_legal = Column(Boolean, default=False)
    has_artisans = Column(Boolean, default=False)
    has_rental = Column(Boolean, default=False)
    has_design3d = Column(Boolean, default=False)
    max_seats = Column(Integer, default=0)
    max_teams = Column(Integer, default=0)
    price_monthly = Column(Numeric(10, 2), nullable=False)
    price_yearly = Column(Numeric(10, 2))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Subscription(Base):
    __tablename__ = "subscription"

    id = Column(Integer, primary_key=True, autoincrement=True)
    agency_id = Column(Integer, nullable=False, index=True)
    plan_id = Column(Integer, ForeignKey("subscription_plan.id"), nullable=False)
    billing_cycle = Column(String(10), default="monthly")
    amount = Column(Numeric(10, 2), nullable=False)
    status = Column(String(20), default="active")
    start_date = Column(DateTime, nullable=False, default=datetime.utcnow)
    end_date = Column(DateTime)
    trial_end = Column(DateTime)
    cancelled_at = Column(DateTime)
    # Échéance de grâce d'un renouvellement impayé (`past_due`). Distincte de `end_date` : au
    # renouvellement, `end_date` est déjà dépassée — c'est elle qui déclenche la facture — et
    # la lire comme échéance réduirait l'accès le jour même.
    grace_until = Column(DateTime)
    last_payment_failure_at = Column(DateTime)
    # Libellé renvoyé par la passerelle, montré tel quel à l'agence : jamais un code technique.
    last_payment_failure_reason = Column(String(255))
    listings_used = Column(Integer, default=0)
    featured_used = Column(Integer, default=0)
    urgent_used = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Invoice(Base):
    __tablename__ = "invoice"

    id = Column(Integer, primary_key=True, autoincrement=True)
    reference = Column(String(30), unique=True, index=True)
    subscription_id = Column(Integer, ForeignKey("subscription.id"), nullable=True)
    invoice_type = Column(String(20), nullable=False, default="subscription")  # subscription | commission
    account_id = Column(Integer, index=True)  # compte facturé pour une commission (particulier/promoteur)
    agency_id = Column(Integer, index=True)
    amount = Column(Numeric(10, 2), nullable=False)
    status = Column(String(20), default="unpaid")  # unpaid|paid
    period_label = Column(String(40))
    issued_at = Column(DateTime, default=datetime.utcnow)
    paid_at = Column(DateTime)
    reminder_count = Column(Integer, default=0)   # relances impayé envoyées (dunning) — anti-doublon
    last_reminder_at = Column(DateTime)           # date de la dernière relance (cadence)


class ServicePrice(Base):
    """Catalogue des prestations facturables — SEULE source d'un montant de prestation.

    Le prix vivait auparavant en quatre endroits, dont un seul (`payment.SERVICE_PRICES`) faisait
    autorité sur ce qui était réellement prélevé : porter le forfait de 4 900 à 9 900 demandait
    d'en toucher huit, et en oublier un affichait un prix pour en prélever un autre.

    `code` est l'identifiant que porte `Payment.service_id` : il n'est jamais renommé ni
    supprimé, sans quoi l'historique des paiements déjà encaissés deviendrait illisible. Une
    prestation retirée de l'offre passe `is_active = False` (I7).
    """

    __tablename__ = "service_price"

    code = Column(String(40), primary_key=True)
    amount = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(3), nullable=False, default="MAD")
    kind = Column(String(20), nullable=False, default="one_off")  # one_off | recurring_monthly
    is_active = Column(Boolean, nullable=False, default=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    updated_by = Column(Integer)

    def to_dict(self, internal: bool = False) -> dict:
        d = {"code": self.code, "amount": float(self.amount), "currency": self.currency,
             "kind": self.kind}
        if internal:
            d["is_active"] = bool(self.is_active)
        return d


class PriceChange(Base):
    """Historique des changements de prix. Écrit dans la MÊME transaction que la mutation : un
    montant modifié sans trace est un montant dont personne ne peut dire d'où il vient (I4).

    `code` vaut le code de prestation, ou `plan:<slug>:monthly` / `plan:<slug>:yearly` pour un
    abonnement — dont le prix reste porté par `subscription_plan`, qui contient bien plus qu'un
    montant (quotas, indicateurs `has_*`).
    """

    __tablename__ = "price_change"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(60), nullable=False, index=True)
    old_amount = Column(Numeric(10, 2))
    new_amount = Column(Numeric(10, 2), nullable=False)
    changed_by = Column(Integer)
    changed_at = Column(DateTime, default=datetime.utcnow, index=True)

    def to_dict(self) -> dict:
        return {"id": self.id, "code": self.code,
                "old_amount": float(self.old_amount) if self.old_amount is not None else None,
                "new_amount": float(self.new_amount), "changed_by": self.changed_by,
                "changed_at": self.changed_at.isoformat() if self.changed_at else None}


class ProcessedMessage(Base):
    __tablename__ = "processed_message"

    message_id = Column(String(64), primary_key=True)
    processed_at = Column(DateTime, default=datetime.utcnow)
