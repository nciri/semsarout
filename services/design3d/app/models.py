"""Modèles du domaine design3d (schéma `design3d`) — projets de conception, niveaux, étagère.

Les identifiants projet/niveau sont fournis par le client (UUID hex) : un projet créé
hors-ligne garde son id à la synchronisation. La géométrie est un document JSON par niveau,
en MÈTRES (origine haut-gauche, y vers le bas) — la 3D et les meubles en dépendent.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, BigInteger, Boolean, Column, DateTime, ForeignKey, Index, Integer, Numeric, String
from sqlalchemy.orm import relationship

from .db import Base

ROOM_TYPES = {"living", "bedroom", "kitchen", "bathroom", "wc", "hallway", "balcony", "garage", "other"}
OPENING_TYPES = {"door", "window"}
TARGET_TYPES = {"property", "program_lot"}
PROJECT_STATUSES = {"draft", "ready"}
EMPTY_GEOMETRY = {"walls": [], "rooms": [], "openings": []}


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(d):
    return d.isoformat() if d else None


class DesignProject(Base):
    __tablename__ = "design_project"
    __table_args__ = (Index("ix_design_project_target", "target_type", "target_id"),)

    id = Column(String(32), primary_key=True, default=_uuid)
    tenant = Column(String(30), nullable=False, default="semsar", server_default="semsar")
    agency_id = Column(Integer, nullable=True, index=True)
    owner_id = Column(Integer, nullable=False, index=True)  # le propriétaire du projet : ses changements priment
    target_type = Column(String(20), nullable=False)
    target_id = Column(BigInteger, nullable=False)
    title = Column(String(200), nullable=False)
    status = Column(String(10), nullable=False, default="draft", server_default="draft")
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)

    levels = relationship("DesignLevel", cascade="all, delete-orphan", back_populates="project")

    def to_dict(self, levels: list | None = None, public: bool = False) -> dict:
        d = {"id": self.id, "target_type": self.target_type, "target_id": self.target_id, "title": self.title,
             "status": self.status, "created_at": _iso(self.created_at), "updated_at": _iso(self.updated_at)}
        if not public:
            d.update(tenant=self.tenant, agency_id=self.agency_id, owner_id=self.owner_id)
        if levels is not None:
            d["levels"] = [lv.to_dict() for lv in levels]
        return d


class DesignLevel(Base):
    __tablename__ = "design_level"

    id = Column(String(32), primary_key=True, default=_uuid)
    project_id = Column(String(32), ForeignKey("design_project.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(60), nullable=False)
    position = Column(Integer, nullable=False, default=0)
    background_image_key = Column(String(255))
    show_background_public = Column(Boolean, nullable=False, default=False, server_default="false")
    calibration = Column(JSON)  # {"p1": {x,y}, "p2": {x,y}, "meters": float} — p1/p2 normalisés 0-1
    wall_height_m = Column(Numeric(4, 2), nullable=False, default=2.70, server_default="2.70")
    geometry = Column(JSON, nullable=False, default=lambda: dict(EMPTY_GEOMETRY))
    revision = Column(Integer, nullable=False, default=0, server_default="0")
    revision_author_id = Column(Integer)
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)

    project = relationship("DesignProject", back_populates="levels")
    shelf = relationship("DesignLevelShelf", cascade="all, delete-orphan")

    def to_dict(self, public: bool = False) -> dict:
        d = {"id": self.id, "project_id": self.project_id, "name": self.name, "position": self.position,
             "calibration": self.calibration, "wall_height_m": float(self.wall_height_m),
             "geometry": self.geometry or dict(EMPTY_GEOMETRY), "revision": self.revision,
             "show_background_public": self.show_background_public, "updated_at": _iso(self.updated_at)}
        if not public or self.show_background_public:
            d["background_image_key"] = self.background_image_key
        if not public:
            d["revision_author_id"] = self.revision_author_id
        return d


class DesignLevelShelf(Base):
    """Version « mise de côté » d'un niveau : le travail d'un collègue déplacé par le propriétaire
    (ou refusé par 409), conservé pour que le propriétaire puisse le récupérer. Une seule entrée
    non revue par (level_id, author_id)."""
    __tablename__ = "design_level_shelf"

    id = Column(String(32), primary_key=True, default=_uuid)
    level_id = Column(String(32), ForeignKey("design_level.id", ondelete="CASCADE"), nullable=False, index=True)
    author_id = Column(Integer, nullable=False)
    geometry = Column(JSON, nullable=False)
    calibration = Column(JSON)
    wall_height_m = Column(Numeric(4, 2), nullable=False)
    base_revision = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)
    reviewed_at = Column(DateTime(timezone=True))

    def to_dict(self) -> dict:
        return {"id": self.id, "level_id": self.level_id, "author_id": self.author_id,
                "geometry": self.geometry, "calibration": self.calibration,
                "wall_height_m": float(self.wall_height_m), "base_revision": self.base_revision,
                "created_at": _iso(self.created_at), "reviewed_at": _iso(self.reviewed_at)}
