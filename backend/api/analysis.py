from fastapi import APIRouter, HTTPException
from models.session import AnalysisResult
from services import session_store

router = APIRouter()


@router.get("/analysis/{session_id}", response_model=AnalysisResult)
async def get_analysis(session_id: str):
    result = session_store.get(session_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Session not found.")
    return result
