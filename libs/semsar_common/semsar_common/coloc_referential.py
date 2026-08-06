"""Référentiel lifestyle M3a-L3achrane — source unique du vocabulaire partagé.

Aligné sur les 13 questions du questionnaire m3a. coloc-profile valide les
réponses, coloc-listing valide les règles de vie, matching compare les mêmes
codes/valeurs.
"""

LIFESTYLE_QUESTIONS: dict[str, list[str]] = {
    "coucher": ["avant22", "22h-minuit", "apres-minuit"],
    "travail": ["jour", "decale", "teletravail"],
    "weekend": ["maison", "sorti", "ca-depend"],
    "menage": ["quotidien", "2-3-semaine", "hebdomadaire"],
    "vaisselle": ["immediat", "jour-meme", "beaucoup"],
    "tabac": ["non-fumeur", "balcon", "interieur"],
    "alcool": ["jamais", "occasionnel", "regulier"],
    "invites": ["rarement", "mensuel", "souvent"],
    "bruit": ["casque", "modere", "sans-contrainte"],
    "cuisine": ["separee", "parfois", "ensemble"],
    "charges": ["chacun", "commune", "a-definir"],
    "social": ["amis", "voisinage", "peu-importe"],
    "langue": ["darija", "francais", "indifferent"],
}

IMPORTANCE_LEVELS = {"INDIFFERENT", "PREFERENCE", "DECISIF"}
