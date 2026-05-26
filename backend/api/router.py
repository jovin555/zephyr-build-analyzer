from fastapi import APIRouter
from api import upload, analysis, sessions

router = APIRouter()
router.include_router(upload.router)
router.include_router(analysis.router)
router.include_router(sessions.router)
