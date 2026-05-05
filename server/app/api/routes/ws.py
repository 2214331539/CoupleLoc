from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session, get_user_by_token
from app.services.connection_manager import connection_manager

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/locations")
async def locations_websocket(
    websocket: WebSocket,
    token: str | None = None,
    session: AsyncSession = Depends(get_db_session),
):
    if token is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user = await get_user_by_token(session, token)
    if user is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await connection_manager.connect(user.id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        connection_manager.disconnect(user.id, websocket)
