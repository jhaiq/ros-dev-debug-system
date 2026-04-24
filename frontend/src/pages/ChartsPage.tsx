import { useState, useEffect, useCallback, useRef } from 'react'
import { useROS } from '../hooks/useROS'
import ROSLIB from 'roslib'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface ChartTopic {
  name: string
  type: string
  data: { time: string; value: number }[]
  color: string
}

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899']
const QUICK_TOPICS = [
  { name: '/odom', label: '里程计' },
  { name: '/imu/data', label: 'IMU' },
  { name: '/battery_state', label: '电池' },
]

export default function ChartsPage() {
  const { ros } = useROS()
  const [topics, setTopics] = useState<ChartTopic[]>([])
  const [inputTopic, setInputTopic] = useState('')
  const [maxPoints, setMaxPoints] = useState(100)
  const [paused, setPaused] = useState(false)
  const subscribersRef = useRef<Map<string, ROSLIB.Topic>>(new Map())
  const topicTypesRef = useRef<Map<string, string>>(new Map())

  const addTopic = useCallback((topicName: string) => {
    if (!ros || topics.find(t => t.name === topicName)) return
    const topicType = topicTypesRef.current.get(topicName) || 'std_msgs/Float64'
    const newTopic: ChartTopic = {
      name: topicName,
      type: topicType,
      data: [],
      color: COLORS[topics.length % COLORS.length],
    }
    setTopics(prev => [...prev, newTopic])
    topicTypesRef.current.set(topicName, topicType)

    const sub = new ROSLIB.Topic({ ros, name: topicName, messageType: topicType, throttle_rate: 100 })
    sub.subscribe((msg: any) => {
      if (paused) return
      const now = new Date().toLocaleTimeString()
      // Extract numeric value from message
      const value = msg.data ?? msg.value ?? msg.x ?? msg.linear?.x ?? 0
      setTopics(prev => prev.map(t =>
        t.name === topicName
          ? { ...t, data: [...t.data.slice(-(maxPoints - 1)), { time: now, value: Number(value) }] }
          : t
      ))
    })
    subscribersRef.current.set(topicName, sub)
  }, [ros, topics, paused, maxPoints])

  const removeTopic = (topicName: string) => {
    const sub = subscribersRef.current.get(topicName)
    if (sub) { sub.unsubscribe(); subscribersRef.current.delete(topicName) }
    setTopics(prev => prev.filter(t => t.name !== topicName))
  }

  useEffect(() => {
    return () => { subscribersRef.current.forEach(sub => sub.unsubscribe()) }
  }, [])

  const handleAdd = () => { if (inputTopic.trim()) { addTopic(inputTopic.trim()); setInputTopic('') } }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">📈 实时图表</h1>
        <div className="flex gap-2">
          <button onClick={() => setPaused(p => !p)} className={`px-3 py-1 rounded text-sm ${paused ? 'bg-yellow-500 text-white' : 'bg-gray-200'}`}>
            {paused ? '▶ 继续' : '⏸ 暂停'}
          </button>
          <button onClick={() => setTopics([])} className="px-3 py-1 bg-red-100 text-red-700 rounded text-sm">清空</button>
        </div>
      </div>

      {/* 添加工具栏 */}
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <div className="flex gap-2 flex-wrap items-center">
          <input value={inputTopic} onChange={e => setInputTopic(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="/topic_name" className="px-3 py-2 border rounded text-sm w-64" />
          <button onClick={handleAdd} className="px-4 py-2 bg-blue-600 text-white rounded text-sm">添加</button>
          <div className="flex gap-1 ml-auto">
            {QUICK_TOPICS.map(q => (
              <button key={q.name} onClick={() => addTopic(q.name)}
                className="px-2 py-1 bg-gray-100 rounded text-xs hover:bg-gray-200">{q.label}</button>
            ))}
          </div>
          <select value={maxPoints} onChange={e => setMaxPoints(Number(e.target.value))}
            className="px-2 py-1 border rounded text-sm">
            {[50, 100, 200, 500].map(n => <option key={n} value={n}>{n} 点</option>)}
          </select>
        </div>
      </div>

      {/* 图表区域 */}
      {topics.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center text-gray-400">
          添加话题开始监控
        </div>
      ) : (
        <div className="space-y-4">
          {topics.map(topic => (
            <div key={topic.name} className="bg-white rounded-lg shadow p-4">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: topic.color }} />
                  <span className="font-mono text-sm font-semibold">{topic.name}</span>
                  <span className="text-xs text-gray-400">({topic.data.length} 点)</span>
                </div>
                <button onClick={() => removeTopic(topic.name)} className="text-red-500 hover:text-red-700 text-sm">✕</button>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={topic.data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="value" stroke={topic.color} dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
