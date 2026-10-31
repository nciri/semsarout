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
def _texte(el) -> str:
    out = []
    for n in el.iter():
        if n.tag == f"{W}t":
            out.append(n.text or "")
        elif n.tag == f"{W}tab":
            out.append(" ")
        elif n.tag == f"{W}br":
            out.append("\n")
    return "".join(out)


def blocs(path: Path) -> list:
    """Blocs du document, dans l'ordre : `("P", texte)` ou `("T", [[cellule, …], …])`."""
    with zipfile.ZipFile(path) as z:
        root = ET.fromstring(z.read("word/document.xml"))
    out = []
    for child in root.find(f"{W}body"):
        if child.tag == f"{W}p":
            t = _texte(child).strip()
            if t:
                out.append(("P", t))
        elif child.tag == f"{W}tbl":
            rows = [[_texte(tc).strip() for tc in tr.findall(f"{W}tc")]
                    for tr in child.findall(f"{W}tr")]
            out.append(("T", rows))
    return out


# ---- classement des blocs ---------------------------------------------------------
# Décidé sur la version FRANÇAISE puis appliqué tel quel à l'arabe, par index : la casse
# n'existe pas en arabe, et une détection par langue ferait diverger la structure des deux
# versions du même acte.
def classe(blocs_fr: list) -> list:
    roles = []
    for i, (kind, contenu) in enumerate(blocs_fr):
        if kind == "T":
            cellules = [c for row in contenu for c in row]
            if len(contenu) == 1 and len(cellules) == 1:
                # Tableau d'une seule cellule : un intitulé d'article, ou un encadré de mode
                # d'emploi. La longueur les sépare sans ambiguïté sur ces cinq documents.
                roles.append("h3" if len(cellules[0]) < 120 else "blockquote")
            else:
                roles.append("table")
            continue
        if i == 0:
            roles.append("h1")
        elif i == 1:
            roles.append("soustitre")
        elif len(contenu) < 90 and contenu == contenu.upper():
            roles.append("h2")      # « ANNEXE 1 — ÉTAT DES LIEUX… »
        else:
            roles.append("p")
    return roles


# ---- substitution des placeholders ------------------------------------------------
def pose_placeholders(texte: str, champs: dict, compteur: list) -> str:
    """Remplace les pointillés dont le rang figure dans `champs`. `compteur` porte le rang
    courant, partagé entre les cellules d'un même tableau."""
    def _un(m):
        compteur[0] += 1
        cle = champs.get(compteur[0])
        return "{{" + cle + "}}" if cle else m.group(0)
    return BLANC.sub(_un, texte)


def en_html(blocs_doc: list, roles: list, champs_par_bloc: dict) -> str:
    morceaux = []
    for i, ((kind, contenu), role) in enumerate(zip(blocs_doc, roles, strict=True)):
        champs = champs_par_bloc.get(i, {})
        compteur = [0]

        def prep(t):
            # `escape` ne touche pas aux accolades : les {{placeholders}} survivent.
            return escape(pose_placeholders(t, champs, compteur), quote=False).replace("\n", "<br>")

        if kind == "P":
            txt = prep(contenu)
            if role == "h1":
                morceaux.append(f"<h1>{txt}</h1>")
            elif role == "soustitre":
                morceaux.append(f"<p><em>{txt}</em></p>")
            elif role == "h2":
                morceaux.append(f"<h2>{txt}</h2>")
            else:
                morceaux.append(f"<p>{txt}</p>")
        elif role in ("h3", "blockquote"):
            txt = prep(contenu[0][0])
            morceaux.append(f"<h3>{txt}</h3>" if role == "h3" else f"<blockquote>{txt}</blockquote>")
        else:
            lignes = []
            for n, row in enumerate(contenu):
                balise = "th" if n == 0 and len(contenu) > 1 else "td"
                cells = "".join(f"<{balise}>{prep(c)}</{balise}>" for c in row)
                lignes.append(f"<tr>{cells}</tr>")
            corps = "".join(lignes)
            if len(contenu) > 1:
                morceaux.append(f"<table><thead>{lignes[0]}</thead><tbody>"
                                f"{''.join(lignes[1:])}</tbody></table>")
            else:
                morceaux.append(f"<table><tbody>{corps}</tbody></table>")
    return "\n".join(morceaux)


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
            html = en_html(doc, roles, carte["champs"])
            valeurs.append((carte["document_type"], carte["noms"][langue], langue, html))

    for i, (dtype, titre, langue, html) in enumerate(valeurs):
        virgule = "," if i < len(valeurs) - 1 else ""
        lignes.append(f"SELECT NULL::int, '{dtype}', $nom${titre}$nom$, '{langue}', $html$\n{html}\n$html$, TRUE, NOW(), NOW()")
        lignes.append(" WHERE NOT EXISTS (SELECT 1 FROM contract.contract_template t"
                      f" WHERE t.agency_id IS NULL AND t.name = $nom${titre}$nom$)")
        lignes.append("UNION ALL" if virgule else ";")

    SORTIE.write_text("\n".join(lignes) + "\n", encoding="utf-8")
    print(f"{SORTIE.relative_to(RACINE)} — {len(valeurs)} modèles, "
          f"{SORTIE.stat().st_size // 1024} Ko")
    return 0


if __name__ == "__main__":
    sys.exit(main())
