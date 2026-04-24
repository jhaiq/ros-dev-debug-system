import { useState, useEffect, useCallback } from 'react'
import { useROS } from '../hooks/useROS'
import ROSLIB from 'roslib'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface LoadData { time: string; load: number }

export default function DashboardPage() {
  const { ros, connected } = useROS()
  const [nodeCount, setNodeCount] = useState(0)
  const [topicCount, setTopicCount] = useState(0)
  const [serviceCount, setServiceCount] = useState(0)
  const [paramCount, setParamCount] = useState(0)
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null)
  const [loadData, setLoadData] = useState<LoadData[]>([])

  const fetchCounts = useCallback(() => {
    if (!ros || !connected) return
    const call = (name: string, type: string, cb: (n: number) => void) => {
      new ROSLIB.Service({ ros, name, serviceType: type })
        .callService(new ROSLIB.ServiceRequest({}), (r: any) => {
          const arr = r.nodes || r.topics || r.services || r.names || []
          cb(arr.length)
        })
    }
    call('/rosapi/nodes', 'rosapi/Nodes', setNodeCount)
    call('/rosapi/topics', 'rosapi/Topics', setTopicCount)
    call('/rosapi/services', 'rosapi/Services', setServiceCount)
    call('/rosapi/get_param_names', 'rosapi/GetParamNames', setParamCount)
  }, [ros, connected])

  useEffect(() => {
    if (!connected) return
    fetchCounts()
    // Load trend - sample every 5s
    const interval = setInterval(() => {
      const now = new Date().toLocaleTimeString()
      const load = nodeCount + topicCount + serviceCount
      setLoadData(prev => [...prev.slice(-29), { time: now, load }])
    }, 5000)
    return () => clearInterval(interval)
  }, [connected, nodeCount, topicCount, serviceCount, fetchCounts])

  useEffect(() => {
    if (!ros || !connected) { setBatteryLevel(null); return }
    const batt = new ROSLIB.Topic({ ros, name: '/battery_state', messageType: 'sensor_msgs/BatteryState', throttle_rate: 1000 })
    batt.subscribe((msg: any) => {
      if (msg.percentage !== undefined) setBatteryLevel(Math.round(msg.percentage * 100))
    })
    return () => { batt.unsubscribe() }
  }, [ros, connected])

  const cards = [
    { icon: '📦', label: '节点', value: nodeCount, color: 'blue' },
    { icon: '📡', label: '话题', value: topicCount, color: 'green' },
    { icon: '🔧', label: '服务', value: serviceCount, color: 'purple' },
    { icon: '⚙️', label: '参数', value: paramCount, color: 'orange' },
  ]

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">📊 仪表盘</h1>

      {/* 状态卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {cards.map(c => (
          <div key={c.label} className={`bg-white rounded-lg shadow p-4 border-l-4 border-${c.color}-500`}>
            <div className="text-2xl mb-1">{c.icon}</div>
            <div className="text-sm text-gray-500">{c.label}</div>
            <div className="text-3xl font-bold">{c.value}</div>
          </div>
        ))}
      </div>

      {/* 电池 */}
      {batteryLevel !== null && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="font-semibold mb-2">🔋 电池电量</h3>
          <div className="flex items-center gap-4">
            <div className="text-3xl font-bold">{batteryLevel}%</div>
            <div className="flex-1">
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className={`h-3 rounded-full ${batteryLevel > 50 ? 'bg-green-500' : batteryLevel > 20 ? 'bg-yellow-500' : 'bg-red-500'}`}
                  style={{ width: `${batteryLevel}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 负载趋势 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="font-semibold mb-4">📈 系统负载趋势</h3>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={loadData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" tick={{ fontSize: 10 }} />
            <YAxis />
            <Tooltip />
            <Area type="monotone" dataKey="load" stroke="#3b82f6" fill="#3b82f620" />
          </AreaChart>
        </ResponsiveContainer>
        {loadData.length === 0 && <div className="text-gray-400 text-center py-8">等待数据...</div>}
      </div>
    </div>
  )
}
