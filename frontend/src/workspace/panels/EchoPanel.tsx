/**
 * 工作台紧凑面板 — 单话题消息 echo
 */
import { useState, useEffect, useRef } from 'react'
import { useROS } from '../../hooks/useROS'
import ROSLIB from 'roslib'
import { rosapi } from '../../lib/rosapi'

export default function EchoPanel() {
  const { ros, connected } = useROS()
  const [topics, setTopics] = useState<{ name: string; type: string }[]>([])
  const [selected, setSelected] = useState('')
  const [msg, setMsg] = useState<any>(null)
  const [rate, setRate] = useState(10)
  const subRef = useRef<ROSLIB.Topic | null>(null)

  useEffect(() => {
    if (ros && connected) rosapi.topicTypes(ros).then(setTopics).catch(() => {})
  }, [ros, connected])

  useEffect(() => {
    if (subRef.current) { subRef.current.unsubscribe(); subRef.current = null }
    setMsg(null)
    if (!selected || !ros) return
    const type = topics.find(t => t.name === selected)?.type || 'unknown'
    const sub = new ROSLIB.Topic({ ros, name: selected, messageType: type, throttle_rate: Math.round(1000 / rate) })
    sub.subscribe((m: any) => setMsg(m))
    subRef.current = sub
    return () => { sub.unsubscribe() }
  }, [selected, rate, ros])

  return (
    <div className="flex flex-col h-full text-sm">
      <div className="flex gap-1 px-2 pt-2 pb-1 border-b items-center">
        <select value={selected} onChange={e => setSelected(e.target.value)} className="flex-1 px-2 py-0.5 border rounded text-xs font-mono">
          <option value="">选择话题…</option>
          {topics.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
        </select>
        <select value={rate} onChange={e => setRate(Number(e.target.value))} className="px-1 py-0.5 border rounded text-xs">
          {[1, 5, 10, 30].map(r => <option key={r} value={r}>{r}Hz</option>)}
        </select>
      </div>
      <div className="flex-1 overflow-auto p-2 bg-gray-50">
        {msg ? (
          <pre className="text-xs font-mono whitespace-pre-wrap break-all">{JSON.stringify(msg, null, 2)}</pre>
        ) : (
          <div className="text-gray-400 text-xs text-center py-6">选择话题查看消息</div>
        )}
      </div>
    </div>
  )
}
