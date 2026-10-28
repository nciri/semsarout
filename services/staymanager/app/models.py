"""Modèles du service staymanager (schéma `staymanager`) — séjours courte durée.

Deux provenances, **une seule table de réservations** : le miroir d'un compte StayManager
externe (`property_link_id`, `staymanager_reservation_id`) et les séjours natifs importés
des calendriers des plateformes (`ical_source_id`). `source` dit laquelle, et les colonnes
propres au miroir sont facultatives — sans quoi une agence sans compte StayManager ne
pourrait avoir aucun séjour.

`PropertyRO` (id/titre/référence) = projection pour le bien imbriqué d'un lien.
"""
from datetime import datetime

from sqlalchemy import (
    JSON, BigInteger, Boolean, Column, Date, DateTime, ForeignKey, Integer, Numeric, String,
    Text,
    UniqueConstraint,
)

from .db import Base


class StayManagerIntegration(Base):
    __tablename__ = "staymanager_integration"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    agency_id = Column(Integer, nullable=False, unique=True, index=True)
    staymanager_user_id = Column(String(100))
    staymanager_email = Column(String(255))
    api_key_encrypted = Column(Text)
    status = Column(String(20), default="pending")
    last_sync_at = Column(DateTime)
    sync_error = Column(Text)
    auto_sync_enabled = Column(Boolean, default=True)
    sync_frequency_hours = Column(Integer, default=6)
    webhook_secret = Column(String(100))
    webhook_url = Column(String(500))
    staymanager_webhook_id = Column(String(100))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class StayManagerPropertyLink(Base):
    __tablename__ = "staymanager_property_link"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    integration_id = Column(BigInteger, ForeignKey("staymanager_integration.id"), nullable=False, index=True)
    property_id = Column(Integer, nullable=False)
    staymanager_property_id = Column(String(100), nullable=False)
    staymanager_property_name = Column(String(255))
    sync_reservations = Column(Boolean, default=True)
    sync_availability = Column(Boolean, default=True)
    sync_guests = Column(Boolean, default=True)
    last_reservation_sync = Column(DateTime)
    last_availability_sync = Column(DateTime)
    sync_status = Column(String(20), default="pending")
    sync_error = Column(Text)
    ical_url = Column(String(500))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class IcalSource(Base):
    """Calendrier d'une plateforme pour un bien : l'URL que l'hôte copie chez Airbnb & co.

    Une plateforme par ligne : un même bien est souvent loué sur deux ou trois canaux, et
    c'est le croisement de leurs calendriers qui révèle les doubles réservations.
    """
    __tablename__ = "ical_source"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    agency_id = Column(Integer, nullable=False, index=True)
    property_id = Column(Integer, nullable=False, index=True)
    platform = Column(String(30), nullable=False)      # airbnb|booking|vrbo|autre
    ical_url = Column(String(1000), nullable=False)
    status = Column(String(20), default="pending")     # pending|ok|error
    last_error = Column(String(255))
    last_synced_at = Column(DateTime)
    reservations_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class StayManagerReservation(Base):
    __tablename__ = "staymanager_reservation"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    # Miroir d'un compte StayManager externe : facultatif pour un séjour natif.
    property_link_id = Column(BigInteger, ForeignKey("staymanager_property_link.id"), index=True)
    staymanager_reservation_id = Column(String(100), unique=True, index=True)
    # Séjour natif : rattaché au bien et à la source qui l'a apporté.
    agency_id = Column(Integer, index=True)
    property_id = Column(Integer, index=True)
    ical_source_id = Column(BigInteger, ForeignKey("ical_source.id"), index=True)
    source = Column(String(20), default="staymanager")  # staymanager|ical|manual
    has_conflict = Column(Boolean, default=False)
    cleaning_fee = Column(Numeric(12, 2))
    external_id = Column(String(100))
    platform = Column(String(50))
    check_in = Column(DateTime, nullable=False, index=True)
    check_out = Column(DateTime, nullable=False, index=True)
    nights = Column(Integer)
    guest_name = Column(String(255))
    guest_phone = Column(String(50))
    guest_email = Column(String(255))
    guest_count = Column(Integer)
    staymanager_guest_id = Column(String(100))
    status = Column(String(20), default="confirmed", index=True)
    guest_verified = Column(Boolean, default=False)
    verification_status = Column(String(20))
    has_access_code = Column(Boolean, default=False)
    access_code_masked = Column(String(20))
    contract_status = Column(String(20))
    total_price = Column(Numeric(12, 2))
    currency = Column(String(10), default="Dh")
    guest_notes = Column(Text)
    special_requests = Column(Text)
    raw_data = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    synced_at = Column(DateTime)


class StayManagerSyncLog(Base):
    __tablename__ = "staymanager_sync_log"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    integration_id = Column(BigInteger, ForeignKey("staymanager_integration.id"), nullable=False, index=True)
    property_link_id = Column(BigInteger)
    sync_type = Column(String(50), nullable=False)
    status = Column(String(20), nullable=False)
    items_synced = Column(Integer, default=0)
    items_created = Column(Integer, default=0)
    items_updated = Column(Integer, default=0)
    items_deleted = Column(Integer, default=0)
    error_message = Column(Text)
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime)
    duration_seconds = Column(Integer)
    trigger = Column(String(20))


class PropertyRO(Base):
    __tablename__ = "property_ro"

    id = Column(BigInteger, primary_key=True)
    agency_id = Column(Integer, index=True)
    title = Column(String(200))
    reference = Column(String(50))

class StayMessageTemplate(Base):
    """Message type d'une agence : ce qu'elle écrit au voyageur, et quand.

    Le texte est brut (pas de HTML) : `notification` l'habille de la charte SemsarOut, et
    l'agence n'a aucune balise à écrire.
    """
    __tablename__ = "stay_message_template"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    agency_id = Column(Integer, nullable=False, index=True)
    # Un gabarit sans bien s'applique à tout le portefeuille ; avec un bien, il le remplace.
    property_id = Column(Integer, index=True)
    name = Column(String(120), nullable=False)
    trigger_event = Column(String(30), nullable=False)   # on_booking|before_check_in|after_check_out
    offset_hours = Column(Integer, default=0)
    subject = Column(String(200), nullable=False)
    body = Column(Text, nullable=False)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class StayMessage(Base):
    """Message préparé pour un séjour : un seul par gabarit et par séjour, d'où l'unicité.

    C'est aussi le registre d'idempotence de l'ordonnanceur : la ligne est créée au moment
    où le message devient dû, puis marquée envoyée ou en échec.
    """
    __tablename__ = "stay_message"
    __table_args__ = (UniqueConstraint("template_id", "reservation_id", name="uq_stay_message"),)

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    agency_id = Column(Integer, nullable=False, index=True)
    template_id = Column(BigInteger, ForeignKey("stay_message_template.id"), nullable=False, index=True)
    reservation_id = Column(BigInteger, ForeignKey("staymanager_reservation.id"), nullable=False, index=True)
    recipient = Column(String(255))
    subject = Column(String(200))
    body = Column(Text)
    status = Column(String(20), default="pending", index=True)  # pending|sent|failed|no_recipient
    error = Column(String(255))
    due_at = Column(DateTime, index=True)
    sent_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)


class CleaningTask(Base):
    """Ménage de rotation d'un séjour : créé au départ du voyageur, pas à la main.

    Distinct d'un ordre de travail artisan (`directory.work_order`, intervention technique
    ponctuelle) : ici c'est la rotation elle-même, générée par le calendrier, confiée à un
    membre de l'équipe et close par un rapport.
    """
    __tablename__ = "cleaning_task"
    __table_args__ = (UniqueConstraint("reservation_id", name="uq_cleaning_task_reservation"),)

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    agency_id = Column(Integer, nullable=False, index=True)
    property_id = Column(Integer, nullable=False, index=True)
    # Nul pour un ménage ajouté à la main (après travaux, avant une visite).
    reservation_id = Column(BigInteger, ForeignKey("staymanager_reservation.id"), index=True)
    assigned_to_id = Column(Integer, index=True)
    scheduled_date = Column(Date, nullable=False, index=True)
    status = Column(String(20), default="pending", index=True)  # pending|in_progress|done|cancelled
    zones_done = Column(JSON, default=list)
    notes = Column(Text)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CleaningReport(Base):
    """Ce que l'agent de ménage remonte : un souci, une demande de produit, une note.

    Les photos vivent dans `CleaningPhoto` (objet-store), pas dans la ligne : un rapport
    sans photo reste lisible, et une photo n'est jamais servie avec son type d'origine.
    """
    __tablename__ = "cleaning_report"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    task_id = Column(BigInteger, ForeignKey("cleaning_task.id"), nullable=False, index=True)
    author_user_id = Column(Integer)
    kind = Column(String(20), nullable=False)   # issue|stock|note
    category = Column(String(40))
    text_note = Column(Text)
    is_urgent = Column(Boolean, default=False)
    seen_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)


class CleaningPhoto(Base):
    __tablename__ = "cleaning_photo"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    report_id = Column(BigInteger, ForeignKey("cleaning_report.id"), nullable=False, index=True)
    file_key = Column(String(255), nullable=False)
    content_type = Column(String(100))
    filename = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)


class StayCheckinLink(Base):
    """Lien d'enregistrement envoyé au voyageur : il déclare son groupe et dépose sa pièce.

    Le jeton n'est stocké que **haché** : une fuite de la base ne doit pas ouvrir les
    dossiers d'identité des voyageurs. L'URL complète n'existe qu'une fois, au moment où
    l'agence la crée.
    """
    __tablename__ = "stay_checkin_link"
    __table_args__ = (UniqueConstraint("reservation_id", name="uq_checkin_link_reservation"),)

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    agency_id = Column(Integer, nullable=False, index=True)
    reservation_id = Column(BigInteger, ForeignKey("staymanager_reservation.id"), nullable=False, index=True)
    token_hash = Column(String(64), nullable=False, unique=True, index=True)
    status = Column(String(20), default="sent")        # sent|submitted|expired
    expires_at = Column(DateTime, nullable=False)
    submitted_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)


class StayGuest(Base):
    """Un occupant déclaré : le voyageur principal et ses accompagnants.

    L'occupation réelle est une obligation d'hébergeur (fiche de police au Maroc) : un
    séjour à quatre dont un seul nom est connu n'est pas déclarable.
    """
    __tablename__ = "stay_guest"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    reservation_id = Column(BigInteger, ForeignKey("staymanager_reservation.id"), nullable=False, index=True)
    full_name = Column(String(200), nullable=False)
    is_lead = Column(Boolean, default=False)
    birth_date = Column(Date)
    nationality = Column(String(60))
    document_type = Column(String(20))                  # cin|passeport|titre_sejour
    document_number = Column(String(60))
    status = Column(String(20), default="declared")     # declared|validated|rejected
    review_note = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)


class StayGuestDocument(Base):
    __tablename__ = "stay_guest_document"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    guest_id = Column(BigInteger, ForeignKey("stay_guest.id"), nullable=False, index=True)
    file_key = Column(String(255), nullable=False)
    content_type = Column(String(100))
    filename = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)
