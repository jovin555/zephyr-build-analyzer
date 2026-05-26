from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from api.router import router
from config import settings
import os

app = FastAPI(title="Zephyr Build Analyzer", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")

os.makedirs(settings.upload_dir, exist_ok=True)
logger.info(f"Upload directory: {settings.upload_dir}")


@app.get("/api/health")
async def health():
    return {"status": "ok"}
