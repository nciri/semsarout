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


def render_inventory_pdf(inv, rooms, property_title: str, tenant_name: str) -> bytes:
    """État des lieux PDF. `rooms` = liste [{name, items:[{label,condition,comment}]}]."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=18 * mm, bottomMargin=18 * mm)
    styles = getSampleStyleSheet()
    head = ParagraphStyle("H", parent=styles["Heading1"], fontSize=22,
                          textColor=colors.HexColor("#0B1220"), spaceAfter=8)
    rh = ParagraphStyle("RH", parent=styles["Heading2"], fontSize=13,
                        textColor=colors.HexColor("#0F766E"), spaceBefore=10, spaceAfter=4)
    info = ParagraphStyle("I", parent=styles["Normal"], fontSize=10, leading=15)
    label = "d'ENTRÉE" if inv.type == "entree" else "de SORTIE"
    story = [
        Paragraph("SemsarOut", head), Paragraph("www.semsarout.com", styles["Normal"]), Spacer(1, 14),
        Paragraph(f"<b>ÉTAT DES LIEUX {label}</b>", head),
        Paragraph(f"Bien : {property_title or '-'}", info),
        Paragraph(f"Locataire : {tenant_name or '-'}", info),
        Paragraph(f"Date : {inv.conducted_at.strftime('%d/%m/%Y') if inv.conducted_at else '-'}", info),
        Spacer(1, 8),
    ]
    for r in rooms:
        story.append(Paragraph(r["name"], rh))
        for it in r["items"]:
            cond = {"bon": "Bon", "moyen": "Moyen", "mauvais": "Mauvais"}.get(it["condition"], it["condition"])
            line = f"• <b>{it['label']}</b> : {cond}"
            if it.get("comment"):
                line += f" — {it['comment']}"
            story.append(Paragraph(line, info))
    if inv.general_notes:
        story += [Spacer(1, 10), Paragraph("<b>Observations générales</b>", rh),
                  Paragraph(inv.general_notes, info)]
    story += [Spacer(1, 20), Paragraph("Signatures : bailleur / gestionnaire — locataire", info)]
    doc.build(story)
    return buf.getvalue()


def render_settlement_pdf(s, lines, tenant_name: str, landlord_name: str, property_title: str) -> bytes:
    """Décompte de caution PDF. `s` = DepositSettlement finalisé ; `lines` = liste DeductionLine."""
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

    def money(v):
        return f"{float(v or 0):,.2f} Đh".replace(",", " ")

    deposit = float(s.deposit_amount or 0)
    total = float(s.total_deductions or 0)
    refunded = float(s.refunded_amount or 0)
    balance = float(s.balance_due or 0)
    story = [
        Paragraph("SemsarOut", head), Paragraph("www.semsarout.com", styles["Normal"]), Spacer(1, 20),
        Paragraph("<b>DÉCOMPTE DE CAUTION</b>", head),
        Paragraph(f"Bien : {property_title or '-'}", info),
        Paragraph(f"Bailleur : {landlord_name or '-'}", info),
        Paragraph(f"Locataire : {tenant_name or '-'}", info),
        Spacer(1, 12),
        Paragraph(f"Dépôt de garantie : {money(deposit)}", info),
        Paragraph("<b>Retenues :</b>", info),
    ]
    if lines:
        for l in lines:
            story.append(Paragraph(f"• {l.label} : {money(l.amount)}", info))
    else:
        story.append(Paragraph("• Aucune retenue", info))
    story += [
        Paragraph(f"<b>Total des retenues : {money(total)}</b>", info),
        Spacer(1, 8),
        Paragraph(f"<b>Caution restituée : {money(refunded)}</b>", info),
    ]
    if balance > 0:
        story.append(Paragraph(f"<b>Solde restant à la charge du locataire : {money(balance)}</b>", info))
    story += [Spacer(1, 12),
              Paragraph("Décompte établi sur la base de l'état des lieux de sortie contradictoire.", info)]
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
