import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, RefreshCw, Shield, Activity, ThumbsUp, ChevronDown, ChevronRight } from 'lucide-react'

const PROXY_API = 'http://localhost:9092'

type Bottleneck = {
  topic: string
  rule: string
  severity: 'critical' | 'warning' | 'info'
  details: {
    p50: number
    p95: number
    p99: number
    max: number
    avg: number
    msgsPerSec: number
    avgSize: number
    count: number
  }
  suggestion: string
}

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
}

function severityColor(severity: string): string {
  switch (severity) {
    case 'critical': return 'bg-red-500/20 border-red-500 text-red-400'
    case 'warning': return 'bg-yellow-500/20 border-yellow-500 text-yellow-400'
    default: return 'bg-blue-500/20 border-blue-500 text-blue-400'
  }
}

function severityIcon(severity: string) {
  switch (severity) {
    case 'critical': return <AlertTriangle size={18} className="text-red-400" />
    case 'warning': return <Activity size={18} className="text-yellow-400" />
    default: return <ThumbsUp size={18} className="text-blue-400" />
  }
}

function severityLabel(severity: string): string {
  switch (severity) {
    case 'critical': return '严重'
    case 'warning': return '警告'
    default: return '提示'
  }
}

function healthScore(stats: TopicStats | null): number {
  if (!stats) return 100
  let score = 100
  if (stats.p95 > 200) score -= 40
  else if (stats.p95 > 100) score -= 25
  else if (stats.p95 > 50) score -= 10
  if (stats.max > stats.p99 * 3) score -= 20
  if (stats.msgsPerSec > 100 && stats.p50 > 50) score -= 20
  if (stats.avgSize > 1024 * 1024) score -= 10
  return Math.max(0, score)
}

function healthColor(score: number): string {
  if (score >= 80) return 'text-green-400'
  if (score >= 50) return 'text-yellow-400'
  return 'text-red-400'
}

function healthBg(score: number): string {
  if (score >= 80) return 'bg-green-500'
  if (score >= 50) return 'bg-yellow-500'
  return 'bg-red-500'
}

export default function BottleneckPage() {
  const [bottlenecks, setBottlenecks] = useState<Bottleneck[]>([])
  const [topics, setTopics] = useState<TopicStats[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [lastCheck, setLastCheck] = useState<number>(0)

  const fetchData = useCallback(async () => {
    try {
      const [bnRes, latRes] = await Promise.all([
        fetch(`${PROXY_API}/api/bottlenecks`),
        fetch(`${PROXY_API}/api/latency`),
      ])
      const bnData = await bnRes.json()
      const latData = await latRes.json()
      setBottlenecks(bnData.bottlenecks || [])
      setTopics(latData.topics || [])
      setLastCheck(Date.now())
    } catch (e) {
      console.error('Failed to fetch bottleneck data:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    const id = setInterval(fetchData, 10000)
    return () => clearInterval(id)
  }, [fetchData])

  const criticalCount = bottlenecks.filter(b => b.severity === 'critical').length
  const warningCount = bottlenecks.filter(b => b.severity === 'warning').length

  const overallHealth = topics.length > 0
    ? Math.round(topics.reduce((sum, t) => sum + healthScore(t), 0) / topics.length)
    : 100

  return (
    <div className="p-6 bg-gray-900 text-white min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="text-orange-400" /> 瓶颈检测
          </h1>
          <p className="text-gray-400 text-sm mt-1">自动检测系统瓶颈与节点健康度评分</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">
            {lastCheck > 0 && `最后检测: ${new Date(lastCheck).toLocaleTimeString('zh-CN')}`}
          </span>
          <button onClick={fetchData} className="p-2 hover:bg-gray-700 rounded-lg transition-colors" title="刷新">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-gray-400 text-xs">系统健康度</div>
          <div className={`text-3xl font-bold ${healthColor(overallHealth)}`}>{overallHealth}</div>
          <div className="mt-2 h-2 bg-gray-700 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${healthBg(overallHealth)}`}
              style={{ width: `${overallHealth}%` }} />
          </div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border-l-4 border-red-500">
          <div className="text-gray-400 text-xs">严重问题</div>
          <div className="text-3xl font-bold text-red-400">{criticalCount}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border-l-4 border-yellow-500">
          <div className="text-gray-400 text-xs">警告</div>
          <div className="text-3xl font-bold text-yellow-400">{warningCount}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-gray-400 text-xs">监控话题</div>
          <div className="text-3xl font-bold">{topics.length}</div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-orange-500 border-t-transparent" />
        </div>
      ) : (
        <>
          {/* Bottleneck List */}
          <div className="mb-6">
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
              <AlertTriangle size={18} className="text-orange-400" /> 检测结果
              {bottlenecks.length > 0 && (
                <span className="text-sm text-gray-400 font-normal">({bottlenecks.length} 条)</span>
              )}
            </h2>

            {bottlenecks.length === 0 ? (
              <div className="bg-gray-800 rounded-lg p-8 text-center">
                <ThumbsUp size={48} className="mx-auto mb-4 text-green-400 opacity-50" />
                <p className="text-green-400 font-medium">暂无瓶颈检测</p>
                <p className="text-gray-500 text-sm mt-1">系统运行正常</p>
              </div>
            ) : (
              <div className="space-y-2">
                {bottlenecks.map((bn, idx) => {
                  const key = `${bn.topic}-${bn.rule}-${idx}`
                  return (
                    <div key={key}
                      className={`rounded-lg border transition-colors ${severityColor(bn.severity)}`}>
                      <button onClick={() => setExpandedId(expandedId === key ? null : key)}
                        className="w-full flex items-center gap-3 p-4 text-left">
                        {severityIcon(bn.severity)}
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold">{bn.topic}</span>
                            <span className="text-xs px-2 py-0.5 rounded bg-current/20">
                              {severityLabel(bn.severity)}
                            </span>
                          </div>
                          <div className="text-sm opacity-80">{bn.rule}</div>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span>p95: {bn.details.p95}ms</span>
                          <span>{bn.details.msgsPerSec.toFixed(1)}/s</span>
                          {expandedId === key ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </div>
                      </button>

                      {expandedId === key && (
                        <div className="px-4 pb-4 border-t border-current/20 pt-3">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
                            <div><span className="text-gray-500 text-xs">p50</span><br /><span className="font-mono">{bn.details.p50}ms</span></div>
                            <div><span className="text-gray-500 text-xs">p95</span><br /><span className="font-mono">{bn.details.p95}ms</span></div>
                            <div><span className="text-gray-500 text-xs">p99</span><br /><span className="font-mono">{bn.details.p99}ms</span></div>
                            <div><span className="text-gray-500 text-xs">max</span><br /><span className="font-mono">{bn.details.max}ms</span></div>
                            <div><span className="text-gray-500 text-xs">平均</span><br /><span className="font-mono">{bn.details.avg.toFixed(1)}ms</span></div>
                            <div><span className="text-gray-500 text-xs">吞吐</span><br /><span className="font-mono">{bn.details.msgsPerSec.toFixed(1)}/s</span></div>
                            <div><span className="text-gray-500 text-xs">平均大小</span><br /><span className="font-mono">{(bn.details.avgSize / 1024).toFixed(1)} KB</span></div>
                            <div><span className="text-gray-500 text-xs">消息数</span><br /><span className="font-mono">{bn.details.count}</span></div>
                          </div>
                          <div className="bg-gray-900/50 rounded-lg p-3">
                            <div className="text-xs text-gray-500 mb-1">💡 建议</div>
                            <div className="text-sm">{bn.suggestion}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Node Health Grid */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
              <Shield size={18} className="text-green-400" /> 话题健康度
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {topics.map((t) => {
                const score = healthScore(t)
                return (
                  <div key={t.topic} className="bg-gray-700 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-sm truncate" title={t.topic}>{t.topic}</span>
                      <span className={`font-bold text-lg ${healthColor(score)}`}>{score}</span>
                    </div>
                    <div className="h-1.5 bg-gray-600 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${healthBg(score)}`}
                        style={{ width: `${score}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-gray-400 mt-2">
                      <span>{t.count} msgs</span>
                      <span>p95: {t.p95}ms</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
