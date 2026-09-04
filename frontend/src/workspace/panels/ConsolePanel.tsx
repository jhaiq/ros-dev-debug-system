/**
 * 工作台紧凑面板 — /rosout 控制台
 */
import { useState, useEffect, useRef } from 'react'
import { useROS } from '../../hooks/useROS'
import ROSLIB from 'roslib'

const LEVELS = ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'FATAL']
const LEVEL_NUM: Record<number, string> = { 1: 'DEBUG', 2: 'INFO', 4: 'WARNING', 8: 'ERROR', 16: 'FATAL' }
const BADGE: Record<string, string> = {
  DEBUG: 'text-gray-500', INFO: 'text-blue-600', WARNING: 'text-amber-500', ERROR: 'text-red-600', FATAL: 'text-purple-600',
}

export default function ConsolePanel() {
  const { ros, connected } = useROS()
  const [logs, setLogs] = useState<{ level: string; message: string; node: string; time: Date }[]>([])
  const [filter, setFilter] = useState('ALL')
  const [search, setSearch] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ros || !connected) return
    const topic = new ROSLIB.Topic({ ros, name: '/rosout', messageType: 'rosgraph_msgs/msg/Log' })
    topic.subscribe((msg: any) => {
      const stamp = msg.header?.stamp
      const time = stamp ? new Date((stamp.sec || 0) * 1000 + (stamp.nanosec || 0) / 1e6) : new Date()
      setLogs(prev => [...prev.slice(-299), {
        level: LEVEL_NUM[msg.level] || 'INFO', message: msg.msg || '', node: msg.name || '', time,
      }])
    })
    return () => { try { topic.unsubscribe() } catch {} }
  }, [ros, connected])

  useEffect(() => { if (endRef.current) endRef.current.scrollIntoView({ block: 'end' }) }, [logs])

  const filtered = logs.filter(l =>
    (filter === 'ALL' || l.level === filter) &&
    (!search || l.message.toLowerCase().includes(search.toLowerCase()) || l.node.toLowerCase().includes(search.toLowerCase())))

  return (
    <div className="flex flex-col h-full text-sm">
      <div className="flex gap-1 px-2 pt-2 pb-1 flex-wrap border-b">
        <button onClick={() => setFilter('ALL')} className={`px-2 py-0.5 text-xs rounded ${filter === 'ALL' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>ALL</button>
        {LEVELS.map(l => (
          <button key={l} onClick={() => setFilter(l)} className={`px-2 py-0.5 text-xs rounded ${filter === l ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>{l}</button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索" className="ml-auto px-2 py-0.5 border rounded text-xs w-32" />
        <button onClick={() => setLogs([])} className="px-2 py-0.5 text-xs bg-gray-100 rounded">清空</button>
      </div>
      <div className="flex-1 overflow-y-auto font-mono text-xs p-1">
        {filtered.map((l, i) => (
          <div key={i} className="flex gap-2 py-0.5 border-b border-gray-50">
            <span className="text-gray-400 shrink-0">{l.time.toLocaleTimeString()}</span>
            <span className={`shrink-0 w-12 ${BADGE[l.level]}`}>{l.level}</span>
            <span className="text-gray-500 shrink-0 max-w-24 truncate">{l.node}</span>
            <span className="break-all">{l.message}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  )
}
