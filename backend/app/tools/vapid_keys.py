"""Erzeugt ein VAPID-Schluesselpaar fuer Web-Push.

Aufruf:

    python -m app.tools.vapid_keys

Die Ausgabe gehoert in die .env des Servers. Der private Schluessel darf das
System nie verlassen; der oeffentliche wird an den Browser ausgeliefert und
ist nicht geheim.
"""
import base64

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec


def _b64(rohdaten: bytes) -> str:
    # URL-sicher und ohne Auffuellzeichen - so verlangt es der Standard.
    return base64.urlsafe_b64encode(rohdaten).decode("ascii").rstrip("=")


def main() -> None:
    schluessel = ec.generate_private_key(ec.SECP256R1())

    privat = _b64(schluessel.private_numbers().private_value.to_bytes(32, "big"))
    oeffentlich = _b64(
        schluessel.public_key().public_bytes(
            encoding=serialization.Encoding.X962,
            format=serialization.PublicFormat.UncompressedPoint,
        )
    )

    print("# In die .env des Servers uebernehmen:")
    print(f"VAPID_PUBLIC_KEY={oeffentlich}")
    print(f"VAPID_PRIVATE_KEY={privat}")
    print("VAPID_CONTACT_EMAIL=betrieb@example.com")


if __name__ == "__main__":
    main()
