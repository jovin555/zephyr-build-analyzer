export interface ELFSymbol {
  name: string
  address: number
  size: number
  section: string
  object_file: string
  sym_type: string
  is_duplicate: boolean
}

export interface ObjectFileEntry {
  path: string
  size: number
  symbols: ELFSymbol[]
}

export interface SectionWithObjects {
  name: string
  size: number
  load_address: number
  region: string
  object_files: ObjectFileEntry[]
}

export interface MemoryRegion {
  name: string
  origin: string
  length: number
  used: number
  attributes: string
  sections: SectionWithObjects[]
}

export interface SectionSummary {
  name: string
  size: number
  region: string
}

export interface KconfigEntry {
  name: string
  value: string
  type: string
}

export interface DevicetreeNode {
  label: string
  status: string
  compatible: string
}

export interface ParseMetadata {
  elf_arch: string
  elf_machine: string
  map_parsed: boolean
  config_flags_count: number
  toolchain: string
  parser_version: string
}

export interface AnalysisResult {
  session_id: string
  status: string
  created_at: string
  files_received: string[]
  parse_warnings: string[]
  memory_regions: MemoryRegion[]
  top_symbols: ELFSymbol[]
  section_summary: SectionSummary[]
  kconfig_flags: KconfigEntry[]
  devicetree_nodes: DevicetreeNode[]
  parse_metadata: ParseMetadata
}

export interface SessionInfo {
  session_id: string
  created_at: string
  files: string[]
  status: string
}

export interface UploadResponse {
  session_id: string
  files_received: string[]
  parse_warnings: string[]
  status: string
  eta_seconds?: number
}
