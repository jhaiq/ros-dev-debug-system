/**
 * rqt_top 复刻 — 节点资源占用监视
 * 调用后端 /api/top 获取按 ROS 节点聚合的 CPU/内存。
 */
import { useState, useEffect } from 'react'

const API = import.meta.env.VITE_BACKEND_API || 'http://localhost:4000/api'

interface ProcessInfo {
  pid: number
  cpu: number
  mem: number
  rss: number
  command: string
}

interface NodeTop {
  node: string
  cpu: number
  mem: number
  rss: number
  processes: ProcessInfo[]
}

function formatBytes(b: number): string {
  if (!b) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  while (b >= 1024 && i < units.length - 1) { b /= 1024; i++ }
  return `${b.toFixed(2)} ${units[i]}`
}

export default function TopPage() {
  const [data, setData] = useState<NodeTop[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [intervalSec, setIntervalSec] = useState(2)

  const fetchTop = async () => {
    try {
      setLoading(true)
      const res = await fetch(`${API}/top`)
      if (!res.ok) throw new Error(res.statusText)
      setData(await res.json())
      setError(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTop()
    const timer = setInterval(fetchTop, intervalSec * 1000)
    return () => clearInterval(timer)
  }, [intervalSec])

  const toggle = (node: string) => {
    setExpanded(prev => { const n = new Set(prev); n.has(node) ? n.delete(node) : n.add(node); return n })
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">📊 节点资源占用</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm">刷新</label>
          <select value={intervalSec} onChange={e => setIntervalSec(Number(e.target.value))} className="border rounded px-2 py-1 text-sm">
            <option value={1}>1s</option>
            <option value={2}>2s</option>
            <option value={5}>5s</option>
            <option value={10}>10s</option>
          </select>
          <button onClick={fetchTop} className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">刷新</button>
        </div>
      </div>
      {error && <div className="mb-4 p-3 rounded bg-red-100 text-red-700 text-sm">{error}</div>}
      {loading && data.length === 0 && <div className="text-gray-400 text-center py-8">加载中...</div>}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left">节点</th>
              <th className="px-4 py-3">CPU %</th>
              <th className="px-4 py-3">MEM %</th>
              <th className="px-4 py-3">RSS</th>
              <th className="px-4 py-3">进程数</th>
            </tr>
          </thead>
          <tbody>
            {data.map(item => (
              <>
                <tr key={item.node} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => toggle(item.node)}>
                  <td className="px-4 py-3 font-mono flex items-center gap-2">
                    <span>{expanded.has(item.node) ? '▾' : '▸'}</span>
                    {item.node}
                  </td>
                  <td className="px-4 py-3 text-center">{item.cpu.toFixed(1)}</td>
                  <td className="px-4 py-3 text-center">{item.mem.toFixed(1)}</td>
                  <td className="px-4 py-3 text-center">{formatBytes(item.rss)}</td>
                  <td className="px-4 py-3 text-center">{item.processes.length}</td>
                </tr>
                {expanded.has(item.node) && item.processes.map(p => (
                  <tr key={p.pid} className="border-b bg-gray-50">
                    <td className="px-4 py-2 pl-10 text-xs font-mono truncate max-w-md" title={p.command}>{p.command}</td>
                    <td className="px-4 py-2 text-center text-xs">{p.cpu.toFixed(1)}</td>
                    <td className="px-4 py-2 text-center text-xs">{p.mem.toFixed(1)}</td>
                    <td className="px-4 py-2 text-center text-xs">{formatBytes(p.rss)}</td>
                    <td className="px-4 py-2 text-center text-xs">{p.pid}</td>
                  </tr>
                ))}
              </>
            ))}
            {data.length === 0 && !loading && <tr><td colSpan={5} className="text-center py-8 text-gray-400">未获取到节点进程信息</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
