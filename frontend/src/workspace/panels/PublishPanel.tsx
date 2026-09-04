/**
 * 工作台紧凑面板 — 消息发布
 */
import { useState, useEffect, useRef } from 'react'
import { useROS } from '../../hooks/useROS'
import ROSLIB from 'roslib'
import { rosapi } from '../../lib/rosapi'

export default function PublishPanel() {
  const { ros, connected } = useROS()
  const [topicTypes, setTopicTypes] = useState<{ name: string; type: string }[]>([])
  const [topic, setTopic] = useState('')
  const [type, setType] = useState('')
  const [payload, setPayload] = useState('{}')
  const [rate, setRate] = useState(0)
  const [enabled, setEnabled] = useState(false)
  const [count, setCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pubRef = useRef<ROSLIB.Topic | null>(null)

  useEffect(() => {
    if (ros && connected) rosapi.topicTypes(ros).then(setTopicTypes).catch(() => {})
  }, [ros, connected])

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  const publishOnce = () => {
    if (!ros || !topic || !type) return
    try {
      setError(null)
      const data = JSON.parse(payload)
      if (!pubRef.current) pubRef.current = new ROSLIB.Topic({ ros, name: topic, messageType: type })
      pubRef.current.publish(new ROSLIB.Message(data))
      setCount(c => c + 1)
    } catch (e: any) { setError(e.message) }
  }

  const togglePeriod = () => {
    if (enabled) {
      if (timerRef.current) clearInterval(timerRef.current)
      setEnabled(false)
    } else {
      if (rate <= 0) return
      timerRef.current = setInterval(publishOnce, 1000 / rate)
      setEnabled(true)
    }
  }

  return (
    <div className="flex flex-col h-full text-sm">
      <div className="p-2 border-b space-y-1">
        <div className="flex gap-1">
          <input list="ws-pub-topics" value={topic} onChange={e => {
            setTopic(e.target.value)
            const t = topicTypes.find(x => x.name === e.target.value)
            if (t) setType(t.type)
          }} placeholder="/topic" className="flex-1 px-2 py-0.5 border rounded text-xs font-mono" />
          <datalist id="ws-pub-topics">{topicTypes.map(t => <option key={t.name} value={t.name} />)}</datalist>
          <input value={type} onChange={e => setType(e.target.value)} placeholder="type" className="w-36 px-2 py-0.5 border rounded text-xs font-mono" />
        </div>
      </div>
      <textarea value={payload} onChange={e => setPayload(e.target.value)} placeholder='{"data": 1}'
        className="flex-1 mx-2 mt-2 p-2 border rounded text-xs font-mono resize-none min-h-0" />
      {error && <div className="px-2 text-xs text-red-600">{error}</div>}
      <div className="flex items-center gap-2 p-2 border-t">
        <button onClick={publishOnce} disabled={!connected}
          className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400">发布一次</button>
        <label className="flex items-center gap-1 text-xs">频率
          <input type="number" min={0.1} step={0.1} value={rate} onChange={e => setRate(Number(e.target.value))}
            className="w-16 px-1 py-0.5 border rounded" />Hz
        </label>
        <button onClick={togglePeriod} disabled={rate <= 0}
          className={`px-3 py-1 text-xs rounded text-white ${enabled ? 'bg-red-600' : 'bg-green-600'} disabled:bg-gray-400`}>
          {enabled ? '停止' : '周期'}
        </button>
        <span className="ml-auto text-xs text-gray-400">{count} 条</span>
      </div>
    </div>
  )
}
