import { useState, useEffect, useCallback, useRef } from 'react'
import { useROS } from '../hooks/useROS'
import ROSLIB from 'roslib'

interface GraphNode {
  id: string
  type: 'node' | 'topic'
  x: number
  y: number
  pubs: string[]
  subs: string[]
}

interface GraphEdge {
  from: string
  to: string
}

export default function NodeGraphPage() {
  const { ros, connected } = useROS()
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const svgRef = useRef<SVGSVGElement>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const isDragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })

  const fetchGraph = useCallback(() => {
    if (!ros || !connected) return

    const getNodes = new ROSLIB.Service({ ros, name: '/rosapi/nodes', serviceType: 'rosapi/Nodes' })
    const getTopics = new ROSLIB.Service({ ros, name: '/rosapi/topics', serviceType: 'rosapi/Topics' })
    const getTopicTypes = new ROSLIB.Service({ ros, name: '/rosapi/topic_types', serviceType: 'rosapi/TopicTypes' })

    Promise.all([
      new Promise<string[]>(r => getNodes.callService(new ROSLIB.ServiceRequest({}), (res: any) => r(res.nodes || []))),
      new Promise<string[]>(r => getTopics.callService(new ROSLIB.ServiceRequest({}), (res: any) => r(res.topics || []))),
      new Promise<string[]>(r => getTopicTypes.callService(new ROSLIB.ServiceRequest({}), (res: any) => r(res.types || []))),
    ]).then(([nodeNames, topicNames, topicTypes]) => {
      const graphNodes: GraphNode[] = []
      const graphEdges: GraphEdge[] = []
      const topicMap = new Map<string, string>()
      topicNames.forEach((t, i) => topicMap.set(t, topicTypes[i] || ''))

      // Layout: nodes on left, topics on right
      const nodeSpacing = 80
      const topicSpacing = 60
      const startX = 100
      const topicX = 500

      nodeNames.forEach((name, i) => {
        graphNodes.push({ id: name, type: 'node', x: startX, y: i * nodeSpacing + 50, pubs: [], subs: [] })
      })

      // Get node details to build edges
      let pending = nodeNames.length
      if (pending === 0) { setNodes([]); setEdges([]); return }

      nodeNames.forEach(nodeName => {
        const getDetails = new ROSLIB.Service({ ros, name: '/rosapi/node_details', serviceType: 'rosapi/NodeDetails' })
        getDetails.callService(new ROSLIB.ServiceRequest({ node: nodeName }), (res: any) => {
          const node = graphNodes.find(n => n.id === nodeName)
          if (node) {
            node.pubs = res.publications || []
            node.subs = res.subscriptions || []
            res.publications?.forEach((topic: string) => {
              if (!graphNodes.find(n => n.id === topic)) {
                const idx = topicNames.indexOf(topic)
                graphNodes.push({ id: topic, type: 'topic', x: topicX, y: idx * topicSpacing + 50, pubs: [], subs: [] })
              }
              graphEdges.push({ from: nodeName, to: topic })
            })
            res.subscriptions?.forEach((topic: string) => {
              if (!graphNodes.find(n => n.id === topic)) {
                const idx = topicNames.indexOf(topic)
                graphNodes.push({ id: topic, type: 'topic', x: topicX, y: idx * topicSpacing + 50, pubs: [], subs: [] })
              }
              graphEdges.push({ from: topic, to: nodeName })
            })
          }
          pending--
          if (pending === 0) { setNodes(graphNodes); setEdges(graphEdges) }
        })
      })
    })
  }, [ros, connected])

  useEffect(() => { if (connected) fetchGraph() }, [connected, fetchGraph])

  // Pan handling
  const handleMouseDown = (e: React.MouseEvent) => { isDragging.current = true; dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y } }
  const handleMouseMove = (e: React.MouseEvent) => { if (isDragging.current) setPan({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y }) }
  const handleMouseUp = () => { isDragging.current = false }

  const filteredNodes = nodes.filter(n => !search || n.id.toLowerCase().includes(search.toLowerCase()))
  const visibleIds = new Set(filteredNodes.map(n => n.id))
  const filteredEdges = edges.filter(e => visibleIds.has(e.from) && visibleIds.has(e.to))

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">🔗 节点-话题依赖图</h1>
        <div className="flex gap-2">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索..." className="px-3 py-2 border rounded text-sm" />
          <button onClick={() => setZoom(z => Math.max(0.3, z - 0.1))} className="px-3 py-2 bg-gray-200 rounded text-sm">-</button>
          <span className="px-2 py-2 text-sm">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} className="px-3 py-2 bg-gray-200 rounded text-sm">+</button>
          <button onClick={fetchGraph} className="px-4 py-2 bg-blue-600 text-white rounded text-sm">刷新</button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <svg ref={svgRef} width="100%" height={600} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
          className="cursor-grab active:cursor-grabbing">
          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {filteredEdges.map((edge, i) => {
              const from = filteredNodes.find(n => n.id === edge.from)
              const to = filteredNodes.find(n => n.id === edge.to)
              if (!from || !to) return null
              return <line key={i} x1={from.x + 60} y1={from.y + 15} x2={to.x} y2={to.y + 15} stroke="#94a3b8" strokeWidth={1} markerEnd="url(#arrowhead)" />
            })}
            {filteredNodes.map(node => (
              <g key={node.id} className="cursor-pointer" onClick={() => setSelectedId(node.id)}>
                <rect x={node.x} y={node.y} width={node.type === 'node' ? 120 : 100} height={30} rx={4}
                  fill={selectedId === node.id ? '#3b82f6' : node.type === 'node' ? '#60a5fa' : '#fbbf24'}
                  stroke={selectedId === node.id ? '#1d4ed8' : '#475569'} strokeWidth={1} />
                <text x={node.x + (node.type === 'node' ? 60 : 50)} y={node.y + 19} textAnchor="middle" fontSize={10} fill="white" className="select-none">
                  {node.id.length > 18 ? node.id.slice(0, 16) + '...' : node.id}
                </text>
              </g>
            ))}
            <defs>
              <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
                <polygon points="0 0, 6 2, 0 4" fill="#94a3b8" />
              </marker>
            </defs>
          </g>
        </svg>
      </div>

      {selectedId && (
        <div className="mt-4 bg-white rounded-lg shadow p-4">
          <h3 className="font-semibold">{selectedId}</h3>
          {(() => {
            const node = nodes.find(n => n.id === selectedId)
            if (!node) return null
            return (
              <div className="grid grid-cols-2 gap-4 mt-2 text-sm">
                <div>
                  <div className="font-medium text-green-700">发布:</div>
                  {node.pubs.map(p => <div key={p} className="text-xs text-gray-600">{p}</div>)}
                </div>
                <div>
                  <div className="font-medium text-blue-700">订阅:</div>
                  {node.subs.map(s => <div key={s} className="text-xs text-gray-600">{s}</div>)}
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
