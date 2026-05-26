// Fixed palette — Flash=blue family, RAM=green family (DeepSeek recommendation)
export const SECTION_COLORS: Record<string, string> = {
  '.text':        '#3b82f6', // blue-500
  '.rodata':      '#06b6d4', // cyan-500
  '.data':        '#f59e0b', // amber-500
  '.bss':         '#ef4444', // red-500
  '.noinit':      '#a855f7', // purple-500
  '.heap':        '#84cc16', // lime-500
  '.stack':       '#22c55e', // green-500
  '.ARM.exidx':   '#64748b', // slate-500
  'other':        '#9ca3af', // gray-400
}

export const REGION_COLORS: Record<string, string> = {
  FLASH:   '#3b82f6',
  RAM:     '#22c55e',
  UNKNOWN: '#9ca3af',
}

export function getSectionColor(name: string): string {
  for (const [key, color] of Object.entries(SECTION_COLORS)) {
    if (name.startsWith(key)) return color
  }
  return SECTION_COLORS['other']
}
