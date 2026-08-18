"""Lokaler SMTP-Auffaenger fuer die Playwright-E2E-Suite.

Nimmt jede Mail entgegen und tut sonst nichts damit - kein Versand, keine
Zustellung, kein externer Kontakt. Ersetzt in der E2E-Umgebung den echten
Mailserver, damit ein Testlauf des Feedback-Formulars niemals eine
tatsaechliche E-Mail an orgaboard@gmail.com (oder eine andere echte Adresse)
verschickt.

Aufruf: python -m app.tools.fake_smtp [port]  (Standard: 1025)
"""
import sys
import threading

from aiosmtpd.controller import Controller


class _Auffaenger:
    async def handle_DATA(self, server, session, envelope):
        print(f"[fake_smtp] Mail aufgefangen: von {envelope.mail_from} an {envelope.rcpt_tos}", flush=True)
        return "250 OK"


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 1025
    controller = Controller(_Auffaenger(), hostname="localhost", port=port)
    controller.start()
    print(f"[fake_smtp] laeuft auf localhost:{port} - verschickt nichts wirklich.", flush=True)
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        pass
    finally:
        controller.stop()


if __name__ == "__main__":
    main()
