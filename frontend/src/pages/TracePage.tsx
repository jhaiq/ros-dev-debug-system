import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, Search, Filter, Download, Clock, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'

const PROXY_API = import.meta.env.VITE_PROXY_API || 'http://localhost:9092'
const PROXY_WS = import.meta.env.VITE_PROXY_WS || 'ws://localhost:9092'

type Trace = {
  trace_id: string
  topic: string
  node: string
  msg_type: string
  publish_ts: number
  subscribe_ts: number
  latency_ms: number
  hop_count: number
  msg_size_bytes: number
}

function latencyColor(ms: number): string {
  if (ms < 10) return 'text-green-400'
  if (ms < 50) return 'text-yellow-400'
  if (ms < 200) return 'text-orange-400'
  return 'text-red-400'
}

function latencyBg(ms: number): string {
  if (ms < 10) return 'bg-green-500'
  if (ms < 50) return 'bg-yellow-500'
  if (ms < 200) return 'bg-orange-500'
  return 'bg-red-500'
}

function latencyBarWidth(ms: number, max: number): string {
  const pct = Math.min(100, (ms / Math.max(max, 1)) * 100)
  return `${pct}%`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 } as Intl.DateTimeFormatOptions)
}

export default function TracePage() {
  const [traces, setTraces] = useState<Trace[]>([])
  const [loading, setLoading] = useState(true)
  const [liveMode, setLiveMode] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [topicFilter, setTopicFilter] = useState('')
  const [maxLatency, setMaxLatency] = useState<number | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  const fetchTraces = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (topicFilter) params.set('topic', topicFilter)
      if (maxLatency != null) params.set('maxLatency', String(maxLatency))
      params.set('limit', '200')
      const res = await fetch(`${PROXY_API}/api/traces?${params}`)
      const data = await res.json()
      setTraces(data.traces || [])
    } catch (e) {
      console.error('Failed to fetch traces:', e)
    } finally {
      setLoading(false)
    }
  }, [topicFilter, maxLatency])

  useEffect(() => {
    fetchTraces()
  }, [fetchTraces])

  useEffect(() => {
    if (liveMode) {
      const ws = new WebSocket(`${PROXY_WS}/ws/traces`)
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'trace') {
            setTraces(prev => {
              const next = [msg.trace, ...prev]
              return next.slice(0, 500)
            })
          }
        } catch { /* ignore parse errors */ }
      }
      wsRef.current = ws
      return () => { ws.close(); wsRef.current = null }
    } else {
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null }
    }
  }, [liveMode])

  const filtered = traces.filter(t => {
    if (searchTerm) {
      const s = searchTerm.toLowerCase()
      return t.trace_id.includes(s) || t.topic.includes(s) || t.node.includes(s)
    }
    return true
  })

  const maxLat = Math.max(...filtered.map(t => t.latency_ms), 1)

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `traces-${Date.now()}.json`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6 bg-gray-900 text-white min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clock className="text-blue-400" /> 调用链追踪
          </h1>
          <p className="text-gray-400 text-sm mt-1">ROS 消息通信链路追踪与时间线分析</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setLiveMode(!liveMode)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              liveMode ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
            }`}>
            {liveMode ? <Pause size={16} /> : <Play size={16} />}
            {liveMode ? '实时监听中' : '开启实时'}
          </button>
          <button onClick={fetchTraces} className="p-2 hover:bg-gray-700 rounded-lg transition-colors" title="刷新">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={exportJson} className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors">
            <Download size={16} /> 导出
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            placeholder="搜索 trace_id / topic / node..."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-blue-500" />
        </div>
        <button onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm hover:bg-gray-700 transition-colors">
          <Filter size={16} /> 筛选
        </button>
        <div className="text-gray-400 text-sm">
          共 <span className="text-white font-medium">{filtered.length}</span> 条 trace
        </div>
      </div>

      {showFilters && (
        <div className="flex items-center gap-4 mb-4 p-3 bg-gray-800 rounded-lg">
          <label className="text-sm text-gray-400">Topic:
            <input value={topicFilter} onChange={e => setTopicFilter(e.target.value)}
              placeholder="/scan, /odom..."
              className="ml-2 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500" />
          </label>
          <label className="text-sm text-gray-400">最大延迟 (ms):
            <input type="number" value={maxLatency ?? ''} onChange={e => setMaxLatency(e.target.value ? Number(e.target.value) : null)}
              className="ml-2 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm w-24 focus:outline-none focus:border-blue-500" />
          </label>
        </div>
      )}

      {/* Trace List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <Clock size={48} className="mx-auto mb-4 opacity-50" />
          <p>暂无追踪数据</p>
          <p className="text-sm mt-1">确保 Proxy 已连接 rosbridge 且有消息通信</p>
        </div>
      ) : (
        <div className="space-y-1">
          {/* Header row */}
          <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs text-gray-500 uppercase border-b border-gray-700">
            <div className="col-span-1"></div>
            <div className="col-span-3">Topic</div>
            <div className="col-span-2">Node</div>
            <div className="col-span-3">延迟</div>
            <div className="col-span-1">大小</div>
            <div className="col-span-1">跳数</div>
            <div className="col-span-1">时间</div>
          </div>

          {filtered.map((trace) => (
            <div key={trace.trace_id}
              className={`grid grid-cols-12 gap-2 px-4 py-2 rounded-lg text-sm cursor-pointer transition-colors hover:bg-gray-800 ${
                expandedId === trace.trace_id ? 'bg-gray-800' : ''
              }`}>
              <div className="col-span-1 flex items-center">
                <button onClick={() => setExpandedId(expandedId === trace.trace_id ? null : trace.trace_id)}
                  className="p-1 hover:bg-gray-700 rounded">
                  {expandedId === trace.trace_id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
              </div>
              <div className="col-span-3 font-mono text-blue-300 truncate" title={trace.topic}>{trace.topic}</div>
              <div className="col-span-2 text-gray-300 truncate" title={trace.node}>{trace.node}</div>
              <div className="col-span-3 flex items-center gap-2">
                <span className={`font-mono font-bold ${latencyColor(trace.latency_ms)}`}>{trace.latency_ms}ms</span>
                <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${latencyBg(trace.latency_ms)}`}
                    style={{ width: latencyBarWidth(trace.latency_ms, maxLat) }} />
                </div>
              </div>
              <div className="col-span-1 text-gray-400 text-xs">{formatBytes(trace.msg_size_bytes)}</div>
              <div className="col-span-1 text-gray-400 text-xs">{trace.hop_count}</div>
              <div className="col-span-1 text-gray-500 text-xs">{formatTime(trace.publish_ts)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Expanded Detail */}
      {expandedId && (() => {
        const trace = traces.find(t => t.trace_id === expandedId)
        if (!trace) return null
        return (
          <div className="mt-4 p-4 bg-gray-800 rounded-lg border border-gray-700">
            <h3 className="font-bold text-lg mb-3">Trace 详情</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-gray-500 text-xs">Trace ID</div>
                <div className="font-mono text-xs truncate" title={trace.trace_id}>{trace.trace_id}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">Topic</div>
                <div className="font-mono text-blue-300">{trace.topic}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">Node</div>
                <div className="font-mono">{trace.node}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">消息类型</div>
                <div className="font-mono">{trace.msg_type}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">发布时间</div>
                <div className="font-mono">{formatTime(trace.publish_ts)}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">订阅时间</div>
                <div className="font-mono">{formatTime(trace.subscribe_ts)}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">端到端延迟</div>
                <div className={`font-mono font-bold text-lg ${latencyColor(trace.latency_ms)}`}>{trace.latency_ms} ms</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">消息大小</div>
                <div className="font-mono">{formatBytes(trace.msg_size_bytes)}</div>
              </div>
            </div>

            {/* Timeline visualization */}
            <div className="mt-4 pt-4 border-t border-gray-700">
              <div className="text-xs text-gray-500 mb-2">时间线</div>
              <div className="relative h-12 bg-gray-900 rounded-lg overflow-hidden">
                {/* Publish span */}
                <div className="absolute top-2 left-4 bg-blue-500 text-white text-xs px-2 py-1 rounded">
                  PUBLISH
                </div>
                {/* Arrow */}
                <div className="absolute top-5 left-24 right-24 h-0.5 bg-gray-600" />
                <div className="absolute top-4 left-1/2 -translate-x-1/2 text-gray-500 text-xs">
                  {trace.latency_ms}ms
                </div>
                {/* Subscribe span */}
                <div className="absolute top-2 right-4 bg-green-500 text-white text-xs px-2 py-1 rounded">
                  SUBSCRIBE
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
