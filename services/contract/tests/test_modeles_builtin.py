"""Garde-fous sur les modèles de contrats intégrés (`db/migrate_modeles_builtin.sql`).

Deux risques, tous deux silencieux en production :
  1. un placeholder mal orthographié ou inventé — `render()` le remplace par une chaîne vide,
     donc un blanc dans un contrat signé, sans aucune erreur ;
  2. une balise hors de l'allowlist de `sanitize_html` — bleach la supprime (`strip=True`),
     donc une mise en forme (tableau, titre, liste) qui disparaît du PDF.
"""
import re
from pathlib import Path

import pytest

from app.merge import STAY_PLACEHOLDERS, build_context, render
from app.sanitize import sanitize_html

MIGRATION = Path(__file__).resolve().parents[1] / "db" / "migrate_modeles_builtin.sql"

# Placeholders de parties multiples (plusieurs vendeurs, plusieurs locataires). Ils ne sont pas
# encore résolus par `build_context` : le support des parties plurielles est en cours côté
# contexte de fusion. Cette liste est le contrat entre les modèles et ce chantier — quand les
# clés arrivent dans `build_context`, le test ci-dessous le signale et la liste se vide.
PARTIES_EN_ATTENTE = {
    "parties_bailleurs",
    "parties_locataires",
    "parties_mandants",
    "parties_vendeurs",
    "parties_acquereurs",
}

PLACEHOLDER = re.compile(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}")
# Les littéraux dollar-quotés du script : $nom$…$nom$ pour le libellé, $html$…$html$ pour le corps.
NOM = re.compile(r"\$nom\$(.*?)\$nom\$", re.DOTALL)
CORPS = re.compile(r"\$html\$(.*?)\$html\$", re.DOTALL)

# Balises porteuses de structure : si bleach en retire une, le document perd une section.
BALISES_SUIVIES = ("h1", "h2", "h3", "h4", "p", "table", "thead", "tbody", "tr", "th", "td",
                   "ul", "ol", "li", "strong", "em", "br", "span", "blockquote")


def _sql() -> str:
    return MIGRATION.read_text(encoding="utf-8")


def _modeles() -> list[tuple[str, str]]:
    sql = _sql()
    return list(zip(NOM.findall(sql), CORPS.findall(sql), strict=True))


def test_migration_presente_et_idempotente():
    sql = _sql()
    assert "contract.contract_template" in sql
    # Rejouée à chaque déploiement : sans ce garde-fou, un second passage dupliquerait les modèles.
    assert "WHERE NOT EXISTS" in sql
    assert "t.agency_id IS NULL AND t.name = m.name" in sql


def test_quatre_modeles_globaux_bien_formes():
    modeles = _modeles()
    assert len(modeles) == 4
    noms = [n for n, _ in modeles]
    assert len(set(noms)) == 4, "les noms servent de clé d'idempotence, ils doivent être uniques"
    for nom, corps in modeles:
        assert nom.strip() == nom and nom
        # Un vrai contrat, pas une ébauche : une dizaine de pages, articles numérotés.
        assert len(corps) > 15_000, f"{nom} fait {len(corps)} caractères, trop court"
        assert corps.count("<h3>Article") >= 15, f"{nom} n'a pas assez d'articles numérotés"


def test_document_type_connu_du_service():
    # Vocabulaire déjà utilisé par le front (TemplatesManager) et par `app/stay.py`.
    connus = {"mandate_sale", "mandate_rental", "compromise", "lease", "stay", "other"}
    types = re.findall(r"^\s*\('([a-z_]+)',", _sql(), re.MULTILINE)
    assert len(types) == 4
    assert set(types) <= connus
    assert len(set(types)) == 4, "un type par modèle, pour que le sélecteur reste lisible"


@pytest.mark.parametrize("nom, corps", _modeles(), ids=lambda v: v[:40])
def test_placeholders_resolus_ou_explicitement_en_attente(nom, corps):
    resolus = set(build_context(None)) | set(STAY_PLACEHOLDERS)
    utilises = set(PLACEHOLDER.findall(corps))
    inconnus = utilises - resolus - PARTIES_EN_ATTENTE
    assert not inconnus, (
        f"{nom} : placeholders qui ne résolvent pas, donc des blancs invisibles "
        f"dans un contrat signé : {sorted(inconnus)}")


@pytest.mark.parametrize("nom, corps", _modeles(), ids=lambda v: v[:40])
def test_html_survit_a_la_sanitisation(nom, corps):
    propre = sanitize_html(corps)
    for balise in BALISES_SUIVIES:
        avant = len(re.findall(rf"<{balise}\b", corps))
        apres = len(re.findall(rf"<{balise}\b", propre))
        assert avant == apres, f"{nom} : <{balise}> passe de {avant} à {apres} après sanitisation"
    # `style` n'est toléré que pour text-align ; tout autre usage serait supprimé.
    assert set(re.findall(r'style="([^"]+)"', corps)) <= {"text-align: center"}
    # Les commentaires HTML portent les références légales : bleach les retire, c'est attendu,
    # et c'est pourquoi les références sont aussi listées dans la documentation du chantier.
    assert "<!--" in corps and "<!--" not in propre


@pytest.mark.parametrize("nom, corps", _modeles(), ids=lambda v: v[:40])
def test_rendu_ne_laisse_aucune_accolade(nom, corps):
    rendu = render(corps, build_context(None) | {k: "X" for k in PARTIES_EN_ATTENTE})
    assert "{{" not in rendu and "}}" not in rendu


def test_parties_en_attente_reellement_utilisees():
    """Si le contexte de fusion gagne ces clés, la liste d'attente doit se vider, pas pourrir."""
    corpus = "".join(c for _, c in _modeles())
    utilisees = set(PLACEHOLDER.findall(corpus))
    assert PARTIES_EN_ATTENTE <= utilisees, "entrée obsolète dans PARTIES_EN_ATTENTE"
    deja_resolues = PARTIES_EN_ATTENTE & set(build_context(None))
    assert not deja_resolues, (
        f"{sorted(deja_resolues)} résolvent désormais dans build_context : "
        "les retirer de PARTIES_EN_ATTENTE")
