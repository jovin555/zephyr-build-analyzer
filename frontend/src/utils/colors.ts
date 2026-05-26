// Vibrant, distinct colors per section type
// Matches both dotted (.text) and Zephyr's undotted names (text, datas, bss)
export const SECTION_COLORS: Record<string, string> = {
  '.text':          '#2563eb', // vivid blue
  'text':           '#2563eb',
  '.rodata':        '#0891b2', // vivid cyan
  'rodata':         '#0891b2',
  '.data':          '#ea580c', // vivid orange
  'datas':          '#ea580c',
  'data':           '#ea580c',
  '.bss':           '#dc2626', // vivid red
  'bss':            '#dc2626',
  '.noinit':        '#9333ea', // vivid purple
  'noinit':         '#9333ea',
  '.heap':          '#65a30d', // vivid lime
  'heap':           '#65a30d',
  '.stack':         '#059669', // vivid emerald
  'stack':          '#059669',
  '.rom_start':     '#4f46e5', // indigo
  'rom_start':      '#4f46e5',
  '.init_array':    '#db2777', // pink
  'initlevel':      '#db2777',
  '.device':        '#d97706', // amber
  'device':         '#d97706',
  '.isr':           '#16a34a', // green
  'sw_isr_table':   '#16a34a',
  '.vectors':       '#0d9488', // teal
  'vectors':        '#0d9488',
  '.tbss':          '#7c3aed', // violet
  'tbss':           '#7c3aed',
  '.ARM':           '#64748b', // slate
  'other':          '#475569', // dark slate
}

export const REGION_COLORS: Record<string, string> = {
  FLASH:    '#1d4ed8',
  RAM:      '#15803d',
  UNKNOWN:  '#64748b',
  IDT_LIST: '#94a3b8',
}

export function getSectionColor(name: string): string {
  // Exact match first
  if (SECTION_COLORS[name]) return SECTION_COLORS[name]
  // Prefix match (handles .text.something, .bss.foo etc.)
  for (const [key, color] of Object.entries(SECTION_COLORS)) {
    if (key === 'other') continue
    if (name.startsWith(key)) return color
  }
  return SECTION_COLORS['other']
}

/** Returns black or white depending on which contrasts better with bg */
export function contrastText(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  // Perceived luminance
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.5 ? '#111827' : '#ffffff'
}
