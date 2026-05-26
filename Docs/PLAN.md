# Zephyr Build-Size & Memory Analysis Dashboard — Implementation Plan

## Context

Zephyr firmware engineers constantly struggle to understand *why* a binary grew after a config change. Existing tools require CLI pipelines and manual map file grep. This dashboard gives engineers a local, visual tool that parses their build artifacts and shows memory layout instantly. It is delivered as a Docker Compose local web app — no accounts, no cloud.

Chosen by the user as the highest-value, fastest-to-market product from the Ideas.md brainstorm.

---

## Stack

| Layer | Choice | Reason |
|---|---|---|
| Frontend | React + Vite (TypeScript) | Fast HMR, huge ecosystem, good chart libs |
| Charts | Recharts (treemap/bar) + D3 (sunburst) | Recharts for React-native components, D3 for partition layout |
| Tables | TanStack Table v8 + TanStack Virtual | Handles 2000+ symbol rows without DOM bloat |
| State | Zustand | Minimal boilerplate, no Redux overhead |
| Backend | Python FastAPI | Best fit for ELF/binary parsing in Python ecosystem |
| ELF parsing | pyelftools | Pure Python, no native deps, handles DWARF |
| Delivery | Docker Compose | `docker-compose up` → open localhost |

---

## Project Structure

```
zephyr-build-analyzer/
├── docker-compose.yml
├── .env.example
├── README.md
├── Docs/
│   └── PLAN.md                    ← this file
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py
│   ├── config.py
│   ├── api/
│   │   ├── router.py
│   │   ├── upload.py          # POST /api/upload
│   │   ├── analysis.py        # GET /api/analysis/{session_id}
│   │   └── sessions.py        # GET/DELETE /api/sessions
│   ├── parsers/
│   │   ├── elf_parser.py      # pyelftools: sections, symbols, DWARF
│   │   ├── map_parser.py      # regex linker map parser
│   │   ├── kconfig_parser.py  # .config and autoconf.h
│   │   └── devicetree_parser.py
│   ├── models/
│   │   ├── session.py
│   │   ├── elf_models.py
│   │   ├── map_models.py
│   │   └── kconfig_models.py
│   ├── services/
│   │   ├── analysis_service.py  # orchestrates parsers, merges data
│   │   └── session_store.py     # in-memory dict store
│   └── tests/
│       ├── fixtures/            # real zephyr.elf, zephyr.map, .config
│       ├── test_elf_parser.py
│       ├── test_map_parser.py
│       └── test_kconfig_parser.py
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── vite.config.ts           # proxy /api → backend:8000
    └── src/
        ├── App.tsx              # React Router: / and /dashboard/:sessionId
        ├── api/                 # axios client, upload.ts, analysis.ts
        ├── types/analysis.ts    # TS interfaces mirroring backend models
        ├── store/analysisStore.ts  # Zustand store
        ├── pages/
        │   ├── UploadPage.tsx
        │   └── DashboardPage.tsx
        └── components/
            ├── upload/          # DropZone, FileList, UploadStatus
            ├── overview/        # SectionBarChart, MemorySummaryCards, RegionUtilGauge
            ├── memory/          # MemoryTreemap, MemorySunburst, MemoryViewToggle
            ├── symbols/         # TopSymbolsTable, SymbolSearch, SymbolDetailPanel
            ├── kconfig/         # KconfigInspector, KconfigSearch, KconfigEntry
            └── shared/          # LoadingSpinner, ErrorBanner, SectionBadge, ByteFormatter
```

---

## API Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/upload` | Receive elf/map/config/dts files, return session_id |
| GET | `/api/analysis/{session_id}` | Full nested analysis JSON |
| GET | `/api/sessions` | List all sessions |
| DELETE | `/api/sessions/{session_id}` | Remove a session |
| GET | `/api/health` | Docker health check |

### Upload response shape
```json
{ "session_id": "abc123", "files_received": ["elf","map","config"], "parse_warnings": [] }
```

### Analysis response (key fields)
```json
{
  "memory_regions": [{ "name":"FLASH", "length":1048576, "used":204800, "sections":[...] }],
  "top_symbols": [{ "name":"z_idle_stacks", "section":".noinit", "object_file":"...", "size":2048 }],
  "section_summary": [{ "name":".text", "size":163840, "region":"FLASH" }],
  "kconfig_flags": [{ "name":"CONFIG_BT", "value":"y", "type":"bool" }],
  "parse_metadata": { "elf_arch":"ARM", "map_parsed":true, "config_flags_count":312, "parser_version":"1.0" }
}
```

---

## Parser Design

### elf_parser.py (3 phases)
1. **Section inventory** — `elffile.iter_sections()` → name, addr, size, type, flags
2. **Symbol table** — `.symtab` section → name, address, size, type (FUNC/OBJECT)
3. **DWARF attribution** — `iter_CUs()` → map `(low_pc, high_pc) → object_file_path`; match symbols by address range

Fallback: `arm-none-eabi-nm -S --size-sort` via subprocess if DWARF is stripped.

### map_parser.py (regex, no library)
- Parse `Memory Configuration` block → regions with origin + length
- Parse `Linker script and memory map` block → sections → object files → symbols
- Handle archive members: `libfoo.a(bar.c.obj)`
- Skip: `FILL`, `/DISCARD/`, `(size before relaxing)` lines
- Toolchain detection from map file header (GCC vs Clang) — v1 targets GCC only

### analysis_service.py — merge strategy
ELF = authoritative for sizes and addresses.
Map = authoritative for object-file attribution.
`_merge_symbol_sources()` left-joins on symbol name+address.

---

## Visualizations (MVP)

| Tab | Component | Chart type |
|---|---|---|
| Overview | SectionBarChart | Recharts horizontal BarChart |
| Overview | MemorySummaryCards | KPI cards (Flash/RAM used) |
| Overview | RegionUtilGauge | Recharts RadialBarChart |
| Memory | MemoryTreemap | Recharts Treemap (click to drill) |
| Memory | MemorySunburst | D3 partition + arc (click to zoom) |
| Symbols | TopSymbolsTable | TanStack Table + Virtual (200 rows) |
| Kconfig | KconfigInspector | Virtualized list, debounced search |

---

## Docker Compose

```yaml
services:
  backend:
    build: ./backend
    ports: ["8000:8000"]
    volumes: [./backend:/app, uploads:/tmp/zba_uploads]
    healthcheck: curl http://localhost:8000/api/health

  frontend:
    build: ./frontend
    ports: ["5173:5173"]
    depends_on: { backend: { condition: service_healthy } }
```

Vite proxy: `/api` → `http://backend:8000` (avoids CORS).

---

## Build Phases

| Phase | Goal | Est. Time |
|---|---|---|
| 0 — Scaffold | Both containers start, health check passes, placeholder UI | ~2h |
| 1 — Upload pipeline | File upload works, session_id returned, empty analysis | ~4h |
| 2 — ELF parser | Real sections + symbols, SectionBarChart visible | ~6h |
| 3 — Map parser | Object-file attribution, MemoryTreemap working | ~5h |
| 4 — Kconfig | KconfigInspector tab complete | ~3h |
| 5 — Symbols + Sunburst | All 4 tabs done | ~4h |
| 6 — Polish | Error handling, session switcher, README | ~3h |
| 7 — Diff view (v2) | Compare two builds side-by-side | deferred |

---

## Key Risks & DeepSeek Recommendations

1. **DWARF stripped** — Map parser is the fallback for object-file attribution. Both parsers must work independently.
2. **Map file format variation** — Use `\s+` not fixed spaces. Add toolchain detection from map file header (GCC vs Clang). Test against Zephyr 3.5, 3.6, 3.7. Start GCC-only in v1.
3. **Large ELF (>50 MB)** — Use streaming write + pyelftools mmap mode. Use FastAPI `BackgroundTasks` for async parsing; return `session_id` + `eta_seconds` immediately, frontend polls `/api/analysis/{session_id}` until `status: ready`.
4. **Sunburst performance** — Limit to 3 depth levels. Group items < 0.5% of total into an "Other" bucket.
5. **Symbol deduplication** — Track symbols appearing in multiple object files; show `(duplicate)` label in the table.
6. **CORS in Docker** — Vite proxy + FastAPI CORS middleware both required.
7. **Parser versioning** — Include `"parser_version": "1.0"` in every analysis response so regex fixes don't break cached sessions.
8. **Color scheme** — Use fixed palette: Flash=blue family, RAM=green family. No random colors.

---

## Verification

1. Run `docker-compose up` — both containers healthy, UI loads at `localhost:5173`.
2. Upload a real `zephyr.elf` + `zephyr.map` + `.config` from a Zephyr hello_world build.
3. Verify: section bar chart shows `.text`/`.bss` etc., treemap shows object files, top symbols table lists >50 entries, Kconfig shows CONFIG_ flags.
4. Run `pytest backend/tests/` — all parser unit tests pass against fixture files.
