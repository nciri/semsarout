from semsar_common.coloc_referential import IMPORTANCE_LEVELS, LIFESTYLE_QUESTIONS


def test_lifestyle_questions_cover_the_13_question_questionnaire():
    assert len(LIFESTYLE_QUESTIONS) == 13
    assert set(LIFESTYLE_QUESTIONS) == {
        "coucher", "travail", "weekend", "menage", "vaisselle", "tabac", "alcool",
        "invites", "bruit", "cuisine", "charges", "social", "langue",
    }


def test_each_question_has_exactly_three_distinct_values():
    for question_code, values in LIFESTYLE_QUESTIONS.items():
        assert len(values) == 3, question_code
        assert len(set(values)) == 3, question_code


def test_importance_levels_unchanged():
    assert IMPORTANCE_LEVELS == {"INDIFFERENT", "PREFERENCE", "DECISIF"}
