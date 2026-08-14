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


def test_sale_delete_requires_csrf_token(client, employee_user):
    """B1: Ohne CSRF-Header darf ein Verkauf nicht geloescht werden."""
    _, employee_id = employee_user
    sale_id = _make_sale(employee_id)
    assert _login(client).status_code == 200

    # Das Session-Cookie schickt der Client automatisch mit - genau das macht
    # ein CSRF-Angriff auch. Fehlt der Header, muss der Server ablehnen.
    response = client.request("DELETE", f"/api/v1/sales/{sale_id}")
    assert response.status_code == 403

    csrf = client.cookies.get("orgaboard_csrf")
    ok = client.request(
        "DELETE", f"/api/v1/sales/{sale_id}", headers={"X-CSRF-Token": csrf}
    )
    assert ok.status_code == 204


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


def test_public_jwt_secret_is_rejected_outside_development():
    """B5: Ein im Repository nachlesbares Secret darf nicht produktiv gelten."""
    from pydantic import ValidationError

    from app.core.config import PUBLIC_JWT_SECRETS, Settings

    for secret in PUBLIC_JWT_SECRETS:
        with pytest.raises(ValidationError):
            Settings(env="production", jwt_secret=secret, cookie_secure=True)
        with pytest.raises(ValidationError):
            Settings(env="staging", jwt_secret=secret)
