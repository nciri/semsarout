"""Événements publiés par commission."""
COMMISSION_DUE = "commission.due"          # → billing crée une Invoice(type=commission)
COMMISSION_SETTLED = "commission.settled"  # affaire conclue et commission réglée
COMMISSION_WAIVED = "commission.waived"    # 1re affaire offerte
