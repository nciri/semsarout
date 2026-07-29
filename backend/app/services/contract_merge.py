"""Build merge context from domain data and substitute {{placeholders}}."""
import re
from datetime import datetime


def _money(v):
    try:
        return f"{float(v):,.2f} Đh".replace(',', ' ')
    except (TypeError, ValueError):
        return ''


def build_context(agency, *, transaction=None, property=None, client=None):
    prop = property
    cli = client
    agent_name = ''
    tx_ref = ''
    asking = ''
    comm_rate = ''
    comm_amount = ''
    if transaction is not None:
        prop = prop or getattr(transaction, 'related_property', None)
        cli = cli or getattr(transaction, 'client', None)
        agent = getattr(transaction, 'agent', None)
        agent_name = agent.full_name if agent else ''
        tx_ref = transaction.reference or ''
        asking = _money(transaction.asking_price)
        comm_rate = f"{float(transaction.commission_rate)}%" if transaction.commission_rate else ''
        comm_amount = _money(transaction.commission_amount)

    ctx = {
        'date': datetime.utcnow().strftime('%d/%m/%Y'),
        'agency_name': getattr(agency, 'name', '') or '',
        'agency_address': getattr(agency, 'address', '') or '',
        'agency_license': getattr(agency, 'license_number', '') or '',
        'agent_name': agent_name,
        'property_address': getattr(prop, 'address', '') or '' if prop else '',
        'property_city': getattr(prop, 'city', '') or '' if prop else '',
        'property_type': getattr(prop, 'property_type', '') or '' if prop else '',
        'property_price': _money(getattr(prop, 'price', None)) if prop else '',
        'property_surface': (f"{prop.surface} m²" if prop and prop.surface else ''),
        'property_rooms': str(getattr(prop, 'rooms', '') or '') if prop else '',
        'property_reference': getattr(prop, 'reference', '') or '' if prop else '',
        'client_name': (f"{cli.first_name} {cli.last_name}" if cli else ''),
        'client_email': getattr(cli, 'email', '') or '' if cli else '',
        'client_phone': getattr(cli, 'phone', '') or '' if cli else '',
        'transaction_reference': tx_ref,
        'asking_price': asking,
        'commission_rate': comm_rate,
        'commission_amount': comm_amount,
    }
    return ctx


_PLACEHOLDER = re.compile(r'\{\{\s*([a-zA-Z0-9_]+)\s*\}\}')


def render(body_html, context):
    if not body_html:
        return ''
    return _PLACEHOLDER.sub(lambda m: str(context.get(m.group(1), '')), body_html)
