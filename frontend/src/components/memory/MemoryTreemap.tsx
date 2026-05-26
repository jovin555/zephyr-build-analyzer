import { Treemap, ResponsiveContainer, Tooltip } from 'recharts'
import type { MemoryRegion, SectionSummary } from '../../types/analysis'
import { buildTreemapData } from '../../utils/treemap'
import { getSectionColor, REGION_COLORS } from '../../utils/colors'
import { formatBytes } from '../../utils/bytes'

// Custom tile renderer — uses the pre-computed `color` field from each node
function CustomTile(props: {
  x?: number; y?: number; width?: number; height?: number
  name?: string; fullPath?: string; section?: string; region?: string
  color?: string; value?: number; depth?: number
}) {
  const { x = 0, y = 0, width = 0, height = 0, name = '', color, depth = 0 } = props
  if (width < 4 || height < 4) return null

  // Section-level tiles (depth=2) get a header bar; object-level (depth=3) get a fill
  const bg = color ?? '#9ca3af'
  const isSection = depth === 2
  const showLabel = width > 32 && height > 16

  return (
    <g>
      <rect
        x={x + 1} y={y + 1}
        width={width - 2} height={height - 2}
        fill={isSection ? bg + '33' : bg + '99'}
        stroke={bg}
        strokeWidth={isSection ? 2 : 1}
        rx={3}
      />
      {showLabel && (
        <text
          x={x + 6} y={y + (isSection ? 14 : Math.min(height / 2 + 4, height - 4))}
          fill={isSection ? bg : '#1e293b'}
          fontSize={isSection ? 11 : 10}
          fontWeight={isSection ? 700 : 400}
          fontFamily="monospace"
          style={{ pointerEvents: 'none' }}
        >
          {name.length > Math.floor(width / 7) ? name.slice(0, Math.floor(width / 7) - 1) + '…' : name}
        </text>
      )}
    </g>
  )
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: { name: string; fullPath?: string; section?: string; value?: number } }[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={{
      background: '#1e293b', color: '#f1f5f9', borderRadius: 8,
      padding: '0.6rem 0.9rem', fontSize: '0.8rem', maxWidth: 340,
      boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
    }}>
      {d.section && (
        <div style={{ color: getSectionColor(d.section), fontWeight: 700, marginBottom: 2 }}>{d.section}</div>
      )}
      <div style={{ fontFamily: 'monospace', wordBreak: 'break-all', marginBottom: 4 }}>
        {d.fullPath ?? d.name}
      </div>
      {d.value != null && (
        <div style={{ color: '#94a3b8' }}>{formatBytes(d.value)}</div>
      )}
    </div>
  )
}

function SectionLegend({ sections }: { sections: SectionSummary[] }) {
  const unique = [...new Map(sections.map((s) => [s.name, s])).values()]
    .sort((a, b) => b.size - a.size)

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
      {unique.map((s) => {
        const color = getSectionColor(s.name)
        return (
          <div key={s.name} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: color + '18', border: `1px solid ${color}55`,
            borderRadius: 6, padding: '3px 8px',
          }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
            <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#374151', fontWeight: 600 }}>{s.name}</span>
            <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{formatBytes(s.size)}</span>
          </div>
        )
      })}
    </div>
  )
}

interface Props {
  regions: MemoryRegion[]
  sections: SectionSummary[]
}

export default function MemoryTreemap({ regions, sections }: Props) {
  if (!regions.length) return <p style={{ color: '#6b7280' }}>No memory map data.</p>

  const data = buildTreemapData(regions)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', marginBottom: '0.75rem' }}>
        <h3 style={{ fontWeight: 600, margin: 0 }}>Memory Layout</h3>
        <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
          Each tile = one object file. Color = section. Size = bytes used.
        </span>
      </div>

      <SectionLegend sections={sections} />

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
        {regions.map((r) => {
          const color = REGION_COLORS[r.name] ?? '#9ca3af'
          return (
            <div key={r.name} style={{
              padding: '3px 10px', borderRadius: 6, fontSize: '0.8rem', fontWeight: 700,
              background: color + '20', border: `1px solid ${color}66`, color,
            }}>
              {r.name}: {formatBytes(r.used)}
            </div>
          )
        })}
      </div>

      <ResponsiveContainer width="100%" height={520}>
        <Treemap
          data={data.children ?? []}
          dataKey="size"
          content={<CustomTile />}
        >
          <Tooltip content={<CustomTooltip />} />
        </Treemap>
      </ResponsiveContainer>

      <p style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '0.5rem' }}>
        Hover any tile for the full object file path and exact size.
      </p>
    </div>
  )
}
