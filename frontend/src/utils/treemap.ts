import type { MemoryRegion } from '../types/analysis'
import { getSectionColor } from './colors'

export interface TreemapNode {
  name: string
  fullPath?: string
  size?: number
  children?: TreemapNode[]
  region?: string
  section?: string
  color?: string   // pre-computed so Recharts content renderer can use it directly
}

// Only collapse into "Other" if a file is less than 0.05% of total — much less aggressive
const OTHER_THRESHOLD = 0.0005

/** Extract a human-readable label from a linker path or archive member.
 *  Examples:
 *   "zephyr/kernel/libzephyr.a(thread.c.obj)"  → "thread.c"
 *   "CMakeFiles/app.dir/src/main.c.obj"        → "main.c"
 *   "lib/libc/minimal/source/stdlib/strtol.c.obj" → "stdlib/strtol.c"
 */
function extractLabel(path: string): string {
  // Archive member: take content between last ( and )
  const archiveMatch = path.match(/\(([^)]+)\)$/)
  if (archiveMatch) {
    return archiveMatch[1].replace(/\.obj$/, '')
  }
  // Plain object file: last two path segments, strip .obj
  return path.split('/').slice(-2).join('/').replace(/\.obj$/, '')
}

export function buildTreemapData(regions: MemoryRegion[]): TreemapNode {
  const totalSize = regions.reduce((s, r) => s + r.used, 0)

  return {
    name: 'root',
    children: regions.map((region) => ({
      name: region.name,
      region: region.name,
      color: undefined,
      children: buildSectionChildren(region, totalSize),
    })),
  }
}

function buildSectionChildren(region: MemoryRegion, totalSize: number): TreemapNode[] {
  const threshold = totalSize * OTHER_THRESHOLD
  const sorted = [...region.sections].sort((a, b) => b.size - a.size)

  const nodes: TreemapNode[] = sorted.map((sec) => ({
    name: sec.name,
    section: sec.name,
    region: region.name,
    color: getSectionColor(sec.name),
    children: buildObjectChildren(sec, totalSize),
  }))

  return nodes
}

function buildObjectChildren(
  section: { name: string; size: number; object_files: { path: string; size: number }[] },
  totalSize: number,
): TreemapNode[] {
  const threshold = totalSize * OTHER_THRESHOLD
  const sorted = [...section.object_files].sort((a, b) => b.size - a.size)

  const visible = sorted.filter((o) => o.size >= threshold)
  const hidden = sorted.filter((o) => o.size < threshold)
  const color = getSectionColor(section.name)

  const nodes: TreemapNode[] = visible.map((obj) => ({
    name: extractLabel(obj.path),
    fullPath: obj.path,
    size: obj.size,
    section: section.name,
    color,
  }))

  if (hidden.length > 0) {
    nodes.push({
      name: `+${hidden.length} smaller files`,
      fullPath: `${hidden.length} files grouped`,
      size: hidden.reduce((s, o) => s + o.size, 0),
      section: section.name,
      color: color + 'aa',
    })
  }

  return nodes.length > 0 ? nodes : [{ name: section.name, size: section.size, color, section: section.name }]
}
