"""Événements publiés par payment (cycle séquestre + confirmation passerelle)."""
PAYMENT_HELD = "payment.held"            # fonds sous séquestre
PAYMENT_RELEASED = "payment.released"    # fonds libérés au bénéficiaire
PAYMENT_REFUNDED = "payment.refunded"    # remboursé
PAYMENT_COMPLETED = "payment.completed"  # confirmation passerelle (webhook) → billing active l'abonnement
