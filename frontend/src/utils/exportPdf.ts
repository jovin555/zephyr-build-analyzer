import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import type { AnalysisResult } from '../types/analysis'
import { formatBytes } from './bytes'

const TABS = ['overview', 'memory', 'symbols', 'kconfig'] as const
type Tab = typeof TABS[number]

const TAB_LABELS: Record<Tab, string> = {
  overview: 'Overview — Flash & RAM Summary',
  memory:   'Memory Layout — Section Treemap',
  symbols:  'Top Symbols — Size Breakdown',
  kconfig:  'Kconfig — Build Configuration',
}

async function captureTab(contentEl: HTMLElement): Promise<HTMLCanvasElement> {
  return html2canvas(contentEl, {
    scale: 2,                // retina quality
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
    // Capture full scrollable height
    windowWidth: contentEl.scrollWidth,
    windowHeight: contentEl.scrollHeight,
    width: contentEl.scrollWidth,
    height: contentEl.scrollHeight,
  })
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export async function exportDashboardPdf(
  analysis: AnalysisResult,
  setActiveTab: (tab: Tab) => void,
  contentRef: React.RefObject<HTMLDivElement>,
  onProgress?: (msg: string) => void,
): Promise<void> {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()   // 297mm
  const pageH = pdf.internal.pageSize.getHeight()  // 210mm
  const margin = 12
  const contentW = pageW - margin * 2
  const headerH = 18
  const footerH = 8

  const meta = analysis.parse_metadata
  const subtitle = `${meta.elf_arch || 'ARM'} · ${analysis.files_received.join(', ')} · parser v${meta.parser_version}`

  for (let i = 0; i < TABS.length; i++) {
    const tab = TABS[i]
    onProgress?.(`Capturing ${TAB_LABELS[tab]}… (${i + 1}/5)`)

    // Switch tab and let React re-render + charts animate
    setActiveTab(tab)
    await wait(600)

    if (!contentRef.current) continue
    const canvas = await captureTab(contentRef.current)

    if (i > 0) pdf.addPage()

    // ── Header bar ──────────────────────────────────────────────────────
    pdf.setFillColor(15, 23, 42)       // #0f172a
    pdf.rect(0, 0, pageW, headerH, 'F')

    pdf.setTextColor(241, 245, 249)    // #f1f5f9
    pdf.setFontSize(11)
    pdf.setFont('helvetica', 'bold')
    pdf.text('Zephyr Build Analyzer', margin, 7)

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(148, 163, 184)    // #94a3b8
    pdf.text(subtitle, margin, 13)

    // Tab title (right-aligned)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10)
    pdf.setTextColor(99, 179, 237)     // light blue
    pdf.text(`${i + 1}/5  ${TAB_LABELS[tab]}`, pageW - margin, 10, { align: 'right' })

    // ── Page content image ───────────────────────────────────────────────
    const availH = pageH - headerH - footerH - 4
    const imgW = contentW
    const rawRatio = canvas.height / canvas.width
    let imgH = imgW * rawRatio
    if (imgH > availH) imgH = availH

    const imgData = canvas.toDataURL('image/png')
    pdf.addImage(imgData, 'PNG', margin, headerH + 2, imgW, imgH)

    // ── Footer ───────────────────────────────────────────────────────────
    pdf.setDrawColor(51, 65, 85)       // #334155
    pdf.setLineWidth(0.3)
    pdf.line(margin, pageH - footerH, pageW - margin, pageH - footerH)

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7)
    pdf.setTextColor(100, 116, 139)    // #64748b
    pdf.text(`Session: ${analysis.session_id}`, margin, pageH - 3)
    pdf.text(
      `FLASH ${formatBytes(analysis.memory_regions.find(r => r.name === 'FLASH')?.used ?? 0)}  ·  RAM ${formatBytes(analysis.memory_regions.find(r => r.name === 'RAM')?.used ?? 0)}`,
      pageW / 2, pageH - 3, { align: 'center' }
    )
    pdf.text(
      `Generated ${new Date().toLocaleString()}`,
      pageW - margin, pageH - 3, { align: 'right' }
    )
  }

  // ── Appendix: Memory Sections Explained ────────────────────────────────
  onProgress?.('Building appendix… (5/5)')
  pdf.addPage()
  addAppendixPage(pdf, pageW, pageH, margin, headerH, footerH, subtitle)

  const filename = `zephyr-build-${analysis.session_id.slice(0, 8)}.pdf`
  pdf.save(filename)
  onProgress?.(`Downloaded ${filename}`)
}

// ── Section definitions ─────────────────────────────────────────────────────

const SECTION_DEFS: { name: string; region: string; color: [number, number, number]; desc: string; detail: string }[] = [
  {
    name: '.text', region: 'FLASH',
    color: [37, 99, 235],
    desc: 'Executable machine code — your application logic and kernel functions.',
    detail: 'Every compiled function ends up here. This is usually the largest FLASH consumer. Reducing it means optimising or removing functionality.',
  },
  {
    name: '.rodata', region: 'FLASH',
    color: [8, 145, 178],
    desc: 'Read-only data — string literals, const arrays, lookup tables.',
    detail: 'Stored in FLASH and never copied to RAM. Large log strings, font tables, and configuration structs live here.',
  },
  {
    name: '.data', region: 'FLASH + RAM',
    color: [234, 88, 12],
    desc: 'Initialised global/static variables — copied from FLASH to RAM at boot.',
    detail: 'The initial values sit in FLASH (increasing binary size). At startup the C runtime copies them to RAM so they can be modified at runtime.',
  },
  {
    name: '.bss', region: 'RAM',
    color: [220, 38, 38],
    desc: 'Zero-initialised globals/statics — pre-cleared to 0 by the C runtime.',
    detail: 'Takes no space in the binary (no initial values to store), but does consume RAM. Large arrays and unconfigured buffers typically land here.',
  },
  {
    name: '.noinit', region: 'RAM',
    color: [147, 51, 234],
    desc: 'Uninitialized RAM — intentionally skipped by the startup zeroing pass.',
    detail: 'Used for variables that must survive a warm reset (e.g. crash counters, reboot reason registers). Zephyr boot does NOT clear this region.',
  },
  {
    name: '.heap', region: 'RAM',
    color: [101, 163, 13],
    desc: 'Dynamic memory arena — used by malloc / k_malloc / net buffers.',
    detail: 'Zephyr pre-allocates a fixed heap block. If your application avoids dynamic allocation this section can be reduced or eliminated.',
  },
  {
    name: '.stack', region: 'RAM',
    color: [5, 150, 105],
    desc: 'Thread stacks — one per Zephyr thread including the main/idle threads.',
    detail: 'Each thread has its own stack region. Stack overflows are a common embedded bug — Zephyr\'s canary checking uses the bottom of this region.',
  },
  {
    name: '.isr_vector / sw_isr_table', region: 'FLASH',
    color: [22, 163, 74],
    desc: 'Interrupt vector table — maps hardware interrupt numbers to handler functions.',
    detail: 'On Cortex-M this table must be at the base of FLASH (or relocated to RAM). Zephyr\'s software ISR table chains dynamic handlers from this base.',
  },
  {
    name: '.rodata / initlevel', region: 'FLASH',
    color: [219, 39, 119],
    desc: 'Kernel init records — SYS_INIT() and DEVICE_DEFINE() descriptors.',
    detail: 'Zephyr\'s initialization subsystem walks these records at boot to call device init functions in priority order. More drivers = larger table.',
  },
  {
    name: '.ARM.exidx / .ARM', region: 'FLASH',
    color: [100, 116, 139],
    desc: 'ARM exception-handling index — unwinding tables for C++ exceptions or stack traces.',
    detail: 'Rarely needed in embedded firmware. If you are not using C++ exceptions, --no-exceptions can eliminate this section entirely.',
  },
]

function addAppendixPage(
  pdf: jsPDF,
  pageW: number,
  pageH: number,
  margin: number,
  headerH: number,
  footerH: number,
  subtitle: string,
) {
  // ── Header bar ──────────────────────────────────────────────────────────
  pdf.setFillColor(15, 23, 42)
  pdf.rect(0, 0, pageW, headerH, 'F')

  pdf.setTextColor(241, 245, 249)
  pdf.setFontSize(11)
  pdf.setFont('helvetica', 'bold')
  pdf.text('Zephyr Build Analyzer', margin, 7)

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  pdf.setTextColor(148, 163, 184)
  pdf.text(subtitle, margin, 13)

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  pdf.setTextColor(99, 179, 237)
  pdf.text('Appendix — Memory Sections Explained', pageW - margin, 10, { align: 'right' })

  // ── Body ─────────────────────────────────────────────────────────────────
  // Two-column layout
  const bodyTop = headerH + 6
  const bodyH = pageH - headerH - footerH - 8
  const colW = (pageW - margin * 2 - 6) / 2
  const col2X = margin + colW + 6

  const splitIdx = Math.ceil(SECTION_DEFS.length / 2)
  const leftDefs  = SECTION_DEFS.slice(0, splitIdx)
  const rightDefs = SECTION_DEFS.slice(splitIdx)

  renderColumn(pdf, leftDefs,  margin,  bodyTop, colW, bodyH)
  renderColumn(pdf, rightDefs, col2X,   bodyTop, colW, bodyH)

  // ── Footer ────────────────────────────────────────────────────────────────
  pdf.setDrawColor(51, 65, 85)
  pdf.setLineWidth(0.3)
  pdf.line(margin, pageH - footerH, pageW - margin, pageH - footerH)

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7)
  pdf.setTextColor(100, 116, 139)
  pdf.text('Zephyr RTOS memory section reference', margin, pageH - 3)
  pdf.text('5/5  Appendix', pageW - margin, pageH - 3, { align: 'right' })
}

function renderColumn(
  pdf: jsPDF,
  defs: typeof SECTION_DEFS,
  x: number,
  startY: number,
  colW: number,
  maxH: number,
) {
  let y = startY
  const rowH    = 18       // height budget per entry
  const nameX   = x + 3
  const descX   = x + 3
  const badgeW  = colW
  const maxY    = startY + maxH

  for (const def of defs) {
    if (y + rowH > maxY) break

    const [r, g, b] = def.color

    // Colored left accent bar
    pdf.setFillColor(r, g, b)
    pdf.rect(x, y, 2.5, rowH - 1, 'F')

    // Section name badge background (faint)
    pdf.setFillColor(r, g, b, 0.08)   // jsPDF ignores alpha here but still fine
    pdf.setFillColor(
      Math.min(255, r + Math.round((255 - r) * 0.88)),
      Math.min(255, g + Math.round((255 - g) * 0.88)),
      Math.min(255, b + Math.round((255 - b) * 0.88)),
    )
    pdf.rect(x + 2.5, y, badgeW - 2.5, rowH - 1, 'F')

    // Section name
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8.5)
    pdf.setTextColor(r, g, b)
    pdf.text(def.name, nameX + 2.5, y + 5)

    // Region pill (right of name)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(6.5)
    pdf.setTextColor(r, g, b)
    pdf.text(`[${def.region}]`, nameX + 2.5 + pdf.getTextWidth(def.name) + 2, y + 5)

    // Short description
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(7)
    pdf.setTextColor(30, 41, 59)   // #1e293b
    pdf.text(def.desc, descX + 2.5, y + 10, { maxWidth: colW - 6 })

    // Detail line
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(6.5)
    pdf.setTextColor(71, 85, 105)  // #475569
    pdf.text(def.detail, descX + 2.5, y + 14.5, { maxWidth: colW - 6 })

    y += rowH
  }
}
