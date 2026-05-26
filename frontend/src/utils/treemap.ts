import type { MemoryRegion } from '../types/analysis'

export interface TreemapNode {
  name: string
  size?: number
  children?: TreemapNode[]
  region?: string
  section?: string
}

const OTHER_THRESHOLD = 0.005 // 0.5% of total

export function buildTreemapData(regions: MemoryRegion[]): TreemapNode {
  const totalSize = regions.reduce((s, r) => s + r.used, 0)

  return {
    name: 'root',
    children: regions.map((region) => ({
      name: region.name,
      region: region.name,
      children: buildSectionChildren(region, totalSize),
    })),
  }
}

function buildSectionChildren(region: MemoryRegion, totalSize: number): TreemapNode[] {
  const threshold = totalSize * OTHER_THRESHOLD
  const visible = region.sections.filter((s) => s.size >= threshold)
  const hidden = region.sections.filter((s) => s.size < threshold)

  const nodes: TreemapNode[] = visible.map((sec) => ({
    name: sec.name,
    section: sec.name,
    region: region.name,
    children: buildObjectChildren(sec, totalSize),
  }))

  if (hidden.length > 0) {
    nodes.push({
      name: 'other',
      region: region.name,
      size: hidden.reduce((s, sec) => s + sec.size, 0),
    })
  }

  return nodes
}

function buildObjectChildren(section: { name: string; size: number; object_files: { path: string; size: number }[] }, totalSize: number): TreemapNode[] {
  const threshold = totalSize * OTHER_THRESHOLD
  const visible = section.object_files.filter((o) => o.size >= threshold)
  const hidden = section.object_files.filter((o) => o.size < threshold)

  const nodes: TreemapNode[] = visible.map((obj) => ({
    name: obj.path.split('/').slice(-2).join('/'),
    size: obj.size,
    section: section.name,
  }))

  if (hidden.length > 0) {
    nodes.push({
      name: `other (${hidden.length} files)`,
      size: hidden.reduce((s, o) => s + o.size, 0),
      section: section.name,
    })
  }

  return nodes.length > 0 ? nodes : [{ name: section.name, size: section.size }]
}
