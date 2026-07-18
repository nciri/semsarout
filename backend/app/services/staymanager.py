"""
StayManager.ma Partner API Client Service (API v1)

Implements the contract documented in `docs/api/partner-api-v1.md` (staymanager.ma
repo) for server-to-server integration with an agency's StayManager account:
- Property sync
- Reservation import
- Guest verification (KYC) status
- Calendar / availability sync
- Smart lock management
- Webhook subscription management

Authentication is a single `X-API-Key` header — StayManager does not support any
other auth scheme for this API. Keys are scoped (see `StayManagerError.required_scopes`
on 403 responses); a key missing a required scope gets `403 missing_scope`.
"""

import requests
import hmac
import hashlib
from typing import Dict, List, Optional
from flask import current_app


class StayManagerError(Exception):
    """Exception for StayManager API errors."""

    def __init__(self, message: str, status_code: int = None, error_code: str = None,
                 required_scopes: List[str] = None, response: Dict = None):
        super().__init__(message)
        self.status_code = status_code
        self.error_code = error_code
        self.required_scopes = required_scopes
        self.response = response


class StayManagerClient:
    """API client for the StayManager.ma Partner API v1."""

    DEFAULT_TIMEOUT = 10  # StayManager's own webhook delivery timeout is 5s; be generous but bounded

    def __init__(self, api_key: str):
        """
        Initialize StayManager client.

        Args:
            api_key: StayManager Partner API key (`sk_live_...`), created by the
                agency itself from StayManager > Intégrations & API.
        """
        if not api_key:
            raise ValueError('api_key is required')

        self.base_url = current_app.config.get(
            'STAYMANAGER_API_URL',
            'https://staymanager.ma/api/v1'
        )
        self.api_key = api_key
        self.session = requests.Session()
        self.session.headers['Content-Type'] = 'application/json'
        self.session.headers['Accept'] = 'application/json'
        self.session.headers['X-API-Key'] = api_key

    def _request(self, method: str, endpoint: str, **kwargs) -> Dict:
        """
        Make an authenticated request to the StayManager Partner API.

        Args:
            method: HTTP method (GET, POST, PUT, DELETE)
            endpoint: API endpoint path (e.g. '/properties')
            **kwargs: Additional request arguments (json=, params=, ...)

        Returns:
            Parsed JSON response

        Raises:
            StayManagerError: On API errors
        """
        url = f"{self.base_url}{endpoint}"
        timeout = kwargs.pop('timeout', self.DEFAULT_TIMEOUT)

        try:
            response = self.session.request(method, url, timeout=timeout, **kwargs)
        except requests.exceptions.Timeout:
            raise StayManagerError("Delai depasse. StayManager est peut-etre indisponible.")
        except requests.exceptions.ConnectionError:
            raise StayManagerError("Impossible de contacter StayManager. Verifiez la connexion.")

        # Empty/no-content responses (e.g. DELETE)
        if response.status_code == 204 or not response.content:
            if response.ok:
                return {}

        try:
            body = response.json()
        except ValueError:
            body = {}

        if response.ok:
            return body

        error_code = body.get('error')

        if response.status_code == 401:
            message = (
                "Cle API StayManager invalide ou revoquee."
                if error_code == 'invalid_api_key'
                else "Le compte StayManager de l'agence est suspendu."
                if error_code == 'account_suspended'
                else "Authentification StayManager echouee."
            )
            raise StayManagerError(message, status_code=401, error_code=error_code, response=body)

        if response.status_code == 403 and error_code == 'missing_scope':
            required = body.get('required', [])
            scopes = ', '.join(required) if required else 'inconnu'
            raise StayManagerError(
                f"Cle API StayManager sans les droits necessaires (scope requis : {scopes}).",
                status_code=403, error_code=error_code, required_scopes=required, response=body
            )

        if response.status_code == 404:
            raise StayManagerError(
                "Ressource introuvable sur StayManager.",
                status_code=404, error_code=error_code or 'not_found', response=body
            )

        message = error_code or body.get('message') or f'HTTP {response.status_code}'
        raise StayManagerError(
            f"Erreur StayManager: {message}",
            status_code=response.status_code, error_code=error_code, response=body
        )

    # ========== Authentication & Profile ==========

    def get_profile(self) -> Dict:
        """Get connected user profile from StayManager."""
        return self._request('GET', '/user/profile')

    def verify_connection(self) -> bool:
        """Verify API connection is working."""
        try:
            self._request('GET', '/health')
            return True
        except StayManagerError:
            return False

    # ========== Properties ==========

    def get_properties(self) -> List[Dict]:
        """
        Get all properties for connected user.

        Returns:
            List of property dictionaries
        """
        response = self._request('GET', '/properties')
        return response.get('properties', response) if isinstance(response, dict) else response

    def get_property(self, property_id: str) -> Dict:
        """
        Get property details.

        Args:
            property_id: StayManager property UUID

        Returns:
            Property details dictionary
        """
        return self._request('GET', f'/properties/{property_id}')

    def create_property(self, data: Dict) -> Dict:
        """
        Create new property in StayManager.

        Args:
            data: Property data including name, address, etc.

        Returns:
            Created property details
        """
        return self._request('POST', '/properties', json=data)

    def update_property(self, property_id: str, data: Dict) -> Dict:
        """
        Update existing property.

        Args:
            property_id: StayManager property UUID
            data: Updated property data

        Returns:
            Updated property details
        """
        return self._request('PUT', f'/properties/{property_id}', json=data)

    def delete_property(self, property_id: str) -> Dict:
        """
        Delete property from StayManager.

        Args:
            property_id: StayManager property UUID
        """
        return self._request('DELETE', f'/properties/{property_id}')

    # ========== Reservations ==========

    def get_reservations(
        self,
        property_id: str = None,
        start_date: str = None,
        end_date: str = None,
        status: str = None,
        page: int = 1,
        per_page: int = 50
    ) -> Dict:
        """
        Get reservations with optional filters (envelope: {"reservations": [...]}
        plus pagination info).

        Args:
            property_id: Filter by property UUID
            start_date: Filter by check-in/out overlap, ISO 8601 (not YYYY-MM-DD)
            end_date: Filter by check-in/out overlap, ISO 8601 (not YYYY-MM-DD)
            status: Filter by status (confirmed, cancelled, blocked, pending)
            page: Page number for pagination
            per_page: Results per page (server default 50, max 100)

        Returns:
            Raw response dict — caller should read response['reservations']
        """
        params = {'page': page, 'per_page': min(per_page, 100)}

        if property_id:
            params['property_id'] = property_id
        if start_date:
            params['start_date'] = start_date
        if end_date:
            params['end_date'] = end_date
        if status:
            params['status'] = status

        return self._request('GET', '/reservations', params=params)

    def get_reservation(self, reservation_id: str) -> Dict:
        """
        Get reservation details.

        Args:
            reservation_id: StayManager reservation UUID

        Returns:
            Reservation dict (unwrapped from the {"reservation": {...}} envelope)
        """
        response = self._request('GET', f'/reservations/{reservation_id}')
        return response.get('reservation', response) if isinstance(response, dict) else response

    def create_reservation(self, data: Dict) -> Dict:
        """
        Create new reservation (direct booking).

        Args:
            data: Reservation data

        Returns:
            Created reservation details
        """
        return self._request('POST', '/reservations', json=data)

    def update_reservation(self, reservation_id: str, data: Dict) -> Dict:
        """
        Update reservation.

        Args:
            reservation_id: StayManager reservation UUID
            data: Updated reservation data
        """
        return self._request('PUT', f'/reservations/{reservation_id}', json=data)

    def cancel_reservation(self, reservation_id: str, reason: str = None) -> Dict:
        """
        Cancel a reservation.

        Args:
            reservation_id: StayManager reservation UUID
            reason: Cancellation reason
        """
        data = {'reason': reason} if reason else {}
        return self._request('POST', f'/reservations/{reservation_id}/cancel', json=data)

    # ========== Guests ==========

    def get_guest(self, guest_id: str) -> Dict:
        """
        Get guest details and verification status.

        Args:
            guest_id: StayManager guest UUID

        Returns:
            Guest details including verification status
        """
        return self._request('GET', f'/guests/{guest_id}')

    def get_guest_verification_status(self, guest_id: str) -> Dict:
        """
        Get guest KYC verification status.

        Args:
            guest_id: StayManager guest UUID

        Returns:
            Verification status details
        """
        return self._request('GET', f'/guests/{guest_id}/verification')

    # ========== Calendar ==========
    # Note: there is no server-triggered "sync calendar" endpoint in the Partner
    # API — StayManager's iCal sync with Airbnb/Booking runs on its own schedule
    # and pushes reservation.* webhooks when it detects changes (see section 6/7
    # of docs/api/partner-api-v1.md). We only ever read availability/ical here.

    def get_availability(self, property_id: str, start_date: str, end_date: str) -> Dict:
        """
        Get property availability for date range [start_date, end_date).

        Args:
            property_id: StayManager property UUID
            start_date: Start date (YYYY-MM-DD)
            end_date: End date (YYYY-MM-DD)

        Returns:
            Availability data (booked/available periods)
        """
        params = {'start_date': start_date, 'end_date': end_date}
        return self._request('GET', f'/properties/{property_id}/availability', params=params)

    def get_ical_url(self, property_id: str) -> str:
        """
        Get iCal URL for property calendar.

        Args:
            property_id: StayManager property UUID

        Returns:
            iCal feed URL
        """
        response = self._request('GET', f'/properties/{property_id}/ical')
        return response.get('ical_url')

    # ========== Smart Locks ==========

    def get_smart_locks(self, property_id: str = None) -> List[Dict]:
        """
        Get smart locks.

        Args:
            property_id: Optional filter by property

        Returns:
            List of smart lock details
        """
        params = {'property_id': property_id} if property_id else {}
        response = self._request('GET', '/smart-locks', params=params)
        return response.get('locks', response) if isinstance(response, dict) else response

    def get_smart_lock(self, lock_id: str) -> Dict:
        """
        Get smart lock details.

        Args:
            lock_id: StayManager lock ID

        Returns:
            Lock details including status
        """
        return self._request('GET', f'/smart-locks/{lock_id}')

    def generate_passcode(self, lock_id: str, start_date, end_date) -> Dict:
        """
        Generate a temporary smart lock passcode.

        Args:
            lock_id: StayManager lock ID
            start_date: When the passcode becomes valid (datetime, sent as ISO 8601)
            end_date: When the passcode expires (datetime, sent as ISO 8601)

        Returns:
            Generated passcode details
        """
        data = {
            'start_date': start_date.isoformat() if hasattr(start_date, 'isoformat') else start_date,
            'end_date': end_date.isoformat() if hasattr(end_date, 'isoformat') else end_date
        }
        return self._request('POST', f'/smart-locks/{lock_id}/generate-passcode', json=data)

    def delete_passcode(self, lock_id: str, passcode_id: str) -> Dict:
        """
        Delete a smart lock passcode.

        Args:
            lock_id: StayManager lock ID
            passcode_id: Passcode ID to delete
        """
        return self._request('DELETE', f'/smart-locks/{lock_id}/passcodes/{passcode_id}')

    # ========== Contracts ==========

    def get_contract(self, reservation_id: str) -> Dict:
        """
        Get contract for a reservation.

        Args:
            reservation_id: Reservation UUID

        Returns:
            Contract details and status
        """
        return self._request('GET', f'/reservations/{reservation_id}/contract')

    def send_contract(self, reservation_id: str) -> Dict:
        """
        Send contract to guest for signing.

        Args:
            reservation_id: Reservation UUID
        """
        return self._request('POST', f'/reservations/{reservation_id}/contract/send')

    # ========== Messaging ==========

    def send_message(self, reservation_id: str, message: str) -> Dict:
        """
        Send a free-form SMS to the reservation's primary guest.

        Args:
            reservation_id: Reservation UUID
            message: SMS body (required)
        """
        return self._request('POST', f'/reservations/{reservation_id}/message', json={'message': message})

    # ========== Webhooks ==========

    def register_webhook(self, url: str, secret: str, events: List[str]) -> Dict:
        """
        Register a webhook subscription (scope `webhooks:manage`).

        Args:
            url: Public https:// callback URL (must resolve to a public IP)
            secret: Our own webhook secret; StayManager stores it as-is and uses
                it to sign every delivery (HMAC-SHA256 over the raw body). It is
                never echoed back in any response — keep the value we generated.
            events: Subset of ['reservation.created', 'reservation.updated',
                'reservation.cancelled', 'guest.verified', 'property.updated']

        Returns:
            The created webhook dict (id, url, events, active, ...) — no secret.
        """
        data = {'url': url, 'secret': secret, 'events': events}
        response = self._request('POST', '/webhooks', json=data)
        return response.get('webhook', response) if isinstance(response, dict) else response

    def list_webhooks(self) -> List[Dict]:
        """List this agency's webhook subscriptions."""
        response = self._request('GET', '/webhooks')
        return response.get('webhooks', response) if isinstance(response, dict) else response

    def delete_webhook(self, webhook_id: str) -> Dict:
        """Delete a webhook subscription."""
        return self._request('DELETE', f'/webhooks/{webhook_id}')

    # ========== Webhook Utilities ==========

    @staticmethod
    def verify_webhook_signature(payload: bytes, signature: str, secret: str) -> bool:
        """
        Verify webhook signature from StayManager.

        Args:
            payload: Raw request body
            signature: X-Signature header value
            secret: Webhook secret

        Returns:
            True if signature is valid
        """
        expected = hmac.new(
            secret.encode(),
            payload,
            hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(expected, signature)


# Keep backwards compatibility with old class name
StayManagerService = StayManagerClient
