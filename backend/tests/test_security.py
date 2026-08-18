"""Regressionstests fuer die im Review gefundenen Sicherheitsluecken.

Jeder Test hier deckt einen konkreten Befund ab und schlaegt fehl, wenn der
Fix zurueckgedreht wird.
"""
import os
import tempfile

import pytest

# Muss vor dem Import der App gesetzt sein - get_settings() ist gecacht.
os.environ.setdefault("DATABASE_URL", "sqlite:///" + tempfile.mktemp(suffix=".db"))
os.environ.setdefault("JWT_SECRET", "test-secret-mit-mindestens-32-zeichen-laenge")

from fastapi.testclient import TestClient  # noqa: E402

from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.core.ratelimit import login_limiter  # noqa: E402
from app.core.security import create_password_reset_token, hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Customer, Employee, Product, Role, Sale, SaleItem, User  # noqa: E402

PASSWORD = "PasswortPasswort1"


@pytest.fixture
def client():
    Base.metadata.create_all(bind=engine)
    yield TestClient(app)
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def employee_user():
    db = SessionLocal()
    try:
        user = User(
            email="mitarbeiter@example.com",
            full_name="Test Mitarbeiter",
            password_hash=hash_password(PASSWORD),
            role=Role.EMPLOYEE,
            must_change_password=True,
        )
        db.add(user)
        db.flush()
        employee = Employee(user_id=user.id, display_name="Test Mitarbeiter")
        db.add(employee)
        db.flush()
        db.commit()
        return user.id, employee.id
    finally:
        db.close()


@pytest.fixture(autouse=True)
def _clear_rate_limiter():
    """Sperren wirken prozessweit - sonst faerbt ein Test auf den naechsten ab."""
    login_limiter.clear()
    yield
    login_limiter.clear()


def _login(client, email=None):
    return client.post(
        "/api/v1/auth/login",
        json={"email": email or "mitarbeiter@example.com", "password": PASSWORD},
    )


def _make_sale(employee_id):
    from datetime import datetime, timezone

    db = SessionLocal()
    try:
        customer = Customer(employee_id=employee_id, first_name="Max", last_name="Muster")
        db.add(customer)
        product = Product(name="Testgeraet VK7", verified=True)
        db.add(product)
        db.flush()
        sale = Sale(
            customer_id=customer.id,
            employee_id=employee_id,
            sold_at=datetime.now(timezone.utc),
        )
        db.add(sale)
        db.flush()
        db.add(
            SaleItem(
                sale_id=sale.id,
                product_id=product.id,
                product_name_snapshot=product.name,
                quantity=1,
                unit_price_cents=100_000,
            )
        )
        db.commit()
        return sale.id
    finally:
        db.close()


def test_sale_cancel_requires_csrf_token(client, employee_user):
    """B1: Ohne CSRF-Header darf ein Verkauf nicht storniert werden.

    Frueher ging es hier um das Loeschen. Loeschen gibt es nicht mehr -
    stattdessen wird storniert, und der Schutz gilt unveraendert.
    """
    _, employee_id = employee_user
    sale_id = _make_sale(employee_id)
    assert _login(client).status_code == 200

    # Das Session-Cookie schickt der Client automatisch mit - genau das macht
    # ein CSRF-Angriff auch. Fehlt der Header, muss der Server ablehnen.
    response = client.post(f"/api/v1/sales/{sale_id}/cancel", json={"reason": None})
    assert response.status_code == 403

    csrf = client.cookies.get("orgaboard_csrf")
    ok = client.post(
        f"/api/v1/sales/{sale_id}/cancel",
        json={"reason": "Kunde zurückgetreten"},
        headers={"X-CSRF-Token": csrf},
    )
    assert ok.status_code == 200
    assert ok.json()["cancelled"] is True


def test_password_reset_clears_must_change_password(client, employee_user):
    """B3: Nach dem Reset darf der Zwangs-Dialog nicht stehen bleiben."""
    user_id, _ = employee_user
    db = SessionLocal()
    try:
        token = create_password_reset_token(db.get(User, user_id))
    finally:
        db.close()

    response = client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": token, "new_password": "GanzNeuesPasswort1"},
    )
    assert response.status_code == 200

    db = SessionLocal()
    try:
        assert db.get(User, user_id).must_change_password is False
    finally:
        db.close()


def test_reset_link_ignores_foreign_origin_header():
    """B2: Ein fremder Origin darf den Reset-Link nicht umlenken."""
    from app.routers.auth import _password_reset_frontend_url

    class ForeignOriginRequest:
        headers = {"origin": "https://angreifer.app.github.dev"}

    url = _password_reset_frontend_url(ForeignOriginRequest())
    assert "angreifer" not in url


def test_login_blocks_after_repeated_failures(client, employee_user):
    """B6: Wiederholtes Passwortraten muss gebremst werden."""
    from app.core.ratelimit import MAX_ATTEMPTS

    codes = [
        client.post(
            "/api/v1/auth/login",
            json={"email": "mitarbeiter@example.com", "password": f"falsch{i}"},
        ).status_code
        for i in range(MAX_ATTEMPTS + 2)
    ]
    assert 429 in codes, "Nach vielen Fehlversuchen muss gesperrt werden"

    # Auch das richtige Passwort kommt waehrend der Sperre nicht durch.
    assert client.post(
        "/api/v1/auth/login",
        json={"email": "mitarbeiter@example.com", "password": PASSWORD},
    ).status_code == 429


def test_password_reset_link_points_directly_to_login(client, employee_user, monkeypatch):
    """B7: Der Link muss auf /login zeigen.

    Zeigt er stattdessen auf die Startseite, faengt sie der Guard fuer einen
    ausgeloggten Benutzer ab und leitet per <Navigate to="/login"/> um - ein
    Redirect, der den Query-String mit dem Token verwirft, bevor die
    Login-Seite ihn lesen kann.
    """
    import app.routers.auth as auth_module

    monkeypatch.setattr(auth_module.settings, "smtp_host", "smtp.example.test")
    monkeypatch.setattr(auth_module.settings, "smtp_from_email", "no-reply@example.test")

    captured = {}

    def fake_send(recipient, reset_url):
        captured["reset_url"] = reset_url

    monkeypatch.setattr(auth_module, "_send_password_reset_email", fake_send)

    response = client.post(
        "/api/v1/auth/password-reset/request",
        json={"email": "mitarbeiter@example.com"},
    )
    assert response.status_code == 200
    reset_url = captured["reset_url"]
    assert reset_url.split("?")[0].endswith("/login")
    assert "reset_token=" in reset_url


def test_password_reset_rejects_invalid_token(client, employee_user):
    response = client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": "kein-gueltiges-jwt", "new_password": "GanzNeuesPasswort1"},
    )
    assert response.status_code == 400


def test_password_reset_rejects_expired_token(client, employee_user):
    import jwt
    from datetime import datetime, timedelta, timezone

    from app.core.config import get_settings
    from app.core.security import password_fingerprint

    user_id, _ = employee_user
    settings = get_settings()

    db = SessionLocal()
    try:
        user = db.get(User, user_id)
        pwd = password_fingerprint(user.password_hash)
    finally:
        db.close()

    now = datetime.now(timezone.utc)
    expired_payload = {
        "sub": user_id,
        "purpose": "password_reset",
        "pwd": pwd,
        "iat": int((now - timedelta(minutes=40)).timestamp()),
        "exp": int((now - timedelta(minutes=20)).timestamp()),
    }
    expired_token = jwt.encode(expired_payload, settings.jwt_secret, algorithm="HS256")

    response = client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": expired_token, "new_password": "GanzNeuesPasswort1"},
    )
    assert response.status_code == 400


def test_password_reset_token_cannot_be_used_twice(client, employee_user):
    """Nach einem erfolgreichen Reset macht der geaenderte Fingerabdruck denselben Link unbrauchbar."""
    user_id, _ = employee_user
    db = SessionLocal()
    try:
        token = create_password_reset_token(db.get(User, user_id))
    finally:
        db.close()

    erster = client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": token, "new_password": "GanzNeuesPasswort1"},
    )
    assert erster.status_code == 200

    zweiter = client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": token, "new_password": "NochEinAnderesPasswort2"},
    )
    assert zweiter.status_code == 400

    # Das erste, per Reset gesetzte Passwort muss weiterhin gelten - der
    # zweite (abgelehnte) Versuch darf nichts mehr veraendert haben.
    login = _login(client, "mitarbeiter@example.com")
    assert login.status_code == 401
    ok = client.post(
        "/api/v1/auth/login",
        json={"email": "mitarbeiter@example.com", "password": "GanzNeuesPasswort1"},
    )
    assert ok.status_code == 200


def test_public_jwt_secret_is_rejected_outside_development():
    """B5: Ein im Repository nachlesbares Secret darf nicht produktiv gelten."""
    from pydantic import ValidationError

    from app.core.config import PUBLIC_JWT_SECRETS, Settings

    for secret in PUBLIC_JWT_SECRETS:
        with pytest.raises(ValidationError):
            Settings(env="production", jwt_secret=secret, cookie_secure=True)
        with pytest.raises(ValidationError):
            Settings(env="staging", jwt_secret=secret)
