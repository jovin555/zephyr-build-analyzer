import { getSectionColor } from '../../utils/colors'

export default function SectionBadge({ name }: { name: string }) {
  const bg = getSectionColor(name)
  return (
    <span style={{
      background: bg + '22', border: `1px solid ${bg}`,
      color: bg, borderRadius: 4, padding: '1px 6px',
      fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 600,
    }}>
      {name}
    </span>
  )
}
