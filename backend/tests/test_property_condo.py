from app.models.property import Property


def _prop(**kw):
    base = dict(reference="R1", title="T", property_type="apartment",
                transaction_type="sale", price=100000, city="Casablanca", owner_id=1)
    base.update(kw)
    return Property(**base)


def test_to_dict_exposes_condo_fields():
    p = _prop(is_condo=True, condo_fees=800)
    d = p.to_dict(include_images=False)
    assert d["is_condo"] is True
    assert d["condo_fees"] == 800.0


def test_to_dict_condo_defaults():
    p = _prop()
    d = p.to_dict(include_images=False)
    assert d["is_condo"] in (False, None)
    assert d["condo_fees"] is None
