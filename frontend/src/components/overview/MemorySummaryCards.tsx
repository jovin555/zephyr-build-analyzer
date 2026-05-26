import type { MemoryRegion } from '../../types/analysis'
import { formatBytes, sizeRatio } from '../../utils/bytes'
import { REGION_COLORS } from '../../utils/colors'

export default function MemorySummaryCards({ regions }: { regions: MemoryRegion[] }) {
  if (!regions.length) return null

  return (
    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
      {regions.map((r) => {
        const pct = (sizeRatio(r.used, r.length) * 100).toFixed(1)
        const color = REGION_COLORS[r.name] ?? REGION_COLORS.UNKNOWN
        return (
          <div key={r.name} style={{
            flex: '1 1 200px', padding: '1rem 1.25rem',
            border: `1px solid ${color}44`, borderRadius: 10,
            background: `${color}11`,
          }}>
            <div style={{ color, fontWeight: 700, fontSize: '0.85rem', marginBottom: 4 }}>{r.name}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{formatBytes(r.used)}</div>
            <div style={{ color: '#6b7280', fontSize: '0.8rem' }}>of {formatBytes(r.length)} ({pct}%)</div>
            <div style={{ marginTop: 8, height: 6, background: '#e5e7eb', borderRadius: 3 }}>
              <div style={{
                height: '100%', borderRadius: 3,
                width: `${pct}%`, background: color,
                transition: 'width 0.4s',
              }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
