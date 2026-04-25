import { useState, useEffect, useCallback } from 'react'
import {
  Shield, AlertTriangle, TrendingUp, FileText, Download, RefreshCw,
  ChevronDown, ChevronRight, Zap, Activity, Brain, CheckCircle
} from 'lucide-react'

const PROXY_API = import.meta.env.VITE_PROXY_API || 'http://localhost:9092'

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
    default: return <CheckCircle size={18} className="text-blue-400" />
  }
}

function severityLabel(severity: string): string {
  switch (severity) {
    case 'critical': return '严重'
    case 'warning': return '警告'
    default: return '提示'
  }
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

function priorityColor(priority: string): string {
  switch (priority) {
    case 'high': return 'text-red-400'
    case 'medium': return 'text-yellow-400'
    default: return 'text-blue-400'
  }
}

type Anomaly = {
  type: string
  topic: string
  severity: 'critical' | 'warning' | 'info'
  message: string
  timestamp: number
  [key: string]: unknown
}

type Recommendation = {
  id: string
  type: string
  priority: 'high' | 'medium' | 'low'
  topic: string
  title: string
  description: string
  action: string
  expectedImpact: string
  confidence: string
}

type RootCause = {
  type: string
  severity: string
  message: string
  confidence: string
  [key: string]: unknown
}

type DiagnosticsReport = {
  healthScore: number
  reportMarkdown: string
  summary: {
    totalTopics: number
    totalMessages: number
    totalThroughput: number
    avgLatency: number
    maxP95: number
    bottleneckCount: number
    anomalyCount: number
    rootCauseCount: number
    recommendationCount: number
  }
}

export default function DiagnosticsPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'anomalies' | 'recommendations' | 'report'>('overview')
  const [anomalies, setAnomalies] = useState<Anomaly[]>([])
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [rootCauses, setRootCauses] = useState<RootCause[]>([])
  const [report, setReport] = useState<DiagnosticsReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [lastCheck, setLastCheck] = useState<number>(0)

  const fetchData = useCallback(async () => {
    try {
      const [anomRes, recRes, rcRes, diagRes] = await Promise.all([
        fetch(`${PROXY_API}/api/anomalies`),
        fetch(`${PROXY_API}/api/recommendations`),
        fetch(`${PROXY_API}/api/rootcauses`),
        fetch(`${PROXY_API}/api/diagnostics`),
      ])
      const [anomData, recData, rcData, diagData] = await Promise.all([
        anomRes.json(),
        recRes.json(),
        rcRes.json(),
        diagRes.json(),
      ])
      setAnomalies(anomData.anomalies || [])
      setRecommendations(recData.recommendations || [])
      setRootCauses(rcData.rootCauses || [])
      setReport(diagData)
      setLastCheck(Date.now())
    } catch (e) {
      console.error('Failed to fetch diagnostics:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    const id = setInterval(fetchData, 15000)
    return () => clearInterval(id)
  }, [fetchData])

  const downloadReport = () => {
    if (!report) return
    const blob = new Blob([report.reportMarkdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ros-diagnostic-report-${Date.now()}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 bg-gray-900 min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-cyan-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="p-6 bg-gray-900 text-white min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="text-cyan-400" /> AI 诊断中心
          </h1>
          <p className="text-gray-400 text-sm mt-1">自动故障诊断、根因分析与配置优化建议</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">
            {lastCheck > 0 && `最后检测: ${new Date(lastCheck).toLocaleTimeString('zh-CN')}`}
          </span>
          <button onClick={fetchData} className="p-2 hover:bg-gray-700 rounded-lg transition-colors" title="刷新">
            <RefreshCw size={18} />
          </button>
          <button onClick={downloadReport}
            className="flex items-center gap-2 px-3 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-sm transition-colors">
            <Download size={16} /> 导出报告
          </button>
        </div>
      </div>

      {/* Health Score + Summary Cards */}
      {report && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-gray-400 text-xs">系统健康度</div>
            <div className={`text-3xl font-bold ${healthColor(report.healthScore)}`}>{report.healthScore}</div>
            <div className="mt-2 h-2 bg-gray-700 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${healthBg(report.healthScore)}`}
                style={{ width: `${report.healthScore}%` }} />
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-gray-400 text-xs">监控话题</div>
            <div className="text-2xl font-bold">{report.summary.totalTopics}</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-gray-400 text-xs">总消息数</div>
            <div className="text-2xl font-bold">{report.summary.totalMessages.toLocaleString()}</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-gray-400 text-xs">异常数</div>
            <div className="text-2xl font-bold text-yellow-400">{report.summary.anomalyCount}</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-gray-400 text-xs">优化建议</div>
            <div className="text-2xl font-bold text-cyan-400">{report.summary.recommendationCount}</div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6 bg-gray-800 rounded-lg p-1">
        {[
          { id: 'overview' as const, label: '概览', icon: <Shield size={16} /> },
          { id: 'anomalies' as const, label: '异常检测', icon: <AlertTriangle size={16} /> },
          { id: 'recommendations' as const, label: '优化建议', icon: <Zap size={16} /> },
          { id: 'report' as const, label: '诊断报告', icon: <FileText size={16} /> },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-1 justify-center ${
              activeTab === tab.id ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Root Causes */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
              <TrendingUp size={18} className="text-orange-400" /> 根因分析
            </h2>
            {rootCauses.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <CheckCircle size={32} className="mx-auto mb-2 text-green-400 opacity-50" />
                <p>未发现明显根因</p>
              </div>
            ) : (
              <div className="space-y-2">
                {rootCauses.map((rc, idx) => (
                  <div key={idx} className={`rounded-lg border p-3 ${severityColor(rc.severity)}`}>
                    <div className="flex items-center gap-2">
                      {severityIcon(rc.severity)}
                      <span className="font-medium">{rc.message}</span>
                      <span className="text-xs ml-auto px-2 py-0.5 rounded bg-current/20">
                        置信度: {rc.confidence}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top Anomalies + Recommendations */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-gray-800 rounded-lg p-4">
              <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
                <AlertTriangle size={18} className="text-yellow-400" /> 最新异常
              </h2>
              {anomalies.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>暂无异常</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {anomalies.slice(0, 5).map((a, idx) => (
                    <div key={idx} className={`rounded-lg border p-3 text-sm ${severityColor(a.severity)}`}>
                      <div className="flex items-center gap-2">
                        {severityIcon(a.severity)}
                        <span>{a.message}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-gray-800 rounded-lg p-4">
              <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
                <Zap size={18} className="text-cyan-400" /> 高优先级建议
              </h2>
              {recommendations.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>暂无优化建议</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {recommendations.filter(r => r.priority === 'high').slice(0, 5).map((r) => (
                    <div key={r.id} className="bg-gray-700 rounded-lg p-3 text-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`font-bold ${priorityColor(r.priority)}`}>[{r.priority.toUpperCase()}]</span>
                        <span className="font-medium">{r.title}</span>
                      </div>
                      <p className="text-gray-400 text-xs">{r.description}</p>
                    </div>
                  ))}
                  {recommendations.filter(r => r.priority === 'high').length === 0 && (
                    <div className="text-center py-4 text-gray-500 text-sm">
                      无高优先级建议 ✅
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Anomalies Tab */}
      {activeTab === 'anomalies' && (
        <div className="space-y-2">
          {anomalies.length === 0 ? (
            <div className="text-center py-20 text-gray-500">
              <CheckCircle size={48} className="mx-auto mb-4 text-green-400 opacity-50" />
              <p>系统运行正常，无异常</p>
            </div>
          ) : (
            anomalies.map((a, idx) => {
              const key = `${a.type}-${a.topic}-${idx}`
              return (
                <div key={key} className={`rounded-lg border transition-colors ${severityColor(a.severity)}`}>
                  <button onClick={() => setExpandedId(expandedId === key ? null : key)}
                    className="w-full flex items-center gap-3 p-4 text-left">
                    {severityIcon(a.severity)}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{a.topic}</span>
                        <span className="text-xs px-2 py-0.5 rounded bg-current/20">
                          {severityLabel(a.severity)}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300">
                          {a.type}
                        </span>
                      </div>
                      <div className="text-sm opacity-80 mt-1">{a.message}</div>
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(a.timestamp).toLocaleTimeString('zh-CN')}
                    </div>
                    {expandedId === key ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>

                  {expandedId === key && (
                    <div className="px-4 pb-4 border-t border-current/20 pt-3">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                        {Object.entries(a).filter(([k]) => !['type', 'severity', 'message', 'timestamp', 'topic'].includes(k)).map(([k, v]) => (
                          <div key={k}>
                            <span className="text-gray-500 text-xs">{k}</span>
                            <div className="font-mono">{String(v)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Recommendations Tab */}
      {activeTab === 'recommendations' && (
        <div className="space-y-2">
          {recommendations.length === 0 ? (
            <div className="text-center py-20 text-gray-500">
              <CheckCircle size={48} className="mx-auto mb-4 text-green-400 opacity-50" />
              <p>系统配置良好，暂无优化建议</p>
            </div>
          ) : (
            recommendations.map((r) => (
              <div key={r.id} className="bg-gray-800 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`font-bold ${priorityColor(r.priority)}`}>[{r.priority.toUpperCase()}]</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300">{r.type}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300">
                    置信度: {r.confidence}
                  </span>
                </div>
                <h3 className="font-bold text-lg mb-1">{r.title}</h3>
                <p className="text-gray-400 text-sm mb-3">{r.description}</p>
                <div className="bg-gray-900 rounded-lg p-3 mb-2">
                  <div className="text-xs text-gray-500 mb-1">🔧 操作</div>
                  <code className="text-sm text-cyan-300">{r.action}</code>
                </div>
                <div className="bg-gray-900 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">📈 预期效果</div>
                  <div className="text-sm text-green-300">{r.expectedImpact}</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Report Tab */}
      {activeTab === 'report' && report && (
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <FileText size={18} className="text-cyan-400" /> 诊断报告
            </h2>
            <button onClick={downloadReport}
              className="flex items-center gap-2 px-3 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-sm transition-colors">
              <Download size={16} /> 下载 Markdown
            </button>
          </div>

          <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm whitespace-pre-wrap text-gray-300 max-h-[600px] overflow-y-auto">
            {report.reportMarkdown}
          </div>
        </div>
      )}
    </div>
  )
}
