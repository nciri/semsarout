import os

# Lu à l'import de app.main : sans quoi `get_principal` ignore les en-têtes de passerelle
# et toute route authentifiée répond 401 en test (patron de services/analytics/tests).
os.environ.setdefault("TRUST_GATEWAY_HEADERS", "true")
