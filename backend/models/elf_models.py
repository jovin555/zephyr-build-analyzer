from pydantic import BaseModel
from typing import Optional


class ELFSymbol(BaseModel):
    name: str
    address: int
    size: int
    section: str
    object_file: str
    sym_type: str  # FUNC | OBJECT | NOTYPE
    is_duplicate: bool = False


class ELFSection(BaseModel):
    name: str
    size: int
    address: int
    section_type: str
    region: str = "UNKNOWN"


class ObjectFileEntry(BaseModel):
    path: str
    size: int
    symbols: list[ELFSymbol] = []


class SectionWithObjects(BaseModel):
    name: str
    size: int
    load_address: int
    region: str
    object_files: list[ObjectFileEntry] = []


class MemoryRegion(BaseModel):
    name: str
    origin: str
    length: int
    used: int
    attributes: str = ""
    sections: list[SectionWithObjects] = []
