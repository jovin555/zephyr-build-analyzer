# Zephyr Build Analyzer

A local web dashboard for visualizing **Zephyr RTOS firmware memory usage**, section layouts, symbol sizes, and Kconfig configuration — without any cloud services or external accounts.

Upload your build artifacts and instantly see where every byte of Flash and RAM is going.

---

## Screenshots

| Upload | Overview | Memory Treemap | Symbols |
|--------|----------|----------------|---------|
| Drop your build files | Flash/RAM KPI cards + section bar chart | Hierarchical treemap of Flash & RAM layout | Searchable table of top 200 symbols |

---

## Features

- **Memory Overview** — Flash and RAM usage cards with fill-level gauges and a horizontal section bar chart (`.text`, `.rodata`, `.data`, `.bss`, `.noinit`)
- **Memory Treemap** — Interactive treemap drilling from memory region → section → object file, with an "Other" bucket for small files
- **Top Symbols Table** — Searchable, sortable table of the 200 largest symbols with size bars and duplicate detection
- **Kconfig Inspector** — Searchable list of all enabled `CONFIG_` flags with type badges (bool / int / string / hex)
- **Parser versioning** — Every session records `parser_version` so cached results survive regex fixes
- **Fully local** — Nothing leaves your machine

---

## Supported Input Files

| File | Description | Required? |
|------|-------------|-----------|
| `zephyr.elf` | Compiled ELF binary | Yes (or map) |
| `zephyr.map` | GNU ld linker map file | Yes (or elf) |
| `.config` / `autoconf.h` | Kconfig output | Optional |
| `devicetree_generated.h` / `.dts` | Devicetree output | Optional |

---

## Quick Start

### Option A — Local (no Docker)

**Requirements:** Python 3.10+, Node.js 18+

#### 1. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

#### 2. Frontend

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

---

### Option B — Docker Compose

**Requirements:** Docker Engine + Docker Compose

```bash
docker-compose up --build
```

Open **http://localhost:5173** in your browser.

> The backend is available at **http://localhost:8000**.  
> API docs (Swagger UI) are at **http://localhost:8000/docs**.

---

## Generating Test Artifacts

If you have the Zephyr SDK and `west` installed:

```bash
# Build the hello_world sample for nRF52840
west build -b nrf52840dk_nrf52840 samples/hello_world

# Artifacts are in build/zephyr/
ls build/zephyr/zephyr.elf
ls build/zephyr/zephyr.map
ls build/zephyr/.config
```

Then upload those three files in the dashboard.

---

## Project Structure

```
zephyr-build-analyzer/
├── backend/
│   ├── main.py                    # FastAPI app entry point
│   ├── config.py                  # Settings (upload dir, size limit)
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── api/
│   │   ├── upload.py              # POST /api/upload
│   │   ├── analysis.py            # GET  /api/analysis/{session_id}
│   │   └── sessions.py            # GET/DELETE /api/sessions
│   ├── parsers/
│   │   ├── elf_parser.py          # pyelftools: sections, symbols, DWARF
│   │   ├── map_parser.py          # GNU ld map file parser
│   │   ├── kconfig_parser.py      # .config and autoconf.h parser
│   │   └── devicetree_parser.py   # devicetree_generated.h parser
│   ├── models/                    # Pydantic data models
│   ├── services/
│   │   ├── analysis_service.py    # Parser orchestration + merge logic
│   │   └── session_store.py       # In-memory session dict
│   └── tests/
│       └── fixtures/              # Place real .elf/.map/.config here
├── frontend/
│   ├── src/
│   │   ├── pages/                 # UploadPage, DashboardPage
│   │   ├── components/
│   │   │   ├── overview/          # SectionBarChart, MemorySummaryCards
│   │   │   ├── memory/            # MemoryTreemap
│   │   │   ├── symbols/           # TopSymbolsTable
│   │   │   └── kconfig/           # KconfigInspector
│   │   ├── store/                 # Zustand state (analysisStore)
│   │   ├── api/                   # axios client + typed API calls
│   │   └── utils/                 # formatBytes, color palette, treemap transform
│   ├── Dockerfile
│   └── vite.config.ts             # Proxies /api → localhost:8000
├── docker-compose.yml
├── Docs/
│   └── PLAN.md                    # Architecture and implementation plan
└── README.md
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Liveness check |
| `POST` | `/api/upload` | Upload build artifacts, returns `session_id` |
| `GET` | `/api/analysis/{session_id}` | Full analysis result |
| `GET` | `/api/sessions` | List all sessions |
| `DELETE` | `/api/sessions/{session_id}` | Delete a session |

Full interactive docs: **http://localhost:8000/docs**

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + Vite + TypeScript |
| Charts | Recharts (treemap, bar) + D3 (sunburst) |
| Tables | TanStack Table v8 + TanStack Virtual |
| State | Zustand |
| HTTP | Axios |
| Backend | Python 3.10+ + FastAPI |
| ELF parsing | pyelftools |
| Delivery | Docker Compose (or local venv + npm) |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `UPLOAD_DIR` | `/tmp/zba_uploads` | Directory for uploaded files |
| `MAX_UPLOAD_SIZE_MB` | `256` | Maximum file size per upload |

Copy `.env.example` to `.env` to override defaults.

---

## Known Limitations (v1)

- Session store is **in-memory** — sessions are lost on backend restart
- Map parser targets **GCC/GNU ld** output; Clang/LLD map files may not parse correctly
- ELF DWARF attribution requires a non-stripped binary; stripped binaries fall back to the map file for object-file names
- Build diff view is planned for v2

---

## License

MIT
