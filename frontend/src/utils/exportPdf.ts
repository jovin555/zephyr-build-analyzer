import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import type { AnalysisResult, MemoryRegion, SectionSummary, ELFSymbol, KconfigEntry } from '../types/analysis'
import { formatBytes } from './bytes'
import { getSectionColor, REGION_COLORS } from './colors'

const TABS = ['overview', 'memory', 'symbols', 'kconfig'] as const
type Tab = typeof TABS[number]

const TAB_LABELS: Record<Tab, string> = {
  overview: 'Overview — Flash & RAM Summary',
  memory:   'Memory Layout — Section Breakdown',
  symbols:  'Top Symbols — Size Breakdown',
  kconfig:  'Kconfig — Build Configuration',
}

// ── Page geometry ──────────────────────────────────────────────────────────────
const PW       = 297   // landscape A4 width  (mm)
const PH       = 210   // landscape A4 height (mm)
const M        = 12    // margin
const HEADER_H = 18
const FOOTER_H = 8
const CW       = PW - M * 2              // content width
const CY       = HEADER_H + 4           // content starts here (y)
const CH       = PH - HEADER_H - FOOTER_H - 6  // content height

// ── Helpers ────────────────────────────────────────────────────────────────────
function wait(ms: number) { return new Promise((r) => setTimeout(r, ms)) }

function hex2rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

const DEBUG_PFX = ['.debug', '.comment', '.last_section', '.stab']

// ── Shared header / footer ─────────────────────────────────────────────────────
function drawChrome(
  pdf: jsPDF, pageNum: number, total: number,
  title: string, subtitle: string,
  sessionId: string, flash: number, ram: number,
) {
  pdf.setFillColor(15, 23, 42)
  pdf.rect(0, 0, PW, HEADER_H, 'F')

  pdf.setTextColor(241, 245, 249)
  pdf.setFontSize(11); pdf.setFont('helvetica', 'bold')
  pdf.text('Zephyr Build Analyzer', M, 7)

  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8)
  pdf.setTextColor(148, 163, 184)
  pdf.text(subtitle, M, 13)

  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10)
  pdf.setTextColor(99, 179, 237)
  pdf.text(`${pageNum}/${total}  ${title}`, PW - M, 10, { align: 'right' })

  pdf.setDrawColor(51, 65, 85); pdf.setLineWidth(0.3)
  pdf.line(M, PH - FOOTER_H, PW - M, PH - FOOTER_H)

  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7)
  pdf.setTextColor(100, 116, 139)
  pdf.text(`Session: ${sessionId}`, M, PH - 3)
  pdf.text(
    `FLASH ${formatBytes(flash)}  ·  RAM ${formatBytes(ram)}`,
    PW / 2, PH - 3, { align: 'center' },
  )
  pdf.text(`Generated ${new Date().toLocaleString()}`, PW - M, PH - 3, { align: 'right' })
}

// ── Page 1: Overview — html2canvas ────────────────────────────────────────────
async function captureTab(el: HTMLElement): Promise<HTMLCanvasElement> {
  return html2canvas(el, {
    scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false,
    windowWidth: el.scrollWidth, windowHeight: el.scrollHeight,
    width: el.scrollWidth, height: el.scrollHeight,
  })
}

// ── Page 2: Memory Layout — programmatic ──────────────────────────────────────
function drawMemoryPage(
  pdf: jsPDF, regions: MemoryRegion[], sections: SectionSummary[],
  subtitle: string, sessionId: string, flash: number, ram: number,
) {
  drawChrome(pdf, 2, 5, TAB_LABELS.memory, subtitle, sessionId, flash, ram)
  let y = CY

  // ─ Section colour legend ────────────────────────────────────────────────────
  const visibleSecs = [...new Map(
    sections.filter((s) => !DEBUG_PFX.some((p) => s.name.startsWith(p))).map((s) => [s.name, s]),
  ).values()].sort((a, b) => b.size - a.size)

  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5); pdf.setTextColor(30, 41, 59)
  pdf.text('Section legend:', M, y + 3.5)
  let lx = M + 24
  for (const sec of visibleSecs.slice(0, 14)) {
    const [r, g, b] = hex2rgb(getSectionColor(sec.name))
    pdf.setFillColor(r, g, b)
    pdf.rect(lx, y, 5, 3.5, 'F')
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6); pdf.setTextColor(30, 41, 59)
    pdf.text(sec.name, lx + 6, y + 3)
    lx += 6 + pdf.getTextWidth(sec.name) + 5
    if (lx > PW - M - 25) break
  }
  y += 9

  // ─ Per-region stacked bar ───────────────────────────────────────────────────
  const BAR_W  = CW - 36
  const BAR_X  = M + 32
  const BAR_H  = 9

  for (const region of regions) {
    if (region.length === 0) continue
    const [rr, rg, rb] = hex2rgb(REGION_COLORS[region.name] ?? '#64748b')

    // Label
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8)
    pdf.setTextColor(rr, rg, rb)
    pdf.text(region.name, M, y + 5)

    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6)
    pdf.setTextColor(100, 116, 139)
    const pct = ((region.used / region.length) * 100).toFixed(1)
    pdf.text(`${formatBytes(region.used)}/${formatBytes(region.length)} (${pct}%)`, M, y + 10)

    // Track
    pdf.setFillColor(226, 232, 240)
    pdf.rect(BAR_X, y, BAR_W, BAR_H, 'F')

    // Segments
    const secsHere = region.sections
      .filter((s) => !DEBUG_PFX.some((p) => s.name.startsWith(p)) && s.size > 0)
      .sort((a, b) => b.size - a.size)

    let sx = BAR_X
    for (const sec of secsHere) {
      const sw = (sec.size / region.length) * BAR_W
      if (sw < 0.5) continue
      const [r, g, b] = hex2rgb(getSectionColor(sec.name))
      pdf.setFillColor(r, g, b)
      pdf.rect(sx, y, sw, BAR_H, 'F')
      if (sw > 14) {
        const lbl = sec.name.length > Math.floor(sw / 2.5)
          ? sec.name.slice(0, Math.floor(sw / 2.5) - 1) + '…' : sec.name
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(5.5)
        pdf.setTextColor(255, 255, 255)
        pdf.text(lbl, sx + 1, y + 6)
      }
      sx += sw
    }

    // Free space
    const freeW = BAR_W - (region.used / region.length) * BAR_W
    if (freeW > 3) {
      pdf.setFillColor(241, 245, 249)
      pdf.rect(sx, y, freeW, BAR_H, 'F')
      if (freeW > 14) {
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(5.5); pdf.setTextColor(148, 163, 184)
        pdf.text('free', sx + 2, y + 6)
      }
    }
    y += BAR_H + 8
  }

  y += 2

  // ─ Section breakdown table ──────────────────────────────────────────────────
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.setTextColor(15, 23, 42)
  pdf.text('Section Breakdown', M, y); y += 5

  const CS = M          // section name col x
  const CR = M + 58     // region col
  const CZ = M + 90     // size col
  const CB = M + 120    // bar col
  const BW = CW - (CB - M) - 20   // bar max width
  const totalSize = visibleSecs.reduce((s, x) => s + x.size, 0)
  const rowH = 5.5

  // Header
  pdf.setFillColor(241, 245, 249)
  pdf.rect(M, y, CW, rowH, 'F')
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7); pdf.setTextColor(71, 85, 105)
  pdf.text('Section', CS + 4, y + 4)
  pdf.text('Region',  CR + 1, y + 4)
  pdf.text('Size',    CZ + 1, y + 4)
  pdf.text('Share',   CB + 1, y + 4)
  y += rowH

  for (let i = 0; i < visibleSecs.length; i++) {
    const sec = visibleSecs[i]
    if (y + rowH > PH - FOOTER_H - 4) break
    if (i % 2 === 0) { pdf.setFillColor(249, 250, 251); pdf.rect(M, y, CW, rowH, 'F') }

    const [r, g, b] = hex2rgb(getSectionColor(sec.name))
    pdf.setFillColor(r, g, b); pdf.rect(CS, y + 1.5, 3, 3, 'F')
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7); pdf.setTextColor(r, g, b)
    pdf.text(sec.name, CS + 4, y + 4)
    pdf.setFont('helvetica', 'normal'); pdf.setTextColor(71, 85, 105)
    pdf.text(sec.region, CR + 1, y + 4)
    pdf.setFont('helvetica', 'bold'); pdf.setTextColor(30, 41, 59)
    pdf.text(formatBytes(sec.size), CZ + 1, y + 4)

    const frac = sec.size / totalSize
    pdf.setFillColor(226, 232, 240); pdf.rect(CB, y + 1.5, BW, 2.5, 'F')
    pdf.setFillColor(r, g, b); pdf.rect(CB, y + 1.5, frac * BW, 2.5, 'F')
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.5); pdf.setTextColor(100, 116, 139)
    pdf.text(`${(frac * 100).toFixed(1)}%`, CB + BW + 2, y + 4)
    y += rowH
  }
}

// ── Page 3: Symbols — programmatic ────────────────────────────────────────────
function drawSymbolsPage(
  pdf: jsPDF, symbols: ELFSymbol[],
  subtitle: string, sessionId: string, flash: number, ram: number,
) {
  drawChrome(pdf, 3, 5, TAB_LABELS.symbols, subtitle, sessionId, flash, ram)
  let y = CY

  const ROW_H   = 5
  const maxRows = Math.floor(CH / ROW_H) - 3
  const sorted  = [...symbols].sort((a, b) => b.size - a.size).slice(0, maxRows)
  const maxSz   = sorted[0]?.size ?? 1

  // Column x positions
  const C_RK  = M
  const C_NM  = M + 10
  const C_SC  = M + 122
  const C_OBJ = M + 158
  const C_SZ  = M + 216
  const C_BAR = M + 240
  const BAR_W = CW - (C_BAR - M) - 4

  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.setTextColor(15, 23, 42)
  pdf.text(`Top ${sorted.length} symbols by size`, M, y); y += 5

  // Header row
  pdf.setFillColor(15, 23, 42); pdf.rect(M, y, CW, 5.5, 'F')
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7); pdf.setTextColor(241, 245, 249)
  pdf.text('#',         C_RK  + 1, y + 4)
  pdf.text('Symbol',    C_NM  + 1, y + 4)
  pdf.text('Section',   C_SC  + 1, y + 4)
  pdf.text('Object',    C_OBJ + 1, y + 4)
  pdf.text('Size',      C_SZ  + 1, y + 4)
  pdf.text('Relative',  C_BAR + 1, y + 4)
  y += 5.5

  for (let i = 0; i < sorted.length; i++) {
    const sym = sorted[i]
    if (y + ROW_H > PH - FOOTER_H - 4) break
    if (i % 2 === 0) { pdf.setFillColor(249, 250, 251); pdf.rect(M, y, CW, ROW_H, 'F') }

    const [r, g, b] = hex2rgb(getSectionColor(sym.section))

    // Rank
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.5); pdf.setTextColor(156, 163, 175)
    pdf.text(String(i + 1), C_RK + 1, y + 3.5)

    // Symbol name
    const nmMaxCh = Math.floor((C_SC - C_NM - 4) / 2.1)
    const nm = sym.name.length > nmMaxCh ? sym.name.slice(0, nmMaxCh - 1) + '…' : sym.name
    pdf.setFont('courier', 'normal'); pdf.setFontSize(6.5); pdf.setTextColor(17, 24, 39)
    pdf.text(nm, C_NM + 1, y + 3.5)

    // Section badge
    pdf.setFillColor(r, g, b); pdf.rect(C_SC, y + 0.8, 3, 3, 'F')
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(6); pdf.setTextColor(r, g, b)
    const sc = sym.section.length > 14 ? sym.section.slice(0, 13) + '…' : sym.section
    pdf.text(sc, C_SC + 4, y + 3.5)

    // Object file (last 2 segments, no .obj)
    const objParts = sym.object_file.split('/')
    const shortObj = objParts.slice(-2).join('/').replace(/\.obj$/, '')
    const objMaxCh = Math.floor((C_SZ - C_OBJ - 4) / 1.85)
    const obj = shortObj.length > objMaxCh ? '…' + shortObj.slice(-(objMaxCh - 1)) : shortObj
    pdf.setFont('courier', 'normal'); pdf.setFontSize(5.5); pdf.setTextColor(107, 114, 128)
    pdf.text(obj, C_OBJ + 1, y + 3.5)

    // Size
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(6.5); pdf.setTextColor(30, 41, 59)
    pdf.text(formatBytes(sym.size), C_SZ + 1, y + 3.5)

    // Bar
    const frac = sym.size / maxSz
    pdf.setFillColor(226, 232, 240); pdf.rect(C_BAR, y + 1.5, BAR_W, 2, 'F')
    pdf.setFillColor(r, g, b); pdf.rect(C_BAR, y + 1.5, frac * BAR_W, 2, 'F')

    y += ROW_H
  }

  if (symbols.length > sorted.length) {
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(100, 116, 139)
    pdf.text(`… and ${symbols.length - sorted.length} more symbols not shown`, M, y + 4)
  }
}

// ── Page 4: Kconfig — programmatic ────────────────────────────────────────────
const TYPE_RGB: Record<string, [number, number, number]> = {
  bool:   [59, 130, 246],
  int:    [34, 197, 94],
  string: [245, 158, 11],
  hex:    [168, 85, 247],
}

function drawKconfigPage(
  pdf: jsPDF, flags: KconfigEntry[],
  subtitle: string, sessionId: string, flash: number, ram: number,
) {
  drawChrome(pdf, 4, 5, TAB_LABELS.kconfig, subtitle, sessionId, flash, ram)
  let y = CY

  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.setTextColor(15, 23, 42)
  pdf.text(`Build Configuration — ${flags.length} Kconfig flags`, M, y); y += 6

  const ROW_H   = 4.5
  const COL_W   = (CW - 6) / 2
  const COL2_X  = M + COL_W + 6
  const maxRows = Math.floor((PH - y - FOOTER_H - 4) / ROW_H)
  const half    = Math.ceil(Math.min(flags.length, maxRows * 2) / 2)
  const leftF   = flags.slice(0, half)
  const rightF  = flags.slice(half, Math.min(flags.length, maxRows * 2))

  function drawCol(colFlags: KconfigEntry[], startX: number) {
    let cy = y
    for (let i = 0; i < colFlags.length; i++) {
      const flag = colFlags[i]
      if (cy + ROW_H > PH - FOOTER_H - 4) break
      if (i % 2 === 0) { pdf.setFillColor(249, 250, 251); pdf.rect(startX, cy, COL_W, ROW_H, 'F') }

      const [r, g, b] = TYPE_RGB[flag.type] ?? [148, 163, 184]

      // Flag name
      const nmMax = Math.floor((COL_W * 0.56) / 2.15)
      const nm = flag.name.length > nmMax ? flag.name.slice(0, nmMax - 1) + '…' : flag.name
      pdf.setFont('courier', 'bold'); pdf.setFontSize(6); pdf.setTextColor(17, 24, 39)
      pdf.text(nm, startX + 1, cy + 3.2)

      // Value
      const valMax = Math.floor((COL_W * 0.26) / 2.15)
      const val = String(flag.value).length > valMax
        ? String(flag.value).slice(0, valMax - 1) + '…'
        : String(flag.value)
      pdf.setFont('courier', 'normal'); pdf.setFontSize(6); pdf.setTextColor(55, 65, 81)
      pdf.text(val, startX + COL_W * 0.57, cy + 3.2)

      // Type badge
      const bx = startX + COL_W * 0.84
      pdf.setFillColor(r, g, b)
      pdf.rect(bx, cy + 0.8, COL_W * 0.16 - 1, 3, 'F')
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(5); pdf.setTextColor(255, 255, 255)
      pdf.text(flag.type, bx + 1, cy + 3.1)

      cy += ROW_H
    }
  }

  drawCol(leftF,  M)
  drawCol(rightF, COL2_X)

  const shown = leftF.length + rightF.length
  if (flags.length > shown) {
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(100, 116, 139)
    pdf.text(`… and ${flags.length - shown} more flags not shown`, M, PH - FOOTER_H - 6)
  }
}

// ── Appendix ───────────────────────────────────────────────────────────────────
const SECTION_DEFS: {
  name: string; region: string; color: [number, number, number]; desc: string; detail: string
}[] = [
  {
    name: '.text', region: 'FLASH', color: [37, 99, 235],
    desc: 'Executable machine code — your application logic and kernel functions.',
    detail: 'Every compiled function ends up here. This is usually the largest FLASH consumer. Reducing it means optimising or removing functionality.',
  },
  {
    name: '.rodata', region: 'FLASH', color: [8, 145, 178],
    desc: 'Read-only data — string literals, const arrays, lookup tables.',
    detail: 'Stored in FLASH and never copied to RAM. Large log strings, font tables, and configuration structs live here.',
  },
  {
    name: '.data', region: 'FLASH + RAM', color: [234, 88, 12],
    desc: 'Initialised global/static variables — copied from FLASH to RAM at boot.',
    detail: 'The initial values sit in FLASH (increasing binary size). At startup the C runtime copies them to RAM so they can be modified at runtime.',
  },
  {
    name: '.bss', region: 'RAM', color: [220, 38, 38],
    desc: 'Zero-initialised globals/statics — pre-cleared to 0 by the C runtime.',
    detail: 'Takes no space in the binary (no initial values to store), but does consume RAM. Large arrays and unconfigured buffers typically land here.',
  },
  {
    name: '.noinit', region: 'RAM', color: [147, 51, 234],
    desc: 'Uninitialized RAM — intentionally skipped by the startup zeroing pass.',
    detail: 'Used for variables that must survive a warm reset (e.g. crash counters, reboot reason registers). Zephyr boot does NOT clear this region.',
  },
  {
    name: '.heap', region: 'RAM', color: [101, 163, 13],
    desc: 'Dynamic memory arena — used by malloc / k_malloc / net buffers.',
    detail: 'Zephyr pre-allocates a fixed heap block. If your application avoids dynamic allocation this section can be reduced or eliminated.',
  },
  {
    name: '.stack', region: 'RAM', color: [5, 150, 105],
    desc: 'Thread stacks — one per Zephyr thread including the main/idle threads.',
    detail: "Each thread has its own stack region. Stack overflows are a common embedded bug — Zephyr's canary checking uses the bottom of this region.",
  },
  {
    name: '.isr_vector / sw_isr_table', region: 'FLASH', color: [22, 163, 74],
    desc: 'Interrupt vector table — maps hardware interrupt numbers to handler functions.',
    detail: "On Cortex-M this table must be at the base of FLASH (or relocated to RAM). Zephyr's software ISR table chains dynamic handlers from this base.",
  },
  {
    name: '.rodata / initlevel', region: 'FLASH', color: [219, 39, 119],
    desc: 'Kernel init records — SYS_INIT() and DEVICE_DEFINE() descriptors.',
    detail: "Zephyr's initialization subsystem walks these records at boot to call device init functions in priority order. More drivers = larger table.",
  },
  {
    name: '.ARM.exidx / .ARM', region: 'FLASH', color: [100, 116, 139],
    desc: 'ARM exception-handling index — unwinding tables for C++ exceptions or stack traces.',
    detail: 'Rarely needed in embedded firmware. If you are not using C++ exceptions, --no-exceptions can eliminate this section entirely.',
  },
]

function renderColumn(
  pdf: jsPDF, defs: typeof SECTION_DEFS,
  x: number, startY: number, colW: number, maxH: number,
) {
  let y = startY
  const rowH = 18
  const maxY = startY + maxH

  for (const def of defs) {
    if (y + rowH > maxY) break
    const [r, g, b] = def.color

    pdf.setFillColor(r, g, b); pdf.rect(x, y, 2.5, rowH - 1, 'F')
    pdf.setFillColor(
      Math.min(255, r + Math.round((255 - r) * 0.88)),
      Math.min(255, g + Math.round((255 - g) * 0.88)),
      Math.min(255, b + Math.round((255 - b) * 0.88)),
    )
    pdf.rect(x + 2.5, y, colW - 2.5, rowH - 1, 'F')

    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5); pdf.setTextColor(r, g, b)
    pdf.text(def.name, x + 5, y + 5)

    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.5); pdf.setTextColor(r, g, b)
    pdf.text(`[${def.region}]`, x + 5 + pdf.getTextWidth(def.name) + 2, y + 5)

    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7); pdf.setTextColor(30, 41, 59)
    pdf.text(def.desc, x + 5, y + 10, { maxWidth: colW - 6 })

    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.5); pdf.setTextColor(71, 85, 105)
    pdf.text(def.detail, x + 5, y + 14.5, { maxWidth: colW - 6 })

    y += rowH
  }
}

function addAppendixPage(
  pdf: jsPDF, subtitle: string,
  sessionId: string, flash: number, ram: number,
) {
  drawChrome(pdf, 5, 5, 'Appendix — Memory Sections Explained', subtitle, sessionId, flash, ram)

  const bodyTop = HEADER_H + 6
  const bodyH   = PH - HEADER_H - FOOTER_H - 8
  const colW    = (PW - M * 2 - 6) / 2
  const col2X   = M + colW + 6
  const split   = Math.ceil(SECTION_DEFS.length / 2)

  renderColumn(pdf, SECTION_DEFS.slice(0, split), M,      bodyTop, colW, bodyH)
  renderColumn(pdf, SECTION_DEFS.slice(split),    col2X,  bodyTop, colW, bodyH)
}

// ── Main export ────────────────────────────────────────────────────────────────
export async function exportDashboardPdf(
  analysis: AnalysisResult,
  setActiveTab: (tab: Tab) => void,
  contentRef: React.RefObject<HTMLDivElement>,
  onProgress?: (msg: string) => void,
): Promise<void> {
  const pdf      = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const meta     = analysis.parse_metadata
  const subtitle = `${meta.elf_arch || 'ARM'} · ${analysis.files_received.join(', ')} · parser v${meta.parser_version}`
  const sid      = analysis.session_id
  const flash    = analysis.memory_regions.find((r) => r.name === 'FLASH')?.used ?? 0
  const ram      = analysis.memory_regions.find((r) => r.name === 'RAM')?.used ?? 0

  // ── Page 1: Overview (html2canvas) ──────────────────────────────────────────
  onProgress?.('Capturing Overview… (1/5)')
  setActiveTab('overview')
  await wait(900)

  if (contentRef.current) {
    const canvas  = await captureTab(contentRef.current)
    const availH  = PH - HEADER_H - FOOTER_H - 4
    const scale   = Math.min(CW / canvas.width, availH / canvas.height)
    const imgW    = canvas.width  * scale
    const imgH    = canvas.height * scale
    const imgX    = M + (CW - imgW) / 2

    drawChrome(pdf, 1, 5, TAB_LABELS.overview, subtitle, sid, flash, ram)
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', imgX, HEADER_H + 2, imgW, imgH)
  }

  // ── Page 2: Memory Layout (programmatic) ────────────────────────────────────
  onProgress?.('Building Memory Layout… (2/5)')
  pdf.addPage()
  drawMemoryPage(pdf, analysis.memory_regions, analysis.section_summary, subtitle, sid, flash, ram)

  // ── Page 3: Top Symbols (programmatic) ──────────────────────────────────────
  onProgress?.('Building Symbols Table… (3/5)')
  pdf.addPage()
  drawSymbolsPage(pdf, analysis.top_symbols, subtitle, sid, flash, ram)

  // ── Page 4: Kconfig (programmatic) ──────────────────────────────────────────
  onProgress?.('Building Kconfig… (4/5)')
  pdf.addPage()
  drawKconfigPage(pdf, analysis.kconfig_flags, subtitle, sid, flash, ram)

  // ── Page 5: Appendix (programmatic) ─────────────────────────────────────────
  onProgress?.('Building appendix… (5/5)')
  pdf.addPage()
  addAppendixPage(pdf, subtitle, sid, flash, ram)

  const filename = `zephyr-build-${analysis.session_id.slice(0, 8)}.pdf`
  pdf.save(filename)
  onProgress?.(`Downloaded ${filename}`)
}
