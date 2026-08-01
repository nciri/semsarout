import pytest

from app.state_machine import EDITABLE_STATUSES, TransitionError, assert_transition


@pytest.mark.parametrize(("current", "target"), [
    ("BROUILLON", "EN_MODERATION"), ("EN_MODERATION", "PUBLIEE"),
    ("EN_MODERATION", "REJETEE"), ("PUBLIEE", "RESERVEE"),
    ("RESERVEE", "LOUEE"), ("REJETEE", "BROUILLON"),
    ("PUBLIEE", "ARCHIVEE"), ("SUSPENDUE", "PUBLIEE"),
])
def test_allowed(current, target):
    assert_transition(current, target)  # ne lève pas


@pytest.mark.parametrize(("current", "target"), [
    ("BROUILLON", "PUBLIEE"), ("PUBLIEE", "BROUILLON"),
    ("ARCHIVEE", "PUBLIEE"), ("LOUEE", "PUBLIEE"),
])
def test_forbidden(current, target):
    with pytest.raises(TransitionError):
        assert_transition(current, target)


def test_editable_statuses():
    assert EDITABLE_STATUSES == {"BROUILLON", "REJETEE"}
