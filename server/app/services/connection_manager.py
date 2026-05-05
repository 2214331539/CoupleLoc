from collections import defaultdict
from collections.abc import Iterable
from uuid import UUID

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[UUID, list[WebSocket]] = defaultdict(list)

    async def connect(self, user_id: UUID, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections[user_id].append(websocket)

    def disconnect(self, user_id: UUID, websocket: WebSocket) -> None:
        user_connections = self._connections.get(user_id)
        if not user_connections:
            return
        if websocket in user_connections:
            user_connections.remove(websocket)
        if not user_connections:
            self._connections.pop(user_id, None)

    async def send_to_user(self, user_id: UUID, payload: dict) -> None:
        stale_connections: list[WebSocket] = []
        for websocket in list(self._connections.get(user_id, [])):
            try:
                await websocket.send_json(payload)
            except Exception:
                stale_connections.append(websocket)

        for websocket in stale_connections:
            self.disconnect(user_id, websocket)

    async def send_to_users(self, user_ids: Iterable[UUID], payload: dict) -> None:
        for user_id in set(user_ids):
            await self.send_to_user(user_id, payload)


connection_manager = ConnectionManager()
