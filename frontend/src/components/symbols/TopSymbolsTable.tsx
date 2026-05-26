import { useMemo, useState } from 'react'
import {
  useReactTable, getCoreRowModel, getSortedRowModel,
  flexRender, type ColumnDef, type SortingState,
} from '@tanstack/react-table'
import type { ELFSymbol } from '../../types/analysis'
import { formatBytes, sizeRatio } from '../../utils/bytes'
import SectionBadge from '../shared/SectionBadge'

interface Props {
  symbols: ELFSymbol[]
  filter: string
}

const MAX_BAR_WIDTH = 120

export default function TopSymbolsTable({ symbols, filter }: Props) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'size', desc: true }])

  const filtered = useMemo(() =>
    filter ? symbols.filter((s) => s.name.toLowerCase().includes(filter.toLowerCase())) : symbols,
    [symbols, filter]
  )

  const maxSize = useMemo(() => Math.max(...filtered.map((s) => s.size), 1), [filtered])

  const columns = useMemo<ColumnDef<ELFSymbol>[]>(() => [
    {
      id: 'rank',
      header: '#',
      cell: ({ row }) => <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>{row.index + 1}</span>,
      size: 40,
      enableSorting: false,
    },
    {
      accessorKey: 'name',
      header: 'Symbol',
      cell: ({ getValue, row }) => (
        <span style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>
          {getValue() as string}
          {row.original.is_duplicate && (
            <span style={{ marginLeft: 6, color: '#f59e0b', fontSize: '0.7rem' }}>(dup)</span>
          )}
        </span>
      ),
    },
    {
      accessorKey: 'section',
      header: 'Section',
      cell: ({ getValue }) => <SectionBadge name={getValue() as string} />,
      size: 110,
    },
    {
      accessorKey: 'object_file',
      header: 'Object File',
      cell: ({ getValue }) => {
        const parts = (getValue() as string).split('/')
        const short = parts.slice(-2).join('/')
        return <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#6b7280' }} title={getValue() as string}>{short}</span>
      },
    },
    {
      accessorKey: 'size',
      header: 'Size',
      cell: ({ getValue }) => {
        const sz = getValue() as number
        const w = sizeRatio(sz, maxSize) * MAX_BAR_WIDTH
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'monospace', fontSize: '0.82rem', minWidth: 60 }}>{formatBytes(sz)}</span>
            <div style={{ width: MAX_BAR_WIDTH, height: 8, background: '#f3f4f6', borderRadius: 4 }}>
              <div style={{ width: w, height: '100%', background: '#3b82f6', borderRadius: 4 }} />
            </div>
          </div>
        )
      },
      size: 220,
    },
  ], [maxSize])

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  if (!symbols.length) return <p style={{ color: '#6b7280' }}>No symbol data.</p>

  return (
    <div style={{ overflowX: 'auto' }}>
      <p style={{ color: '#6b7280', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
        Showing {filtered.length} of {symbols.length} symbols
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} style={{ borderBottom: '2px solid #e5e7eb' }}>
              {hg.headers.map((h) => (
                <th
                  key={h.id}
                  style={{
                    padding: '0.5rem 0.75rem', textAlign: 'left',
                    cursor: h.column.getCanSort() ? 'pointer' : 'default',
                    userSelect: 'none', color: '#374151', fontWeight: 600,
                  }}
                  onClick={h.column.getToggleSortingHandler()}
                >
                  {flexRender(h.column.columnDef.header, h.getContext())}
                  {h.column.getIsSorted() === 'asc' ? ' ↑' : h.column.getIsSorted() === 'desc' ? ' ↓' : ''}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} style={{ borderBottom: '1px solid #f3f4f6' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f9fafb')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '')}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} style={{ padding: '0.45rem 0.75rem' }}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
