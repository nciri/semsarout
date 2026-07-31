def test_rental_uses_shared_signing_lib():
    from app import main
    import semsar_signing
    # main.signing doit être la lib partagée, pas un module local rental.
    assert main.signing is semsar_signing
    assert hasattr(main.signing, "create_envelope")
    assert main.signing.signing_enabled.__module__ == "semsar_signing.client"
