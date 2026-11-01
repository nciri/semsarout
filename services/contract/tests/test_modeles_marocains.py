"""Garde-fous sur les cinq actes marocains intégrés (`db/migrate_modeles_marocains.sql`).

Les risques couverts sont tous silencieux en production :
  1. un placeholder mal orthographié ou inventé — `render()` le remplace par une chaîne vide,
     donc un blanc muet dans un acte signé, sans aucune erreur ;
  2. une balise hors de l'allowlist de `sanitize_html` — bleach la supprime (`strip=True`),
     donc un article, un tableau d'échéancier ou une annexe qui disparaît du PDF ;
  3. une divergence entre la version française et la version arabe du même acte : ce sont
     deux documents signés ensemble, dont l'un prévaut en cas de litige ;
  4. une valeur rédigée par le serveur en français dans un acte arabe (type du bien,
     composition), qui ne serait pas signable.
"""
import re
from pathlib import Path

import pytest

from app.merge import (A_COMPLETER, ROLE_NAME_PLACEHOLDERS, STAY_PLACEHOLDERS, build_context,
                       render, utilise_blocs_de_parties)
from app.sanitize import sanitize_html

MIGRATION = Path(__file__).resolve().parents[1] / "db" / "migrate_modeles_marocains.sql"
SOURCES = Path(__file__).resolve().parents[3] / "docs" / "contracts_models"

PLACEHOLDER = re.compile(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}")
MODELE = re.compile(r"'(\w+)', \$nom\$(.*?)\$nom\$, '(fr|ar)', \$html\$\n(.*?)\n\$html\$",
                    re.DOTALL)
# Balises porteuses de structure : si bleach en retire une, l'acte perd une section.
BALISES_SUIVIES = ("h1", "h2", "h3", "p", "em", "blockquote", "table", "thead", "tbody",
                   "tr", "th", "td")


def _sql() -> str:
    return MIGRATION.read_text(encoding="utf-8")


def _modeles() -> list[tuple[str, str, str, str]]:
    """`(document_type, intitulé, langue, corps HTML)` pour chaque modèle de la migration."""
    return MODELE.findall(_sql())


def test_migration_rejouable_et_propage_une_revision():
    """Rejouée à chaque déploiement. L'upsert fait les deux : pas de doublon au second
    passage, et un acte corrigé dans son .docx remplace celui en base — une insertion gardée
    par un NOT EXISTS aurait laissé la première version pour toujours."""
    sql = _sql()
    assert "contract.contract_template" in sql
    assert "ON CONFLICT (name) WHERE agency_id IS NULL DO UPDATE SET" in sql
    assert "body_html = EXCLUDED.body_html" in sql


def _blocs_docx(path: Path) -> dict:
    """Inventaire des blocs d'un .docx : paragraphes vides, paragraphes en retrait, tableaux.

    Lu directement dans le XML plutôt qu'avec `python-docx`, qui n'est pas une dépendance du
    service : ce test tourne partout où tourne la suite.
    """
    import xml.etree.ElementTree as ET
    import zipfile

    W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    with zipfile.ZipFile(path) as z:
        racine = ET.fromstring(z.read("word/document.xml"))
    vides = retraits = 0
    for enfant in racine.find(f"{W}body"):
        if enfant.tag != f"{W}p":
            continue
        texte = "".join(t.text or "" for t in enfant.iter(f"{W}t"))
        pPr = enfant.find(f"{W}pPr")
        if not texte.strip():
            vides += 1
        elif pPr is not None and pPr.find(f"{W}ind") is not None:
            retraits += 1
    return {"vides": vides, "retraits": retraits}


def test_le_rythme_vertical_du_document_word_est_repris():
    """Chaque paragraphe vide et chaque énumération du .docx se retrouve dans le HTML.

    Les paragraphes vides portent l'aération du document Word : les retirer tassait l'acte
    d'un bon tiers de page et décalait toutes les coupures. Les paragraphes en retrait sont
    ses énumérations, rendues en liste faute d'attribut de retrait dans l'allowlist.
    """
    fichiers = sorted(SOURCES.glob("*.docx"))
    assert len(fichiers) == 10, "les dix .docx source doivent être lisibles"
    for fichier in fichiers:
        attendu = _blocs_docx(fichier)
        # Les modèles sortent dans l'ordre des fichiers, langue par langue : le numéro de
        # l'acte et sa langue suffisent à retrouver le bon corps.
        rang = int(fichier.name[:2]) - 1
        langue = "ar" if "_AR" in fichier.name else "fr"
        corps = [h for _d, _n, lang, h in _modeles() if lang == langue][rang]
        assert corps.count("<p></p>") == attendu["vides"], (
            f"{fichier.name} : {corps.count('<p></p>')} paragraphes vides "
            f"au lieu de {attendu['vides']}")
        assert corps.count("<li") == attendu["retraits"], (
            f"{fichier.name} : {corps.count('<li')} entrées de liste "
            f"au lieu de {attendu['retraits']}")
        # Un `<li>` hors liste serait retiré par l'assainissement.
        if attendu["retraits"]:
            assert "<ul>" in corps, f"{fichier.name} : des <li> sans <ul>"


def test_la_mise_en_page_des_documents_est_conservee():
    """Les actes portent du gras, des italiques et des alignements. Tout aplatir rendait un
    mur de texte sans hiérarchie, loin du document fourni."""
    for dtype, nom, langue, html in _modeles():
        assert "<strong>" in html, f"{dtype}/{langue} a perdu ses passages en gras"
        assert "text-align" in html, f"{dtype}/{langue} a perdu ses alignements"
        assert "<h3" in html, f"{dtype}/{langue} a perdu ses intitulés d'articles"
    # Les actes arabes se lisent de droite à gauche : leurs blocs sont alignés à droite.
    arabes = [h for _d, _n, langue, h in _modeles() if langue == "ar"]
    assert all("text-align:right;" in h for h in arabes)


def test_retire_les_modeles_basiques_dorigine():
    """Sans ce retrait, l'écran de création offrirait deux « Mandat de vente » au choix."""
    retrait = _sql().split("-- 2.")[0]
    assert "DELETE FROM contract.contract_template" in retrait
    for ancien in ("Mandat de vente (exclusif ou non exclusif)",
                   "Compromis de vente (promesse synallagmatique)",
                   "Contrat de bail (habitation)", "Mandat de location / gestion"):
        assert ancien in retrait, ancien


def test_les_nouveaux_intitules_ne_sont_pas_dans_la_liste_de_retrait():
    """Un intitulé neuf repris dans la suppression se ferait retirer puis réinsérer à chaque
    déploiement — l'identifiant du modèle changerait sous les contrats qui le citent."""
    retrait = _sql().split("-- 2.")[0]
    for _dtype, nom, _langue, _html in _modeles():
        assert nom not in retrait, f"« {nom} » figure dans la liste de retrait"


def test_cinq_actes_dans_les_deux_langues():
    modeles = _modeles()
    assert len(modeles) == 10, "cinq actes × deux langues"
    par_type: dict[str, set] = {}
    for dtype, _nom, langue, _html in modeles:
        par_type.setdefault(dtype, set()).add(langue)
    assert set(par_type) == {"compromise", "vefa", "lease", "mandate_rental", "mandate_sale"}
    for dtype, langues in par_type.items():
        assert langues == {"fr", "ar"}, f"{dtype} n'existe pas dans les deux langues"


def test_tous_les_placeholders_sont_resolus_par_la_fusion():
    """Un placeholder absent du contexte sort en chaîne vide : un blanc dans un acte signé."""
    resolus = set(build_context(None)) | set(STAY_PLACEHOLDERS)
    for dtype, nom, langue, html in _modeles():
        employes = set(PLACEHOLDER.findall(html))
        inconnus = employes - resolus
        assert not inconnus, f"{dtype}/{langue} ({nom}) emploie {sorted(inconnus)}"


def test_les_actes_traversent_le_nettoyage_inchanges():
    """Contrôle le plus fort disponible : `sanitize_html` ne doit RIEN modifier. Toute balise
    hors allowlist serait supprimée en silence (`strip=True`), emportant un article, un
    tableau d'échéancier ou une annexe — sans lever d'erreur."""
    for dtype, nom, langue, html in _modeles():
        assert sanitize_html(html) == html, f"{dtype}/{langue} ({nom}) est modifié au nettoyage"


def test_aucune_balise_de_structure_nest_supprimee_au_nettoyage():
    for dtype, nom, langue, html in _modeles():
        propre = sanitize_html(html)
        for balise in BALISES_SUIVIES:
            avant = html.count(f"<{balise}>")
            apres = propre.count(f"<{balise}>")
            assert apres == avant, f"{dtype}/{langue} : <{balise}> {avant} → {apres}"


def test_les_deux_langues_dun_acte_portent_les_memes_placeholders():
    """Les deux versions sont signées ensemble : un champ fusionné d'un côté et laissé en
    pointillés de l'autre produirait deux actes qui ne disent pas la même chose."""
    par_type: dict[str, dict] = {}
    for dtype, _nom, langue, html in _modeles():
        par_type.setdefault(dtype, {})[langue] = sorted(PLACEHOLDER.findall(html))
    for dtype, versions in par_type.items():
        assert versions["fr"] == versions["ar"], f"{dtype} : placeholders FR ≠ AR"


def test_les_actes_qui_nomment_des_parties_en_exigent_au_moins_une():
    """`create_contract` refuse de générer sans partie quand le modèle identifie ses parties.
    Les noms nus (`nom_vendeurs`…) doivent déclencher ce refus comme les blocs HTML."""
    avec_parties = [(d, langue) for d, _n, langue, h in _modeles()
                    if set(PLACEHOLDER.findall(h)) & set(ROLE_NAME_PLACEHOLDERS.values())]
    assert len(avec_parties) == 10, "les cinq actes nomment tous leurs parties"
    for dtype, _nom, _langue, html in _modeles():
        assert utilise_blocs_de_parties(html), dtype


class _Bien:
    property_type = "apartment"
    transaction_type = "rent"
    price_period = "month"
    address = "12 rue Oukaimeden, Agdal"
    city = "Rabat"
    surface = 118.0
    rooms = 4
    bedrooms = 2
    bathrooms = 1
    floor = 3
    price = 9500
    condo_fees = 350
    title = "Appartement Agdal"
    neighborhood = "Agdal"
    postal_code = "10080"
    land_surface = None
    construction_year = 2012
    charges = None
    reference = "REF-9"


class _Agence:
    name = "Agence Atlas"
    address = "45 avenue Mohammed V, Rabat"
    license_number = "L-2026-1"
    city = "Rabat"
    phone = "0537000000"
    email = "contact@atlas.ma"
    rc_number = "RC-88123"
    ice_number = "ICE-00199"


class _Client:
    first_name = "Sara"
    last_name = "Bennani"
    phone = "0661000000"
    email = "sara@example.ma"


@pytest.mark.parametrize("langue,attendu_type,attendu_consistance", [
    ("fr", "appartement", "4 pièces"),
    ("ar", "شقة", "4 غرف"),
])
def test_les_valeurs_redigees_par_le_serveur_suivent_la_langue(langue, attendu_type,
                                                               attendu_consistance):
    ctx = build_context(_Agence(), property=_Bien(), client=_Client(),
                        parties=[("bailleur", _Client())], lang=langue)
    assert ctx["property_type"] == attendu_type
    assert attendu_consistance in ctx["property_consistance"]
    assert ctx["nom_bailleurs"] == "Sara Bennani"


def test_les_nombres_nus_nont_ni_symbole_ni_unite():
    """Les actes écrivent « MAD », « m² » et « % » eux-mêmes : « 9 500,00 Dh MAD » serait faux."""
    ctx = build_context(_Agence(), property=_Bien())
    assert ctx["property_price_nombre"] == "9 500"
    assert ctx["property_surface_nombre"] == "118"
    assert ctx["property_condo_fees_nombre"] == "350"
    for cle in ("property_price_nombre", "property_surface_nombre"):
        assert "Dh" not in ctx[cle] and "m²" not in ctx[cle]


def test_un_prix_de_vente_nest_jamais_ecrit_en_loyer_mensuel():
    """Le défaut constaté sur un contrat réel : le bail généré sur un bien EN VENTE écrivait
    « loyer mensuel fixé à 860 000 MAD », le prix de vente du bien. Un montant faux dans un
    acte signé, qu'aucune erreur ne signale. Le champ retombe sur les pointillés."""
    class _BienEnVente(_Bien):
        transaction_type = "sale"

    class _BienCourteDuree(_Bien):
        price_period = "day"

    assert build_context(None, property=_Bien())["property_rent_nombre"] == "9 500"
    assert build_context(None, property=_BienEnVente())["property_rent_nombre"] == A_COMPLETER
    assert build_context(None, property=_BienCourteDuree())["property_rent_nombre"] == A_COMPLETER

    bail = next(h for d, _n, langue, h in _modeles() if d == "lease" and langue == "fr")
    rendu = render(bail, build_context(_Agence(), property=_BienEnVente(),
                                       parties=[("bailleur", _Client())]))
    assert "9 500" not in rendu


def test_un_champ_dacte_non_renseigne_sort_en_pointilles():
    """Le défaut le plus dangereux de la fusion : `render()` rend une chaîne vide pour une
    valeur absente. Une agence sans RC en base donnerait « RC n° , ICE , » dans un mandat
    signé — un blanc muet. Les champs d'acte retombent donc sur les pointillés."""
    class _AgenceNue:
        name = "Agence Atlas"
        address = city = phone = email = license_number = None
        rc_number = ice_number = None

    ctx = build_context(_AgenceNue(), property=_Bien())
    assert ctx["agency_rc"] == A_COMPLETER
    assert ctx["agency_ice"] == A_COMPLETER
    assert ctx["agency_name"] == "Agence Atlas"          # renseigné : pas écrasé
    assert ctx["asking_price_nombre"] == A_COMPLETER     # pas de transaction

    mandat = next(h for d, _n, langue, h in _modeles() if d == "mandate_sale" and langue == "fr")
    rendu = render(mandat, ctx)
    assert "RC n° ," not in rendu and "ICE ," not in rendu


def test_un_bail_rendu_porte_les_donnees_du_bien_et_plus_de_placeholder():
    bail_fr = next(h for d, _n, langue, h in _modeles() if d == "lease" and langue == "fr")
    rendu = render(bail_fr, build_context(_Agence(), property=_Bien(), client=_Client(),
                                          parties=[("bailleur", _Client()),
                                                   ("locataire", _Client())]))
    assert not PLACEHOLDER.search(rendu), "placeholder non substitué dans le rendu"
    assert "12 rue Oukaimeden, Agdal" in rendu
    assert "9 500" in rendu          # loyer mensuel
    assert "Agence Atlas" in rendu
    assert "RC-88123" in rendu


@pytest.mark.skipif(not SOURCES.exists(), reason="sources .docx absentes")
def test_le_sql_correspond_toujours_aux_docx_source():
    """Le SQL est généré : édité à la main, il serait écrasé au prochain passage du
    générateur. Ce test compare un bloc du .docx au HTML en base."""
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
    from build_modeles_marocains import CARTES, blocs, classe, en_html

    for nom, carte in CARTES.items():
        fr = blocs(SOURCES / f"{nom}_FR.docx")
        attendu = en_html(fr, classe(fr), carte["champs"])
        titre = carte["noms"]["fr"]
        en_base = next((h for _d, n, langue, h in _modeles() if n == titre and langue == "fr"), None)
        assert en_base is not None, f"{titre} absent de la migration"
        assert en_base == attendu, f"{nom} : le SQL a divergé du .docx — relancer le générateur"
