"""ELF parser using pyelftools.

Three phases:
1. Section inventory
2. Symbol table extraction
3. DWARF compile-unit attribution (object file → address range mapping)

Falls back to arm-none-eabi-nm subprocess if DWARF info is absent.
"""

from pathlib import Path
from typing import Optional
import subprocess

from elftools.elf.elffile import ELFFile
from elftools.elf.sections import SymbolTableSection
from elftools.common.exceptions import ELFError
from loguru import logger

from models.elf_models import ELFSection, ELFSymbol

FLASH_SECTIONS = {".text", ".rodata", ".ARM.exidx", ".data"}
RAM_SECTIONS = {".data", ".bss", ".noinit", ".heap", ".stack"}

# heuristic: sections starting with these prefixes live in flash
FLASH_PREFIXES = (".text", ".rodata", ".ARM")
RAM_PREFIXES = (".bss", ".noinit", ".heap", ".stack", ".data")


def _classify_region(section_name: str, address: int) -> str:
    for p in FLASH_PREFIXES:
        if section_name.startswith(p):
            return "FLASH"
    for p in RAM_PREFIXES:
        if section_name.startswith(p):
            return "RAM"
    # Cortex-M: RAM typically starts at 0x2000_0000
    if address >= 0x20000000:
        return "RAM"
    return "FLASH"


def _build_dwarf_map(elffile: ELFFile) -> dict[tuple[int, int], str]:
    """Returns mapping of (low_pc, high_pc) → compile_unit_file_path."""
    cu_map: dict[tuple[int, int], str] = {}
    try:
        if not elffile.has_dwarf_info():
            return cu_map
        dwarf = elffile.get_dwarf_info()
        for cu in dwarf.iter_CUs():
            die = cu.get_top_DIE()
            comp_dir = die.attributes.get("DW_AT_comp_dir")
            name = die.attributes.get("DW_AT_name")
            low_pc = die.attributes.get("DW_AT_low_pc")
            high_pc = die.attributes.get("DW_AT_high_pc")
            if name and low_pc and high_pc:
                path = name.value.decode("utf-8", errors="replace")
                lo = low_pc.value
                hi = high_pc.value
                # DW_AT_high_pc can be offset or absolute
                if high_pc.form != "DW_FORM_addr":
                    hi = lo + hi
                cu_map[(lo, hi)] = path
    except Exception as e:
        logger.warning(f"DWARF parse warning: {e}")
    return cu_map


def _addr_to_cu(address: int, cu_map: dict[tuple[int, int], str]) -> str:
    for (lo, hi), path in cu_map.items():
        if lo <= address < hi:
            return path
    return "unknown"


def _nm_fallback(elf_path: Path) -> list[ELFSymbol]:
    """Use arm-none-eabi-nm as fallback for symbol extraction."""
    try:
        result = subprocess.run(
            ["arm-none-eabi-nm", "-S", "--size-sort", str(elf_path)],
            capture_output=True, text=True, timeout=30,
        )
        symbols = []
        for line in result.stdout.splitlines():
            parts = line.split()
            if len(parts) < 4:
                continue
            try:
                address = int(parts[0], 16)
                size = int(parts[1], 16)
                sym_type = parts[2]
                name = parts[3]
                section = ".text" if sym_type in ("T", "t") else ".bss" if sym_type in ("B", "b") else ".data"
                region = _classify_region(section, address)
                symbols.append(ELFSymbol(
                    name=name, address=address, size=size,
                    section=section, object_file="unknown", sym_type=sym_type,
                ))
            except ValueError:
                continue
        return symbols
    except (FileNotFoundError, subprocess.TimeoutExpired) as e:
        logger.warning(f"nm fallback failed: {e}")
        return []


def parse(elf_path: Path) -> tuple[list[ELFSection], list[ELFSymbol], dict]:
    sections: list[ELFSection] = []
    symbols: list[ELFSymbol] = []
    metadata: dict = {}

    with open(elf_path, "rb") as f:
        try:
            elffile = ELFFile(f)
        except ELFError as e:
            raise ValueError(f"Not a valid ELF file: {e}")

        metadata["arch"] = elffile.get_machine_arch()
        metadata["machine"] = str(elffile["e_machine"])

        SHF_ALLOC = 0x2  # section occupies memory at runtime

        # Phase 1: sections — only keep sections actually loaded into memory
        section_index: dict[int, str] = {}
        for idx, section in enumerate(elffile.iter_sections()):
            name = section.name
            size = section["sh_size"]
            addr = section["sh_addr"]
            flags = section["sh_flags"]
            # Skip non-loadable sections (debug info, comments, etc.)
            if not (flags & SHF_ALLOC):
                continue
            if size == 0:
                continue
            region = _classify_region(name, addr)
            sections.append(ELFSection(
                name=name,
                size=size,
                address=addr,
                section_type=section["sh_type"],
                region=region,
            ))
            section_index[idx] = name

        # Phase 2: symbol table
        symtab = elffile.get_section_by_name(".symtab")
        if not isinstance(symtab, SymbolTableSection):
            logger.warning("No .symtab found, trying nm fallback")
            symbols = _nm_fallback(elf_path)
            return sections, symbols, metadata

        # Phase 3: DWARF attribution
        cu_map = _build_dwarf_map(elffile)

        for sym in symtab.iter_symbols():
            size = sym["st_size"]
            if size == 0:
                continue
            sym_type = sym.entry["st_info"]["type"]
            if sym_type not in ("STT_FUNC", "STT_OBJECT", "STT_NOTYPE"):
                continue
            addr = sym["st_value"]
            sec_idx = sym["st_shndx"]
            sec_name = section_index.get(sec_idx, "unknown") if isinstance(sec_idx, int) else "unknown"
            obj_file = _addr_to_cu(addr, cu_map) if cu_map else "unknown"
            region = _classify_region(sec_name, addr)

            symbols.append(ELFSymbol(
                name=sym.name,
                address=addr,
                size=size,
                section=sec_name,
                object_file=obj_file,
                sym_type=sym_type.replace("STT_", ""),
            ))

    return sections, symbols, metadata
