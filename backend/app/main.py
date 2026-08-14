from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from app.core.config import get_settings
from app.core.database import Base, SessionLocal, engine
from app.core.security import decode_session_token
from app.models import Employee, User
from app.routers import appointments, assistant, auth, buntewoche, customers, dashboard, directory, history, messages, notifications, presentations, products, profile, rentals, sales, search, team
from app.services.realtime import SocketClient, manager

settings=get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.auto_create_schema:
        Base.metadata.create_all(bind=engine)
    yield


app=FastAPI(title="OrgaBoard API",version="1.0.0",lifespan=lifespan)
app.add_middleware(CORSMiddleware,allow_origins=[settings.frontend_origin],allow_credentials=True,allow_methods=["*"],allow_headers=["*"])

for router in [auth.router,dashboard.router,customers.router,appointments.router,sales.router,presentations.router,products.router,rentals.router,buntewoche.router,messages.router,assistant.router,search.router,history.router,team.router,profile.router,directory.router,notifications.router]:
    app.include_router(router,prefix=settings.api_prefix)

@app.get("/health")
def health():
    return {"status":"ok","service":"orgaboard-api"}

@app.websocket("/ws/updates")
async def updates(websocket: WebSocket):
    token=websocket.cookies.get("orgaboard_session")
    if not token:
        await websocket.close(code=4401);return
    try:
        payload=decode_session_token(token)
    except Exception:
        await websocket.close(code=4401);return
    db=SessionLocal()
    try:
        user=db.get(User,payload.get("sub"))
        if not user or not user.is_active:
            await websocket.close(code=4401);return
        employee=db.scalar(select(Employee).where(Employee.user_id==user.id))
        client=SocketClient(websocket=websocket,user_id=user.id,employee_id=employee.id if employee else None,role=user.role.value)
        await manager.connect(client)
        try:
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            manager.disconnect(websocket)
    finally:
        db.close()
