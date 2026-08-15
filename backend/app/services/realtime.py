from dataclasses import dataclass
from fastapi import WebSocket
from app.models import Role


@dataclass
class SocketClient:
    websocket: WebSocket
    user_id: str
    employee_id: str | None
    role: str


class RealtimeManager:
    def __init__(self):
        self.clients: list[SocketClient] = []

    async def connect(self, client: SocketClient):
        await client.websocket.accept()
        self.clients.append(client)

    @staticmethod
    def _sieht_alles(rolle: str | None) -> bool:
        try:
            return Role(rolle).mindestens(Role.TEAM_LEADER)
        except ValueError:
            return False

    def disconnect(self, websocket: WebSocket):
        self.clients = [c for c in self.clients if c.websocket is not websocket]

    async def publish(self, event: dict, employee_id: str | None = None, user_id: str | None = None):
        dead: list[WebSocket] = []
        for client in self.clients:
            # Wer fremde Daten sehen darf, bekommt auch fremde Ereignisse.
            # Die Rolle liegt hier als Zeichenkette vor, deshalb der Umweg
            # ueber Role(...) - sonst waere ein Systemadministrator vom
            # Live-Aktualisieren ausgeschlossen.
            allowed = self._sieht_alles(client.role)
            if user_id and client.user_id == user_id:
                allowed = True
            if employee_id and client.employee_id == employee_id:
                allowed = True
            if employee_id is None and user_id is None:
                allowed = True
            if not allowed:
                continue
            try:
                await client.websocket.send_json(event)
            except Exception:
                dead.append(client.websocket)
        for ws in dead:
            self.disconnect(ws)


manager = RealtimeManager()
