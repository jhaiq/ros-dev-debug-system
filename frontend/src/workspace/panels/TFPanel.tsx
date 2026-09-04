/**
 * 工作台紧凑面板 — TF 树
 */
import { useState, useCallback } from 'react'
import { useTFSubscription } from '../../hooks/useTFTopics'

interface TFEdge { parent: string; child: string }

export default function TFPanel() {
  const [edges, setEdges] = useState<TFEdge[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const handler = useCallback((msg: any) => {
      if (!msg.transforms) return
      const newEdges: TFEdge[] = msg.transforms.map((t: any) => ({ parent: t.header.frame_id, child: t.child_frame_id }))
      setEdges(prev => {
        const merged = [...prev, ...newEdges]
        const seen = new Set<string>()
        return merged.filter(e => { const k = `${e.parent}/${e.child}`; if (seen.has(k)) return false; seen.add(k); return true })
      })
  }, [])
  useTFSubscription(handler, 500)

  const childrenMap: Record<string, string[]> = {}
  const parents = new Set<string>(), children = new Set<string>()
  edges.forEach(e => {
    ;(childrenMap[e.parent] = childrenMap[e.parent] || []).push(e.child)
    parents.add(e.parent); children.add(e.child)
  })
  const roots = [...parents].filter(p => !children.has(p))

  const Node = ({ frame, depth }: { frame: string; depth: number }) => {
    const kids = childrenMap[frame] || []
    const isExp = expanded.has(frame)
    return (
      <div style={{ marginLeft: depth * 14 }}>
        <div className="flex items-center gap-1 py-0.5 cursor-pointer hover:bg-gray-50 px-1 rounded"
          onClick={() => setExpanded(prev => { const n = new Set(prev); isExp ? n.delete(frame) : n.add(frame); return n })}>
          <span className="text-gray-400 text-xs w-3">{kids.length ? (isExp ? '▾' : '▸') : ''}</span>
          <span className="font-mono text-xs">{frame}</span>
        </div>
        {isExp && kids.map((c, i) => <Node key={i} frame={c} depth={depth + 1} />)}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full text-sm">
      <div className="px-2 pt-2 pb-1 border-b text-xs text-gray-400">{edges.length} 条边</div>
      <div className="flex-1 overflow-y-auto p-1">
        {roots.length ? roots.map((r, i) => <Node key={i} frame={r} depth={0} />) : (
          <div className="text-gray-400 text-xs text-center py-6">等待 TF 数据…</div>
        )}
      </div>
    </div>
  )
}
