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

from app.merge import ROLE_PLACEHOLDERS, STAY_PLACEHOLDERS, build_context, render
from app.sanitize import sanitize_html

MIGRATION = Path(__file__).resolve().parents[1] / "db" / "migrate_modeles_builtin.sql"

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
def test_tous_les_placeholders_resolvent(nom, corps):
    resolus = set(build_context(None)) | set(STAY_PLACEHOLDERS)
    utilises = set(PLACEHOLDER.findall(corps))
    inconnus = utilises - resolus
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
    centres = set(re.findall(r'style="([^"]+)"', corps))
    assert centres <= {"text-align: center"}
    # Et il doit **survivre** : la liste blanche déclare `text-align`, mais sans `tinycss2`
    # le repli de `sanitize_html` retirait `style` entièrement et tous ces éléments perdaient
    # leur centrage en silence. Le cas a tenu toute la vie de ces services sans être vu
    # parce que l'assertion ci-dessus ne regardait que la **source** du gabarit.
    if centres:
        assert 'style="text-align: center;"' in propre, (
            f"{nom} : le centrage ne survit pas à la sanitisation — `bleach[css]` "
            f"(tinycss2) est-il bien installé ?")
    # Les commentaires HTML portent les références légales : bleach les retire, c'est attendu,
    # et c'est pourquoi les références sont aussi listées dans la documentation du chantier.
    assert "<!--" in corps and "<!--" not in propre


@pytest.mark.parametrize("nom, corps", _modeles(), ids=lambda v: v[:40])
def test_rendu_ne_laisse_aucune_accolade(nom, corps):
    rendu = render(corps, build_context(None))
    assert "{{" not in rendu and "}}" not in rendu


def test_chaque_role_a_son_bloc_de_parties():
    """Un rôle sans placeholder correspondant dans les modèles n'a pas lieu d'exister, et un
    placeholder de parties absent de `build_context` sortirait vide du rendu."""
    corpus = "".join(c for _, c in _modeles())
    utilisees = set(PLACEHOLDER.findall(corpus))
    attendues = set(ROLE_PLACEHOLDERS.values())
    assert attendues <= utilisees, f"rôle sans emploi dans les modèles : {sorted(attendues - utilisees)}"
    assert attendues <= set(build_context(None)), "rôle que build_context ne résout pas"
