/**
 * 工作台紧凑面板 — 话题列表（含 Hz）
 */
import { useState, useEffect, useRef } from 'react'
import { useROS } from '../../hooks/useROS'
import ROSLIB from 'roslib'
import { rosapi } from '../../lib/rosapi'

interface TopicStat { hz: number; last: number; samples: number[] }

export default function TopicsPanel() {
  const { ros, connected } = useROS()
  const [topics, setTopics] = useState<{ name: string; type: string }[]>([])
  const [search, setSearch] = useState('')
  const [stats, setStats] = useState<Map<string, TopicStat>>(new Map())
  const subsRef = useRef<Map<string, ROSLIB.Topic>>(new Map())
  const maxSubs = 30

  useEffect(() => {
    if (ros && connected) rosapi.topicTypes(ros).then(setTopics).catch(() => {})
  }, [ros, connected])

  useEffect(() => {
    if (!ros || !connected) return
    const toWatch = topics.filter(t => !search || t.name.includes(search)).slice(0, maxSubs)
    const needed = new Set(toWatch.map(t => t.name))
    subsRef.current.forEach((sub, name) => { if (!needed.has(name)) { sub.unsubscribe(); subsRef.current.delete(name) } })
    toWatch.forEach(t => {
      if (subsRef.current.has(t.name)) return
      const sub = new ROSLIB.Topic({ ros, name: t.name, messageType: t.type, throttle_rate: 500 })
      sub.subscribe(() => {
        setStats(prev => {
          const s = prev.get(t.name)
          const now = Date.now()
          const samples = (s?.samples || []).filter(ts => now - ts < 1000)
          samples.push(now)
          const hz = samples.length > 1 ? (samples.length - 1) / ((samples[samples.length - 1] - samples[0]) / 1000) : 0
          const next = new Map(prev)
          next.set(t.name, { hz, last: now, samples })
          return next
        })
      })
      subsRef.current.set(t.name, sub)
    })
    return () => { subsRef.current.forEach(s => s.unsubscribe()); subsRef.current.clear() }
  }, [ros, connected, topics, search])

  const filtered = topics.filter(t => !search || t.name.includes(search)).slice(0, maxSubs)

  return (
    <div className="flex flex-col h-full text-sm">
      <div className="px-2 pt-2 pb-1 border-b">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索话题…" className="w-full px-2 py-0.5 border rounded text-xs" />
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.map(t => {
          const s = stats.get(t.name)
          return (
            <div key={t.name} className="flex items-center gap-2 px-2 py-1 border-b border-gray-50">
              <span className="font-mono text-xs truncate flex-1">{t.name}</span>
              <span className="text-xs text-gray-400 truncate max-w-28">{t.type}</span>
              <span className="text-xs font-mono text-blue-600 w-14 text-right">{s ? s.hz.toFixed(1) : '—'} Hz</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
