"""Tests for compromis PDF generation with HTML escaping."""
import pytest
from services.selling.app.compromis_pdf import _fill, render


def test_html_escaping_in_scalar_fields():
    """Verify that scalar fields are HTML-escaped to prevent injection."""
    html_template = """
    <html>
        <body>
            <p>Vendeur: {{vendeur_nom}}</p>
            <p>CIN: {{vendeur_cin}}</p>
            <p>Acheteur: {{acheteur_nom}}</p>
        </body>
    </html>
    """

    # Test with malicious input
    data = {
        "parties": {
            "vendeur": {
                "nom": "A<b>B&C</b><script>alert('xss')</script>",
                "cin": "AA<>&\"'",
                "adresse": ""
            },
            "acheteur": {
                "nom": "Test<img src=x onerror=alert('xss')>",
                "cin": "",
                "adresse": ""
            }
        },
        "bien": {},
        "prix": {},
        "reiteration": {},
        "frais_fiscalite": {},
        "conditions_suspensives": [],
    }

    result = _fill(html_template, data)

    # Verify that HTML special characters are escaped
    assert "A&lt;b&gt;B&amp;C&lt;/b&gt;&lt;script&gt;" in result
    assert "<script>" not in result  # No raw script tags
    assert "AA&lt;&gt;&amp;&quot;&#x27;" in result
    assert "&lt;img src=x onerror=" in result


def test_conditions_suspensives_escaping():
    """Verify that list items in conditions_suspensives are escaped but li tags remain."""
    html_template = """
    <html>
        <body>
            <ul>{{conditions_suspensives}}</ul>
        </body>
    </html>
    """

    data = {
        "parties": {"vendeur": {}, "acheteur": {}},
        "bien": {},
        "prix": {},
        "reiteration": {},
        "frais_fiscalite": {},
        "conditions_suspensives": [
            "Condition <normal>",
            "Another&test<script>alert('xss')</script>",
        ],
    }

    result = _fill(html_template, data)

    # Verify li tags are preserved but content is escaped
    assert "<li>Condition &lt;normal&gt;</li>" in result
    assert "<li>Another&amp;test&lt;script&gt;" in result
    assert "<li>" in result  # li tags should still exist
    assert "</li>" in result


def test_render_with_malicious_input():
    """Verify that render() produces valid PDF bytes even with malicious input."""
    malicious_data = {
        "parties": {
            "vendeur": {
                "nom": "<script>alert('xss')</script>",
                "cin": "AA&<>",
                "adresse": "Test<img>"
            },
            "acheteur": {
                "nom": "Buyer&Co",
                "cin": "BB'\"",
                "adresse": ""
            }
        },
        "bien": {
            "titre_foncier": "Title<b>",
            "consistance": "Consist&ency",
            "superficie": "100<script>",
            "situation": "",
            "origine_propriete": ""
        },
        "prix": {
            "montant": "500000&<",
            "arrhes": "50000",
            "echeancier": ""
        },
        "reiteration": {
            "delai_jours": "30<",
            "acte": ""
        },
        "frais_fiscalite": {
            "tpi": "1000",
            "enregistrement": "2000",
            "conservation_fonciere": ""
        },
        "conditions_suspensives": [
            "Condition1<script>",
            "Condition2&test",
        ],
        "situation_hypothecaire": "Clear",
        "clause_penale": "Penalty<>",
        "election_domicile": "Address",
        "droit_applicable": "Moroccan<law>"
    }

    # Should not raise an exception and should produce valid PDF bytes
    pdf_bytes = render(malicious_data)

    # Verify it's a valid PDF (starts with %PDF)
    assert pdf_bytes.startswith(b"%PDF"), "Output should be valid PDF bytes"
    assert len(pdf_bytes) > 0, "PDF should not be empty"
