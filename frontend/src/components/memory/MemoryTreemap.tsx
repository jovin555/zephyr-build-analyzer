import { Treemap, ResponsiveContainer, Tooltip } from 'recharts'
import type { MemoryRegion, SectionSummary } from '../../types/analysis'
import { buildTreemapData } from '../../utils/treemap'
import { getSectionColor, contrastText, REGION_COLORS } from '../../utils/colors'
import { formatBytes } from '../../utils/bytes'

function darken(hex: string, amount = 40): string {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amount)
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amount)
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amount)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

function CustomTile(props: {
  x?: number; y?: number; width?: number; height?: number
  name?: string; fullPath?: string; section?: string; region?: string
  color?: string; value?: number; depth?: number
}) {
  const { x = 0, y = 0, width = 0, height = 0, name = '', color, depth = 0 } = props
  if (width < 3 || height < 3) return null

  const bg = color ?? (depth <= 1 ? '#334155' : '#475569')
  const border = darken(bg, 30)
  const textColor = contrastText(bg)
  const isRegion  = depth === 1  // FLASH / RAM label
  const isSection = depth === 2  // .text / .bss header tile
  const isFile    = depth === 3  // individual object file

  // Region tiles: dark overlay label in the middle, no fill (children fill it)
  if (isRegion) {
    return (
      <g>
        <rect x={x} y={y} width={width} height={height} fill="transparent" stroke="#1e293b" strokeWidth={2} rx={4} />
        {width > 60 && height > 20 && (
          <text x={x + width / 2} y={y + height / 2} textAnchor="middle" dominantBaseline="middle"
            fill="#94a3b8" fontSize={12} fontWeight={700} style={{ pointerEvents: 'none' }}>
            {name}
          </text>
        )}
      </g>
    )
  }

  // Section tiles: solid vivid fill, bold label at top
  if (isSection) {
    return (
      <g>
        <rect x={x + 1} y={y + 1} width={width - 2} height={height - 2}
          fill={bg + '40'} stroke={bg} strokeWidth={2} rx={3} />
        {width > 40 && height > 16 && (
          <text x={x + 6} y={y + 13} fill={bg} fontSize={11} fontWeight={700}
            fontFamily="monospace" style={{ pointerEvents: 'none' }}>
            {name.length > Math.floor(width / 7) ? name.slice(0, Math.floor(width / 7) - 1) + '…' : name}
          </text>
        )}
      </g>
    )
  }

  // File tiles: fully solid vibrant fill
  if (isFile) {
    const label = name.length > Math.floor(width / 6.5)
      ? name.slice(0, Math.floor(width / 6.5) - 1) + '…'
      : name

    return (
      <g>
        <rect x={x + 1} y={y + 1} width={width - 2} height={height - 2}
          fill={bg} stroke={border} strokeWidth={1} rx={2} />
        {width > 28 && height > 14 && (
          <text x={x + 5} y={y + height / 2 + 4}
            fill={textColor} fontSize={10} fontFamily="monospace"
            style={{ pointerEvents: 'none' }}>
            {label}
          </text>
        )}
      </g>
    )
  }

  return null
}

function CustomTooltip({ active, payload }: {
  active?: boolean
  payload?: { payload: { name: string; fullPath?: string; section?: string; value?: number; color?: string } }[]
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const color = d.color ?? getSectionColor(d.section ?? '')
  return (
    <div style={{
      background: '#0f172a', color: '#f1f5f9', borderRadius: 10,
      padding: '0.65rem 1rem', fontSize: '0.8rem', maxWidth: 360,
      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      border: `1px solid ${color}`,
    }}>
      {d.section && (
        <div style={{
          color, fontWeight: 700, fontSize: '0.75rem',
          marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          {d.section}
        </div>
      )}
      <div style={{ fontFamily: 'monospace', wordBreak: 'break-all', marginBottom: 6, fontSize: '0.82rem' }}>
        {d.fullPath ?? d.name}
      </div>
      {d.value != null && (
        <div style={{
          background: color + '22', border: `1px solid ${color}44`,
          borderRadius: 6, padding: '2px 8px', display: 'inline-block',
          color, fontWeight: 700, fontSize: '0.85rem',
        }}>
          {formatBytes(d.value)}
        </div>
      )}
    </div>
  )
}

function SectionLegend({ sections }: { sections: SectionSummary[] }) {
  const DEBUG_PREFIXES = ['.debug', '.comment', '.last_section', '.stab']
  const unique = [...new Map(
    sections
      .filter((s) => !DEBUG_PREFIXES.some((p) => s.name.startsWith(p)))
      .map((s) => [s.name, s])
  ).values()].sort((a, b) => b.size - a.size)

  if (!unique.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1rem' }}>
      {unique.map((s) => {
        const color = getSectionColor(s.name)
        return (
          <div key={s.name} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: '#1e293b', border: `1px solid ${color}`,
            borderRadius: 6, padding: '4px 10px',
          }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
            <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', color, fontWeight: 700 }}>{s.name}</span>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{formatBytes(s.size)}</span>
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
    <div style={{ background: '#0f172a', borderRadius: 12, padding: '1.25rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', marginBottom: '0.75rem' }}>
        <h3 style={{ fontWeight: 700, margin: 0, color: '#f1f5f9' }}>Memory Layout</h3>
        <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
          Color = section · Size = bytes · Hover for details
        </span>
      </div>

      {/* Region pills */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {regions.map((r) => {
          const color = REGION_COLORS[r.name] ?? '#64748b'
          return (
            <div key={r.name} style={{
              padding: '4px 12px', borderRadius: 20, fontSize: '0.82rem', fontWeight: 700,
              background: color + '25', border: `1px solid ${color}`, color,
            }}>
              {r.name}: {formatBytes(r.used)}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <SectionLegend sections={sections} />

      {/* Treemap */}
      <div style={{ background: '#1e293b', borderRadius: 8, padding: 4 }}>
        <ResponsiveContainer width="100%" height={540}>
          <Treemap data={data.children ?? []} dataKey="size" content={<CustomTile />}>
            <Tooltip content={<CustomTooltip />} />
          </Treemap>
        </ResponsiveContainer>
      </div>

      <p style={{ fontSize: '0.7rem', color: '#475569', marginTop: '0.5rem', textAlign: 'center' }}>
        Hover any colored tile for full object file path and exact size
      </p>
    </div>
  )
}
