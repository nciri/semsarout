from app import main


def test_application_event_payload_has_no_contact_but_has_parties():
    # construit le payload comme dans submit_application (extraction de la logique en helper)
    payload = main._application_event_payload(app_id=1, applicant_user_id=10, owner_id=5,
                                              property_id=2, property_title="T")
    assert "applicant_email" not in payload
    assert "applicant_name" not in payload
    assert payload["applicant_user_id"] == 10
    assert payload["owner_id"] == 5
