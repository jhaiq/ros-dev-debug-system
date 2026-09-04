/**
 * TFGraphView — rqt_tf_tree 风格的图形化 TF 树
 * 整洁树布局（父节点在左、子节点挂在右侧、按叶子槽位垂直居中，永不重叠），
 * 贝塞尔连线箭头，拖拽平移 + 缩放 + 一键适配，点击节点联动详情面板。
 */
import { useMemo, useState, useEffect, useCallback, useRef, type RefObject } from 'react'

interface Props {
  roots: string[]
  childrenMap: Record<string, string[]>
  selectedFrame: string | null
  onSelect: (frame: string) => void
  svgRef: RefObject<SVGSVGElement>
}

const NODE_W = 150
const NODE_H = 34
const GAP_X = 70
const GAP_Y = 12
const MARGIN = 24

interface Pos { x: number; y: number }

export default function TFGraphView({ roots, childrenMap, selectedFrame, onSelect, svgRef }: Props) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<Pos>({ x: 0, y: 0 })
  const dragging = useRef<{ x: number; y: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // 整洁树布局：叶子按序分配垂直槽位，父节点居中于子节点
  const layout = useMemo(() => {
    const pos = new Map<string, Pos>()
    let leafCursor = 0
    let maxDepth = 0
    const seen = new Set<string>()
    const walk = (frame: string, depth: number): number => {
      if (seen.has(frame)) return pos.get(frame)?.y ?? leafCursor * (NODE_H + GAP_Y) + MARGIN
      seen.add(frame)
      maxDepth = Math.max(maxDepth, depth)
      const x = depth * (NODE_W + GAP_X) + MARGIN
      const children = childrenMap[frame] || []
      let y: number
      if (children.length === 0) {
        y = leafCursor * (NODE_H + GAP_Y) + MARGIN
        leafCursor++
      } else {
        const ys = children.map(c => walk(c, depth + 1))
        y = (Math.min(...ys) + Math.max(...ys)) / 2
      }
      pos.set(frame, { x, y })
      return y
    }
    roots.forEach(r => walk(r, 0))
    const width = (maxDepth + 1) * (NODE_W + GAP_X) + MARGIN * 2
    const height = Math.max(leafCursor, 1) * (NODE_H + GAP_Y) + MARGIN * 2
    return { pos, width, height }
  }, [roots, childrenMap])

  const edges = useMemo(() => {
    const out: { parent: string; child: string; path: string }[] = []
    Object.entries(childrenMap).forEach(([parent, children]) => {
      const from = layout.pos.get(parent)
      if (!from) return
      children.forEach(child => {
        const to = layout.pos.get(child)
        if (!to) return
        const x1 = from.x + NODE_W, y1 = from.y + NODE_H / 2
        const x2 = to.x, y2 = to.y + NODE_H / 2
        const mid = (x1 + x2) / 2
        out.push({ parent, child, path: `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}` })
      })
    })
    return out
  }, [childrenMap, layout])

  // 布局变化时自动适配视图
  const fit = useCallback(() => {
    const vw = containerRef.current?.clientWidth ?? 1000
    const vh = containerRef.current?.clientHeight ?? 500
    const scale = Math.min(vw / layout.width, vh / layout.height, 1.25)
    setZoom(Math.max(scale, 0.2))
    setPan({ x: 0, y: 0 })
  }, [layout])

  useEffect(() => { fit() }, [fit])

  const onMouseDown = (e: React.MouseEvent) => { dragging.current = { x: e.clientX - pan.x, y: e.clientY - pan.y } }
  const onMouseMove = (e: React.MouseEvent) => { if (dragging.current) setPan({ x: e.clientX - dragging.current.x, y: e.clientY - dragging.current.y }) }
  const onMouseUp = () => { dragging.current = null }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2 text-sm">
        <button onClick={() => setZoom(z => Math.max(0.2, +(z - 0.1).toFixed(2)))} className="px-2 py-1 bg-gray-100 rounded hover:bg-gray-200">−</button>
        <span className="text-gray-500 w-12 text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.min(2, +(z + 0.1).toFixed(2)))} className="px-2 py-1 bg-gray-100 rounded hover:bg-gray-200">＋</button>
        <button onClick={fit} className="px-2 py-1 bg-gray-100 rounded hover:bg-gray-200">适配视图</button>
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }} className="px-2 py-1 bg-gray-100 rounded hover:bg-gray-200">1:1</button>
        <span className="text-xs text-gray-400">拖拽平移 · 点击节点查看变换详情</span>
      </div>
      <div ref={containerRef} className="bg-gray-50 rounded border overflow-hidden" style={{ height: 520 }}>
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          className="cursor-grab active:cursor-grabbing select-none"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          preserveAspectRatio="xMinYMin meet"
        >
          <defs>
            <marker id="tfarrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#64748b" />
            </marker>
          </defs>
          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {edges.map((e, i) => (
              <path key={i} d={e.path} fill="none" stroke="#64748b" strokeWidth={1.6} markerEnd="url(#tfarrow)" />
            ))}
            {Array.from(layout.pos.entries()).map(([frame, p]) => {
              const selected = selectedFrame === frame
              const isRoot = roots.includes(frame)
              return (
                <g key={frame} className="cursor-pointer" onClick={e => { e.stopPropagation(); onSelect(frame) }}>
                  <rect
                    x={p.x} y={p.y} width={NODE_W} height={NODE_H} rx={8}
                    fill={selected ? '#2563eb' : isRoot ? '#38bdf8' : '#60a5fa'}
                    stroke={selected ? '#1e40af' : '#1d4ed8'}
                    strokeWidth={selected ? 2.5 : 1}
                  />
                  <text x={p.x + NODE_W / 2} y={p.y + NODE_H / 2 + 4} textAnchor="middle" fontSize={13} fill="white" fontFamily="monospace">
                    {frame.length > 20 ? frame.slice(0, 18) + '…' : frame}
                  </text>
                </g>
              )
            })}
          </g>
        </svg>
      </div>
    </div>
  )
}
