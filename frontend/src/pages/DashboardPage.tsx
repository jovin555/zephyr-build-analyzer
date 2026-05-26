import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { exportDashboardPdf } from '../utils/exportPdf'
import { useAnalysisStore } from '../store/analysisStore'
import LoadingSpinner from '../components/shared/LoadingSpinner'
import ErrorBanner from '../components/shared/ErrorBanner'
import MemorySummaryCards from '../components/overview/MemorySummaryCards'
import SectionBarChart from '../components/overview/SectionBarChart'
import MemoryTreemap from '../components/memory/MemoryTreemap'
import TopSymbolsTable from '../components/symbols/TopSymbolsTable'
import KconfigInspector from '../components/kconfig/KconfigInspector'

const TABS = ['overview', 'memory', 'symbols', 'kconfig'] as const

export default function DashboardPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const contentRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)
  const [exportMsg, setExportMsg] = useState('')
  const {
    analysis, isLoading, uploadError, activeTab, symbolFilter, kconfigFilter,
    loadSession, setActiveTab, setSymbolFilter, setKconfigFilter, clearError,
  } = useAnalysisStore()

  async function handleExportPdf() {
    if (!analysis || exporting) return
    setExporting(true)
    setExportMsg('Preparing export…')
    try {
      await exportDashboardPdf(analysis, setActiveTab, contentRef, setExportMsg)
    } catch (e) {
      setExportMsg('Export failed — see console for details')
      console.error(e)
    } finally {
      setExporting(false)
    }
  }

  useEffect(() => {
    if (sessionId && (!analysis || analysis.session_id !== sessionId)) {
      loadSession(sessionId)
    }
  }, [sessionId])

  if (isLoading) return <LoadingSpinner message="Parsing build artifacts…" />

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      {/* Top bar */}
      <div style={{
        background: '#fff', borderBottom: '1px solid #e5e7eb',
        padding: '0.75rem 2rem', display: 'flex', alignItems: 'center', gap: '1rem',
      }}>
        <button onClick={() => navigate('/')} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#3b82f6', fontWeight: 600, fontSize: '1rem',
        }}>← Zephyr Build Analyzer</button>
        {analysis && (
          <span style={{ color: '#6b7280', fontSize: '0.8rem', fontFamily: 'monospace' }}>
            Session: {analysis.session_id.slice(0, 8)}… | {analysis.files_received.join(', ')} |{' '}
            {analysis.parse_metadata.elf_arch || 'Unknown arch'} | v{analysis.parse_metadata.parser_version}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {exportMsg && (
            <span style={{ fontSize: '0.78rem', color: exporting ? '#3b82f6' : '#16a34a', fontFamily: 'monospace' }}>
              {exportMsg}
            </span>
          )}
          {analysis && (
            <button
              onClick={handleExportPdf}
              disabled={exporting}
              style={{
                padding: '0.4rem 1rem', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600,
                background: exporting ? '#93c5fd' : '#3b82f6', color: '#fff',
                border: 'none', cursor: exporting ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s',
              }}
            >
              {exporting ? 'Exporting…' : 'Export PDF'}
            </button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '0 2rem', display: 'flex', gap: 0 }}>
        {TABS.map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: '0.75rem 1.25rem', border: 'none', background: 'none', cursor: 'pointer',
            fontWeight: activeTab === tab ? 700 : 400,
            color: activeTab === tab ? '#3b82f6' : '#6b7280',
            borderBottom: activeTab === tab ? '2px solid #3b82f6' : '2px solid transparent',
            textTransform: 'capitalize',
          }}>
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div ref={contentRef} style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto' }}>
        {uploadError && <ErrorBanner message={uploadError} onDismiss={clearError} />}

        {analysis?.parse_warnings.map((w, i) => (
          <ErrorBanner key={i} message={`Warning: ${w}`} />
        ))}

        {!analysis && !isLoading && (
          <p style={{ color: '#6b7280' }}>No analysis data. <button onClick={() => navigate('/')} style={{ color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer' }}>Upload files</button>.</p>
        )}

        {analysis && (
          <>
            {activeTab === 'overview' && (
              <div>
                <MemorySummaryCards regions={analysis.memory_regions} />
                <SectionBarChart sections={analysis.section_summary} />
              </div>
            )}

            {activeTab === 'memory' && (
              <MemoryTreemap regions={analysis.memory_regions} sections={analysis.section_summary} />
            )}

            {activeTab === 'symbols' && (
              <div>
                <div style={{ marginBottom: '1rem' }}>
                  <input
                    type="text"
                    placeholder="Filter symbols…"
                    value={symbolFilter}
                    onChange={(e) => setSymbolFilter(e.target.value)}
                    style={{
                      padding: '0.5rem 0.75rem', border: '1px solid #d1d5db',
                      borderRadius: 8, width: 300, fontSize: '0.9rem',
                    }}
                  />
                </div>
                <TopSymbolsTable symbols={analysis.top_symbols} filter={symbolFilter} />
              </div>
            )}

            {activeTab === 'kconfig' && (
              <div>
                <div style={{ marginBottom: '1rem' }}>
                  <input
                    type="text"
                    placeholder="Filter CONFIG_ flags…"
                    value={kconfigFilter}
                    onChange={(e) => setKconfigFilter(e.target.value)}
                    style={{
                      padding: '0.5rem 0.75rem', border: '1px solid #d1d5db',
                      borderRadius: 8, width: 300, fontSize: '0.9rem',
                    }}
                  />
                </div>
                <KconfigInspector flags={analysis.kconfig_flags} filter={kconfigFilter} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
