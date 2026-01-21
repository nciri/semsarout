import requests
from flask import current_app


class StayManagerService:
    """Service for StayManager.ma integration."""

    def __init__(self, api_key: str = None):
        self.base_url = current_app.config.get('STAYMANAGER_API_URL')
        self.api_key = api_key or current_app.config.get('STAYMANAGER_API_KEY')
        self.headers = {
            'Authorization': f'Bearer {self.api_key}',
            'Content-Type': 'application/json'
        }

    def _request(self, method: str, endpoint: str, **kwargs):
        """Make API request to StayManager."""
        url = f"{self.base_url}/{endpoint}"
        try:
            response = requests.request(
                method,
                url,
                headers=self.headers,
                timeout=30,
                **kwargs
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            raise StayManagerError(f"StayManager API error: {str(e)}")

    def get_properties(self, agency_id: str):
        """Fetch properties from StayManager for an agency."""
        return self._request('GET', f'agencies/{agency_id}/properties')

    def sync_property(self, property_data: dict, staymanager_id: str = None):
        """Sync property to StayManager."""
        if staymanager_id:
            return self._request('PUT', f'properties/{staymanager_id}', json=property_data)
        return self._request('POST', 'properties', json=property_data)

    def get_bookings(self, property_id: str):
        """Get bookings for a property from StayManager."""
        return self._request('GET', f'properties/{property_id}/bookings')

    def verify_connection(self):
        """Verify API connection is working."""
        try:
            self._request('GET', 'health')
            return True
        except StayManagerError:
            return False


class StayManagerError(Exception):
    """Exception for StayManager API errors."""
    pass
