"""Génération du PDF de compromis de vente (marché marocain). HTML→PDF via xhtml2pdf."""
import io
import os

from xhtml2pdf import pisa

_TEMPLATE = os.path.join(os.path.dirname(__file__), "templates", "compromis.html")


def _fill(html: str, data: dict) -> str:
    # rendu minimal par substitution (pas de dépendance à un moteur de templates externe)
    import json
    p = data.get("parties", {})
    bien = data.get("bien", {})
    prix = data.get("prix", {})
    reit = data.get("reiteration", {})
    frais = data.get("frais_fiscalite", {})
    repl = {
        "{{vendeur_nom}}": str(p.get("vendeur", {}).get("nom", "")),
        "{{vendeur_cin}}": str(p.get("vendeur", {}).get("cin", "")),
        "{{vendeur_adresse}}": str(p.get("vendeur", {}).get("adresse", "")),
        "{{acheteur_nom}}": str(p.get("acheteur", {}).get("nom", "")),
        "{{acheteur_cin}}": str(p.get("acheteur", {}).get("cin", "")),
        "{{acheteur_adresse}}": str(p.get("acheteur", {}).get("adresse", "")),
        "{{titre_foncier}}": str(bien.get("titre_foncier", "")),
        "{{consistance}}": str(bien.get("consistance", "")),
        "{{superficie}}": str(bien.get("superficie", "")),
        "{{situation}}": str(bien.get("situation", "")),
        "{{origine_propriete}}": str(bien.get("origine_propriete", "")),
        "{{prix_montant}}": str(prix.get("montant", "")),
        "{{prix_arrhes}}": str(prix.get("arrhes", "")),
        "{{prix_echeancier}}": str(prix.get("echeancier", "")),
        "{{conditions_suspensives}}": "".join(f"<li>{c}</li>" for c in data.get("conditions_suspensives", [])),
        "{{situation_hypothecaire}}": str(data.get("situation_hypothecaire", "")),
        "{{reiteration_delai}}": str(reit.get("delai_jours", "")),
        "{{reiteration_acte}}": str(reit.get("acte", "")),
        "{{frais_tpi}}": str(frais.get("tpi", "")),
        "{{frais_enregistrement}}": str(frais.get("enregistrement", "")),
        "{{frais_conservation}}": str(frais.get("conservation_fonciere", "")),
        "{{clause_penale}}": str(data.get("clause_penale", "")),
        "{{election_domicile}}": str(data.get("election_domicile", "")),
        "{{droit_applicable}}": str(data.get("droit_applicable", "droit marocain")),
    }
    for k, v in repl.items():
        html = html.replace(k, v)
    return html


def render(data: dict) -> bytes:
    with open(_TEMPLATE, encoding="utf-8") as f:
        html = _fill(f.read(), data)
    buf = io.BytesIO()
    pisa.CreatePDF(src=html, dest=buf, encoding="utf-8")
    return buf.getvalue()
