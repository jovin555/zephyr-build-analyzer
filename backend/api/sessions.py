from fastapi import APIRouter, HTTPException
from models.session import SessionInfo
from services import session_store

router = APIRouter()


@router.get("/sessions", response_model=list[SessionInfo])
async def list_sessions():
    return session_store.list_all()


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    deleted = session_store.delete(session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Session not found.")
    return {"deleted": session_id}
