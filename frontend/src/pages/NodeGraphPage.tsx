/**
 * rqt_graph 复刻增强 — 节点-话题依赖图
 * 支持：Dead sinks / Leaf topics / Debug topics 隐藏、话题名正则过滤、
 *       邻居高亮、刷新间隔、导出 PNG / dot。
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useROS } from '../hooks/useROS'
import ROSLIB from 'roslib'
import { rosapi } from '../lib/rosapi'

interface GraphNode {
  id: string
  type: 'node' | 'topic' | 'group'
  x: number
  y: number
  pubs: string[]
  subs: string[]
}

interface GraphEdge { from: string; to: string }

export default function NodeGraphPage() {
  const { ros, connected } = useROS()
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [hideDeadSinks, setHideDeadSinks] = useState(true)
  const [hideLeafTopics, setHideLeafTopics] = useState(false)
  const [hideDebug, setHideDebug] = useState(false)
  const [topicRegex, setTopicRegex] = useState('')
  const [groupByNamespace, setGroupByNamespace] = useState(false)
  const [collapsedNs, setCollapsedNs] = useState<Set<string>>(new Set())
  const [intervalSec, setIntervalSec] = useState(0)
  const svgRef = useRef<SVGSVGElement>(null)
  const isDragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })

  const fetchGraph = useCallback(() => {
    if (!ros || !connected) return
    const getNodes = new ROSLIB.Service({ ros, name: '/rosapi/nodes', serviceType: 'rosapi/Nodes' })

    getNodes.callService(new ROSLIB.ServiceRequest({}), async (res: any) => {
      const nodeNames: string[] = res.nodes || []
      // 兼容新旧 rosapi 的话题类型接口
      const topicNames = (await rosapi.topicTypes(ros).catch(() => [] as { name: string; type: string }[]))
        .map(t => t.name)
      const graphNodes: GraphNode[] = nodeNames.map((name, i) => ({
        id: name, type: 'node', x: 100, y: i * 70 + 40, pubs: [], subs: [],
      }))
      const graphEdges: GraphEdge[] = []
      let pending = nodeNames.length
      if (pending === 0) { setNodes(graphNodes); setEdges([]); return }

      nodeNames.forEach(nodeName => {
        const getDetails = new ROSLIB.Service({ ros, name: '/rosapi/node_details', serviceType: 'rosapi/NodeDetails' })
        getDetails.callService(new ROSLIB.ServiceRequest({ node: nodeName }), (res: any) => {
          const pubs: string[] = res.publications || []
          const subs: string[] = res.subscriptions || []
          const node = graphNodes.find(n => n.id === nodeName)
          if (node) { node.pubs = pubs; node.subs = subs }
          pubs.forEach((topic: string) => {
            if (!graphNodes.find(n => n.id === topic)) {
              const idx = topicNames.indexOf(topic)
              graphNodes.push({ id: topic, type: 'topic', x: 500, y: idx * 50 + 40, pubs: [], subs: [] })
            }
            graphEdges.push({ from: nodeName, to: topic })
          })
          subs.forEach((topic: string) => {
            if (!graphNodes.find(n => n.id === topic)) {
              const idx = topicNames.indexOf(topic)
              graphNodes.push({ id: topic, type: 'topic', x: 500, y: idx * 50 + 40, pubs: [], subs: [] })
            }
            graphEdges.push({ from: topic, to: nodeName })
          })
          pending--
          if (pending === 0) {
            // 拓扑排序竖向布局：按入度/出度平衡
            graphNodes.forEach((n, i) => {
              if (n.type === 'node') n.y = (i + 1) * 60
              else {
                const incoming = graphEdges.filter(e => e.to === n.id).length
                const outgoing = graphEdges.filter(e => e.from === n.id).length
                const idx = graphNodes.filter(g => g.type === 'topic').indexOf(n)
                n.y = (idx + 1) * 55
                n.x = incoming >= outgoing ? 520 : 480
              }
            })
            setNodes(graphNodes); setEdges(graphEdges)
          }
        })
      })
    })
  }, [ros, connected])

  useEffect(() => { if (connected) fetchGraph() }, [connected, fetchGraph])
  useEffect(() => {
    if (intervalSec <= 0) return
    const timer = setInterval(fetchGraph, intervalSec * 1000)
    return () => clearInterval(timer)
  }, [intervalSec, fetchGraph])

  const { visibleNodes, visibleEdges } = useMemo(() => {
    let topicIds = nodes.filter(n => n.type === 'topic').map(n => n.id)
    const incoming = new Map<string, number>(), outgoing = new Map<string, number>()
    edges.forEach(e => { incoming.set(e.to, (incoming.get(e.to) || 0) + 1); outgoing.set(e.from, (outgoing.get(e.from) || 0) + 1) })

    if (hideDeadSinks) topicIds = topicIds.filter(id => (outgoing.get(id) || 0) > 0)
    if (hideLeafTopics) topicIds = topicIds.filter(id => (incoming.get(id) || 0) > 0 && (outgoing.get(id) || 0) > 0)
    if (hideDebug) topicIds = topicIds.filter(id => !(/\/(rosout|parameter_events|clock|rosout_agg)$/.test(id) || id.startsWith('/rosapi/')))

    if (topicRegex.trim()) {
      try {
        const re = new RegExp(topicRegex.trim())
        topicIds = topicIds.filter(id => re.test(id))
      } catch { /* ignore invalid regex */ }
    }

    const topicSet = new Set(topicIds)
    const searchLow = search.toLowerCase()
    const matchesSearch = (id: string) => !searchLow || id.toLowerCase().includes(searchLow)

    // 保留与搜索匹配的节点和话题
    const matchedNodeIds = nodes.filter(n => n.type === 'node' && matchesSearch(n.id)).map(n => n.id)
    const matchedTopicIds = topicIds.filter(matchesSearch)
    const visibleIds = new Set([...matchedNodeIds, ...matchedTopicIds])

    // 如果只按名称搜索，则同时保留与匹配节点直接相连的话题/节点（邻居），与 rqt_graph 行为一致
    if (searchLow) {
      edges.forEach(e => {
        const fromIsTopic = nodes.find(n => n.id === e.from)?.type === 'topic'
        const topicId = fromIsTopic ? e.from : e.to
        const nodeId = fromIsTopic ? e.to : e.from
        if (topicSet.has(topicId) && visibleIds.has(nodeId)) {
          visibleIds.add(topicId); visibleIds.add(nodeId)
        }
      })
    }

    // 在没有搜索时，保留所有与可见话题相连的节点
    if (!searchLow) {
      nodes.filter(n => n.type === 'node' && (n.pubs.some(t => topicSet.has(t)) || n.subs.some(t => topicSet.has(t))))
        .forEach(n => visibleIds.add(n.id))
    }

    const vNodes = nodes.filter(n => visibleIds.has(n.id))
    const vEdges = edges.filter(e => {
      if (!visibleIds.has(e.from) || !visibleIds.has(e.to)) return false
      const fromIsTopic = nodes.find(n => n.id === e.from)?.type === 'topic'
      const topicId = fromIsTopic ? e.from : e.to
      return topicSet.has(topicId)
    })

    // 按命名空间分组折叠（rqt_graph "Group by namespace"）
    let outNodes = vNodes, outEdges = vEdges
    if (groupByNamespace) {
      const nsOf = (id: string) => {
        const parts = id.split('/').filter(Boolean)
        return parts.length > 1 ? '/' + parts.slice(0, -1).join('/') : '/'
      }
      const groups = new Map<string, GraphNode[]>()
      vNodes.forEach(n => {
        const ns = nsOf(n.id)
        if (!groups.has(ns)) groups.set(ns, [])
        groups.get(ns)!.push(n)
      })
      const rep = new Map<string, string>()
      const groupNodes: GraphNode[] = []
      groups.forEach((members, ns) => {
        if (members.length > 1 && collapsedNs.has(ns)) {
          const gid = `group:${ns}`
          members.forEach(m => rep.set(m.id, gid))
          groupNodes.push({
            id: gid, type: 'group',
            x: members.reduce((a, m) => a + m.x, 0) / members.length,
            y: members.reduce((a, m) => a + m.y, 0) / members.length,
            pubs: [], subs: [],
          })
        }
      })
      if (groupNodes.length) {
        const memberIds = new Set(rep.keys())
        outNodes = [...vNodes.filter(n => !memberIds.has(n.id)), ...groupNodes]
        const edgeMap = new Map<string, GraphEdge>()
        vEdges.forEach(e => {
          const f = rep.get(e.from) || e.from
          const t = rep.get(e.to) || e.to
          if (f !== t) edgeMap.set(`${f}->${t}`, { from: f, to: t })
        })
        outEdges = Array.from(edgeMap.values())
      }
    }
    return { visibleNodes: outNodes, visibleEdges: outEdges }
  }, [nodes, edges, hideDeadSinks, hideLeafTopics, hideDebug, topicRegex, search, groupByNamespace, collapsedNs])

  const handleMouseDown = (e: React.MouseEvent) => { isDragging.current = true; dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y } }
  const handleMouseMove = (e: React.MouseEvent) => { if (isDragging.current) setPan({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y }) }
  const handleMouseUp = () => { isDragging.current = false }

  const neighborIds = new Set<string>()
  if (selectedId) {
    visibleEdges.forEach(e => { if (e.from === selectedId) neighborIds.add(e.to); if (e.to === selectedId) neighborIds.add(e.from) })
  }

  const exportDot = () => {
    let dot = 'digraph rqt_graph {\n'
    visibleNodes.forEach(n => { dot += `  "${n.id}" [label="${n.id}" ${n.type === 'topic' ? 'shape=box style=filled fillcolor="#fbbf24"' : 'shape=ellipse style=filled fillcolor="#60a5fa"'}];\n` })
    visibleEdges.forEach(e => { dot += `  "${e.from}" -> "${e.to}";\n` })
    dot += '}'
    download(dot, `rqt_graph-${iso()}.dot`, 'text/plain')
  }

  const exportPng = () => {
    const svg = svgRef.current
    if (!svg) return
    const serializer = new XMLSerializer()
    const source = serializer.serializeToString(svg)
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = svg.clientWidth
      canvas.height = svg.clientHeight
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      const png = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = png; a.download = `rqt_graph-${iso()}.png`; a.click()
    }
    img.src = url
  }

  return (
    <div className="p-6">
      <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-3 mb-4">
        <h1 className="text-2xl font-bold">🔗 节点-话题依赖图</h1>
        <div className="flex gap-2 flex-wrap items-center">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索节点/话题" className="px-3 py-2 border rounded text-sm" />
          <input value={topicRegex} onChange={e => setTopicRegex(e.target.value)} placeholder="话题正则" className="px-3 py-2 border rounded text-sm font-mono w-40" />
          <select value={intervalSec} onChange={e => setIntervalSec(Number(e.target.value))} className="border rounded px-2 py-2 text-sm">
            <option value={0}>手动刷新</option>
            <option value={1}>1s 刷新</option>
            <option value={5}>5s 刷新</option>
          </select>
          <button onClick={() => setZoom(z => Math.max(0.3, z - 0.1))} className="px-3 py-2 bg-gray-200 rounded text-sm">-</button>
          <span className="px-2 py-2 text-sm">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} className="px-3 py-2 bg-gray-200 rounded text-sm">+</button>
          <button onClick={fetchGraph} className="px-4 py-2 bg-blue-600 text-white rounded text-sm">刷新</button>
          <button onClick={exportDot} className="px-3 py-2 bg-gray-100 rounded text-sm">导出 dot</button>
          <button onClick={exportPng} className="px-3 py-2 bg-gray-100 rounded text-sm">导出 PNG</button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-3 mb-4 flex gap-4 flex-wrap text-sm">
        <label className="flex items-center gap-1"><input type="checkbox" checked={hideDeadSinks} onChange={e => setHideDeadSinks(e.target.checked)} />隐藏无订阅 topic（dead sinks）</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={hideLeafTopics} onChange={e => setHideLeafTopics(e.target.checked)} />隐藏无发布/订阅的 leaf topics</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={hideDebug} onChange={e => setHideDebug(e.target.checked)} />隐藏调试 topic</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={groupByNamespace} onChange={e => setGroupByNamespace(e.target.checked)} />按命名空间分组（点击组可折叠/展开）</label>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <svg ref={svgRef} width="100%" height={600} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
          className="cursor-grab active:cursor-grabbing">
          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {visibleEdges.map((edge, i) => {
              const from = visibleNodes.find(n => n.id === edge.from)
              const to = visibleNodes.find(n => n.id === edge.to)
              if (!from || !to) return null
              const highlighted = selectedId && (edge.from === selectedId || edge.to === selectedId)
              return <line key={i} x1={from.x + 60} y1={from.y + 15} x2={to.x} y2={to.y + 15}
                stroke={highlighted ? '#2563eb' : '#94a3b8'} strokeWidth={highlighted ? 2.5 : 1} markerEnd="url(#arrowhead)" />
            })}
            {visibleNodes.map(node => {
              const isSelected = selectedId === node.id
              const isNeighbor = neighborIds.has(node.id)
              const opacity = selectedId ? (isSelected || isNeighbor ? 1 : 0.35) : 1
              const isGroup = node.type === 'group'
              return (
                <g key={node.id} style={{ opacity }} className="cursor-pointer"
                  onClick={() => {
                    if (isGroup) {
                      const ns = node.id.slice('group:'.length)
                      setCollapsedNs(prev => { const n = new Set(prev); n.delete(ns); return n })
                    } else {
                      setSelectedId(node.id)
                    }
                  }}>
                  <rect x={node.x} y={node.y} width={node.type === 'node' ? 120 : isGroup ? 140 : 100} height={30} rx={4}
                    fill={isSelected ? '#3b82f6' : isGroup ? '#a78bfa' : node.type === 'node' ? '#60a5fa' : '#fbbf24'}
                    stroke={isSelected || isNeighbor ? '#1d4ed8' : '#475569'} strokeWidth={isNeighbor ? 2 : 1} />
                  <text x={node.x + (node.type === 'topic' ? 50 : isGroup ? 70 : 60)} y={node.y + 19} textAnchor="middle" fontSize={10} fill="white" className="select-none">
                    {(isGroup ? node.id.slice(6) + ' ▸' : node.id).length > 18
                      ? (isGroup ? node.id.slice(6, 20) + '…' : node.id.slice(0, 16) + '...')
                      : (isGroup ? node.id.slice(6) + ' ▸' : node.id)}
                  </text>
                </g>
              )
            })}
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
          <div className="flex justify-between items-center">
            <h3 className="font-semibold">{selectedId}</h3>
            <button onClick={() => setSelectedId(null)} className="text-xs text-gray-500 hover:text-gray-700">清除选择</button>
          </div>
          {(() => {
            const node = nodes.find(n => n.id === selectedId)
            if (!node) return null
            return (
              <div className="grid grid-cols-2 gap-4 mt-2 text-sm">
                <div>
                  <div className="font-medium text-green-700">发布:</div>
                  {node.pubs.map(p => <div key={p} className="text-xs text-gray-600 font-mono">{p}</div>)}
                </div>
                <div>
                  <div className="font-medium text-blue-700">订阅:</div>
                  {node.subs.map(s => <div key={s} className="text-xs text-gray-600 font-mono">{s}</div>)}
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}

function download(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url)
}
function iso() { return new Date().toISOString().slice(0, 19) }
