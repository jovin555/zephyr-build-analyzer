from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from models.elf_models import MemoryRegion, ELFSymbol, SectionWithObjects
from models.kconfig_models import KconfigEntry


class SectionSummary(BaseModel):
    name: str
    size: int
    region: str


class DevicetreeNode(BaseModel):
    label: str
    status: str
    compatible: str = ""


class ParseMetadata(BaseModel):
    elf_arch: str = ""
    elf_machine: str = ""
    map_parsed: bool = False
    config_flags_count: int = 0
    toolchain: str = "gcc"
    parser_version: str = "1.0"


class AnalysisResult(BaseModel):
    session_id: str
    status: str = "ready"  # ready | parsing | error
    created_at: datetime = datetime.utcnow()
    files_received: list[str] = []
    parse_warnings: list[str] = []
    memory_regions: list[MemoryRegion] = []
    top_symbols: list[ELFSymbol] = []
    section_summary: list[SectionSummary] = []
    kconfig_flags: list[KconfigEntry] = []
    devicetree_nodes: list[DevicetreeNode] = []
    parse_metadata: ParseMetadata = ParseMetadata()


class SessionInfo(BaseModel):
    session_id: str
    created_at: datetime
    files: list[str]
    status: str


class UploadResponse(BaseModel):
    session_id: str
    files_received: list[str]
    parse_warnings: list[str]
    status: str
    eta_seconds: Optional[int] = None
