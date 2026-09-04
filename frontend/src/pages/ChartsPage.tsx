/**
 * rqt_plot 复刻增强 — 字段路径曲线、多曲线合图、持久化、CSV 导出、暂停/清空
 *
 * 曲线表达式格式：/topic/field/sub 或 topic/field/sub（首段为话题名，其余为字段路径）
 * 数值字段支持：取任意嵌套数值字段（bool 转 0/1，time 转秒）。
 */
import { useState, useEffect, useRef, useMemo } from 'react'
import { useROS } from '../hooks/useROS'
import ROSLIB from 'roslib'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { rosapi } from '../lib/rosapi'

interface DataPoint { t: number; time: string; value: number }

interface Curve {
  id: string
  topic: string
  type: string
  path: string // 空字符串表示取顶层标量
  label: string
  color: string
  data: DataPoint[]
}

interface Plot {
  id: string
  title: string
  curveIds: string[]
}

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316']
const STORAGE_KEY = 'rqt_plot_state'

function parsePath(expr: string): { topic: string; path: string } {
  const clean = expr.startsWith('/') ? expr.slice(1) : expr
  const parts = clean.split('/')
  return { topic: `/${parts[0]}`, path: parts.slice(1).join('/') }
}

function extractValue(msg: any, path: string): number | null {
  if (!path) {
    const v = msg?.data ?? msg?.value
    if (typeof v === 'number') return v
    if (typeof v === 'boolean') return v ? 1 : 0
    if (typeof msg === 'number') return msg
    return null
  }
  let cur = msg
  for (const seg of path.split('/')) {
    if (cur === undefined || cur === null) return null
    cur = cur[seg]
  }
  if (typeof cur === 'number') return cur
  if (typeof cur === 'boolean') return cur ? 1 : 0
  if (cur && typeof cur === 'object' && ('sec' in cur || 'secs' in cur)) {
    const sec = cur.sec ?? cur.secs ?? 0
    const nanosec = cur.nanosec ?? 0
    return sec + nanosec / 1e9
  }
  return null
}

export default function ChartsPage() {
  const { ros, connected } = useROS()
  const [topicTypes, setTopicTypes] = useState<{ name: string; type: string }[]>([])
  const [curves, setCurves] = useState<Curve[]>([])
  const [plots, setPlots] = useState<Plot[]>([{ id: 'main', title: '实时图表', curveIds: [] }])
  const [input, setInput] = useState('/odom/pose/pose/position/x')
  const [maxPoints, setMaxPoints] = useState(100)
  const [paused, setPaused] = useState(false)
  const [plotMaxPoints, setPlotMaxPoints] = useState(200)
  const subscribersRef = useRef<Map<string, ROSLIB.Topic>>(new Map())

  // 加载持久化
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const s = JSON.parse(raw)
        if (Array.isArray(s.curves)) setCurves(s.curves.map((c: any) => ({ ...c, data: [] })))
        if (Array.isArray(s.plots)) setPlots(s.plots)
      }
    } catch { /* ignore */ }
  }, [])

  // 持久化
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ curves: curves.map(c => ({ ...c, data: [] })), plots }))
    } catch { /* ignore */ }
  }, [curves, plots])

  useEffect(() => {
    if (ros && connected) {
      rosapi.topicTypes(ros).then(t => setTopicTypes(t)).catch(() => setTopicTypes([]))
    }
  }, [ros, connected])

  // 为每个 curve 订阅
  useEffect(() => {
    if (!ros || !connected) return
    // 清理不再需要的订阅
    const needed = new Set(curves.map(c => c.id))
    subscribersRef.current.forEach((sub, id) => {
      if (!needed.has(id)) { sub.unsubscribe(); subscribersRef.current.delete(id) }
    })

    curves.forEach(curve => {
      if (subscribersRef.current.has(curve.id)) return
      const sub = new ROSLIB.Topic({ ros, name: curve.topic, messageType: curve.type, throttle_rate: 50 })
      sub.subscribe((msg: any) => {
        if (paused) return
        const value = extractValue(msg, curve.path)
        if (value === null) return
        const now = Date.now()
        setCurves(prev => prev.map(c => c.id === curve.id ? {
          ...c,
          data: [...c.data.slice(-(maxPoints - 1)), { t: now, time: new Date(now).toLocaleTimeString(), value }],
        } : c))
      })
      subscribersRef.current.set(curve.id, sub)
    })

    return () => {
      subscribersRef.current.forEach(sub => sub.unsubscribe())
      subscribersRef.current.clear()
    }
  }, [ros, connected, curves.map(c => c.id).join(','), paused, maxPoints])

  const addCurve = async () => {
    if (!ros || !connected || !input.trim()) return
    const { topic, path } = parsePath(input.trim())
    const existing = curves.find(c => c.topic === topic && c.path === path)
    if (existing) { alert('该曲线已存在'); return }

    let type = topicTypes.find(t => t.name === topic)?.type
    if (!type) {
      // 尝试从 rosapi 查询类型
      try { type = (await rosapi.topicTypes(ros)).find(t => t.name === topic)?.type } catch {}
    }
    if (!type) { alert(`无法确定话题 ${topic} 的类型`); return }

    const id = `curve:${Math.random().toString(36).slice(2)}`
    const label = path ? `${topic}/${path}` : topic
    const color = COLORS[curves.length % COLORS.length]
    const curve: Curve = { id, topic, type, path, label, color, data: [] }
    setCurves(prev => [...prev, curve])
    setPlots(prev => {
      const main = prev.find(p => p.id === 'main') || prev[0]
      return prev.map(p => p.id === main.id ? { ...p, curveIds: [...p.curveIds, id] } : p)
    })
    setInput('')
  }

  const removeCurve = (id: string) => {
    const sub = subscribersRef.current.get(id)
    if (sub) { sub.unsubscribe(); subscribersRef.current.delete(id) }
    setCurves(prev => prev.filter(c => c.id !== id))
    setPlots(prev => prev.map(p => ({ ...p, curveIds: p.curveIds.filter(cid => cid !== id) })))
  }

  const removePlot = (id: string) => {
    if (id === 'main') return
    const plot = plots.find(p => p.id === id)
    if (plot) plot.curveIds.forEach(removeCurve)
    setPlots(prev => prev.filter(p => p.id !== id))
  }

  const addPlot = () => {
    setPlots(prev => [...prev, { id: `plot:${Math.random().toString(36).slice(2)}`, title: `图窗 ${prev.length + 1}`, curveIds: [] }])
  }

  const moveCurve = (curveId: string, plotId: string) => {
    setPlots(prev => prev.map(p => ({
      ...p,
      curveIds: p.id === plotId
        ? [...p.curveIds.filter(cid => cid !== curveId), curveId]
        : p.curveIds.filter(cid => cid !== curveId),
    })))
  }

  const clearAll = () => {
    subscribersRef.current.forEach(s => s.unsubscribe())
    subscribersRef.current.clear()
    setCurves([])
    setPlots([{ id: 'main', title: '实时图表', curveIds: [] }])
    localStorage.removeItem(STORAGE_KEY)
  }

  const exportCsv = () => {
    if (!curves.length) return
    const header = ['time', ...curves.map(c => c.label)].join(',')
    const t0 = curves[0].data[0]?.t ?? 0
    const rows: Record<number, Record<string, number>> = {}
    curves.forEach(c => c.data.forEach(d => {
      if (!rows[d.t]) rows[d.t] = {}
      rows[d.t][c.label] = d.value
    }))
    const lines = Object.entries(rows).sort(([a], [b]) => Number(a) - Number(b)).map(([t, vals]) => {
      const sec = ((Number(t) - t0) / 1000).toFixed(3)
      return `"${sec}",${curves.map(c => vals[c.label] ?? '').join(',')}`
    })
    const blob = new Blob([header + '\n' + lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `rqt_plot-${iso()}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const plotData = (plot: Plot) => {
    const map = new Map<number, Record<string, any>>()
    plot.curveIds.forEach(id => {
      const c = curves.find(x => x.id === id)
      if (!c) return
      c.data.forEach(d => {
        if (!map.has(d.t)) map.set(d.t, { t: d.t, time: d.time })
        map.get(d.t)![c.label] = d.value
      })
    })
    return Array.from(map.values()).sort((a, b) => a.t - b.t).slice(-plotMaxPoints)
  }

  const orphanCurves = useMemo(() => curves.filter(c => !plots.some(p => p.curveIds.includes(c.id))), [curves, plots])

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">📈 实时图表</h1>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setPaused(p => !p)} className={`px-3 py-1 rounded text-sm ${paused ? 'bg-amber-600 text-white' : 'bg-blue-600 text-white'}`}>
            {paused ? '▶ 继续' : '⏸ 暂停'}
          </button>
          <button onClick={() => setCurves(prev => prev.map(c => ({ ...c, data: [] })))} className="px-3 py-1 bg-gray-200 rounded text-sm">清空曲线</button>
          <button onClick={exportCsv} className="px-3 py-1 bg-green-600 text-white rounded text-sm">导出 CSV</button>
          <button onClick={clearAll} className="px-3 py-1 bg-red-100 text-red-700 rounded text-sm">重置</button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <div className="flex gap-2 flex-wrap items-center">
          <input list="chart-topics" value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCurve()}
            placeholder="/topic/field/sub" className="flex-1 min-w-64 px-3 py-2 border rounded text-sm font-mono" />
          <datalist id="chart-topics">
            {topicTypes.map(t => <option key={t.name} value={t.name}>{t.type}</option>)}
          </datalist>
          <button onClick={addCurve} disabled={!connected} className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:bg-gray-400">添加曲线</button>
          <button onClick={addPlot} className="px-4 py-2 bg-gray-600 text-white rounded text-sm hover:bg-gray-700">新增图窗</button>
          <label className="text-sm flex items-center gap-1">点数
            <select value={maxPoints} onChange={e => setMaxPoints(Number(e.target.value))} className="border rounded px-2 py-1 text-sm">
              {[50, 100, 200, 500, 1000].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="text-sm flex items-center gap-1">显示
            <select value={plotMaxPoints} onChange={e => setPlotMaxPoints(Number(e.target.value))} className="border rounded px-2 py-1 text-sm">
              {[50, 100, 200, 500, 1000].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
        <div className="text-xs text-gray-400 mt-2">提示：话题列表下拉，输入 /topic/field/sub 可绘制嵌套数值字段；例 /odom/pose/pose/position/x</div>
      </div>

      {/* 曲线列表（可分配到图窗） */}
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <div className="text-sm font-semibold mb-2">曲线 ({curves.length})</div>
        <div className="flex flex-wrap gap-2">
          {curves.map(c => (
            <div key={c.id} className="flex items-center gap-2 px-2 py-1 border rounded text-sm">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: c.color }} />
              <span className="font-mono text-xs">{c.label}</span>
              <span className="text-xs text-gray-400">{c.data.length} 点</span>
              <select value={plots.find(p => p.curveIds.includes(c.id))?.id || 'main'}
                onChange={e => moveCurve(c.id, e.target.value)}
                className="text-xs border rounded px-1 py-0.5">
                {plots.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
              <button onClick={() => removeCurve(c.id)} className="text-red-500 hover:text-red-700 text-xs">×</button>
            </div>
          ))}
        </div>
      </div>

      {/* 图窗 */}
      {plots.map(plot => (
        <div key={plot.id} className="bg-white rounded-lg shadow p-4 mb-4">
          <div className="flex justify-between items-center mb-2">
            <input value={plot.title} onChange={e => setPlots(prev => prev.map(p => p.id === plot.id ? { ...p, title: e.target.value } : p))}
              className="font-semibold border-b focus:outline-none focus:border-blue-600 px-1" />
            {plot.id !== 'main' && (
              <button onClick={() => removePlot(plot.id)} className="text-red-500 hover:text-red-700 text-sm">删除图窗</button>
            )}
          </div>
          {plot.curveIds.length === 0 ? (
            <div className="text-gray-400 text-center py-8 text-sm">此图窗暂无曲线</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={plotData(plot)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                <YAxis />
                <Tooltip />
                <Legend />
                {plot.curveIds.map(id => {
                  const c = curves.find(x => x.id === id)
                  if (!c) return null
                  return <Line key={c.id} type="monotone" dataKey={c.label} stroke={c.color} dot={false} strokeWidth={2} />
                })}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      ))}

      {orphanCurves.length > 0 && (
        <div className="text-xs text-amber-600">{orphanCurves.length} 条曲线未分配到图窗</div>
      )}
    </div>
  )
}

function iso() { return new Date().toISOString().slice(0, 19) }
