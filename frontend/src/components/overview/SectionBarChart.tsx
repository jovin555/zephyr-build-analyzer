import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer,
} from 'recharts'
import type { SectionSummary } from '../../types/analysis'
import { formatBytes } from '../../utils/bytes'
import { getSectionColor } from '../../utils/colors'

interface Props {
  sections: SectionSummary[]
}

const DEBUG_PREFIXES = ['.debug', '.comment', '.last_section', '.stab', '.gnu.warning']

export default function SectionBarChart({ sections }: Props) {
  if (!sections.length) return <p style={{ color: '#6b7280' }}>No section data.</p>

  const data = [...sections]
    .filter((s) => !DEBUG_PREFIXES.some((p) => s.name.startsWith(p)))
    .sort((a, b) => b.size - a.size)
    .map((s) => ({ name: s.name, size: s.size, region: s.region }))

  return (
    <div>
      <h3 style={{ marginBottom: '1rem', fontWeight: 600 }}>Section Sizes</h3>
      <ResponsiveContainer width="100%" height={Math.max(data.length * 36, 180)}>
        <BarChart data={data} layout="vertical" margin={{ left: 90, right: 60 }}>
          <XAxis type="number" tickFormatter={formatBytes} tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fontFamily: 'monospace' }} width={85} />
          <Tooltip formatter={(v: number) => formatBytes(v)} />
          <Bar dataKey="size" radius={[0, 4, 4, 0]}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={getSectionColor(entry.name)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
