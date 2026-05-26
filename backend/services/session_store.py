from typing import Optional
from models.session import AnalysisResult, SessionInfo

_store: dict[str, AnalysisResult] = {}


def save(session_id: str, result: AnalysisResult) -> None:
    _store[session_id] = result


def get(session_id: str) -> Optional[AnalysisResult]:
    return _store.get(session_id)


def list_all() -> list[SessionInfo]:
    return [
        SessionInfo(
            session_id=r.session_id,
            created_at=r.created_at,
            files=r.files_received,
            status=r.status,
        )
        for r in _store.values()
    ]


def delete(session_id: str) -> bool:
    if session_id in _store:
        del _store[session_id]
        return True
    return False
