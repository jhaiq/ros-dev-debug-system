import { useState, useEffect, useCallback, useMemo } from 'react'
import { BarChart, Clock, RefreshCw, TrendingUp, ArrowDown } from 'lucide-react'

const PROXY_API = 'http://localhost:9092'

type TopicStats = {
  topic: string
  count: number
  avg: number
  min: number
  max: number
  p50: number
  p90: number
  p95: number
  p99: number
  msgsPerSec: number
  avgSize: number
  lastSeen: number
  msgTypes?: string[]
}

function latencyColor(ms: number): string {
  if (ms < 10) return 'bg-green-500'
  if (ms < 50) return 'bg-yellow-500'
  if (ms < 200) return 'bg-orange-500'
  return 'bg-red-500'
}

function latencyTextColor(ms: number): string {
  if (ms < 10) return 'text-green-400'
  if (ms < 50) return 'text-yellow-400'
  if (ms < 200) return 'text-orange-400'
  return 'text-red-400'
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return n.toFixed(1)
}

/** 简易热力图（纯 CSS 实现，无需额外依赖） */
function HeatmapChart({ topics, timeWindows }: { topics: TopicStats[], timeWindows: number }) {
  const columns = Math.min(timeWindows, 30)
  const colors = ['bg-green-500', 'bg-green-400', 'bg-yellow-500', 'bg-yellow-400', 'bg-orange-500', 'bg-orange-400', 'bg-red-500', 'bg-red-600']

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        {/* Time axis labels */}
        <div className="flex ml-24 mb-1">
          {Array.from({ length: columns }, (_, i) => (
            <div key={i} className="flex-1 text-center text-xs text-gray-500">
              {i === 0 ? '现在' : i === columns - 1 ? `${columns}s 前` : ''}
            </div>
          ))}
        </div>

        {topics.map((t) => (
          <div key={t.topic} className="flex items-center mb-1">
            <div className="w-24 text-xs font-mono text-gray-300 truncate pr-2" title={t.topic}>{t.topic}</div>
            <div className="flex-1 flex gap-px">
              {Array.from({ length: columns }, (_, i) => {
                // 模拟热力值（实际应由后端按时间窗口提供）
                const baseLatency = t.p50
                const jitter = Math.random() * baseLatency * 0.5
                const value = baseLatency + jitter
                const colorIdx = Math.min(colors.length - 1, Math.floor(value / 30))
                return (
                  <div key={i}
                    className={`flex-1 h-6 rounded-sm ${colors[colorIdx]} transition-all`}
                    title={`${t.topic}: ~${value.toFixed(0)}ms`} />
                )
              })}
            </div>
          </div>
        ))}

        {/* Legend */}
        <div className="flex items-center gap-2 mt-3 ml-24">
          <span className="text-xs text-gray-500">低延迟</span>
          {colors.map((c, i) => (
            <div key={i} className={`w-4 h-3 ${c} rounded-sm`} />
          ))}
          <span className="text-xs text-gray-500">高延迟</span>
        </div>
      </div>
    </div>
  )
}

/** 延迟分布条形图（纯 CSS） */
function LatencyDistributionChart({ stats }: { stats: TopicStats[] }) {
  const maxP99 = Math.max(...stats.map(s => s.p99), 1)

  return (
    <div className="space-y-3">
      {stats.map((s) => (
        <div key={s.topic}>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="font-mono text-gray-300 truncate" title={s.topic}>{s.topic}</span>
            <span className={`font-mono font-bold ${latencyTextColor(s.p95)}`}>p95: {s.p95}ms</span>
          </div>
          <div className="flex gap-1 h-4">
            <div className={`${latencyColor(s.p50)} rounded-l`}
              style={{ width: `${(s.p50 / maxP99) * 100}%` }}
              title={`p50: ${s.p50}ms`} />
            <div className={`${latencyColor(s.p90)}`}
              style={{ width: `${((s.p90 - s.p50) / maxP99) * 100}%` }}
              title={`p90: ${s.p90}ms`} />
            <div className={`${latencyColor(s.p95)}`}
              style={{ width: `${((s.p95 - s.p90) / maxP99) * 100}%` }}
              title={`p95: ${s.p95}ms`} />
            <div className={`${latencyColor(s.p99)} rounded-r`}
              style={{ width: `${((s.p99 - s.p95) / maxP99) * 100}%` }}
              title={`p99: ${s.p99}ms`} />
          </div>
        </div>
      ))}
      <div className="flex items-center gap-4 text-xs text-gray-500 mt-2">
        <span>■ p50</span><span>■ p90</span><span>■ p95</span><span>■ p99</span>
      </div>
    </div>
  )
}

export default function LatencyPage() {
  const [topics, setTopics] = useState<TopicStats[]>([])
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [timeWindow, setTimeWindow] = useState(30)

  const fetchLatency = useCallback(async () => {
    try {
      const res = await fetch(`${PROXY_API}/api/latency`)
      const data = await res.json()
      setTopics(data.topics || [])
      if (data.topics?.length > 0 && !selectedTopic) {
        setSelectedTopic(data.topics[0].topic)
      }
    } catch (e) {
      console.error('Failed to fetch latency:', e)
    } finally {
      setLoading(false)
    }
  }, [selectedTopic])

  useEffect(() => {
    fetchLatency()
  }, [fetchLatency])

  useEffect(() => {
    const id = setInterval(fetchLatency, 5000)
    return () => clearInterval(id)
  }, [fetchLatency])

  const selectedStats = useMemo(() => topics.find(t => t.topic === selectedTopic), [topics, selectedTopic])
  const sortedTopics = useMemo(() => [...topics].sort((a, b) => b.p95 - a.p95), [topics])

  return (
    <div className="p-6 bg-gray-900 text-white min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart className="text-purple-400" /> 延迟监控
          </h1>
          <p className="text-gray-400 text-sm mt-1">话题消息延迟热力图与百分位统计</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-800 rounded-lg p-1">
            {[5, 15, 30, 60].map(w => (
              <button key={w} onClick={() => setTimeWindow(w)}
                className={`px-3 py-1 rounded text-sm transition-colors ${
                  timeWindow === w ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                }`}>{w}s</button>
            ))}
          </div>
          <button onClick={fetchLatency} className="p-2 hover:bg-gray-700 rounded-lg transition-colors" title="刷新">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-gray-400 text-xs">监控话题数</div>
          <div className="text-2xl font-bold">{topics.length}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-gray-400 text-xs">总消息数</div>
          <div className="text-2xl font-bold">{formatNumber(topics.reduce((s, t) => s + t.count, 0))}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-gray-400 text-xs">最高 p95 延迟</div>
          <div className={`text-2xl font-bold ${latencyTextColor(sortedTopics[0]?.p95 || 0)}`}>
            {sortedTopics[0]?.p95 || 0}ms
          </div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-gray-400 text-xs">总吞吐</div>
          <div className="text-2xl font-bold">{formatNumber(topics.reduce((s, t) => s + t.msgsPerSec, 0))}/s</div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-purple-500 border-t-transparent" />
        </div>
      ) : topics.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <Clock size={48} className="mx-auto mb-4 opacity-50" />
          <p>暂无延迟数据</p>
          <p className="text-sm mt-1">确保 Proxy 已连接且有消息通信</p>
        </div>
      ) : (
        <>
          {/* Heatmap */}
          <div className="bg-gray-800 rounded-lg p-4 mb-6">
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
              <TrendingUp size={18} className="text-purple-400" /> 延迟热力图
            </h2>
            <HeatmapChart topics={sortedTopics} timeWindows={timeWindow} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Latency Distribution */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
                <ArrowDown size={18} className="text-blue-400" /> 延迟分布
              </h2>
              <LatencyDistributionChart stats={sortedTopics} />
            </div>

            {/* Topic Detail */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h2 className="text-lg font-bold mb-3">话题详情</h2>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {topics.map((t) => (
                  <button key={t.topic} onClick={() => setSelectedTopic(t.topic)}
                    className={`w-full text-left p-3 rounded-lg transition-colors ${
                      selectedTopic === t.topic ? 'bg-purple-600/30 border border-purple-500' : 'bg-gray-700 hover:bg-gray-600'
                    }`}>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm">{t.topic}</span>
                      <span className={`font-mono font-bold ${latencyTextColor(t.p95)}`}>{t.p95}ms</span>
                    </div>
                    <div className="flex gap-4 text-xs text-gray-400 mt-1">
                      <span>avg: {t.avg.toFixed(1)}ms</span>
                      <span>max: {t.max}ms</span>
                      <span>{t.count} msgs</span>
                      <span>{t.msgsPerSec.toFixed(1)}/s</span>
                    </div>
                  </button>
                ))}
              </div>

              {selectedStats && (
                <div className="mt-4 p-3 bg-gray-900 rounded-lg">
                  <div className="font-mono text-sm font-bold mb-2">{selectedStats.topic}</div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div><span className="text-gray-500">平均</span><br /><span className={`font-mono ${latencyTextColor(selectedStats.avg)}`}>{selectedStats.avg.toFixed(1)}ms</span></div>
                    <div><span className="text-gray-500">p50</span><br /><span className={`font-mono ${latencyTextColor(selectedStats.p50)}`}>{selectedStats.p50}ms</span></div>
                    <div><span className="text-gray-500">p90</span><br /><span className={`font-mono ${latencyTextColor(selectedStats.p90)}`}>{selectedStats.p90}ms</span></div>
                    <div><span className="text-gray-500">p95</span><br /><span className={`font-mono ${latencyTextColor(selectedStats.p95)}`}>{selectedStats.p95}ms</span></div>
                    <div><span className="text-gray-500">p99</span><br /><span className={`font-mono ${latencyTextColor(selectedStats.p99)}`}>{selectedStats.p99}ms</span></div>
                    <div><span className="text-gray-500">最大</span><br /><span className={`font-mono ${latencyTextColor(selectedStats.max)}`}>{selectedStats.max}ms</span></div>
                    <div><span className="text-gray-500">消息大小</span><br /><span className="font-mono">{formatBytes(selectedStats.avgSize)}</span></div>
                    <div><span className="text-gray-500">吞吐率</span><br /><span className="font-mono">{selectedStats.msgsPerSec.toFixed(1)}/s</span></div>
                    <div><span className="text-gray-500">总消息</span><br /><span className="font-mono">{selectedStats.count}</span></div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
