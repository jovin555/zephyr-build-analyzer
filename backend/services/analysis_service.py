from pathlib import Path
from typing import Optional
from loguru import logger

from models.session import AnalysisResult, SectionSummary, ParseMetadata
from models.elf_models import MemoryRegion, ELFSymbol, SectionWithObjects, ObjectFileEntry
from parsers import elf_parser, map_parser, kconfig_parser, devicetree_parser
from services import session_store


def run_analysis(
    session_id: str,
    elf_path: Optional[Path],
    map_path: Optional[Path],
    config_path: Optional[Path],
    dts_path: Optional[Path],
    files_received: list[str],
) -> AnalysisResult:
    warnings: list[str] = []
    elf_sections: list = []
    elf_symbols: list[ELFSymbol] = []
    map_regions: list[MemoryRegion] = []
    map_symbols: list[ELFSymbol] = []
    metadata = ParseMetadata()

    if elf_path:
        try:
            elf_sections, elf_symbols, elf_meta = elf_parser.parse(elf_path)
            metadata.elf_arch = elf_meta.get("arch", "")
            metadata.elf_machine = elf_meta.get("machine", "")
        except Exception as e:
            logger.error(f"ELF parse error: {e}")
            warnings.append(f"ELF parse error: {e}")

    if map_path:
        try:
            map_regions, map_symbols, toolchain = map_parser.parse(map_path)
            metadata.map_parsed = True
            metadata.toolchain = toolchain
        except Exception as e:
            logger.error(f"Map parse error: {e}")
            warnings.append(f"Map parse error: {e}")

    merged_symbols = _merge_symbol_sources(elf_symbols, map_symbols)
    merged_regions = _build_region_tree(map_regions, elf_sections, merged_symbols)
    section_summary = _build_section_summary(merged_regions)

    kconfig_flags = []
    if config_path:
        try:
            kconfig_flags = kconfig_parser.parse(config_path)
            metadata.config_flags_count = len(kconfig_flags)
        except Exception as e:
            warnings.append(f"Kconfig parse error: {e}")

    dt_nodes = []
    if dts_path:
        try:
            dt_nodes = devicetree_parser.parse(dts_path)
        except Exception as e:
            warnings.append(f"Devicetree parse error: {e}")

    top_symbols = sorted(merged_symbols, key=lambda s: s.size, reverse=True)[:200]

    result = AnalysisResult(
        session_id=session_id,
        status="ready",
        files_received=files_received,
        parse_warnings=warnings,
        memory_regions=merged_regions,
        top_symbols=top_symbols,
        section_summary=section_summary,
        kconfig_flags=kconfig_flags,
        devicetree_nodes=dt_nodes,
        parse_metadata=metadata,
    )

    session_store.save(session_id, result)
    return result


def _merge_symbol_sources(
    elf_symbols: list[ELFSymbol], map_symbols: list[ELFSymbol]
) -> list[ELFSymbol]:
    """Left-join: ELF has sizes/types, map has object_file attribution."""
    if not elf_symbols:
        return map_symbols

    map_index: dict[tuple[str, int], str] = {}
    for s in map_symbols:
        map_index[(s.name, s.address)] = s.object_file

    name_count: dict[str, int] = {}
    for s in elf_symbols:
        name_count[s.name] = name_count.get(s.name, 0) + 1

    result = []
    for sym in elf_symbols:
        if sym.size == 0:
            continue
        obj_file = map_index.get((sym.name, sym.address), sym.object_file)
        sym = sym.model_copy(update={
            "object_file": obj_file,
            "is_duplicate": name_count.get(sym.name, 1) > 1,
        })
        result.append(sym)
    return result


def _build_region_tree(
    map_regions: list[MemoryRegion],
    elf_sections: list,
    symbols: list[ELFSymbol],
) -> list[MemoryRegion]:
    if not map_regions:
        return _build_regions_from_elf(elf_sections, symbols)

    sym_by_section: dict[str, list[ELFSymbol]] = {}
    for sym in symbols:
        sym_by_section.setdefault(sym.section, []).append(sym)

    for region in map_regions:
        for section in region.sections:
            section_syms = sym_by_section.get(section.name, [])
            obj_map: dict[str, list[ELFSymbol]] = {}
            for sym in section_syms:
                obj_map.setdefault(sym.object_file, []).append(sym)
            if not section.object_files:
                section.object_files = [
                    ObjectFileEntry(
                        path=obj_path,
                        size=sum(s.size for s in syms),
                        symbols=syms,
                    )
                    for obj_path, syms in obj_map.items()
                ]
    return map_regions


def _build_regions_from_elf(elf_sections: list, symbols: list[ELFSymbol]) -> list[MemoryRegion]:
    flash_sections = [s for s in elf_sections if s.region == "FLASH"]
    ram_sections = [s for s in elf_sections if s.region == "RAM"]

    regions = []
    for region_name, sections in [("FLASH", flash_sections), ("RAM", ram_sections)]:
        used = sum(s.size for s in sections)
        region_sections = []
        for sec in sections:
            sec_syms = [sym for sym in symbols if sym.section == sec.name]
            obj_map: dict[str, list[ELFSymbol]] = {}
            for sym in sec_syms:
                obj_map.setdefault(sym.object_file, []).append(sym)
            region_sections.append(SectionWithObjects(
                name=sec.name,
                size=sec.size,
                load_address=sec.address,
                region=region_name,
                object_files=[
                    ObjectFileEntry(path=p, size=sum(s.size for s in syms), symbols=syms)
                    for p, syms in obj_map.items()
                ],
            ))
        regions.append(MemoryRegion(
            name=region_name,
            origin=hex(sections[0].address) if sections else "0x0",
            length=used,
            used=used,
            sections=region_sections,
        ))
    return regions


def _build_section_summary(regions: list[MemoryRegion]) -> list[SectionSummary]:
    summaries = []
    for region in regions:
        for section in region.sections:
            summaries.append(SectionSummary(
                name=section.name,
                size=section.size,
                region=region.name,
            ))
    return summaries
