"""Tests fuer Rollenrang und Einzelrechte.

Das ist die Stelle, an der ein Fehler am teuersten waere: zu wenig zu sehen
sieht aus wie ein leerer Datenbestand, zu viel zu sehen faellt gar nicht
auf. Geprueft wird deshalb beides - dass hoehere Stufen nicht weniger
duerfen als niedrigere, und dass niedrigere nicht mehr duerfen als
vorgesehen.
"""
import os
import tempfile

import pytest

os.environ.setdefault("DATABASE_URL", "sqlite:///" + tempfile.mktemp(suffix=".db"))
os.environ.setdefault("JWT_SECRET", "test-secret-mit-mindestens-32-zeichen-laenge")

from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.core.permissions import (  # noqa: E402
    hat_recht,
    ist_systemadmin,
    rechte_uebersicht,
    require_permission,
    require_system_admin,
    rollenrechte,
    sieht_fremde_daten,
)
from app.core.rbac import require_team_leader  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.models import Permission, Role, User, UserPermission  # noqa: E402

from fastapi import HTTPException  # noqa: E402

PASSWORD = "PasswortPasswort1"


@pytest.fixture(autouse=True)
def _schema():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def _user(rolle: Role, email: str | None = None) -> User:
    db = SessionLocal()
    try:
        u = User(
            email=email or f"{rolle.value.lower()}@example.com",
            full_name=rolle.value,
            password_hash=hash_password(PASSWORD),
            role=rolle,
            must_change_password=False,
        )
        db.add(u)
        db.commit()
        db.refresh(u)
        db.expunge(u)
        return u
    finally:
        db.close()


# ------------------------------------------------------------- Rangfolge

def test_rangfolge_ist_aufsteigend():
    assert Role.EMPLOYEE.rang < Role.TEAM_LEADER.rang
    assert Role.TEAM_LEADER.rang < Role.REGIONAL_LEAD.rang
    assert Role.REGIONAL_LEAD.rang < Role.SYSTEM_ADMIN.rang


def test_hoehere_stufe_erfuellt_niedrigere():
    assert Role.SYSTEM_ADMIN.mindestens(Role.TEAM_LEADER)
    assert Role.REGIONAL_LEAD.mindestens(Role.TEAM_LEADER)
    assert Role.TEAM_LEADER.mindestens(Role.TEAM_LEADER)
    assert not Role.EMPLOYEE.mindestens(Role.TEAM_LEADER)


def test_bestehende_rollenwerte_unveraendert():
    """Ein gespeicherter Datensatz muss weiter gueltig bleiben."""
    assert Role.EMPLOYEE.value == "EMPLOYEE"
    assert Role.TEAM_LEADER.value == "TEAM_LEADER"


# ----------------------------------------------------- Sicht auf Fremdes

@pytest.mark.parametrize("rolle,erwartet", [
    (Role.EMPLOYEE, False),
    (Role.TEAM_LEADER, True),
    (Role.REGIONAL_LEAD, True),
    (Role.SYSTEM_ADMIN, True),
])
def test_wer_fremde_daten_sehen_darf(rolle, erwartet):
    assert sieht_fremde_daten(_user(rolle)) is erwartet


@pytest.mark.parametrize("rolle", [Role.TEAM_LEADER, Role.REGIONAL_LEAD, Role.SYSTEM_ADMIN])
def test_teamleiterpruefung_laesst_hoehere_stufen_durch(rolle):
    """Der Systemadministrator darf nicht an einer Teamleiterpruefung scheitern."""
    assert require_team_leader(_user(rolle)) is not None


def test_teamleiterpruefung_weist_mitarbeiter_ab():
    with pytest.raises(HTTPException) as fehler:
        require_team_leader(_user(Role.EMPLOYEE))
    assert fehler.value.status_code == 403


# -------------------------------------------------------- Systemadmin

def test_nur_der_systemadmin_ist_systemadmin():
    assert ist_systemadmin(_user(Role.SYSTEM_ADMIN)) is True
    assert ist_systemadmin(_user(Role.REGIONAL_LEAD, "r@example.com")) is False


def test_require_system_admin_weist_regionalleiter_ab():
    with pytest.raises(HTTPException) as fehler:
        require_system_admin(_user(Role.REGIONAL_LEAD))
    assert fehler.value.status_code == 403


# ----------------------------------------------------------- Einzelrechte

def test_systemadmin_hat_alle_rechte():
    assert rollenrechte(Role.SYSTEM_ADMIN) == set(Permission)


def test_mitarbeiter_darf_kunden_sehen_aber_nicht_loeschen():
    db = SessionLocal()
    try:
        u = _user(Role.EMPLOYEE)
        assert hat_recht(db, u, Permission.KUNDEN_SEHEN) is True
        assert hat_recht(db, u, Permission.KUNDEN_LOESCHEN) is False
        assert hat_recht(db, u, Permission.EXPORT) is False
    finally:
        db.close()


def test_teamleiter_darf_exportieren():
    db = SessionLocal()
    try:
        assert hat_recht(db, _user(Role.TEAM_LEADER), Permission.EXPORT) is True
    finally:
        db.close()


def test_einzelrecht_kann_zusaetzlich_gewaehrt_werden():
    u = _user(Role.EMPLOYEE)
    db = SessionLocal()
    try:
        db.add(UserPermission(user_id=u.id, permission=Permission.EXPORT, allowed=True))
        db.commit()
        assert hat_recht(db, u, Permission.EXPORT) is True
    finally:
        db.close()


def test_einzelrecht_kann_entzogen_werden():
    u = _user(Role.TEAM_LEADER)
    db = SessionLocal()
    try:
        db.add(UserPermission(user_id=u.id, permission=Permission.EXPORT, allowed=False))
        db.commit()
        assert hat_recht(db, u, Permission.EXPORT) is False
    finally:
        db.close()


def test_dem_systemadmin_laesst_sich_nichts_entziehen():
    """Sonst sperrt sich der Betreiber irgendwann selbst aus."""
    u = _user(Role.SYSTEM_ADMIN)
    db = SessionLocal()
    try:
        db.add(UserPermission(user_id=u.id, permission=Permission.EXPORT, allowed=False))
        db.commit()
        assert hat_recht(db, u, Permission.EXPORT) is True
    finally:
        db.close()


def test_require_permission_wirft_mit_lesbarem_grund():
    db = SessionLocal()
    try:
        with pytest.raises(HTTPException) as fehler:
            require_permission(db, _user(Role.EMPLOYEE), Permission.KUNDEN_LOESCHEN)
        assert fehler.value.status_code == 403
        assert "Kunden löschen" in fehler.value.detail
    finally:
        db.close()


def test_keine_rolle_darf_mehr_als_der_systemadmin():
    for rolle in Role:
        assert rollenrechte(rolle) <= set(Permission)
        assert rollenrechte(rolle) <= rollenrechte(Role.SYSTEM_ADMIN)


def test_hoehere_stufe_hat_nie_weniger_rechte():
    """Ein Regionalleiter darf nicht weniger duerfen als ein Teamleiter."""
    stufen = sorted(Role, key=lambda r: r.rang)
    for niedriger, hoeher in zip(stufen, stufen[1:]):
        assert rollenrechte(niedriger) <= rollenrechte(hoeher), (
            f"{hoeher.value} darf weniger als {niedriger.value}"
        )


# ------------------------------------------------------------ Uebersicht

def test_uebersicht_listet_jedes_recht_genau_einmal():
    db = SessionLocal()
    try:
        zeilen = rechte_uebersicht(db, _user(Role.EMPLOYEE))
        assert len(zeilen) == len(Permission)
        assert len({z["permission"] for z in zeilen}) == len(Permission)
    finally:
        db.close()


def test_uebersicht_zeigt_abweichung_getrennt_vom_rollenstandard():
    u = _user(Role.EMPLOYEE)
    db = SessionLocal()
    try:
        db.add(UserPermission(user_id=u.id, permission=Permission.EXPORT, allowed=True))
        db.commit()

        zeile = [z for z in rechte_uebersicht(db, u) if z["permission"] == "export.run"][0]
        assert zeile["from_role"] is False, "Die Rolle sieht das nicht vor"
        assert zeile["override"] is True, "Es ist ausdruecklich gewaehrt"
        assert zeile["effective"] is True
    finally:
        db.close()


def test_uebersicht_sperrt_die_haken_beim_systemadmin():
    db = SessionLocal()
    try:
        zeilen = rechte_uebersicht(db, _user(Role.SYSTEM_ADMIN))
        assert all(z["locked"] for z in zeilen)
        assert all(z["effective"] for z in zeilen)
    finally:
        db.close()
