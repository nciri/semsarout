#!/usr/bin/env python3
"""Génère `db/migrate_modeles_marocains.sql` depuis les .docx de `docs/contracts_models/`.

Pourquoi un générateur plutôt qu'un SQL écrit à la main : les cinq actes existent en deux
langues, pèsent 6 à 12 kilo-caractères chacun, et seront révisés (la loi n° 41-25 est de
juillet 2026). Les retranscrire à la main, ce serait dix documents juridiques à retaper à
chaque correction, avec le risque d'une divergence silencieuse entre la version française et
l'arabe — dans un acte que l'on signe.

Le point qui rend la chose fiable : les deux versions de chaque acte ont **exactement** la
même structure — même nombre de blocs, mêmes types, et le même nombre de pointillés dans
chaque bloc (vérifié : 0 écart sur les cinq paires). Les placeholders sont donc posés par
POSITION — « bloc 7, 2e pointillé » — et non par reconnaissance de texte. Une carte unique
sert les deux langues, et aucune phrase juridique n'est réécrite ici.

    python services/contract/tools/build_modeles_marocains.py
"""
import re
import sys
import zipfile
from html import escape
from pathlib import Path
from xml.etree import ElementTree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
RACINE = Path(__file__).resolve().parents[3]
SOURCES = RACINE / "docs" / "contracts_models"
SORTIE = Path(__file__).resolve().parents[1] / "db" / "migrate_modeles_marocains.sql"

# Un pointillé de formulaire : au moins deux caractères « … » (U+2026) ou quatre points.
# Un « … » seul est une vraie ellipse de prose (« parking, cave, terrasse… ») et reste tel quel.
BLANC = re.compile("…{2,}|[.]{4,}")

# Les quatre modèles intégrés d'origine, remplacés par ceux-ci : mêmes intitulés, mais une
# page de clauses génériques contre un acte complet et sourcé. Laisser les deux en base
# donnerait deux « Mandat de vente » au choix dans l'écran de création.
ANCIENS = [
    # Quatre actes d'une page, posés par `migrate_modeles_builtin.sql` (migration retirée).
    "Bail à usage d'habitation (loi 67-12)",
    "Mandat de gestion locative (gérance)",
    "Mandat de vente (exclusif ou non exclusif)",
    "Compromis de vente (promesse synallagmatique)",
    # Quatre trames de 300 à 550 caractères importées du monolithe (ids 1 à 4), qui
    # porteraient les mêmes intitulés que les actes ci-dessous dans l'écran de création.
    "Mandat de vente",
    "Mandat de location / gestion",
    "Compromis de vente",
    "Contrat de bail (habitation)",
]

# ----------------------------------------------------------------------------------
# Carte des placeholders : {index de bloc: {n° du pointillé dans ce bloc: placeholder}}
#
# Un pointillé n'est remplacé que si le système détient VRAIMENT la donnée. Numéro de titre
# foncier, CNIE, nationalité, régime matrimonial, RIB, capital social, numéro de police
# d'assurance : rien de tout cela n'est stocké, donc les pointillés restent — ils se lisent
# comme un champ à remplir, alors qu'un placeholder non résolu rend une chaîne vide
# (cf. `render`), c'est-à-dire un blanc muet dans un acte signé.
# ----------------------------------------------------------------------------------
CARTES = {
    "01_Compromis_de_vente": {
        # L'intitulé sert d'étiquette dans l'écran de création : le titre brut du .docx crie
        # en majuscules et traîne ses cases à cocher (« MANDAT DE VENTE — ☐ SIMPLE ☐ EXCLUSIF »).
        "noms": {"fr": "Compromis de vente — acte authentique (loi n° 41-25)", "ar": "وعد متبادل ببيع عقار محفظ"},
        "document_type": "compromise",
        "champs": {
            5: {1: "nom_vendeurs"},                       # vendeur personne physique
            8: {1: "nom_acquereurs"},                     # acquéreur
            10: {1: "agency_name", 2: "agency_rc", 3: "agency_ice", 4: "agent_name"},
            15: {1: "property_address", 2: "property_city"},
            17: {1: "property_surface_nombre"},
            18: {1: "property_consistance"},
            27: {2: "asking_price_nombre"},               # (<<1>> dirhams en lettres)
            60: {1: "commission_rate_nombre", 2: "commission_amount_nombre"},
            76: {1: "agency_city", 2: "date"},
        },
    },
    "02_Contrat_preliminaire_VEFA": {
        # L'intitulé sert d'étiquette dans l'écran de création : le titre brut du .docx crie
        # en majuscules et traîne ses cases à cocher (« MANDAT DE VENTE — ☐ SIMPLE ☐ EXCLUSIF »).
        "noms": {"fr": "Contrat préliminaire VEFA (loi n° 44-00)", "ar": "عقد البيع الابتدائي لعقار في طور الإنجاز"},
        "document_type": "vefa",
        "champs": {
            4: {1: "nom_vendeurs"},                       # promoteur
            5: {1: "nom_acquereurs"},
            6: {2: "transaction_reference"},
            10: {1: "property_title", 2: "property_address"},
            15: {3: "property_floor", 5: "property_type"},
            16: {1: "property_surface_nombre", 3: "property_consistance"},
            21: {2: "asking_price_nombre"},
            55: {1: "agency_city", 2: "date"},
        },
    },
    "03_Contrat_de_bail_habitation": {
        # L'intitulé sert d'étiquette dans l'écran de création : le titre brut du .docx crie
        # en majuscules et traîne ses cases à cocher (« MANDAT DE VENTE — ☐ SIMPLE ☐ EXCLUSIF »).
        "noms": {"fr": "Bail d'habitation — loi n° 67-12", "ar": "عقد كراء محل معد للسكنى"},
        "document_type": "lease",
        "champs": {
            4: {1: "nom_bailleurs"},
            5: {1: "agency_name", 2: "agency_rc", 3: "agency_ice"},
            6: {1: "nom_locataires"},
            11: {1: "property_address", 2: "property_city"},
            12: {1: "property_floor", 2: "property_surface_nombre", 3: "property_consistance"},
            20: {1: "property_rent_nombre"},              # loyer mensuel, jamais un prix de vente
            23: {1: "property_condo_fees_nombre"},        # charges de copropriété
            60: {1: "commission_amount_nombre"},          # honoraires de location
            62: {1: "agency_city", 2: "date"},
            66: {1: "property_address"},                  # annexe état des lieux
        },
    },
    "04_Mandat_de_location_et_gestion": {
        # L'intitulé sert d'étiquette dans l'écran de création : le titre brut du .docx crie
        # en majuscules et traîne ses cases à cocher (« MANDAT DE VENTE — ☐ SIMPLE ☐ EXCLUSIF »).
        "noms": {"fr": "Mandat de location et de gestion locative", "ar": "وكالة الكراء والتسيير الكرائي"},
        "document_type": "mandate_rental",
        "champs": {
            4: {1: "nom_mandants", 4: "client_phone", 5: "client_email"},
            5: {1: "agency_name", 4: "agency_address", 5: "agency_rc", 7: "agency_ice",
                12: "agent_name"},
            7: {1: "property_address", 2: "property_surface_nombre"},
            11: {1: "property_rent_nombre"},              # loyer mensuel minimum
            23: {2: "commission_amount_nombre"},          # honoraires de mise en location
            24: {1: "commission_rate_nombre"},            # honoraires de gestion
            28: {2: "date"},                              # prise d'effet du mandat
            36: {1: "agency_city", 2: "date"},
        },
    },
    "05_Mandat_de_vente": {
        # L'intitulé sert d'étiquette dans l'écran de création : le titre brut du .docx crie
        # en majuscules et traîne ses cases à cocher (« MANDAT DE VENTE — ☐ SIMPLE ☐ EXCLUSIF »).
        "noms": {"fr": "Mandat de vente — simple ou exclusif", "ar": "وكالة البيع — عادية أو حصرية"},
        "document_type": "mandate_sale",
        "champs": {
            4: {1: "nom_mandants", 4: "client_phone", 5: "client_email"},
            5: {1: "agency_name", 2: "agency_rc", 4: "agency_ice", 6: "agency_address",
                9: "agent_name"},
            7: {1: "property_address", 2: "property_surface_nombre",
                3: "property_consistance"},
            13: {1: "asking_price_nombre"},
            34: {1: "commission_rate_nombre", 2: "commission_amount_nombre"},
            42: {1: "agency_city", 2: "date"},
        },
    },
}


# ---- lecture du .docx -------------------------------------------------------------
# Les actes portent une vraie mise en page : 36 passages en gras, des italiques, des
# paragraphes justifiés ou centrés, des bandeaux de titre. Tout aplatir rendait un mur de
# texte. Ce qui est conservé est ce que l'allowlist produit accepte (`semsar_common.
# html_sanitize`) : `<strong>`, `<em>`, `<u>` et `text-align` — la seule propriété CSS admise.
# Les couleurs et les fonds de cellule ne passent pas par le contenu : ils sont rendus par la
# feuille de style du PDF (app/pdf.py), là où la présentation a sa place.
ALIGNEMENTS = {"center": "center", "right": "right", "both": "justify", "end": "right"}


def _runs(p) -> list:
    """Passages d'un paragraphe : `[(texte, gras, italique, souligné), …]`, voisins fusionnés."""
    out = []
    for r in p.findall(f"{W}r"):
        txt = []
        for n in r.iter():
            if n.tag == f"{W}t":
                txt.append(n.text or "")
            elif n.tag == f"{W}tab":
                txt.append(" ")
            elif n.tag == f"{W}br":
                txt.append("\n")
        txt = "".join(txt)
        if not txt:
            continue
        rpr = r.find(f"{W}rPr")
        def actif(tag):
            if rpr is None:
                return False
            el = rpr.find(f"{W}{tag}")
            return el is not None and el.get(f"{W}val") not in ("0", "false", "none")
        style = (actif("b"), actif("i"), actif("u"))
        if out and out[-1][1:] == style:
            out[-1] = (out[-1][0] + txt, *style)
        else:
            out.append((txt, *style))
    return out


def _alignement(p) -> str | None:
    pr = p.find(f"{W}pPr")
    if pr is None:
        return None
    jc = pr.find(f"{W}jc")
    return ALIGNEMENTS.get(jc.get(f"{W}val", "")) if jc is not None else None


def _texte(el) -> str:
    """Texte brut d'un élément — sert au classement des blocs et aux contrôles."""
    out = []
    for n in el.iter():
        if n.tag == f"{W}t":
            out.append(n.text or "")
        elif n.tag == f"{W}tab":
            out.append(" ")
        elif n.tag == f"{W}br":
            out.append("\n")
    return "".join(out)


def _cellule(tc) -> list:
    """Passages d'une cellule : ses paragraphes, séparés par un saut de ligne."""
    out = []
    for i, p in enumerate(tc.findall(f"{W}p")):
        runs = _runs(p)
        if not runs:
            continue
        if out:
            out.append(("\n", False, False, False))
        out.extend(runs)
    return out


def _retrait(p) -> bool:
    """Vrai si le paragraphe porte un retrait gauche (`w:ind`).

    Les actes s'en servent pour leurs énumérations (« – Copie des pièces d'identité ; »),
    jamais pour autre chose : c'est ce qui permet de les rendre en liste.
    """
    pPr = p.find(f"{W}pPr")
    return pPr is not None and pPr.find(f"{W}ind") is not None


def blocs(path: Path) -> list:
    """Blocs du document : `("P", runs, alignement, retrait)` ou `("T", rows, None, False)`.

    Les paragraphes vides sont conservés : ils portent le rythme vertical du document Word,
    et les retirer tassait l'acte d'un bon tiers de page.
    """
    with zipfile.ZipFile(path) as z:
        root = ET.fromstring(z.read("word/document.xml"))
    out = []
    for child in root.find(f"{W}body"):
        if child.tag == f"{W}p":
            out.append(("P", _runs(child), _alignement(child), _retrait(child)))
        elif child.tag == f"{W}tbl":
            rows = [[_cellule(tc) for tc in tr.findall(f"{W}tc")]
                    for tr in child.findall(f"{W}tr")]
            out.append(("T", rows, None, False))
    return out


def texte_de(bloc) -> str:
    """Texte brut d'un bloc, pour le classement et le comptage des pointillés."""
    kind, contenu, _, _ = bloc
    if kind == "P":
        return "".join(t for t, *_ in contenu)
    return " ".join("".join(t for t, *_ in cell) for row in contenu for cell in row)


# ---- classement des blocs ---------------------------------------------------------
# Décidé sur la version FRANÇAISE puis appliqué tel quel à l'arabe, par index : la casse
# n'existe pas en arabe, et une détection par langue ferait diverger la structure des deux
# versions du même acte.
def classe(blocs_fr: list) -> list:
    roles = []
    rang_texte = 0   # rang du paragraphe NON vide : les vides ne décalent pas titre et sous-titre
    for bloc in blocs_fr:
        kind, contenu, _, retrait = bloc
        texte = texte_de(bloc).strip()
        if kind == "P" and not texte:
            roles.append("vide")
            continue
        if kind == "T":
            if len(contenu) == 1 and len(contenu[0]) == 1:
                # Tableau d'une seule cellule : un intitulé d'article (bandeau sombre dans le
                # .docx), ou un encadré de mode d'emploi. La longueur les sépare sans
                # ambiguïté sur ces cinq documents.
                roles.append("h3" if len(texte) < 120 else "blockquote")
            else:
                roles.append("table")
            continue
        rang_texte += 1
        if rang_texte == 1:
            roles.append("h1")
        elif rang_texte == 2:
            roles.append("soustitre")
        elif len(texte) < 90 and texte == texte.upper():
            roles.append("h2")      # « ANNEXE 1 — ÉTAT DES LIEUX… »
        elif retrait:
            roles.append("liste")   # énumération en retrait dans le .docx
        else:
            roles.append("p")
    return roles


# ---- substitution des placeholders ------------------------------------------------
def pose_placeholders(texte: str, champs: dict, compteur: list) -> str:
    """Remplace les pointillés dont le rang figure dans `champs`. `compteur` porte le rang
    courant, partagé entre les passages d'un paragraphe et les cellules d'un tableau."""
    def _un(m):
        compteur[0] += 1
        cle = champs.get(compteur[0])
        return "{{" + cle + "}}" if cle else m.group(0)
    return BLANC.sub(_un, texte)


def _inline(runs: list, champs: dict, compteur: list) -> str:
    """Passages d'un paragraphe en HTML, mise en forme conservée.

    Un pointillé réparti sur deux passages de formatage différent serait compté deux fois :
    le bloc est alors rendu sans mise en forme plutôt que mal substitué (`_segments_surs`).
    """
    morceaux = []
    for texte, gras, italique, souligne in runs:
        pose = escape(pose_placeholders(texte, champs, compteur), quote=False)
        pose = pose.replace("\n", "<br>")
        for actif, balise in ((gras, "strong"), (italique, "em"), (souligne, "u")):
            if actif and pose.strip():
                pose = f"<{balise}>{pose}</{balise}>"
        morceaux.append(pose)
    return "".join(morceaux)


def _segments_surs(runs: list) -> list:
    """`runs` tels quels si aucun pointillé n'est coupé entre deux passages, sinon un seul
    passage sans mise en forme — la substitution correcte primant sur le gras."""
    entier = "".join(t for t, *_ in runs)
    if len(BLANC.findall(entier)) == sum(len(BLANC.findall(t)) for t, *_ in runs):
        return runs
    return [(entier, False, False, False)]


def en_html(blocs_doc: list, roles: list, champs_par_bloc: dict, langue: str = "fr") -> str:
    # Les actes arabes se lisent de droite à gauche. `text-align` est la seule propriété CSS
    # que l'allowlist produit admet : elle porte l'essentiel de la mise en page des blocs.
    defaut = "right" if langue == "ar" else None
    morceaux = []
    # `champs_par_bloc` (les CARTES) est numéroté sur les blocs PORTEURS DE TEXTE : les
    # paragraphes vides, conservés depuis pour le rythme vertical, ne décalent pas ce rang.
    rang = -1
    for bloc, role in zip(blocs_doc, roles, strict=True):
        kind, contenu, align, _ = bloc
        if role != "vide":
            rang += 1
        champs = champs_par_bloc.get(rang, {})
        compteur = [0]
        style = ""
        choix = align or defaut
        if choix and choix != "left":
            style = f' style="text-align:{choix};"'

        if role == "vide":
            morceaux.append("<p></p>")
        elif kind == "P":
            corps = _inline(_segments_surs(contenu), champs, compteur)
            if role == "liste":
                morceaux.append(f"<li{style}>{corps}</li>")
            elif role == "h1":
                morceaux.append(f'<h1 style="text-align:center;">{corps}</h1>')
            elif role == "soustitre":
                morceaux.append(f'<p style="text-align:center;"><em>{corps}</em></p>')
            elif role == "h2":
                morceaux.append(f"<h2{style}>{corps}</h2>")
            else:
                morceaux.append(f"<p{style}>{corps}</p>")
        elif role in ("h3", "blockquote"):
            corps = _inline(_segments_surs(contenu[0][0]), champs, compteur)
            balise = "h3" if role == "h3" else "blockquote"
            morceaux.append(f"<{balise}{style}>{corps}</{balise}>")
        else:
            lignes = []
            for n, row in enumerate(contenu):
                balise = "th" if n == 0 and len(contenu) > 1 else "td"
                cells = "".join(
                    f"<{balise}{style}>{_inline(_segments_surs(cell), champs, compteur)}</{balise}>"
                    for cell in row)
                lignes.append(f"<tr>{cells}</tr>")
            if len(contenu) > 1:
                morceaux.append(f"<table><thead>{lignes[0]}</thead>"
                                f"<tbody>{''.join(lignes[1:])}</tbody></table>")
            else:
                morceaux.append(f"<table><tbody>{''.join(lignes)}</tbody></table>")
    return "\n".join(_en_listes(morceaux, roles))


def _en_listes(morceaux: list, roles: list) -> list:
    """Enveloppe les suites de `<li>` dans un `<ul>`.

    Un `<li>` hors liste serait retiré par l'assainissement produit. Les paragraphes vides
    qui séparent deux entrées de la même énumération sont absorbés dans la liste : dans le
    .docx, c'est l'espacement du paragraphe qui les sépare, pas une rupture.
    """
    out, courante = [], []

    def _fermer():
        if courante:
            out.append(f"<ul>{''.join(courante)}</ul>")
            courante.clear()

    for i, html in enumerate(morceaux):
        if roles[i] == "liste":
            courante.append(html)
        elif roles[i] == "vide" and courante and "liste" in roles[i + 1:i + 2]:
            continue
        else:
            _fermer()
            out.append(html)
    _fermer()
    return out


# ---- génération du SQL ------------------------------------------------------------
ENTETE = """-- Modèles de contrats marocains — cinq actes, chacun en français et en arabe.
--
-- GÉNÉRÉ par `services/contract/tools/build_modeles_marocains.py` depuis les .docx de
-- `docs/contracts_models/`. Ne pas éditer à la main : corriger le .docx puis relancer le
-- générateur, sinon la prochaine exécution écrase la correction.
--
-- Remplace les quatre modèles intégrés d'origine (une page de clauses génériques chacun) par
-- des actes complets, sourcés sur le DOC, la loi n° 67-12 (baux), la loi n° 44-00 et la loi
-- n° 107-12 (VEFA), le Code des droits réels tel que modifié par la loi n° 41-25, et le Dahir
-- du 12 août 1913 sur l'immatriculation foncière.
--
-- Rejouable : chaque insertion est gardée par un NOT EXISTS sur (agency_id IS NULL, name).
"""


def main() -> int:
    manquants = [n for n in CARTES for suffixe in ("FR", "AR")
                 if not (SOURCES / f"{n}_{suffixe}.docx").exists()]
    if manquants:
        print(f"sources absentes : {sorted(set(manquants))}", file=sys.stderr)
        return 1

    lignes = [ENTETE, ""]
    lignes.append("-- 1. Retrait des quatre modèles intégrés d'origine. Les contrats déjà")
    lignes.append("-- générés ne sont pas touchés : leur corps est copié dans `contract.body_html`")
    lignes.append("-- à la création, le modèle ne sert plus après coup.")
    noms = ", ".join("$n$" + n + "$n$" for n in ANCIENS)
    lignes.append("DELETE FROM contract.contract_template")
    lignes.append(f" WHERE is_builtin IS TRUE AND agency_id IS NULL AND name IN ({noms});")
    lignes.append("")
    lignes.append("-- 2. Les dix modèles (cinq actes × deux langues).")
    lignes.append("-- Upsert sur l'index unique partiel des modèles intégrés : un acte révisé dans son")
    lignes.append("-- .docx se propage au déploiement suivant. Une insertion gardée par NOT EXISTS")
    lignes.append("-- laissait la première version en base pour toujours.")
    lignes.append("INSERT INTO contract.contract_template "
                  "(agency_id, document_type, name, lang, body_html, is_builtin, created_at, updated_at)")

    valeurs = []
    for nom, carte in CARTES.items():
        fr = blocs(SOURCES / f"{nom}_FR.docx")
        ar = blocs(SOURCES / f"{nom}_AR.docx")
        if [b[0] for b in fr] != [b[0] for b in ar]:
            print(f"{nom} : structures FR/AR divergentes, carte inapplicable", file=sys.stderr)
            return 1
        roles = classe(fr)
        for langue, doc in (("fr", fr), ("ar", ar)):
            html = en_html(doc, roles, carte["champs"], langue)
            valeurs.append((carte["document_type"], carte["noms"][langue], langue, html))

    for i, (dtype, titre, langue, html) in enumerate(valeurs):
        lignes.append(f"SELECT NULL::int, '{dtype}', $nom${titre}$nom$, '{langue}', $html$\n{html}\n$html$, TRUE, NOW(), NOW()")
        lignes.append("UNION ALL" if i < len(valeurs) - 1 else "")
    lignes.append("ON CONFLICT (name) WHERE agency_id IS NULL DO UPDATE SET")
    lignes.append("    document_type = EXCLUDED.document_type,")
    lignes.append("    lang = EXCLUDED.lang,")
    lignes.append("    body_html = EXCLUDED.body_html,")
    lignes.append("    is_builtin = TRUE,")
    lignes.append("    updated_at = NOW();")

    SORTIE.write_text("\n".join(lignes) + "\n", encoding="utf-8")
    print(f"{SORTIE.relative_to(RACINE)} — {len(valeurs)} modèles, "
          f"{SORTIE.stat().st_size // 1024} Ko")
    return 0


if __name__ == "__main__":
    sys.exit(main())
