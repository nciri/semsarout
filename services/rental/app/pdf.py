"""Génération PDF du service rental — quittances, baux, mandats, états des lieux (reportlab).

**Toute valeur interpolée dans un `Paragraph` passe par `_x`.** Le `Paragraph` de ReportLab
n'affiche pas du texte : il analyse un mini-langage de balisage. Mesuré sur la version
installée (reportlab 5.1.0), il se comporte de deux façons, toutes les deux mauvaises ici :

- une balise **reconnue mais non fermée** lève un `ValueError` de parsing — il ne dégrade
  pas. Un nom de locataire « Ben <Ali> & Fils <b> », un libellé de retenue ou un commentaire
  d'état des lieux finissant par un chevron suffisait donc à transformer « télécharger la
  quittance » en 500, et c'était déjà vrai **avant** la bascule WYSIWYG ;
- une balise **inconnue de son mini-langage** (`<p>`, `<ul>`, `<li>`, `<strong>`…) est
  silencieusement supprimée. Contrairement à ce que supposait l'inventaire de l'étape 1, un
  `<p>` ne lève donc pas : il efface la structure sans le dire, et des observations saisies
  en WYSIWYG arriveraient dans le PDF en une seule ligne continue.

D'où les deux outils : `_x` échappe toute valeur, et `general_notes` — qui est du HTML
depuis la bascule — est d'abord projeté par `html_to_text`, `_lines` rendant ses sauts de
ligne avec le `<br/>` que ReportLab, lui, comprend.
"""
from io import BytesIO
from xml.sax.saxutils import escape as _escape

from semsar_common import html_to_text


def _x(value) -> str:
    """Valeur prête pour un `Paragraph` : `<`, `>` et `&` échappés, `None` → `-`."""
    return _escape("-" if value is None or value == "" else str(value))


def _lines(text: str) -> str:
    """Texte multi-ligne échappé, avec les sauts de ligne que ReportLab sait rendre."""
    return _x(text).replace("\n", "<br/>")


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
        Paragraph(f"<b>QUITTANCE DE LOYER</b> {_x(rp.receipt_number)}", head),
        Paragraph(f"Période : {_x(rp.period_label)}", info),
        Paragraph(f"Bien : {_x(property_title)}", info),
        Paragraph(f"Bailleur : {_x(landlord_name)}", info),
        Paragraph(f"Locataire : {_x(tenant_name)}", info),
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


def render_lease_pdf(lease, mandate, tenant_name: str, landlord_name: str, property_title: str) -> bytes:
    """Contrat de bail PDF. `lease` = Lease, `mandate` = Mandate associé (peut être None)."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=20 * mm, bottomMargin=20 * mm)
    styles = getSampleStyleSheet()
    head = ParagraphStyle("H", parent=styles["Heading1"], fontSize=22,
                          textColor=colors.HexColor("#0B1220"), spaceAfter=10)
    info = ParagraphStyle("I", parent=styles["Normal"], fontSize=10, leading=16)

    def money(v):
        return f"{float(v or 0):,.2f} Đh".replace(",", " ")

    def d(dt):
        return dt.strftime("%d/%m/%Y") if dt else "-"

    story = [
        Paragraph("SemsarOut", head), Paragraph("www.semsarout.com", styles["Normal"]), Spacer(1, 18),
        Paragraph(f"<b>CONTRAT DE BAIL</b> {_x(lease.reference) if lease.reference else ''}", head),
        Paragraph(f"Bailleur : {_x(landlord_name)}", info),
        Paragraph(f"Locataire : {_x(tenant_name)}", info),
        Paragraph(f"Bien : {_x(property_title)}", info),
        Spacer(1, 10),
        Paragraph(f"Loyer mensuel : {money(lease.rent_amount)}", info),
        Paragraph(f"Charges : {money(lease.charges_amount)}", info),
        Paragraph(f"Dépôt de garantie : {money(lease.deposit_amount)}", info),
        Paragraph(f"Jour d'échéance : le {lease.payment_day or 1} de chaque mois", info),
        Paragraph(f"Période : du {d(lease.start_date)} au {d(lease.end_date)}", info),
        Spacer(1, 14),
        Paragraph("Fait pour signature électronique via SemsarOut / 3a9dSign.", info),
    ]
    doc.build(story)
    return buf.getvalue()


def render_mandate_pdf(mandate, landlord_name: str, property_title: str) -> bytes:
    """Mandat de gestion/location PDF. `mandate` = Mandate."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=20 * mm, bottomMargin=20 * mm)
    styles = getSampleStyleSheet()
    head = ParagraphStyle("H", parent=styles["Heading1"], fontSize=22,
                          textColor=colors.HexColor("#0B1220"), spaceAfter=10)
    info = ParagraphStyle("I", parent=styles["Normal"], fontSize=10, leading=16)

    def d(dt):
        return dt.strftime("%d/%m/%Y") if dt else "-"

    story = [
        Paragraph("SemsarOut", head), Paragraph("www.semsarout.com", styles["Normal"]), Spacer(1, 18),
        Paragraph(f"<b>MANDAT DE {_x((mandate.mandate_type or 'gestion').upper())}</b> {_x(mandate.reference) if mandate.reference else ''}", head),
        Paragraph(f"Mandant (bailleur) : {_x(landlord_name)}", info),
        Paragraph(f"Bien : {_x(property_title)}", info),
        Paragraph(f"Type de mandat : {_x(mandate.mandate_type)}", info),
        Paragraph(f"Honoraires : {float(mandate.fee_percent or 0):.2f} %", info),
        Paragraph(f"Période : du {d(mandate.start_date)} au {d(mandate.end_date)}", info),
        Spacer(1, 14),
        Paragraph("Fait pour signature électronique via SemsarOut / 3a9dSign.", info),
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
        Paragraph(f"Bien : {_x(property_title)}", info),
        Paragraph(f"Locataire : {_x(tenant_name)}", info),
        Paragraph(f"Date : {inv.conducted_at.strftime('%d/%m/%Y') if inv.conducted_at else '-'}", info),
        Spacer(1, 8),
    ]
    for r in rooms:
        story.append(Paragraph(_x(r["name"]), rh))
        for it in r["items"]:
            cond = {"bon": "Bon", "moyen": "Moyen", "mauvais": "Mauvais"}.get(it["condition"], it["condition"])
            line = f"• <b>{_x(it['label'])}</b> : {_x(cond)}"
            if it.get("comment"):
                line += f" — {_lines(it['comment'])}"
            story.append(Paragraph(line, info))
    if inv.general_notes:
        # 🔴 `general_notes` est saisi en WYSIWYG : un `<p>` ou un `<ul>` arrivant dans un
        # `Paragraph` lève, il n'est pas ignoré. On y projette le texte.
        story += [Spacer(1, 10), Paragraph("<b>Observations générales</b>", rh),
                  Paragraph(_lines(html_to_text(inv.general_notes)), info)]
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
    total = sum(float(l.amount or 0) for l in lines)
    refunded = deposit - total if deposit > total else 0
    balance = total - deposit if total > deposit else 0
    story = [
        Paragraph("SemsarOut", head), Paragraph("www.semsarout.com", styles["Normal"]), Spacer(1, 20),
        Paragraph("<b>DÉCOMPTE DE CAUTION</b>", head),
        Paragraph(f"Bien : {_x(property_title)}", info),
        Paragraph(f"Bailleur : {_x(landlord_name)}", info),
        Paragraph(f"Locataire : {_x(tenant_name)}", info),
        Spacer(1, 12),
        Paragraph(f"Dépôt de garantie : {money(deposit)}", info),
        Paragraph("<b>Retenues :</b>", info),
    ]
    if lines:
        for l in lines:
            story.append(Paragraph(f"• {_x(l.label)} : {money(l.amount)}", info))
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
    expenses = float(crg.expenses or 0)
    net = float(crg.net or 0)
    story = [
        Paragraph("SemsarOut", head), Paragraph("www.semsarout.com", styles["Normal"]), Spacer(1, 20),
        Paragraph("<b>COMPTE-RENDU DE GESTION</b>", head),
        Paragraph(f"Mandat : {_x(mandate_reference)}", info),
        Paragraph(f"Période : {_x(crg.period_label)}", info),
        Paragraph(f"Propriétaire : {_x(landlord_name)}", info),
        Spacer(1, 12),
        Paragraph(f"Loyers encaissés : {collected:,.2f} Đh".replace(",", " "), info),
        Paragraph(f"Honoraires de gestion : {fees:,.2f} Đh".replace(",", " "), info),
        Paragraph(f"Dépenses d'intervention : {expenses:,.2f} Đh".replace(",", " "), info),
        Paragraph(f"<b>Net reversé : {net:,.2f} Đh</b>".replace(",", " "), info),
    ]
    doc.build(story)
    return buf.getvalue()
