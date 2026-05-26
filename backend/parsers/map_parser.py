"""GNU linker map file parser.

Parses the two major blocks:
1. Memory Configuration → MemoryRegion list with origin + length
2. Linker script and memory map → sections → object files → symbols

Targets GCC/GNU ld output (Zephyr's default toolchain).
Toolchain is detected from the map file header comment.
"""

import re
from pathlib import Path
from loguru import logger

from models.elf_models import MemoryRegion, SectionWithObjects, ObjectFileEntry, ELFSymbol

_RE_MEM_REGION = re.compile(
    r"^(\S+)\s+(0x[0-9a-fA-F]+)\s+(0x[0-9a-fA-F]+)\s*(\S*)"
)
_RE_SECTION_HEADER = re.compile(r"^(\.\S+)\s+(0x[0-9a-fA-F]+)\s+(0x[0-9a-fA-F]+)")
_RE_OBJ_LINE = re.compile(
    r"^\s+(\.\S+)?\s+(0x[0-9a-fA-F]+)\s+(0x[0-9a-fA-F]+)\s+(\S+\.(obj|o|a\(\S+\)))"
)
_RE_SYMBOL_LINE = re.compile(r"^\s+(0x[0-9a-fA-F]+)\s+(\S+)$")
_RE_ARCHIVE = re.compile(r"^(.+\.a)\((.+)\)$")

# Sections to skip (debug, discard)
_SKIP_SECTIONS = {"/DISCARD/", ".debug_info", ".debug_abbrev", ".debug_str",
                  ".debug_line", ".debug_frame", ".comment", ".ARM.attributes"}

FLASH_PREFIXES = (".text", ".rodata", ".ARM")
RAM_PREFIXES = (".bss", ".noinit", ".heap", ".stack", ".data")


def _detect_toolchain(content: str) -> str:
    if "clang" in content[:500].lower():
        return "clang"
    return "gcc"


def _classify_region(name: str, regions: list[MemoryRegion], addr: int) -> str:
    for r in regions:
        origin = int(r.origin, 16)
        if origin <= addr < origin + r.length:
            return r.name
    if name.startswith(FLASH_PREFIXES):
        return "FLASH"
    if name.startswith(RAM_PREFIXES):
        return "RAM"
    return "UNKNOWN"


def parse(map_path: Path) -> tuple[list[MemoryRegion], list[ELFSymbol], str]:
    content = map_path.read_text(errors="replace")
    toolchain = _detect_toolchain(content)
    lines = content.splitlines()

    regions = _parse_memory_config(lines)
    map_sections, map_symbols = _parse_linker_map(lines, regions)

    # Build region tree from parsed sections
    region_map: dict[str, MemoryRegion] = {r.name: r for r in regions}
    for sec in map_sections:
        r = region_map.get(sec.region)
        if r:
            r.sections.append(sec)
            r.used += sec.size

    return list(region_map.values()), map_symbols, toolchain


def _parse_memory_config(lines: list[str]) -> list[MemoryRegion]:
    regions: list[MemoryRegion] = []
    in_block = False
    for line in lines:
        if "Memory Configuration" in line:
            in_block = True
            continue
        if in_block and "Linker script" in line:
            break
        if not in_block:
            continue
        m = _RE_MEM_REGION.match(line)
        if m and m.group(1) not in ("Name", "*default*"):
            regions.append(MemoryRegion(
                name=m.group(1),
                origin=m.group(2),
                length=int(m.group(3), 16),
                used=0,
                attributes=m.group(4),
            ))
    return regions


def _parse_linker_map(
    lines: list[str], regions: list[MemoryRegion]
) -> tuple[list[SectionWithObjects], list[ELFSymbol]]:
    sections: list[SectionWithObjects] = []
    symbols: list[ELFSymbol] = []
    in_map = False
    current_section: SectionWithObjects | None = None
    current_obj: ObjectFileEntry | None = None

    for line in lines:
        if "Linker script and memory map" in line:
            in_map = True
            continue
        if not in_map:
            continue
        if line.strip().startswith("OUTPUT("):
            continue
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if "size before relaxing" in line or stripped.startswith("FILL"):
            continue

        # Section header: starts at column 0 with a dot
        if line and not line[0].isspace() and line.startswith("."):
            m = _RE_SECTION_HEADER.match(line)
            if m:
                sec_name = m.group(1)
                if any(sec_name.startswith(skip) for skip in _SKIP_SECTIONS):
                    current_section = None
                    continue
                addr = int(m.group(2), 16)
                size = int(m.group(3), 16)
                if size == 0:
                    current_section = None
                    continue
                region = _classify_region(sec_name, regions, addr)
                current_section = SectionWithObjects(
                    name=sec_name, size=size,
                    load_address=addr, region=region,
                )
                sections.append(current_section)
                current_obj = None
            continue

        if current_section is None:
            continue

        # Object file sub-line
        m = _RE_OBJ_LINE.match(line)
        if m:
            addr = int(m.group(2), 16)
            size = int(m.group(3), 16)
            raw_path = m.group(4)
            # Resolve archive member
            am = _RE_ARCHIVE.match(raw_path)
            obj_path = f"{am.group(1)}({am.group(2)})" if am else raw_path
            if size > 0:
                current_obj = ObjectFileEntry(path=obj_path, size=size)
                current_section.object_files.append(current_obj)
            continue

        # Symbol address line
        m = _RE_SYMBOL_LINE.match(line)
        if m and current_obj:
            addr = int(m.group(1), 16)
            sym_name = m.group(2)
            if not sym_name.startswith("0x"):
                symbols.append(ELFSymbol(
                    name=sym_name,
                    address=addr,
                    size=0,
                    section=current_section.name,
                    object_file=current_obj.path,
                    sym_type="NOTYPE",
                ))

    return sections, symbols
