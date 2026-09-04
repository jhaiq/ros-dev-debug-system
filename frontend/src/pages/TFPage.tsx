/**
 * rqt_tf_tree 复刻增强 — TF 树
 * 支持：树形视图、图形视图、frames.yaml 文本视图、刷新间隔、导出 PNG / 文本。
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useROS } from '../hooks/useROS'
import { useTFSubscription, useTfPrefix, setTfPrefix } from '../hooks/useTFTopics'

interface TFEdge { parent: string; child: string }
interface TFTransform {
  parent: string
  child: string
  translation: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number; w: number }
  stamp: number
}

export default function TFPage() {
  const { connected } = useROS()
  const [edges, setEdges] = useState<TFEdge[]>([])
  const [transforms, setTransforms] = useState<Map<string, TFTransform>>(new Map())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'tree' | 'graph' | 'yaml'>('tree')
  const [intervalSec, setIntervalSec] = useState(1)
  const [selectedFrame, setSelectedFrame] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  // 订阅 TF（useTFSubscription 自动兼容 /tf 与命名空间 /robot1/tf）
  const handleTF = useCallback((msg: any) => {
    if (!msg.transforms) return
      const newEdges: TFEdge[] = []
      msg.transforms.forEach((t: any) => {
        const parent = t.header.frame_id
        const child = t.child_frame_id
        const key = `${parent}/${child}`
        newEdges.push({ parent, child })
        const tr: TFTransform = {
          parent, child,
          translation: t.transform?.translation || { x: 0, y: 0, z: 0 },
          rotation: t.transform?.rotation || { x: 0, y: 0, z: 0, w: 1 },
          stamp: (t.header.stamp?.sec || 0) + (t.header.stamp?.nanosec || 0) / 1e9,
        }
        setTransforms(prev => { const n = new Map(prev); n.set(key, tr); return n })
      })
      setEdges(prev => {
        const merged = [...prev, ...newEdges]
        const seen = new Set<string>()
        return merged.filter(e => { const key = `${e.parent}/${e.child}`; if (seen.has(key)) return false; seen.add(key); return true })
      })
  }, [])
  useTFSubscription(handleTF, 500)

  const prefix = useTfPrefix()
  const [prefixInput, setPrefixInput] = useState(prefix)
  const resetTF = useCallback(() => {
    setEdges([]); setTransforms(new Map())
  }, [])

  // 自动刷新：清空后由常驻订阅重新累积
  useEffect(() => {
    if (!connected || intervalSec <= 0) return
    const timer = setInterval(resetTF, intervalSec * 1000)
    return () => clearInterval(timer)
  }, [connected, intervalSec, resetTF])

  const buildTree = useCallback(() => {
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
    const frames = [...new Set([...allParents, ...allChildren])]
    return { roots, childrenMap, frames }
  }, [edges])

  const { roots, childrenMap, frames } = buildTree()

  const graphPositions = useCallback(() => {
    const levelMap = new Map<string, number>()
    const setLevel = (frame: string, lvl: number) => {
      if ((levelMap.get(frame) || 0) >= lvl) return
      levelMap.set(frame, lvl)
      ;(childrenMap[frame] || []).forEach(c => setLevel(c, lvl + 1))
    }
    roots.forEach(r => setLevel(r, 0))
    const byLevel: Record<number, string[]> = {}
    levelMap.forEach((lvl, f) => { byLevel[lvl] = byLevel[lvl] || []; byLevel[lvl].push(f) })
    const pos = new Map<string, { x: number; y: number }>()
    Object.entries(byLevel).forEach(([lvl, list]) => {
      const count = list.length
      const width = 600
      list.forEach((f, i) => pos.set(f, { x: (i + 1) * width / (count + 1), y: Number(lvl) * 70 + 40 }))
    })
    return pos
  }, [childrenMap, roots])

  const TFNodeView = ({ frame, depth = 0 }: { frame: string; depth: number }) => {
    const children = childrenMap[frame] || []
    const isExpanded = expanded.has(frame)
    const hasChildren = children.length > 0
    const low = search.toLowerCase()
    if (low && !frame.toLowerCase().includes(low) && !children.some(c => c.toLowerCase().includes(low))) return null
    return (
      <div style={{ marginLeft: depth * 20 }}>
        <div className={`flex items-center gap-2 py-1 px-2 rounded hover:bg-gray-50 cursor-pointer ${selectedFrame === frame ? 'bg-blue-50' : ''}`}
          onClick={() => { setSelectedFrame(frame); if (hasChildren) setExpanded(prev => { const next = new Set(prev); isExpanded ? next.delete(frame) : next.add(frame); return next }) }}>
          {hasChildren ? <span className="text-gray-500 w-4">{isExpanded ? '▾' : '▸'}</span> : <span className="w-4" />}
          <span className="font-mono text-sm">{frame}</span>
        </div>
        {hasChildren && isExpanded && children.map((child, i) => <TFNodeView key={i} frame={child} depth={depth + 1} />)}
      </div>
    )
  }

  const exportYaml = () => {
    let out = '---\n'
    frames.forEach(f => {
      out += `${f}:\n`
      const children = childrenMap[f] || []
      children.forEach(c => {
        const key = `${f}/${c}`
        const tr = transforms.get(key)
        if (tr) {
          out += `  ${c}:\n`
          out += `    translation: { x: ${tr.translation.x}, y: ${tr.translation.y}, z: ${tr.translation.z} }\n`
          out += `    rotation: { x: ${tr.rotation.x}, y: ${tr.rotation.y}, z: ${tr.rotation.z}, w: ${tr.rotation.w} }\n`
        }
      })
    })
    download(out, `tf-frames-${iso()}.yaml`, 'text/plain')
  }

  const exportPng = () => {
    if (view !== 'graph') { setView('graph'); setTimeout(exportPng, 100); return }
    const svg = svgRef.current
    if (!svg) return
    const serializer = new XMLSerializer()
    const source = serializer.serializeToString(svg)
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = svg.clientWidth; canvas.height = svg.clientHeight
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      const png = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = png; a.download = `tf-tree-${iso()}.png`; a.click()
    }
    img.src = url
  }

  const pos = graphPositions()
  const graphEdges = edges.map(e => ({ from: pos.get(e.parent), to: pos.get(e.child), parent: e.parent, child: e.child })).filter(e => e.from && e.to)

  const selectedTransform = selectedFrame ? transforms.get([...transforms.entries()].find(([, tr]) => tr.child === selectedFrame)?.[0] || '') : null

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">🌳 TF 树</h1>
        <div className="flex gap-2 flex-wrap items-center">
          <input value={prefixInput} onChange={e => setPrefixInput(e.target.value)}
            placeholder="TF 前缀，如 /robot1" className="border rounded px-2 py-1 text-sm font-mono w-44" />
          <button onClick={() => setTfPrefix(prefixInput)}
            className="px-2 py-1 bg-gray-100 rounded text-sm hover:bg-gray-200">应用前缀</button>
          <select value={intervalSec} onChange={e => setIntervalSec(Number(e.target.value))} className="border rounded px-2 py-1 text-sm">
            <option value={0}>手动刷新</option>
            <option value={1}>1s 刷新</option>
            <option value={5}>5s 刷新</option>
            <option value={10}>10s 刷新</option>
          </select>
          <div className="flex border rounded overflow-hidden">
            <button onClick={() => setView('tree')} className={`px-3 py-1 text-sm ${view === 'tree' ? 'bg-blue-600 text-white' : 'bg-white hover:bg-gray-50'}`}>树形</button>
            <button onClick={() => setView('graph')} className={`px-3 py-1 text-sm ${view === 'graph' ? 'bg-blue-600 text-white' : 'bg-white hover:bg-gray-50'}`}>图形</button>
            <button onClick={() => setView('yaml')} className={`px-3 py-1 text-sm ${view === 'yaml' ? 'bg-blue-600 text-white' : 'bg-white hover:bg-gray-50'}`}>frames</button>
          </div>
          <button onClick={exportYaml} className="px-3 py-1 bg-gray-100 rounded text-sm">导出文本</button>
          <button onClick={exportPng} className="px-3 py-1 bg-gray-100 rounded text-sm">导出 PNG</button>
        </div>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索 frame..." className="w-full px-3 py-2 border rounded mb-4" />

      {frames.length === 0 ? (
        <div className="text-center py-12 text-gray-400">暂无 TF 数据</div>
      ) : (
        <div className="bg-white rounded-lg shadow p-4 max-h-[70vh] overflow-y-auto">
          {view === 'tree' && roots.map((root, i) => <TFNodeView key={i} frame={root} depth={0} />)}
          {view === 'yaml' && (
            <pre className="text-xs font-mono whitespace-pre-wrap bg-gray-50 p-2 rounded max-h-[60vh] overflow-auto">
              {frames.map(f => {
                const children = childrenMap[f] || []
                if (!children.length) return null
                return children.map(c => {
                  const key = `${f}/${c}`
                  const tr = transforms.get(key)
                  if (!tr) return null
                  return `${c}:\n  parent: ${f}\n  translation: {x: ${tr.translation.x.toFixed(3)}, y: ${tr.translation.y.toFixed(3)}, z: ${tr.translation.z.toFixed(3)}}\n  rotation: {x: ${tr.rotation.x.toFixed(3)}, y: ${tr.rotation.y.toFixed(3)}, z: ${tr.rotation.z.toFixed(3)}, w: ${tr.rotation.w.toFixed(3)}}\n`
                }).join('\n')
              }).filter(Boolean).join('\n')}
            </pre>
          )}
          {view === 'graph' && (
            <svg ref={svgRef} width="100%" height={500}>
              {graphEdges.map((e, i) => (
                <line key={i} x1={e.from!.x} y1={e.from!.y + 15} x2={e.to!.x} y2={e.to!.y} stroke="#94a3b8" strokeWidth={1} markerEnd="url(#tfarrow)" />
              ))}
              {Array.from(pos.entries()).map(([frame, p]) => (
                <g key={frame} className="cursor-pointer" onClick={() => setSelectedFrame(frame)}>
                  <rect x={p.x - 50} y={p.y} width={100} height={30} rx={4} fill={selectedFrame === frame ? '#3b82f6' : '#60a5fa'} />
                  <text x={p.x} y={p.y + 19} textAnchor="middle" fontSize={10} fill="white">{frame}</text>
                </g>
              ))}
              <defs><marker id="tfarrow" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto"><polygon points="0 0, 6 2, 0 4" fill="#94a3b8" /></marker></defs>
            </svg>
          )}
        </div>
      )}

      {selectedFrame && (
        <div className="mt-4 bg-white rounded-lg shadow p-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-semibold">{selectedFrame}</h3>
            <button onClick={() => setSelectedFrame(null)} className="text-xs text-gray-500 hover:text-gray-700">清除</button>
          </div>
          {selectedTransform ? (
            <div className="grid grid-cols-2 gap-4 text-sm font-mono">
              <div>parent: {selectedTransform.parent}</div>
              <div>child: {selectedTransform.child}</div>
              <div>translation: x={selectedTransform.translation.x.toFixed(3)} y={selectedTransform.translation.y.toFixed(3)} z={selectedTransform.translation.z.toFixed(3)}</div>
              <div>rotation: x={selectedTransform.rotation.x.toFixed(3)} y={selectedTransform.rotation.y.toFixed(3)} z={selectedTransform.rotation.z.toFixed(3)} w={selectedTransform.rotation.w.toFixed(3)}</div>
            </div>
          ) : (
            <div className="text-sm text-gray-400">选中 frame 无变换数据（可能仅出现在静态 TF 中）</div>
          )}
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

function download(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url)
}
function iso() { return new Date().toISOString().slice(0, 19) }
