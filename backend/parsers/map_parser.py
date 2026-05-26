"""GNU linker map file parser for Zephyr RTOS builds.

Zephyr's linker script uses section GROUP names without a leading dot
(e.g. "text", "bss", "datas", "noinit") while individual object-file
contributions appear indented with dotted names (".text.main", ".bss.x").
This parser handles both formats as well as two-line object entries and
the "load address" suffix on initialized-data sections.

Targets GCC/GNU ld output (Zephyr's default toolchain).
"""

import re
from pathlib import Path
from loguru import logger

from models.elf_models import MemoryRegion, SectionWithObjects, ObjectFileEntry, ELFSymbol

# Memory Configuration block
_RE_MEM_REGION = re.compile(
    r"^(\S+)\s+(0x[0-9a-fA-F]+)\s+(0x[0-9a-fA-F]+)\s*(\S*)"
)

# Top-level section header — name may or may not start with a dot.
# Optional "load address 0x..." suffix (for .data-type sections).
# Examples:
#   text            0x00000100     0x4348
#   .debug_loc      0x00000000    0x19557
#   datas           0x20000000       0xbc load address 0x00004cb4
_RE_SECTION_HEADER = re.compile(
    r"^(\.?\S+)\s+(0x[0-9a-fA-F]+)\s+(0x[0-9a-fA-F]+)"
)

# Object file sub-line (indented, may start with a sub-section name or not)
# Examples:
#   " .text.main     0x00000100       0x18 app/libapp.a(main.c.obj)"
#   "                0x00000118       0x10 zephyr/libzephyr.a(boot_banner.c.obj)"
_RE_OBJ_LINE = re.compile(
    r"^\s+(?:\.\S+\s+)?(0x[0-9a-fA-F]+)\s+(0x[0-9a-fA-F]+)\s+(\S+\.(obj|o)|\S+\.a\([^)]+\))"
)

# Pure symbol address line: "  0xADDRESS   symbol_name"
_RE_SYMBOL_LINE = re.compile(r"^\s+(0x[0-9a-fA-F]+)\s+([A-Za-z_][A-Za-z0-9_.@]+)$")

_RE_ARCHIVE = re.compile(r"^(.+\.a)\((.+)\)$")

# Sections whose content we never want in the memory map
_SKIP_PREFIXES = (
    ".debug", "/DISCARD/", ".comment", ".ARM.attributes",
    ".stab", ".gnu.warning",
)

# Zephyr group names → canonical section name with dot
_ZEPHYR_GROUP_MAP = {
    "text":   ".text",
    "rodata": ".rodata",
    "datas":  ".data",
    "bss":    ".bss",
    "noinit": ".noinit",
    "initlevel": ".init_array",
    "initshell": ".shell_root_cmds",
    "log_const_sections": ".log_const_sections",
    "log_dynamic_sections": ".log_dynamic_sections",
    "device_handles": ".device_handles",
    "devices": ".device",
    "sw_isr_table": ".isr_vector",
    "vectors": ".vectors",
}

FLASH_PREFIXES = (".text", ".rodata", ".ARM", ".vectors", ".isr")
RAM_PREFIXES   = (".bss", ".noinit", ".data", ".heap", ".stack", ".ccm")


def _detect_toolchain(content: str) -> str:
    return "clang" if "clang" in content[:500].lower() else "gcc"


def _normalize_section_name(raw: str) -> str:
    """Map Zephyr group names to conventional dotted section names."""
    return _ZEPHYR_GROUP_MAP.get(raw, raw if raw.startswith(".") else f".{raw}")


def _should_skip(name: str) -> bool:
    return any(name.startswith(p) for p in _SKIP_PREFIXES)


def _classify_region(name: str, regions: list[MemoryRegion], addr: int) -> str:
    for r in regions:
        origin = int(r.origin, 16)
        if origin <= addr < origin + r.length:
            return r.name
    if any(name.startswith(p) for p in FLASH_PREFIXES):
        return "FLASH"
    if any(name.startswith(p) for p in RAM_PREFIXES):
        return "RAM"
    return "UNKNOWN"


def parse(map_path: Path) -> tuple[list[MemoryRegion], list[ELFSymbol], str]:
    content = map_path.read_text(errors="replace")
    toolchain = _detect_toolchain(content)
    lines = content.splitlines()

    regions = _parse_memory_config(lines)
    map_sections, map_symbols = _parse_linker_map(lines, regions)

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
    symbols:  list[ELFSymbol] = []

    in_map = False
    current_section: SectionWithObjects | None = None
    current_obj: ObjectFileEntry | None = None
    pending_subsection: str | None = None  # for two-line sub-section entries

    for line in lines:
        if "Linker script and memory map" in line:
            in_map = True
            continue
        if not in_map:
            continue

        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if any(kw in stripped for kw in ("size before relaxing", "FILL ", "LOAD ", "OUTPUT(",
                                          "SORT_BY_ALIGNMENT", "[!provide]", "*(")):
            continue

        # ── TOP-LEVEL SECTION HEADER (no leading whitespace) ──────────────
        if line and not line[0].isspace():
            m = _RE_SECTION_HEADER.match(line)
            if m:
                raw_name = m.group(1)
                canonical = _normalize_section_name(raw_name)
                if _should_skip(canonical):
                    current_section = None
                    current_obj = None
                    pending_subsection = None
                    continue
                addr = int(m.group(2), 16)
                size = int(m.group(3), 16)
                if size == 0:
                    current_section = None
                    current_obj = None
                    continue
                region = _classify_region(canonical, regions, addr)
                current_section = SectionWithObjects(
                    name=canonical,
                    size=size,
                    load_address=addr,
                    region=region,
                )
                sections.append(current_section)
                current_obj = None
                pending_subsection = None
            continue  # whether matched or not, top-level line is done

        # ── INDENTED LINES (object files, sub-sections, symbols) ──────────
        if current_section is None:
            continue

        # Check for a two-line sub-section: first line has only the sub-name
        # e.g.  " .bss.z_idle_threads"
        if re.match(r"^\s+\.\S+\s*$", line):
            pending_subsection = stripped
            continue

        # Object file line
        m = _RE_OBJ_LINE.match(line)
        if m:
            addr = int(m.group(1), 16)
            size = int(m.group(2), 16)
            raw_path = m.group(3)
            if size == 0:
                pending_subsection = None
                continue
            am = _RE_ARCHIVE.match(raw_path)
            obj_path = f"{am.group(1)}({am.group(2)})" if am else raw_path
            current_obj = ObjectFileEntry(path=obj_path, size=size)
            current_section.object_files.append(current_obj)
            pending_subsection = None
            continue

        # Symbol address line
        m = _RE_SYMBOL_LINE.match(line)
        if m and current_obj:
            addr = int(m.group(1), 16)
            sym_name = m.group(2)
            symbols.append(ELFSymbol(
                name=sym_name,
                address=addr,
                size=0,
                section=current_section.name,
                object_file=current_obj.path,
                sym_type="NOTYPE",
            ))
            continue

        pending_subsection = None

    return sections, symbols
