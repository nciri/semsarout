"""Génération PDF du service rental — quittance de loyer (reportlab)."""
from io import BytesIO


def render_receipt_pdf(rp, tenant_name: str, landlord_name: str, property_title: str) -> bytes:
    """Quittance de loyer PDF. `rp` = RentPeriod encaissée (receipt_number présent)."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=20 * mm, bottomMargin=20 * mm)
    styles = getSampleStyleSheet()
    head = ParagraphStyle("Header", parent=styles["Heading1"], fontSize=24,
                          textColor=colors.HexColor("#0B1220"), spaceAfter=10)
    info = ParagraphStyle("Info", parent=styles["Normal"], fontSize=10, leading=16)
    rent = float(rp.rent_amount or 0)
    charges = float(rp.charges_amount or 0)
    total = float(rp.total_amount or 0)
    story = [
        Paragraph("SemsarOut", head), Paragraph("www.semsarout.com", styles["Normal"]), Spacer(1, 20),
        Paragraph(f"<b>QUITTANCE DE LOYER</b> {rp.receipt_number or '-'}", head),
        Paragraph(f"Période : {rp.period_label or '-'}", info),
        Paragraph(f"Bien : {property_title or '-'}", info),
        Paragraph(f"Bailleur : {landlord_name or '-'}", info),
        Paragraph(f"Locataire : {tenant_name or '-'}", info),
        Spacer(1, 12),
        Paragraph(f"Loyer : {rent:,.2f} Đh".replace(",", " "), info),
        Paragraph(f"Charges : {charges:,.2f} Đh".replace(",", " "), info),
        Paragraph(f"<b>Total : {total:,.2f} Đh</b>".replace(",", " "), info),
        Spacer(1, 12),
        Paragraph(f"Payé le : {rp.paid_at.strftime('%d/%m/%Y') if rp.paid_at else '-'}", info),
        Paragraph("Reçu pour solde de tout compte de la période indiquée.", info),
    ]
    doc.build(story)
    return buf.getvalue()


def render_crg_pdf(crg, landlord_name: str, mandate_reference: str) -> bytes:
    """Compte-rendu de gestion PDF. `crg` = CrgReport."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=20 * mm, bottomMargin=20 * mm)
    styles = getSampleStyleSheet()
    head = ParagraphStyle("Header", parent=styles["Heading1"], fontSize=24,
                          textColor=colors.HexColor("#0B1220"), spaceAfter=10)
    info = ParagraphStyle("Info", parent=styles["Normal"], fontSize=10, leading=16)
    collected = float(crg.rent_collected or 0)
    fees = float(crg.fees or 0)
    net = float(crg.net or 0)
    story = [
        Paragraph("SemsarOut", head), Paragraph("www.semsarout.com", styles["Normal"]), Spacer(1, 20),
        Paragraph("<b>COMPTE-RENDU DE GESTION</b>", head),
        Paragraph(f"Mandat : {mandate_reference or '-'}", info),
        Paragraph(f"Période : {crg.period_label or '-'}", info),
        Paragraph(f"Propriétaire : {landlord_name or '-'}", info),
        Spacer(1, 12),
        Paragraph(f"Loyers encaissés : {collected:,.2f} Đh".replace(",", " "), info),
        Paragraph(f"Honoraires de gestion : {fees:,.2f} Đh".replace(",", " "), info),
        Paragraph(f"<b>Net reversé : {net:,.2f} Đh</b>".replace(",", " "), info),
    ]
    doc.build(story)
    return buf.getvalue()
