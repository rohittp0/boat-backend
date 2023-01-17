from enum import Enum
from typing import List

from fastapi import APIRouter
from starlette.websockets import WebSocket, WebSocketDisconnect

from config.variables import set_up

config = set_up()
router = APIRouter()


class ClientTypes(Enum):
    ADMIN = "admin"
    BOAT = "boat"
    CLIENT = "viewer"


async def read_json(websocket: WebSocket):
    try:
        while True:
            yield await websocket.receive_json()
    except WebSocketDisconnect:
        pass


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.device_connection = None

    async def connect(self, websocket: WebSocket, client: ClientTypes, key=None):
        await websocket.accept()

        if client == ClientTypes.ADMIN or client == ClientTypes.BOAT:
            key = key if key else websocket.headers.get("key")

            if key != config["boat_key"]:
                await websocket.send_json({"type": "connection", "status": "failed"})
                return await websocket.close()

        if client == ClientTypes.BOAT:
            self.device_connection = websocket
            await self.broadcast({"type": "device", "status": "connected"})
        else:
            self.active_connections.append(websocket)

        await websocket.send_json({"type": "connection", "status": "connected"})

        async for data in read_json(websocket):
            if client == ClientTypes.BOAT:
                await self.from_boat(data)
            else:
                await self.from_client(data, websocket, client)

        await self.disconnect(websocket, client)

    async def disconnect(self, websocket: WebSocket, client: ClientTypes):
        if client == ClientTypes.BOAT:
            self.device_connection = None
            await self.broadcast({"type": "device", "status": "disconnected"})
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, param):
        for connection in self.active_connections:
            await connection.send_json(param)

    async def from_boat(self, data):
        if data["type"] == "data":
            await self.broadcast(data)

    async def from_client(self, data, websocket, client):
        if data["type"] == "info":
            await websocket.send_json({
                "type": "device",
                "status": "connected" if self.device_connection else "disconnected"
            })

        if client != ClientTypes.ADMIN:
            return

        print(data)

        if data["type"] == "command":
            if not self.device_connection:
                return await websocket.send_json({"type": "error", "message": "Device is not connected"})

            data = data["data"]
            message = {
                "type": "command",
                "data": data["key"][0].upper() if data["on"] else data["key"][0].lower()
            }

            await self.device_connection.send_json(message)


manager = ConnectionManager()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, client: ClientTypes, key=None):
    await manager.connect(websocket, client, key)
