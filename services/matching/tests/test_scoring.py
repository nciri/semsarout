from decimal import Decimal

from app.scoring import ListingCriteria, SeekerCriteria, Weights, evaluate

W = Weights(version="test")


def _seeker(**over):
    base = dict(gender="FEMME", budget_min=Decimal("1000"), budget_max=Decimal("2500"),
                city_id="Casablanca", lifestyle={}, importance={})
    base.update(over)
    return SeekerCriteria(**base)


def _listing(**over):
    base = dict(listing_id="l1", housing_gender="FEMININ", rent=Decimal("2000"),
                city_id="Casablanca", capacity=3, house_rules={})
    base.update(over)
    return ListingCriteria(**base)


def test_hard_constraints():
    assert evaluate(_seeker(), _listing(housing_gender="MASCULIN"), W).hard_failures == ["genre-logement"]
    assert evaluate(_seeker(), _listing(rent=Decimal("2600")), W).hard_failures == ["budget"]
    assert evaluate(_seeker(), _listing(city_id="Rabat"), W).hard_failures == ["ville"]
    r = evaluate(_seeker(lifestyle={"tabac": "non_fumeur"}, importance={"tabac": "DECISIF"}),
                 _listing(house_rules={"tabac": "fumeur"}), W)
    assert r.hard_failures == ["decisif:tabac"] and r.score == 0


def test_score_and_weights():
    # loyer au budget_min → budget_fit 1.0 ; aucune préférence comparable → lifestyle_fit 1.0
    assert evaluate(_seeker(), _listing(rent=Decimal("1000")), W).score == 100
    # loyer au budget_max → budget_fit 0.5 → 0.4*0.5 + 0.6*1.0 = 0.8
    assert evaluate(_seeker(), _listing(rent=Decimal("2500")), W).score == 80
    # préférence en conflit → lifestyle_fit 0 → 0.4*1.0 = 0.4
    r = evaluate(_seeker(lifestyle={"coucher": "tot"}, importance={"coucher": "PREFERENCE"}),
                 _listing(rent=Decimal("1000"), house_rules={"coucher": "tard"}), W)
    assert r.score == 40


def test_explanations_max_four_and_content():
    r = evaluate(_seeker(lifestyle={"coucher": "tot", "tabac": "non_fumeur"},
                         importance={"coucher": "PREFERENCE", "tabac": "PREFERENCE"}),
                 _listing(house_rules={"coucher": "tot", "tabac": "fumeur"}), W)
    assert r.hard_pass and len(r.explanations) <= 4
    assert any("Budget compatible" in e for e in r.explanations)
    assert any("coucher" in e for e in r.explanations)      # atout
    assert any("vigilance" in e for e in r.explanations)     # tabac en conflit
