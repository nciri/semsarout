# StayManager.ma Integration Plan for SemsarOut

## Executive Summary

This document outlines a comprehensive API integration between SemsarOut (Real Estate Platform) and StayManager.ma (Property Management System for vacation rentals). The integration enables agencies using SemsarOut to sync their rental properties with StayManager for automated guest management, calendar sync, and smart lock control.

---

## 1. Integration Overview

### 1.1 What is StayManager?

StayManager.ma is a property management platform for short-term rentals (Airbnb, Booking.com, etc.) that provides:

- **Calendar Sync**: iCal integration with booking platforms
- **Guest Verification**: KYC/identity verification via Didit
- **Digital Contracts**: Automated contract generation and e-signatures
- **Smart Lock Management**: TTLock integration for keyless entry
- **Automated Messaging**: SMS templates and scheduled messages
- **Team Management**: Multi-user access with role-based permissions

### 1.2 Integration Goals

1. **Property Sync**: Sync SemsarOut rental properties to StayManager
2. **Reservation Import**: Import StayManager reservations into SemsarOut
3. **Availability Calendar**: Display real-time availability from StayManager
4. **Guest Verification Status**: Show verification status on SemsarOut
5. **Smart Lock Access**: Manage access codes from SemsarOut dashboard

### 1.3 Target Users

- Agencies with **Pro** or **Enterprise** plans on SemsarOut
- Properties listed for **rent** (short-term or vacation rentals)
- Agencies already using or wanting to use StayManager

---

## 2. Technical Architecture

### 2.1 Authentication Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   SemsarOut  │     │   SemsarOut  │     │  StayManager │
│   Frontend   │────▶│   Backend    │────▶│     API      │
└──────────────┘     └──────────────┘     └──────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │   Firebase   │
                     │    Auth      │
                     └──────────────┘
```

**Authentication Strategy:**
1. User connects StayManager account via Firebase (same auth provider)
2. SemsarOut stores StayManager `firebase_uid` linkage
3. API calls made server-to-server with service account or API key
4. Alternative: OAuth2 flow if StayManager implements it

### 2.2 Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     DATA SYNC FLOWS                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  SemsarOut Property ──────▶ StayManager Property             │
│       (one-time push or manual sync)                         │
│                                                              │
│  StayManager Reservations ◀────── SemsarOut (pull/webhook)   │
│       (periodic sync or real-time webhook)                   │
│                                                              │
│  StayManager Calendar ◀────── SemsarOut Availability Widget  │
│       (iCal feed consumption)                                │
│                                                              │
│  StayManager Guest Status ◀────── SemsarOut Dashboard        │
│       (API query on demand)                                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. API Endpoints Mapping

### 3.1 StayManager Endpoints to Use

Based on the codebase analysis:

| StayManager Endpoint | Method | Purpose |
|---------------------|--------|---------|
| `/api/properties` | GET | List user's properties |
| `/api/properties` | POST | Create new property |
| `/api/properties/<id>` | GET | Get property details |
| `/api/properties/<id>` | PUT | Update property |
| `/api/reservations` | GET | List reservations |
| `/api/reservations/<id>` | GET | Get reservation details |
| `/api/guests/<id>` | GET | Get guest info & verification status |
| `/api/calendar/sync/<property_id>` | POST | Trigger calendar sync |
| `/api/smart-locks` | GET | List smart locks |
| `/api/smart-locks/<id>/generate-passcode` | POST | Generate access code |

### 3.2 SemsarOut New Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/integrations/staymanager/connect` | POST | Connect StayManager account |
| `/api/v1/integrations/staymanager/disconnect` | POST | Disconnect account |
| `/api/v1/integrations/staymanager/status` | GET | Get connection status |
| `/api/v1/integrations/staymanager/properties` | GET | List linked properties |
| `/api/v1/integrations/staymanager/properties/<id>/link` | POST | Link SemsarOut property to StayManager |
| `/api/v1/integrations/staymanager/properties/<id>/unlink` | POST | Unlink property |
| `/api/v1/integrations/staymanager/properties/<id>/sync` | POST | Sync property data |
| `/api/v1/integrations/staymanager/reservations` | GET | Get reservations |
| `/api/v1/integrations/staymanager/reservations/<id>` | GET | Get reservation details |
| `/api/v1/integrations/staymanager/calendar/<property_id>` | GET | Get availability calendar |
| `/api/v1/webhooks/staymanager` | POST | Webhook receiver for StayManager events |

---

## 4. Data Models

### 4.1 New SemsarOut Models

#### StayManagerIntegration
```python
class StayManagerIntegration(db.Model):
    """StayManager account connection for agencies."""
    __tablename__ = 'staymanager_integrations'

    id = db.Column(db.Integer, primary_key=True)
    agency_id = db.Column(db.Integer, db.ForeignKey('agencies.id'), nullable=False, unique=True)

    # StayManager connection
    staymanager_user_id = db.Column(db.String(100))  # StayManager firebase_uid
    staymanager_email = db.Column(db.String(255))

    # API credentials (if API key auth)
    api_key_encrypted = db.Column(db.Text)

    # Connection status
    status = db.Column(db.String(20), default='pending')  # pending, connected, disconnected, error
    last_sync_at = db.Column(db.DateTime)
    sync_error = db.Column(db.Text)

    # Settings
    auto_sync_enabled = db.Column(db.Boolean, default=True)
    sync_frequency_hours = db.Column(db.Integer, default=6)
    webhook_secret = db.Column(db.String(100))

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, onupdate=datetime.utcnow)

    # Relationships
    agency = db.relationship('Agency', backref='staymanager_integration')
    property_links = db.relationship('StayManagerPropertyLink', back_populates='integration')
```

#### StayManagerPropertyLink
```python
class StayManagerPropertyLink(db.Model):
    """Links SemsarOut properties to StayManager properties."""
    __tablename__ = 'staymanager_property_links'

    id = db.Column(db.Integer, primary_key=True)
    integration_id = db.Column(db.Integer, db.ForeignKey('staymanager_integrations.id'), nullable=False)

    # SemsarOut property
    property_id = db.Column(db.Integer, db.ForeignKey('properties.id'), nullable=False)

    # StayManager property
    staymanager_property_id = db.Column(db.String(100), nullable=False)  # UUID from StayManager
    staymanager_property_name = db.Column(db.String(255))

    # Sync settings
    sync_reservations = db.Column(db.Boolean, default=True)
    sync_availability = db.Column(db.Boolean, default=True)
    sync_guests = db.Column(db.Boolean, default=True)

    # Sync status
    last_reservation_sync = db.Column(db.DateTime)
    last_availability_sync = db.Column(db.DateTime)

    # iCal URL for availability (from StayManager)
    ical_url = db.Column(db.String(500))

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    integration = db.relationship('StayManagerIntegration', back_populates='property_links')
    property = db.relationship('Property', backref='staymanager_link')
    reservations = db.relationship('StayManagerReservation', back_populates='property_link')
```

#### StayManagerReservation
```python
class StayManagerReservation(db.Model):
    """Cached reservations from StayManager."""
    __tablename__ = 'staymanager_reservations'

    id = db.Column(db.Integer, primary_key=True)
    property_link_id = db.Column(db.Integer, db.ForeignKey('staymanager_property_links.id'), nullable=False)

    # StayManager reservation data
    staymanager_reservation_id = db.Column(db.String(100), nullable=False, unique=True)
    external_id = db.Column(db.String(100))  # Airbnb/Booking.com ID
    platform = db.Column(db.String(50))  # airbnb, booking, vrbo, direct

    # Dates
    check_in = db.Column(db.DateTime, nullable=False)
    check_out = db.Column(db.DateTime, nullable=False)

    # Guest info
    guest_name = db.Column(db.String(255))
    guest_phone = db.Column(db.String(50))
    guest_email = db.Column(db.String(255))
    guest_count = db.Column(db.Integer)

    # Status
    status = db.Column(db.String(20))  # confirmed, cancelled, blocked

    # Guest verification (from StayManager)
    guest_verified = db.Column(db.Boolean, default=False)
    verification_status = db.Column(db.String(20))  # pending, verified, failed

    # Smart lock
    has_access_code = db.Column(db.Boolean, default=False)
    access_code = db.Column(db.String(20))  # Encrypted or masked

    # Contract
    contract_status = db.Column(db.String(20))  # generated, sent, signed

    # Pricing
    total_price = db.Column(db.Numeric(12, 2))
    currency = db.Column(db.String(3), default='MAD')

    # Raw data cache
    raw_data = db.Column(db.JSON)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, onupdate=datetime.utcnow)

    # Relationships
    property_link = db.relationship('StayManagerPropertyLink', back_populates='reservations')
```

---

## 5. Implementation Phases

### Phase 1: Foundation (Week 1-2)

1. **Backend Infrastructure**
   - Create StayManager API client service
   - Implement authentication handling
   - Create database models and migrations
   - Build basic CRUD endpoints

2. **Account Connection**
   - Implement Firebase-based account linking
   - Create connection/disconnection flow
   - Store API credentials securely

### Phase 2: Property Sync (Week 3)

1. **Property Linking**
   - UI to select which properties to sync
   - Two-way property data mapping
   - iCal URL retrieval for availability

2. **Property Push** (Optional)
   - Push SemsarOut property to StayManager
   - Map property fields between systems

### Phase 3: Reservation Sync (Week 4)

1. **Reservation Import**
   - Periodic pull of reservations
   - Webhook integration for real-time updates
   - Guest data sync

2. **Dashboard Display**
   - Show reservations in SemsarOut dashboard
   - Calendar view with availability
   - Guest verification status badges

### Phase 4: Advanced Features (Week 5-6)

1. **Smart Lock Integration**
   - Display access codes
   - Generate codes on demand
   - Access history

2. **Webhooks**
   - Implement webhook receiver
   - Handle reservation events
   - Handle guest verification events

---

## 6. API Client Implementation

### 6.1 StayManager Client Class

```python
# backend/app/services/staymanager_client.py

import requests
from typing import Optional, Dict, List
from flask import current_app
from app.utils.encryption import decrypt_value

class StayManagerClient:
    """API client for StayManager.ma integration."""

    BASE_URL = "https://api.staymanager.ma/api"  # Production
    # BASE_URL = "http://localhost:5000/api"  # Development

    def __init__(self, api_key: str = None, firebase_token: str = None):
        self.api_key = api_key
        self.firebase_token = firebase_token
        self.session = requests.Session()
        self._setup_auth()

    def _setup_auth(self):
        """Configure authentication headers."""
        if self.firebase_token:
            self.session.headers['Authorization'] = f'Bearer {self.firebase_token}'
        elif self.api_key:
            self.session.headers['X-API-Key'] = self.api_key

    def _request(self, method: str, endpoint: str, **kwargs) -> Dict:
        """Make authenticated request to StayManager API."""
        url = f"{self.BASE_URL}{endpoint}"
        response = self.session.request(method, url, **kwargs)
        response.raise_for_status()
        return response.json()

    # Properties
    def get_properties(self) -> List[Dict]:
        """Get all properties for connected user."""
        return self._request('GET', '/properties')

    def get_property(self, property_id: str) -> Dict:
        """Get property details."""
        return self._request('GET', f'/properties/{property_id}')

    def create_property(self, data: Dict) -> Dict:
        """Create new property in StayManager."""
        return self._request('POST', '/properties', json=data)

    # Reservations
    def get_reservations(self, property_id: str = None,
                         start_date: str = None,
                         end_date: str = None) -> List[Dict]:
        """Get reservations with optional filters."""
        params = {}
        if property_id:
            params['property_id'] = property_id
        if start_date:
            params['start_date'] = start_date
        if end_date:
            params['end_date'] = end_date
        return self._request('GET', '/reservations', params=params)

    def get_reservation(self, reservation_id: str) -> Dict:
        """Get reservation details."""
        return self._request('GET', f'/reservations/{reservation_id}')

    # Guests
    def get_guest(self, guest_id: str) -> Dict:
        """Get guest details and verification status."""
        return self._request('GET', f'/guests/{guest_id}')

    # Calendar
    def sync_calendar(self, property_id: str) -> Dict:
        """Trigger calendar sync for property."""
        return self._request('POST', f'/calendar/sync/{property_id}')

    def get_sync_status(self, property_id: str) -> Dict:
        """Get calendar sync status."""
        return self._request('GET', f'/calendar/sync/status/{property_id}')

    # Smart Locks
    def get_smart_locks(self, property_id: str = None) -> List[Dict]:
        """Get smart locks."""
        params = {'property_id': property_id} if property_id else {}
        return self._request('GET', '/smart-locks', params=params)

    def generate_passcode(self, lock_id: str, data: Dict) -> Dict:
        """Generate smart lock passcode."""
        return self._request('POST', f'/smart-locks/{lock_id}/generate-passcode', json=data)

    # User Profile
    def get_profile(self) -> Dict:
        """Get connected user profile."""
        return self._request('GET', '/user/profile')

    # Health Check
    def health_check(self) -> bool:
        """Check if StayManager API is reachable."""
        try:
            self._request('GET', '/health')
            return True
        except:
            return False
```

---

## 7. Frontend Components

### 7.1 New Pages

1. **StayManager Settings** (`/dashboard/integrations/staymanager`)
   - Connect/disconnect account
   - View connection status
   - Configure sync settings

2. **Property Linking** (`/dashboard/integrations/staymanager/properties`)
   - List SemsarOut properties
   - Link/unlink with StayManager properties
   - Sync status per property

3. **Reservations View** (`/dashboard/integrations/staymanager/reservations`)
   - List synced reservations
   - Calendar view
   - Guest verification status

### 7.2 Dashboard Widgets

1. **StayManager Quick Status**
   - Connection status indicator
   - Upcoming reservations count
   - Pending verifications count

2. **Property Availability Widget**
   - Mini calendar with occupancy
   - Link to full calendar

---

## 8. Security Considerations

### 8.1 Data Protection

- Encrypt API keys and tokens at rest
- Use environment variables for sensitive config
- Implement rate limiting on sync endpoints
- Validate webhook signatures

### 8.2 Access Control

- Only agencies with `has_staymanager_sync = True` can access
- Plan-based feature gating (Pro and Enterprise only)
- Property-level permissions for team members

### 8.3 Data Isolation

- Each agency's StayManager data isolated
- No cross-agency data access
- Audit logging for sensitive operations

---

## 9. Subscription Integration

### 9.1 Feature Flag

The `has_staymanager_sync` flag in `SubscriptionPlan` controls access:

| Plan | has_staymanager_sync |
|------|---------------------|
| Starter | False |
| Pro | True |
| Enterprise | True |

### 9.2 Limits

| Plan | Max Linked Properties |
|------|----------------------|
| Pro | 10 |
| Enterprise | Unlimited |

---

## 10. Error Handling

### 10.1 Sync Errors

- Log all sync failures
- Retry with exponential backoff
- Notify user of persistent failures
- Allow manual retry

### 10.2 API Errors

- Handle rate limiting (429)
- Handle authentication failures (401)
- Handle not found (404) gracefully
- Show user-friendly error messages

---

## 11. Webhooks

### 11.1 Events to Handle

| Event | Action |
|-------|--------|
| `reservation.created` | Create local reservation record |
| `reservation.updated` | Update local reservation |
| `reservation.cancelled` | Mark reservation as cancelled |
| `guest.verified` | Update verification status |
| `contract.signed` | Update contract status |
| `property.updated` | Sync property changes |

### 11.2 Webhook Security

- Verify webhook signature using shared secret
- Validate timestamp to prevent replay attacks
- Log all webhook events

---

## 12. Testing Strategy

### 12.1 Unit Tests

- StayManager client methods
- Model serialization
- Webhook signature verification

### 12.2 Integration Tests

- End-to-end sync flows
- Webhook processing
- Error handling

### 12.3 Mock Server

- Create mock StayManager API for testing
- Simulate various response scenarios

---

## 13. Monitoring & Analytics

### 13.1 Metrics to Track

- Sync success/failure rates
- Average sync duration
- Webhook processing time
- API error rates

### 13.2 Alerts

- Sync failures > 3 consecutive
- API authentication failures
- Webhook processing delays

---

## 14. Future Enhancements

1. **Two-way Property Sync**: Push SemsarOut properties to StayManager
2. **Pricing Sync**: Sync dynamic pricing rules
3. **Message Templates**: Share templates between platforms
4. **Analytics Dashboard**: Combined analytics from both platforms
5. **Mobile Notifications**: Push notifications for reservation updates

---

## 15. Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `backend/app/models/staymanager.py` | Integration models |
| `backend/app/services/staymanager_client.py` | API client |
| `backend/app/api/v1/integrations/staymanager.py` | API endpoints |
| `backend/app/utils/staymanager_sync.py` | Sync utilities |
| `backend/migrations/versions/xxx_add_staymanager_integration.py` | Migration |
| `frontend/src/pages/dashboard/integrations/StayManager.jsx` | Settings page |
| `frontend/src/pages/dashboard/integrations/StayManagerProperties.jsx` | Property linking |
| `frontend/src/pages/dashboard/integrations/StayManagerReservations.jsx` | Reservations |

### Modified Files

| File | Changes |
|------|---------|
| `backend/app/models/__init__.py` | Export new models |
| `backend/app/api/v1/__init__.py` | Register new routes |
| `frontend/src/App.jsx` | Add routes |
| `frontend/src/components/layout/Header.jsx` | Add menu items |

---

## 16. Timeline

| Week | Tasks |
|------|-------|
| 1 | Models, migrations, API client |
| 2 | Connection flow, basic endpoints |
| 3 | Property linking, sync logic |
| 4 | Reservation sync, webhooks |
| 5 | Frontend pages, dashboard widgets |
| 6 | Testing, documentation, polish |

---

## Appendix A: StayManager API Reference

See the comprehensive codebase analysis above for full API details.

## Appendix B: Data Mapping

### Property Field Mapping

| SemsarOut Field | StayManager Field |
|----------------|-------------------|
| `title` | `name` |
| `address` | `address` |
| `city` | (extracted from address) |
| `latitude` | `latitude` |
| `longitude` | `longitude` |
| `property_type` | `property_type` |
| (new) `wifi_name` | `wifi_name` |
| (new) `wifi_password` | `wifi_password` |
| (new) `check_in_time` | `check_in_time` |
| (new) `check_out_time` | `check_out_time` |

### Reservation Field Mapping

| SemsarOut Field | StayManager Field |
|----------------|-------------------|
| `staymanager_reservation_id` | `id` |
| `external_id` | `external_id` |
| `platform` | `platform` |
| `check_in` | `check_in` |
| `check_out` | `check_out` |
| `guest_name` | `guest_name_partial` → `guests[0].full_name` |
| `status` | `status` |
