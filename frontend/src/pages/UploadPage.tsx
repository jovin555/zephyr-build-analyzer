import { useNavigate } from 'react-router-dom'
import DropZone from '../components/upload/DropZone'
import ErrorBanner from '../components/shared/ErrorBanner'
import { useAnalysisStore } from '../store/analysisStore'

export default function UploadPage() {
  const navigate = useNavigate()
  const { uploadFiles, isLoading, uploadError, clearError } = useAnalysisStore()

  const handleFiles = async (files: Parameters<typeof uploadFiles>[0]) => {
    try {
      const sessionId = await uploadFiles(files)
      navigate(`/dashboard/${sessionId}`)
    } catch {
      // error already set in store
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#f8fafc', padding: '2rem',
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: '2.5rem',
        boxShadow: '0 1px 8px rgba(0,0,0,0.08)', width: '100%', maxWidth: 600,
      }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>
          Zephyr Build Analyzer
        </h1>
        <p style={{ color: '#6b7280', marginBottom: '2rem', fontSize: '0.9rem' }}>
          Upload your build artifacts to visualize memory usage, sections, and Kconfig.
        </p>

        {uploadError && <ErrorBanner message={uploadError} onDismiss={clearError} />}

        <DropZone onFilesSelected={handleFiles} isLoading={isLoading} />

        <p style={{ marginTop: '1.5rem', fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center' }}>
          All files are processed locally. Nothing is sent to any external server.
        </p>
      </div>
    </div>
  )
}
