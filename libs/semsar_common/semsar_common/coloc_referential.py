"""Référentiel lifestyle M3a-L3achrane — source unique du vocabulaire partagé.

Le dépôt initial n'avait AUCUN référentiel (codes libres, accord implicite entre
profile/listing/matching). Formalisé au port : coloc-profile valide les réponses,
coloc-listing valide les règles de vie, matching compare les mêmes codes/valeurs.
"""

LIFESTYLE_QUESTIONS: dict[str, list[str]] = {
    "tabac": ["non_fumeur", "fumeur"],
    "animaux": ["acceptes", "refuses"],
    "invites": ["souvent", "rarement"],
    "coucher": ["tot", "tard"],
    "menage": ["frequent", "souple"],
}

IMPORTANCE_LEVELS = {"INDIFFERENT", "PREFERENCE", "DECISIF"}
