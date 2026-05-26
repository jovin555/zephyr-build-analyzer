import { useState } from 'react'
import { Treemap, ResponsiveContainer, Tooltip } from 'recharts'
import type { MemoryRegion } from '../../types/analysis'
import { buildTreemapData, type TreemapNode } from '../../utils/treemap'
import { getSectionColor, REGION_COLORS } from '../../utils/colors'
import { formatBytes } from '../../utils/bytes'

function CustomContent(props: {
  x?: number; y?: number; width?: number; height?: number
  name?: string; section?: string; region?: string; value?: number
}) {
  const { x = 0, y = 0, width = 0, height = 0, name = '', section, region } = props
  if (width < 20 || height < 12) return null
  const bg = section ? getSectionColor(section) : (region ? (REGION_COLORS[region] ?? '#9ca3af') : '#9ca3af')
  const label = name.length > 20 ? name.slice(-18) + '…' : name

  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={bg + '88'} stroke={bg} strokeWidth={1} rx={3} />
      {height > 20 && (
        <text x={x + 6} y={y + 14} fill="#111" fontSize={10} fontFamily="monospace">
          {label}
        </text>
      )}
    </g>
  )
}

export default function MemoryTreemap({ regions }: { regions: MemoryRegion[] }) {
  if (!regions.length) return <p style={{ color: '#6b7280' }}>No memory map data.</p>

  const data = buildTreemapData(regions)

  return (
    <div>
      <h3 style={{ marginBottom: '1rem', fontWeight: 600 }}>Memory Layout</h3>
      <ResponsiveContainer width="100%" height={500}>
        <Treemap
          data={data.children ?? []}
          dataKey="size"
          content={<CustomContent />}
        >
          <Tooltip formatter={(v: number) => formatBytes(v)} />
        </Treemap>
      </ResponsiveContainer>
    </div>
  )
}
