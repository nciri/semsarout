"""
StayManager.ma API Client Service

This service provides integration with StayManager.ma property management platform
for vacation rentals. It supports:
- Property sync
- Reservation import
- Guest verification status
- Calendar sync
- Smart lock management
"""

import requests
import hmac
import hashlib
from datetime import datetime
from typing import Optional, Dict, List, Any
from flask import current_app


class StayManagerError(Exception):
    """Exception for StayManager API errors."""

    def __init__(self, message: str, status_code: int = None, response: Dict = None):
        super().__init__(message)
        self.status_code = status_code
        self.response = response


class StayManagerClient:
    """API client for StayManager.ma integration."""

    DEFAULT_TIMEOUT = 30
    MAX_RETRIES = 3

    def __init__(self, api_key: str = None, firebase_token: str = None):
        """
        Initialize StayManager client.

        Args:
            api_key: StayManager API key for server-to-server auth
            firebase_token: Firebase token for user-based auth
        """
        self.base_url = current_app.config.get(
            'STAYMANAGER_API_URL',
            'https://api.staymanager.ma/api'
        )
        self.api_key = api_key
        self.firebase_token = firebase_token
        self.session = requests.Session()
        self._setup_auth()

    def _setup_auth(self):
        """Configure authentication headers."""
        self.session.headers['Content-Type'] = 'application/json'
        self.session.headers['Accept'] = 'application/json'

        if self.firebase_token:
            self.session.headers['Authorization'] = f'Bearer {self.firebase_token}'
        elif self.api_key:
            self.session.headers['X-API-Key'] = self.api_key

    def _request(self, method: str, endpoint: str, **kwargs) -> Dict:
        """
        Make authenticated request to StayManager API.

        Args:
            method: HTTP method (GET, POST, PUT, DELETE)
            endpoint: API endpoint path
            **kwargs: Additional request arguments

        Returns:
            Parsed JSON response

        Raises:
            StayManagerError: On API errors
        """
        url = f"{self.base_url}{endpoint}"
        timeout = kwargs.pop('timeout', self.DEFAULT_TIMEOUT)

        try:
            response = self.session.request(
                method,
                url,
                timeout=timeout,
                **kwargs
            )

            # Handle specific error codes
            if response.status_code == 401:
                raise StayManagerError(
                    "Authentication failed. Please reconnect your StayManager account.",
                    status_code=401
                )
            elif response.status_code == 403:
                raise StayManagerError(
                    "Access denied. Check your permissions.",
                    status_code=403
                )
            elif response.status_code == 429:
                raise StayManagerError(
                    "Rate limit exceeded. Please try again later.",
                    status_code=429
                )

            response.raise_for_status()

            # Handle empty responses
            if response.status_code == 204 or not response.content:
                return {}

            return response.json()

        except requests.exceptions.Timeout:
            raise StayManagerError("Request timed out. StayManager may be unavailable.")
        except requests.exceptions.ConnectionError:
            raise StayManagerError("Unable to connect to StayManager. Check your internet connection.")
        except requests.exceptions.HTTPError as e:
            error_msg = str(e)
            try:
                error_data = response.json()
                error_msg = error_data.get('message', error_data.get('error', str(e)))
            except:
                pass
            raise StayManagerError(
                f"StayManager API error: {error_msg}",
                status_code=response.status_code,
                response=error_data if 'error_data' in locals() else None
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
        Get reservations with optional filters.

        Args:
            property_id: Filter by property UUID
            start_date: Filter by check-in date (YYYY-MM-DD)
            end_date: Filter by check-out date (YYYY-MM-DD)
            status: Filter by status (confirmed, cancelled, blocked)
            page: Page number for pagination
            per_page: Results per page

        Returns:
            Dictionary with reservations list and pagination info
        """
        params = {'page': page, 'per_page': per_page}

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
            Reservation details with guest info
        """
        return self._request('GET', f'/reservations/{reservation_id}')

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

    def get_availability(self, property_id: str, start_date: str, end_date: str) -> List[Dict]:
        """
        Get property availability for date range.

        Args:
            property_id: StayManager property UUID
            start_date: Start date (YYYY-MM-DD)
            end_date: End date (YYYY-MM-DD)

        Returns:
            List of availability entries
        """
        params = {'start_date': start_date, 'end_date': end_date}
        return self._request('GET', f'/properties/{property_id}/availability', params=params)

    def sync_calendar(self, property_id: str) -> Dict:
        """
        Trigger calendar sync for property.

        Args:
            property_id: StayManager property UUID

        Returns:
            Sync status
        """
        return self._request('POST', f'/calendar/sync/{property_id}')

    def get_sync_status(self, property_id: str) -> Dict:
        """
        Get calendar sync status.

        Args:
            property_id: StayManager property UUID

        Returns:
            Current sync status and last sync time
        """
        return self._request('GET', f'/calendar/sync/status/{property_id}')

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

    def generate_passcode(
        self,
        lock_id: str,
        name: str,
        start_time: datetime,
        end_time: datetime,
        passcode_type: str = 'temporary'
    ) -> Dict:
        """
        Generate smart lock passcode.

        Args:
            lock_id: StayManager lock ID
            name: Name for the passcode
            start_time: When passcode becomes valid
            end_time: When passcode expires
            passcode_type: Type of passcode (temporary, permanent)

        Returns:
            Generated passcode details
        """
        data = {
            'name': name,
            'start_time': start_time.isoformat(),
            'end_time': end_time.isoformat(),
            'type': passcode_type
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

    def send_message(self, reservation_id: str, template_id: str = None, message: str = None) -> Dict:
        """
        Send message to guest.

        Args:
            reservation_id: Reservation UUID
            template_id: Optional template ID
            message: Custom message (if not using template)
        """
        data = {}
        if template_id:
            data['template_id'] = template_id
        if message:
            data['message'] = message
        return self._request('POST', f'/reservations/{reservation_id}/message', json=data)

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
