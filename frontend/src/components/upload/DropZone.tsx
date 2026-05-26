import { useRef, useState } from 'react'
import type { FileUploadPayload } from '../../api/upload'

interface Props {
  onFilesSelected: (files: FileUploadPayload) => void
  isLoading: boolean
}

const FILE_HINTS: { key: keyof FileUploadPayload; label: string; hint: string }[] = [
  { key: 'elfFile',    label: 'ELF binary',     hint: 'zephyr.elf' },
  { key: 'mapFile',    label: 'Linker map',      hint: 'zephyr.map' },
  { key: 'configFile', label: 'Kconfig',         hint: '.config or autoconf.h' },
  { key: 'dtsFile',    label: 'Devicetree',      hint: 'devicetree_generated.h (optional)' },
]

export default function DropZone({ onFilesSelected, isLoading }: Props) {
  const [selected, setSelected] = useState<Partial<FileUploadPayload>>({})
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const handleFileChange = (key: keyof FileUploadPayload) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setSelected((prev) => ({ ...prev, [key]: file }))
  }

  const handleSubmit = () => {
    if (Object.keys(selected).length === 0) return
    onFilesSelected(selected as FileUploadPayload)
  }

  const hasFiles = Object.keys(selected).length > 0
  const hasRequiredFile = selected.elfFile || selected.mapFile

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {FILE_HINTS.map(({ key, label, hint }) => (
          <label key={key} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0.75rem 1rem', border: '1px solid',
            borderColor: selected[key] ? '#3b82f6' : '#d1d5db',
            borderRadius: 8, cursor: 'pointer', background: selected[key] ? '#eff6ff' : '#fff',
            transition: 'all 0.15s',
          }}>
            <span>
              <span style={{ fontWeight: 600, marginRight: 8 }}>{label}</span>
              <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>{hint}</span>
            </span>
            {selected[key] ? (
              <span style={{ color: '#3b82f6', fontSize: '0.85rem' }}>✓ {(selected[key] as File).name}</span>
            ) : (
              <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>Click to select</span>
            )}
            <input
              type="file"
              style={{ display: 'none' }}
              ref={(el) => { inputRefs.current[key] = el }}
              onChange={handleFileChange(key)}
            />
          </label>
        ))}
      </div>

      <button
        onClick={handleSubmit}
        disabled={!hasFiles || !hasRequiredFile || isLoading}
        style={{
          width: '100%', padding: '0.85rem',
          background: hasFiles && hasRequiredFile && !isLoading ? '#3b82f6' : '#d1d5db',
          color: '#fff', border: 'none', borderRadius: 8,
          fontWeight: 600, fontSize: '1rem', cursor: hasFiles && hasRequiredFile && !isLoading ? 'pointer' : 'not-allowed',
          transition: 'background 0.15s',
        }}
      >
        {isLoading ? 'Analyzing…' : 'Analyze Build'}
      </button>
      {hasFiles && !hasRequiredFile && (
        <p style={{ color: '#f59e0b', fontSize: '0.8rem', marginTop: '0.5rem' }}>
          At least an ELF or map file is required.
        </p>
      )}
    </div>
  )
}
