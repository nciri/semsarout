"""Génération du PDF de compromis de vente (marché marocain). HTML→PDF via xhtml2pdf."""
import html
import io
import os

from xhtml2pdf import pisa

_TEMPLATE = os.path.join(os.path.dirname(__file__), "templates", "compromis.html")


def _fill(template: str, data: dict) -> str:
    # rendu minimal par substitution (pas de dépendance à un moteur de templates externe)
    p = data.get("parties", {})
    bien = data.get("bien", {})
    prix = data.get("prix", {})
    reit = data.get("reiteration", {})
    frais = data.get("frais_fiscalite", {})
    repl = {
        "{{vendeur_nom}}": html.escape(str(p.get("vendeur", {}).get("nom", ""))),
        "{{vendeur_cin}}": html.escape(str(p.get("vendeur", {}).get("cin", ""))),
        "{{vendeur_adresse}}": html.escape(str(p.get("vendeur", {}).get("adresse", ""))),
        "{{acheteur_nom}}": html.escape(str(p.get("acheteur", {}).get("nom", ""))),
        "{{acheteur_cin}}": html.escape(str(p.get("acheteur", {}).get("cin", ""))),
        "{{acheteur_adresse}}": html.escape(str(p.get("acheteur", {}).get("adresse", ""))),
        "{{titre_foncier}}": html.escape(str(bien.get("titre_foncier", ""))),
        "{{consistance}}": html.escape(str(bien.get("consistance", ""))),
        "{{superficie}}": html.escape(str(bien.get("superficie", ""))),
        "{{situation}}": html.escape(str(bien.get("situation", ""))),
        "{{origine_propriete}}": html.escape(str(bien.get("origine_propriete", ""))),
        "{{prix_montant}}": html.escape(str(prix.get("montant", ""))),
        "{{prix_arrhes}}": html.escape(str(prix.get("arrhes", ""))),
        "{{prix_echeancier}}": html.escape(str(prix.get("echeancier", ""))),
        "{{conditions_suspensives}}": "".join(f"<li>{html.escape(str(c))}</li>" for c in data.get("conditions_suspensives", [])),
        "{{situation_hypothecaire}}": html.escape(str(data.get("situation_hypothecaire", ""))),
        "{{reiteration_delai}}": html.escape(str(reit.get("delai_jours", ""))),
        "{{reiteration_acte}}": html.escape(str(reit.get("acte", ""))),
        "{{frais_tpi}}": html.escape(str(frais.get("tpi", ""))),
        "{{frais_enregistrement}}": html.escape(str(frais.get("enregistrement", ""))),
        "{{frais_conservation}}": html.escape(str(frais.get("conservation_fonciere", ""))),
        "{{clause_penale}}": html.escape(str(data.get("clause_penale", ""))),
        "{{election_domicile}}": html.escape(str(data.get("election_domicile", ""))),
        "{{droit_applicable}}": html.escape(str(data.get("droit_applicable", "droit marocain"))),
    }
    for k, v in repl.items():
        template = template.replace(k, v)
    return template


def render(data: dict) -> bytes:
    with open(_TEMPLATE, encoding="utf-8") as f:
        html = _fill(f.read(), data)
    buf = io.BytesIO()
    pisa.CreatePDF(src=html, dest=buf, encoding="utf-8")
    return buf.getvalue()
