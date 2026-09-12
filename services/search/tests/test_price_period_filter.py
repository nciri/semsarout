from semsar_search.index import build_query


def _must(body):
    return body["query"]["bool"]["must"]


def _must_not(body):
    return body["query"]["bool"].get("must_not", [])


def test_default_excludes_short_term_listings():
    body = build_query({"transaction_type": "rent"}, [], [])
    assert {"terms": {"price_period": ["day", "week"]}} in _must_not(body)


def test_default_price_filter_uses_raw_price_field():
    body = build_query({"min_price": 1000, "max_price": 5000}, [], [])
    assert {"range": {"price": {"gte": 1000, "lte": 5000}}} in _must(body)


def test_short_term_includes_only_day_and_week():
    body = build_query({"short_term": True}, [], [])
    assert {"terms": {"price_period": ["day", "week"]}} in _must(body)
    assert _must_not(body) == []


def test_short_term_price_filter_uses_price_per_day_field():
    body = build_query({"short_term": True, "min_price": 200, "max_price": 800}, [], [])
    assert {"range": {"price_per_day": {"gte": 200, "lte": 800}}} in _must(body)
    assert not any("price" in r.get("range", {}) and "price_per_day" not in r.get("range", {})
                  for r in _must(body) if "range" in r)


def test_short_term_sort_uses_price_per_day():
    body = build_query({"short_term": True, "sort": "price_asc"}, [], [])
    assert {"price_per_day": "asc"} in body["sort"]
    assert {"price": "asc"} not in body["sort"]


def test_default_sort_uses_raw_price():
    body = build_query({"sort": "price_desc"}, [], [])
    assert {"price": "desc"} in body["sort"]
