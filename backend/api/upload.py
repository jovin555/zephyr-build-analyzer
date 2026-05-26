import shutil
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, UploadFile, File, BackgroundTasks, HTTPException
from loguru import logger

from config import settings
from models.session import UploadResponse
from services import analysis_service, session_store

router = APIRouter()

_FILE_FIELDS = {
    "elf_file": "elf",
    "map_file": "map",
    "config_file": "config",
    "dts_file": "dts",
}


@router.post("/upload", response_model=UploadResponse)
async def upload_build(
    background_tasks: BackgroundTasks,
    elf_file: Optional[UploadFile] = File(None),
    map_file: Optional[UploadFile] = File(None),
    config_file: Optional[UploadFile] = File(None),
    dts_file: Optional[UploadFile] = File(None),
):
    session_id = str(uuid.uuid4())
    session_dir = Path(settings.upload_dir) / session_id
    session_dir.mkdir(parents=True, exist_ok=True)

    files_received: list[str] = []
    paths: dict[str, Optional[Path]] = {
        "elf": None, "map": None, "config": None, "dts": None,
    }

    for field_name, file_type in {
        "elf_file": elf_file,
        "map_file": map_file,
        "config_file": config_file,
        "dts_file": dts_file,
    }.items():
        if file_type is not None and file_type.filename:
            dest = session_dir / file_type.filename
            with open(dest, "wb") as out:
                shutil.copyfileobj(file_type.file, out)
            key = field_name.replace("_file", "")
            paths[key] = dest
            files_received.append(key)
            logger.info(f"[{session_id}] Saved {key}: {dest}")

    if not files_received:
        raise HTTPException(status_code=400, detail="No files uploaded.")

    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    for key, path in paths.items():
        if path and path.stat().st_size > max_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"{key} file exceeds {settings.max_upload_size_mb} MB limit.",
            )

    # Pre-save a stub so the poll endpoint returns 200 immediately
    # instead of 404 while the background task is still running.
    from models.session import AnalysisResult
    session_store.save(session_id, AnalysisResult(
        session_id=session_id,
        status="parsing",
        files_received=files_received,
    ))

    background_tasks.add_task(
        analysis_service.run_analysis,
        session_id,
        paths["elf"],
        paths["map"],
        paths["config"],
        paths["dts"],
        files_received,
    )

    return UploadResponse(
        session_id=session_id,
        files_received=files_received,
        parse_warnings=[],
        status="parsing",
        eta_seconds=5,
    )
