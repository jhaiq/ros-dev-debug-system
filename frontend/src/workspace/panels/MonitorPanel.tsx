/**
 * 工作台紧凑面板 — 诊断监视（/diagnostics 汇总）
 */
import { useState, useEffect } from 'react'
import { useROS } from '../../hooks/useROS'
import ROSLIB from 'roslib'

const LABEL = ['OK', 'WARN', 'ERR', 'STALE']
const COLOR = ['text-green-600', 'text-amber-500', 'text-red-600', 'text-gray-400']
const STALE_MS = 10000

interface Status { level: number; name: string; message: string; lastUpdate: number }

export default function MonitorPanel() {
  const { ros, connected } = useROS()
  const [statuses, setStatuses] = useState<Map<string, Status>>(new Map())
  const [selected, setSelected] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!ros || !connected) return
    const topic = new ROSLIB.Topic({ ros, name: '/diagnostics', messageType: 'diagnostic_msgs/msg/DiagnosticArray' })
    topic.subscribe((msg: any) => {
      const ts = Date.now()
      setStatuses(prev => {
        const next = new Map(prev)
        ;(msg.status || []).forEach((s: any) => {
          next.set(s.name, { level: s.level ?? 0, name: s.name || '', message: s.message || '', lastUpdate: ts })
        })
        return next
      })
    })
    return () => { try { topic.unsubscribe() } catch {} }
  }, [ros, connected])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 2000)
    return () => clearInterval(t)
  }, [])

  const counts = [0, 0, 0, 0]
  statuses.forEach(s => {
    const stale = now - s.lastUpdate > STALE_MS
    counts[stale ? 3 : s.level]++
  })

  return (
    <div className="flex flex-col h-full text-sm">
      <div className="flex gap-3 px-2 pt-2 pb-1 border-b justify-center">
        {LABEL.map((l, i) => (
          <span key={l} className={`text-xs ${COLOR[i]}`}>{l}: <b>{counts[i]}</b></span>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {Array.from(statuses.values()).map(s => {
          const stale = now - s.lastUpdate > STALE_MS
          const level = stale ? 3 : s.level
          return (
            <div key={s.name} className={`px-2 py-1 border-b border-gray-50 cursor-pointer hover:bg-gray-50 ${selected === s.name ? 'bg-blue-50' : ''}`}
              onClick={() => setSelected(s.name)}>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium ${COLOR[level]}`}>{LABEL[level]}</span>
                <span className="font-mono text-xs truncate flex-1">{s.name}</span>
              </div>
              {selected === s.name && <div className="text-xs text-gray-500 mt-0.5">{s.message}</div>}
            </div>
          )
        })}
        {statuses.size === 0 && <div className="text-gray-400 text-xs text-center py-6">等待 /diagnostics…</div>}
      </div>
    </div>
  )
}
