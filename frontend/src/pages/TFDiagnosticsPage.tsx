import { useState, useEffect, useCallback } from 'react'
import { useROS } from '../hooks/useROS'
import ROSLIB from 'roslib'

interface Diagnostic {
  rule: string
  status: 'ok' | 'warning' | 'error'
  details: string
}

interface FrameInfo {
  name: string
  parent: string | null
  depth: number
  children: string[]
}

export default function TFDiagnosticsPage() {
  const { ros, connected } = useROS()
  const [frames, setFrames] = useState<FrameInfo[]>([])
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([])
  const [search, setSearch] = useState('')

  const fetchTF = useCallback(() => {
    if (!ros || !connected) return

    const tfTopic = new ROSLIB.Topic({ ros, name: '/tf', messageType: 'tf2_msgs/TFMessage', throttle_rate: 500 })
    const tfStatic = new ROSLIB.Topic({ ros, name: '/tf_static', messageType: 'tf2_msgs/TFMessage', throttle_rate: 500 })

    const handleTF = (msg: any) => {
      if (!msg.transforms) return
      const frameMap = new Map<string, FrameInfo>()
      const transforms = msg.transforms

      transforms.forEach((t: any) => {
        const parentId = t.header.frame_id
        const childId = t.child_frame_id

        if (!frameMap.has(parentId)) {
          frameMap.set(parentId, { name: parentId, parent: null, depth: 0, children: [] })
        }
        if (!frameMap.has(childId)) {
          frameMap.set(childId, { name: childId, parent: null, depth: 0, children: [] })
        }

        const child = frameMap.get(childId)!
        child.parent = parentId
        frameMap.get(parentId)!.children.push(childId)
      })

      // Calculate depth
      const calcDepth = (name: string, visited = new Set<string>()): number => {
        if (visited.has(name)) return 0 // cycle
        visited.add(name)
        const frame = frameMap.get(name)
        if (!frame || !frame.parent) return 0
        return 1 + calcDepth(frame.parent, visited)
      }

      frameMap.forEach(f => { f.depth = calcDepth(f.name) })
      setFrames([...frameMap.values()])
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

  // Run diagnostics
  useEffect(() => {
    if (frames.length === 0) return

    const diagnostics: Diagnostic[] = []

    // 1. Cycle detection
    const visited = new Set<string>()
    const inStack = new Set<string>()
    let hasCycle = false
    const checkCycle = (name: string) => {
      if (inStack.has(name)) { hasCycle = true; return }
      if (visited.has(name)) return
      visited.add(name)
      inStack.add(name)
      const frame = frames.find(f => f.name === name)
      if (frame?.parent) checkCycle(frame.parent)
      inStack.delete(name)
    }
    frames.forEach(f => checkCycle(f.name))
    diagnostics.push({
      rule: '循环依赖检测',
      status: hasCycle ? 'error' : 'ok',
      details: hasCycle ? '检测到 TF 树中存在循环依赖，可能导致坐标变换计算错误' : '未发现循环依赖'
    })

    // 2. Orphan frames (no parent, not a root)
    const roots = frames.filter(f => !f.parent)
    const orphans = frames.filter(f => !f.parent && roots.length > 1)
    diagnostics.push({
      rule: '孤立帧检测',
      status: orphans.length > 0 ? 'warning' : 'ok',
      details: orphans.length > 0 ? `发现 ${orphans.length} 个孤立帧: ${orphans.map(f => f.name).join(', ')}` : '所有帧都已连接到 TF 树'
    })

    // 3. Multiple roots
    diagnostics.push({
      rule: '多根帧警告',
      status: roots.length > 1 ? 'warning' : 'ok',
      details: roots.length > 1 ? `发现 ${roots.length} 个根帧: ${roots.map(r => r.name).join(', ')}` : '只有一个根帧'
    })

    // 4. Deep tree (>10 levels)
    const maxDepth = Math.max(...frames.map(f => f.depth))
    const deepFrames = frames.filter(f => f.depth > 10)
    diagnostics.push({
      rule: '深层树检测',
      status: deepFrames.length > 0 ? 'warning' : 'ok',
      details: deepFrames.length > 0 ? `TF 树深度 ${maxDepth}，${deepFrames.length} 个帧超过 10 层` : `TF 树深度 ${maxDepth}，正常`
    })

    // 5. Common frame check
    const expectedFrames = ['map', 'odom', 'base_link', 'base_footprint']
    const missingFrames = expectedFrames.filter(f => !frames.some(fr => fr.name === f))
    diagnostics.push({
      rule: '常用帧缺失',
      status: missingFrames.length > 0 ? 'warning' : 'ok',
      details: missingFrames.length > 0 ? `缺失常用帧: ${missingFrames.join(', ')}` : '所有常用帧都存在'
    })

    // 6. NaN/Infinity detection
    const invalidFrames = frames.filter(f =>
      isNaN(f.depth) || !isFinite(f.depth)
    )
    diagnostics.push({
      rule: 'NaN/Infinity 检测',
      status: invalidFrames.length > 0 ? 'error' : 'ok',
      details: invalidFrames.length > 0 ? `发现 ${invalidFrames.length} 个无效帧` : '所有帧数据有效'
    })

    setDiagnostics(diagnostics)
  }, [frames])

  const filteredFrames = frames.filter(f => !search || f.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">🔍 TF 诊断</h1>

      {/* 诊断结果 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {diagnostics.map((d, i) => (
          <div key={i} className={`p-4 rounded-lg border-l-4 ${
            d.status === 'ok' ? 'bg-green-50 border-green-500' :
            d.status === 'warning' ? 'bg-yellow-50 border-yellow-500' : 'bg-red-50 border-red-500'
          }`}>
            <div className="font-semibold mb-1">
              {d.status === 'ok' ? '✅' : d.status === 'warning' ? '⚠️' : '❌'} {d.rule}
            </div>
            <div className="text-sm text-gray-600">{d.details}</div>
          </div>
        ))}
      </div>

      {/* 帧列表 */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold">帧列表 ({frames.length})</h2>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索..."
            className="px-3 py-1 border rounded text-sm" />
        </div>
        <div className="max-h-64 overflow-y-auto">
          {filteredFrames.map(f => (
            <div key={f.name} className="flex justify-between py-1 px-2 border-b text-sm">
              <span className="font-mono">{f.name}</span>
              <span className="text-gray-500">深度: {f.depth} | 子帧: {f.children.length}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
