from app.models.user import User
from app.models.agency import Agency
from app.models.property import Property, PropertyImage, PropertyDocument
from app.models.subscription import Subscription, SubscriptionPlan, PaymentMethod, Invoice
from app.models.lead import Lead
from app.models.role import Role, Permission, ActivityLog, user_roles, role_permissions
from app.models.client import Client, ClientInteraction
from app.models.visit import Visit, CalendarEvent, AgentAvailability
from app.models.transaction import Transaction, Offer, TransactionDocument, SALE_STAGES, RENT_STAGES
from app.models.program import (
    Program, ProgramUnit, ProgramImage, ProgramUnitImage,
    ProgramPlan, ProgramLot, LOT_STATUSES
)
from app.models.buyer import SavedSearch, Favorite, BuyerMessage, MessageReply, PropertyEstimate
from app.models.market import NeighborhoodPriceRef
from app.models.staymanager import (
    StayManagerIntegration,
    StayManagerPropertyLink,
    StayManagerReservation,
    StayManagerSyncLog
)
from app.models.team import Team
from app.models.invitation import Invitation
from app.models.contract import ContractTemplate, Contract
from app.models.legal import Notary, LegalCase, LegalTask
from app.models.artisan import Artisan, WorkOrder
from app.models.shop import Product, Cart, CartItem, Order, OrderItem
from app.models.outbox import OutboxEvent  # émission v2 (désactivée par défaut, cf. module)

__all__ = [
    'User',
    'Agency',
    'Property',
    'PropertyImage',
    'PropertyDocument',
    'Subscription',
    'SubscriptionPlan',
    'PaymentMethod',
    'Invoice',
    'Lead',
    'Role',
    'Permission',
    'ActivityLog',
    'user_roles',
    'role_permissions',
    'Client',
    'ClientInteraction',
    'Visit',
    'CalendarEvent',
    'AgentAvailability',
    'Transaction',
    'Offer',
    'TransactionDocument',
    'SALE_STAGES',
    'RENT_STAGES',
    'Program',
    'ProgramUnit',
    'ProgramImage',
    'ProgramUnitImage',
    'ProgramPlan',
    'ProgramLot',
    'LOT_STATUSES',
    'SavedSearch',
    'Favorite',
    'BuyerMessage',
    'MessageReply',
    'PropertyEstimate',
    'NeighborhoodPriceRef',
    'StayManagerIntegration',
    'StayManagerPropertyLink',
    'StayManagerReservation',
    'StayManagerSyncLog',
    'Team',
    'Invitation',
    'ContractTemplate',
    'Contract',
    'Notary',
    'LegalCase',
    'LegalTask',
    'Artisan',
    'WorkOrder',
    'Product',
    'Cart',
    'CartItem',
    'Order',
    'OrderItem'
]
