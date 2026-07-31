"""Modèles du service rental (schéma `rental`) — gestion locative.

Personnes (locataire/propriétaire) = crm.Client, référencés par client_id ; l'email est résolu
par le service notification via crm /internal/client/{id}. PropertyRO (titre/ville) est une
projection locale maintenue par listing.* ; ClientRO (nom) sert l'affichage back-office.
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, Numeric, String, Text, UniqueConstraint

from .db import Base


class Mandate(Base):
    __tablename__ = "mandate"

    id = Column(Integer, primary_key=True, autoincrement=True)
    reference = Column(String(30), unique=True, nullable=False, index=True)
    agency_id = Column(Integer, index=True, nullable=False)
    property_id = Column(Integer, index=True, nullable=False)
    landlord_client_id = Column(Integer, index=True, nullable=False)
    mandate_type = Column(String(20), default="gestion")     # gestion | location
    fee_percent = Column(Numeric(5, 2))
    landlord_iban = Column(String(34))                        # chiffré au repos en cible (pgcrypto)
    start_date = Column(DateTime)
    end_date = Column(DateTime)
    status = Column(String(20), default="draft")             # draft|active|expired|terminated
    signed_at = Column(DateTime)
    signed_pdf_key = Column(String(255))
    expiry_notice_sent_at = Column(DateTime)                 # avis d'échéance (anti-doublon)
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Lease(Base):
    __tablename__ = "lease"

    id = Column(Integer, primary_key=True, autoincrement=True)
    reference = Column(String(30), unique=True, nullable=False, index=True)
    mandate_id = Column(Integer, index=True)                  # absent pour un bail particulier
    property_id = Column(Integer, index=True, nullable=False)
    tenant_client_id = Column(Integer, index=True)            # absent pour un bail particulier (voir tenant_user_id)
    agency_id = Column(Integer, index=True)                   # absent pour un bail particulier
    owner_id = Column(Integer, index=True)       # bail de particulier (sans agence)
    tenant_user_id = Column(Integer)             # locataire = utilisateur (pas un crm.Client)
    rent_amount = Column(Numeric(12, 2))
    charges_amount = Column(Numeric(12, 2), default=0)
    deposit_amount = Column(Numeric(12, 2), default=0)
    deposit_returned_at = Column(DateTime)
    deposit_return_amount = Column(Numeric(12, 2))
    payment_day = Column(Integer, default=1)                 # jour d'échéance (1-28)
    start_date = Column(DateTime)
    end_date = Column(DateTime)
    irl_index_ref = Column(String(40))                       # indice de référence (révision)
    last_revision_at = Column(DateTime)
    revision_notice_sent_at = Column(DateTime)               # avis de révision (anti-doublon)
    status = Column(String(20), default="draft")             # draft|active|ended|terminated
    signed_at = Column(DateTime)
    signed_pdf_key = Column(String(255))
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class RentPeriod(Base):
    __tablename__ = "rent_period"
    __table_args__ = (UniqueConstraint("lease_id", "year", "month", name="uq_rent_period_lease_ym"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    lease_id = Column(Integer, index=True, nullable=False)
    agency_id = Column(Integer, index=True, nullable=False)   # dénormalisé (cloisonnement)
    period_label = Column(String(40))                         # ex "Août 2026"
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    rent_amount = Column(Numeric(12, 2), nullable=False)
    charges_amount = Column(Numeric(12, 2), default=0)
    total_amount = Column(Numeric(12, 2), nullable=False)
    due_date = Column(DateTime)
    status = Column(String(20), default="pending")            # pending|paid|partial|late
    paid_amount = Column(Numeric(12, 2))
    paid_at = Column(DateTime)
    payment_method = Column(String(20))                       # virement|cheque|especes|carte
    receipt_number = Column(String(30), unique=True)          # n° de quittance (à l'encaissement)
    reminder_count = Column(Integer, default=0)               # relance loyer impayé (dunning)
    last_reminder_at = Column(DateTime)
    payout_sent_at = Column(DateTime)                         # avis de virement propriétaire
    created_at = Column(DateTime, default=datetime.utcnow)


class CrgReport(Base):
    __tablename__ = "crg_report"
    __table_args__ = (UniqueConstraint("mandate_id", "year", "month", name="uq_crg_mandate_ym"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    mandate_id = Column(Integer, index=True, nullable=False)
    agency_id = Column(Integer, index=True, nullable=False)
    period_label = Column(String(40))
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    rent_collected = Column(Numeric(12, 2), default=0)
    fees = Column(Numeric(12, 2), default=0)
    net = Column(Numeric(12, 2), default=0)
    sent_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)


class ChargeRegularization(Base):
    __tablename__ = "charge_regularization"

    id = Column(Integer, primary_key=True, autoincrement=True)
    lease_id = Column(Integer, index=True, nullable=False)
    agency_id = Column(Integer, index=True, nullable=False)
    year = Column(Integer, nullable=False)
    provisions_total = Column(Numeric(12, 2), default=0)   # charges provisionnées encaissées
    actual_total = Column(Numeric(12, 2), default=0)       # charges réelles (saisie agence)
    balance = Column(Numeric(12, 2), default=0)            # +=dû par locataire / -=à rembourser
    status = Column(String(20), default="draft")           # draft|sent|settled
    statement_sent_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)


class Inventory(Base):
    __tablename__ = "inventory"
    __table_args__ = (UniqueConstraint("lease_id", "type", name="uq_inventory_lease_type"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    lease_id = Column(Integer, index=True, nullable=False)
    agency_id = Column(Integer, index=True, nullable=False)
    type = Column(String(10), nullable=False)                 # entree | sortie
    status = Column(String(20), default="draft")              # draft | finalized | signed
    general_notes = Column(Text)
    conducted_at = Column(DateTime)
    conducted_by_id = Column(Integer)
    finalized_at = Column(DateTime)
    signed_at = Column(DateTime)
    pdf_key = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class InventoryRoom(Base):
    __tablename__ = "inventory_room"
    id = Column(Integer, primary_key=True, autoincrement=True)
    inventory_id = Column(Integer, index=True, nullable=False)
    name = Column(String(80), nullable=False)
    position = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class InventoryItem(Base):
    __tablename__ = "inventory_item"
    id = Column(Integer, primary_key=True, autoincrement=True)
    room_id = Column(Integer, index=True, nullable=False)
    label = Column(String(80), nullable=False)
    condition = Column(String(10), default="bon")             # bon | moyen | mauvais
    comment = Column(Text)
    position = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class InventoryPhoto(Base):
    __tablename__ = "inventory_photo"
    id = Column(Integer, primary_key=True, autoincrement=True)
    item_id = Column(Integer, index=True, nullable=False)
    file_key = Column(String(255))
    filename = Column(String(255))
    content_type = Column(String(100))
    created_at = Column(DateTime, default=datetime.utcnow)


class DepositSettlement(Base):
    __tablename__ = "deposit_settlement"
    __table_args__ = (UniqueConstraint("lease_id", name="uq_settlement_lease"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    lease_id = Column(Integer, index=True, nullable=False)
    agency_id = Column(Integer, index=True, nullable=False)
    deposit_amount = Column(Numeric(12, 2), default=0)        # snapshot caution au décompte
    total_deductions = Column(Numeric(12, 2), default=0)
    refunded_amount = Column(Numeric(12, 2), default=0)
    balance_due = Column(Numeric(12, 2), default=0)           # solde à réclamer (dégâts > caution)
    status = Column(String(20), default="draft")             # draft | finalized
    finalized_at = Column(DateTime)
    sent_at = Column(DateTime)
    signed_at = Column(DateTime)
    signed_pdf_key = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class DeductionLine(Base):
    __tablename__ = "deduction_line"
    id = Column(Integer, primary_key=True, autoincrement=True)
    settlement_id = Column(Integer, index=True, nullable=False)
    label = Column(String(160), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    item_id = Column(Integer)                                 # rattachement facultatif à un élément dégradé
    created_at = Column(DateTime, default=datetime.utcnow)


class PropertyRO(Base):
    """Projection locale du bien (via listing.*) : property_title / property_city."""
    __tablename__ = "property_ro"

    id = Column(Integer, primary_key=True)
    title = Column(String(200))
    city = Column(String(100))


class ClientRO(Base):
    """Projection locale du client (nom) pour l'affichage back-office."""
    __tablename__ = "client_ro"

    id = Column(Integer, primary_key=True)
    first_name = Column(String(50))
    last_name = Column(String(50))
    email = Column(String(120))
    client_type = Column(String(20))


class TenantApplication(Base):
    __tablename__ = "tenant_application"

    id = Column(Integer, primary_key=True, autoincrement=True)
    property_id = Column(Integer, index=True, nullable=False)
    agency_id = Column(Integer, index=True)                 # agence du bien (aiguillage)
    owner_id = Column(Integer, index=True)                  # bien de particulier
    applicant_user_id = Column(Integer, index=True, nullable=True)  # uid JWT (propriété candidat)
    submitted_by_agent_id = Column(Integer, index=True)      # user agence ayant déposé pour un client
    client_id = Column(Integer, index=True)                  # crm.Client (dossier déposé par l'agence)
    applicant_name = Column(String(150))
    applicant_email = Column(String(120))
    applicant_phone = Column(String(30))
    monthly_income = Column(Numeric(12, 2))
    guarantor_name = Column(String(150))
    guarantor_income = Column(Numeric(12, 2))
    status = Column(String(20), default="received")         # received|reviewing|shortlist|accepted|rejected|withdrawn
    submitted_at = Column(DateTime, default=datetime.utcnow)
    decided_at = Column(DateTime)
    decision_reason = Column(String(255))
    ack_sent_at = Column(DateTime)
    missing_docs_reminder_sent_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ApplicationDocument(Base):
    __tablename__ = "application_document"

    id = Column(Integer, primary_key=True, autoincrement=True)
    application_id = Column(Integer, index=True, nullable=False)
    doc_type = Column(String(40))                           # cin|bulletin_salaire|contrat_travail|avis_impot|garant_*
    status = Column(String(20), default="received")         # received|validated|rejected
    file_key = Column(String(255))
    filename = Column(String(255))
    content_type = Column(String(100))
    created_at = Column(DateTime, default=datetime.utcnow)


class ProcessedMessage(Base):
    __tablename__ = "processed_message"

    message_id = Column(String(64), primary_key=True)
    processed_at = Column(DateTime, default=datetime.utcnow)


class SignatureRequest(Base):
    """Demande de signature électronique (3a9dSign) pour un document rental (EDL/décompte/bail/mandat)."""
    __tablename__ = "signature_request"
    __table_args__ = (UniqueConstraint("doc_type", "doc_ref_id", name="uq_signature_doc"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    doc_type = Column(String(20), nullable=False)            # inventory|settlement|lease|mandate
    doc_ref_id = Column(Integer, nullable=False)
    agency_id = Column(Integer, index=True, nullable=False)
    envelope_id = Column(String(64))
    document_id = Column(String(64))
    status = Column(String(20), default="pending")           # pending|sent|in_progress|completed|declined|voided|expired
    signed_pdf_key = Column(String(255))
    signers = Column(Text)                                    # JSON [{name,email,order}]
    error = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
