import { useState, useEffect, useCallback } from 'react'
import { useROS } from '../hooks/useROS'
import ROSLIB from 'roslib'

interface TFEdge {
  parent: string
  child: string
}

export default function TFPage() {
  const { ros, connected } = useROS()
  const [edges, setEdges] = useState<TFEdge[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  const fetchTF = useCallback(() => {
    if (!ros || !connected) return
    // Subscribe to /tf and /tf_static to build the tree
    const tfTopic = new ROSLIB.Topic({ ros, name: '/tf', messageType: 'tf2_msgs/TFMessage', throttle_rate: 500 })
    const tfStatic = new ROSLIB.Topic({ ros, name: '/tf_static', messageType: 'tf2_msgs/TFMessage', throttle_rate: 500 })

    const handleTF = (msg: any) => {
      if (msg.transforms) {
        const newEdges: TFEdge[] = msg.transforms.map((t: any) => ({
          parent: t.header.frame_id,
          child: t.child_frame_id
        }))
        setEdges(prev => {
          const merged = [...prev, ...newEdges]
          // Deduplicate
          const seen = new Set<string>()
          return merged.filter(e => {
            const key = `${e.parent}/${e.child}`
            if (seen.has(key)) return false
            seen.add(key)
            return true
          })
        })
      }
    }

    tfTopic.subscribe(handleTF)
    tfStatic.subscribe(handleTF)
    return () => { tfTopic.unsubscribe(); tfStatic.unsubscribe() }
  }, [ros, connected])

  useEffect(() => {
    if (connected) {
      const cleanup = fetchTF()
      return cleanup
    }
  }, [connected, fetchTF])

  // Build tree
  const buildTree = () => {
    const childrenMap: Record<string, string[]> = {}
    const allParents = new Set<string>()
    const allChildren = new Set<string>()

    edges.forEach(e => {
      if (!childrenMap[e.parent]) childrenMap[e.parent] = []
      childrenMap[e.parent].push(e.child)
      allParents.add(e.parent)
      allChildren.add(e.child)
    })

    const roots = [...allParents].filter(p => !allChildren.has(p))
    return { roots, childrenMap, frames: [...new Set([...allParents, ...allChildren])] }
  }

  const { roots, childrenMap, frames } = buildTree()

  const TFNodeView = ({ frame, depth = 0 }: { frame: string; depth: number }) => {
    const children = childrenMap[frame] || []
    const isExpanded = expanded.has(frame)
    const hasChildren = children.length > 0

    if (search && !frame.toLowerCase().includes(search.toLowerCase()) &&
        !children.some(c => c.toLowerCase().includes(search.toLowerCase()))) {
      return null
    }

    return (
      <div style={{ marginLeft: depth * 20 }}>
        <div className="flex items-center gap-2 py-1 px-2 rounded hover:bg-gray-50 cursor-pointer"
          onClick={() => hasChildren && setExpanded(prev => {
            const next = new Set(prev)
            isExpanded ? next.delete(frame) : next.add(frame)
            return next
          })}>
          {hasChildren ? (
            <span className="text-gray-500 w-4">{isExpanded ? '▾' : '▸'}</span>
          ) : <span className="w-4" />}
          <span className="font-mono text-sm">{frame}</span>
        </div>
        {hasChildren && isExpanded && children.map((child, i) => (
          <TFNodeView key={i} frame={child} depth={depth + 1} />
        ))}
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">🌳 TF 树</h1>
        <span className="text-sm text-gray-500">{frames.length} frames</span>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="搜索 frame..." className="w-full px-3 py-2 border rounded mb-4" />

      {frames.length === 0 ? (
        <div className="text-center py-12 text-gray-400">暂无 TF 数据</div>
      ) : (
        <div className="bg-white rounded-lg shadow p-4 max-h-[70vh] overflow-y-auto">
          {roots.map((root, i) => <TFNodeView key={i} frame={root} depth={0} />)}
        </div>
      )}

      <div className="mt-4 bg-blue-50 rounded p-4 text-sm text-gray-700">
        <p><strong>TF (Transform)</strong> 管理坐标系变换。常见坐标系：</p>
        <ul className="list-disc list-inside mt-1">
          <li><strong>world/map</strong> - 世界/地图（固定）</li>
          <li><strong>odom</strong> - 里程计（连续但漂移）</li>
          <li><strong>base_link</strong> - 机器人基座</li>
          <li><strong>laser/camera</strong> - 传感器</li>
        </ul>
      </div>
    </div>
  )
}
