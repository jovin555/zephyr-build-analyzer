import { useState, useMemo } from 'react'
import type { KconfigEntry } from '../../types/analysis'

const TYPE_COLORS: Record<string, string> = {
  bool:   '#3b82f6',
  int:    '#22c55e',
  string: '#f59e0b',
  hex:    '#a855f7',
}

interface Props {
  flags: KconfigEntry[]
  filter: string
}

export default function KconfigInspector({ flags, filter }: Props) {
  const filtered = useMemo(() =>
    filter ? flags.filter((f) => f.name.toLowerCase().includes(filter.toLowerCase())) : flags,
    [flags, filter]
  )

  if (!flags.length) return <p style={{ color: '#6b7280' }}>No Kconfig data.</p>

  return (
    <div>
      <p style={{ color: '#6b7280', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
        {filtered.length} of {flags.length} flags
      </p>
      <div style={{ maxHeight: 600, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
        {filtered.map((entry, i) => (
          <div key={entry.name} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0.45rem 1rem',
            background: i % 2 === 0 ? '#fff' : '#f9fafb',
            borderBottom: '1px solid #f3f4f6',
          }}>
            <span style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: '#111' }}>{entry.name}</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: '#374151' }}>{entry.value}</span>
              <span style={{
                background: (TYPE_COLORS[entry.type] ?? '#9ca3af') + '22',
                border: `1px solid ${TYPE_COLORS[entry.type] ?? '#9ca3af'}`,
                color: TYPE_COLORS[entry.type] ?? '#9ca3af',
                borderRadius: 4, padding: '1px 6px', fontSize: '0.7rem', fontWeight: 600,
              }}>
                {entry.type}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
