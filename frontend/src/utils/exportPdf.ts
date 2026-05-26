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
    onProgress?.(`Capturing ${TAB_LABELS[tab]}… (${i + 1}/4)`)

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
    pdf.text(`${i + 1}/4  ${TAB_LABELS[tab]}`, pageW - margin, 10, { align: 'right' })

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

  const filename = `zephyr-build-${analysis.session_id.slice(0, 8)}.pdf`
  pdf.save(filename)
  onProgress?.(`Downloaded ${filename}`)
}
