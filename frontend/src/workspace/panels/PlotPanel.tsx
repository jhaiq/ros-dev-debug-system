/**
 * 工作台紧凑面板 — 单话题实时绘图
 */
import { useState, useEffect, useRef } from 'react'
import { useROS } from '../../hooks/useROS'
import ROSLIB from 'roslib'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { rosapi } from '../../lib/rosapi'

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899']

interface Series { id: string; label: string; color: string; points: { t: number; time: string; value: number }[] }

function extract(msg: any, path: string): number | null {
  let cur = msg
  if (!path) {
    const v = msg?.data ?? msg?.value
    return typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : null
  }
  for (const seg of path.split('/')) { if (cur == null) return null; cur = cur[seg] }
  return typeof cur === 'number' ? cur : null
}

export default function PlotPanel() {
  const { ros, connected } = useROS()
  const [topicTypes, setTopicTypes] = useState<{ name: string; type: string }[]>([])
  const [input, setInput] = useState('')
  const [series, setSeries] = useState<Series[]>([])
  const [maxPoints, setMaxPoints] = useState(100)
  const subsRef = useRef<Map<string, ROSLIB.Topic>>(new Map())

  useEffect(() => {
    if (ros && connected) rosapi.topicTypes(ros).then(setTopicTypes).catch(() => {})
  }, [ros, connected])

  useEffect(() => {
    return () => { subsRef.current.forEach(s => s.unsubscribe()); subsRef.current.clear() }
  }, [])

  const addSeries = () => {
    if (!ros || !connected || !input.trim()) return
    const expr = input.trim().startsWith('/') ? input.trim().slice(1) : input.trim()
    const parts = expr.split('/')
    const topicName = '/' + parts[0]
    const path = parts.slice(1).join('/')
    const type = topicTypes.find(t => t.name === topicName)?.type
    if (!type) { alert(`找不到话题 ${topicName} 的类型`); return }
    const id = `${topicName}/${path}`
    if (series.find(s => s.id === id)) return
    const sub = new ROSLIB.Topic({ ros, name: topicName, messageType: type, throttle_rate: 50 })
    sub.subscribe((msg: any) => {
      const value = extract(msg, path)
      if (value === null) return
      const now = Date.now()
      setSeries(prev => prev.map(s => s.id === id ? {
        ...s, points: [...s.points.slice(-(maxPoints - 1)), { t: now, time: new Date(now).toLocaleTimeString(), value }],
      } : s))
    })
    subsRef.current.set(id, sub)
    setSeries(prev => [...prev, { id, label: id, color: COLORS[prev.length % COLORS.length], points: [] }])
    setInput('')
  }

  const removeSeries = (id: string) => {
    subsRef.current.get(id)?.unsubscribe(); subsRef.current.delete(id)
    setSeries(prev => prev.filter(s => s.id !== id))
  }

  const dataMap = new Map<number, Record<string, any>>()
  series.forEach(s => s.points.forEach(p => {
    if (!dataMap.has(p.t)) dataMap.set(p.t, { t: p.t, time: p.time })
    dataMap.get(p.t)![s.label] = p.value
  }))
  const data = Array.from(dataMap.values()).sort((a, b) => a.t - b.t).slice(-maxPoints)

  return (
    <div className="flex flex-col h-full text-sm">
      <div className="flex gap-1 px-2 pt-2 pb-1 border-b flex-wrap items-center">
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSeries()}
          placeholder="/topic/field" className="px-2 py-0.5 border rounded text-xs flex-1 min-w-32 font-mono" />
        <button onClick={addSeries} className="px-2 py-0.5 text-xs bg-blue-600 text-white rounded">+</button>
        <select value={maxPoints} onChange={e => setMaxPoints(Number(e.target.value))} className="text-xs border rounded px-1">
          {[50, 100, 200, 500].map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <div className="flex-1 min-h-0">
        {series.length === 0 ? (
          <div className="text-gray-400 text-xs text-center py-8">输入 /topic/field 添加曲线</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} />
              <Tooltip />
              {series.map(s => <Line key={s.id} type="monotone" dataKey={s.label} stroke={s.color} dot={false} strokeWidth={1.5} />)}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="flex gap-1 px-2 pb-1 flex-wrap border-t pt-1">
        {series.map(s => (
          <span key={s.id} className="text-xs px-1.5 py-0.5 border rounded flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="font-mono">{s.label}</span>
            <button onClick={() => removeSeries(s.id)} className="text-red-500">×</button>
          </span>
        ))}
      </div>
    </div>
  )
}
