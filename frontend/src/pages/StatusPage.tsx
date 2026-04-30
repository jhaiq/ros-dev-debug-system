import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useROS } from '../hooks/useROS'
import ROSLIB from 'roslib'

export default function StatusPage() {
  const { ros, connected, url, cache } = useROS()
  const [nodeCount, setNodeCount] = useState(cache.nodes.length || 0)
  const [topicCount, setTopicCount] = useState(cache.topics.length || 0)
  const [serviceCount, setServiceCount] = useState(cache.services.length || 0)
  const [paramCount, setParamCount] = useState(cache.params.length || 0)
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null)

  const fetchSystemInfo = useCallback(() => {
    if (!ros || !connected) return
    const callCount = (name: string, type: string, cb: (n: number) => void) => {
      const svc = new ROSLIB.Service({ ros, name, serviceType: type })
      svc.callService(new ROSLIB.ServiceRequest({}), (r: any) => {
        const arr = r.nodes || r.topics || r.services || r.names || []
        cb(arr.length)
      })
    }
    callCount('/rosapi/nodes', 'rosapi/Nodes', setNodeCount)
    callCount('/rosapi/topics', 'rosapi/Topics', setTopicCount)
    callCount('/rosapi/services', 'rosapi/Services', setServiceCount)
    callCount('/rosapi/get_param_names', 'rosapi/GetParamNames', setParamCount)
  }, [ros, connected])

  useEffect(() => {
    if (connected) fetchSystemInfo()
  }, [connected, fetchSystemInfo])

  // 从缓存同步计数（跨路由共享数据）
  useEffect(() => {
    if (cache.nodesFetchedAt) setNodeCount(cache.nodes.length)
    if (cache.topicsFetchedAt) setTopicCount(cache.topics.length)
    if (cache.servicesFetchedAt) setServiceCount(cache.services.length)
    if (cache.paramsFetchedAt) setParamCount(cache.params.length)
  }, [cache])

  useEffect(() => {
    if (!ros || !connected) { setBatteryLevel(null); return }
    const batteryTopic = new ROSLIB.Topic({ ros, name: '/battery_state', messageType: 'sensor_msgs/BatteryState', throttle_rate: 1000 })
    batteryTopic.subscribe((msg: any) => {
      if (msg.percentage !== undefined) setBatteryLevel(Math.round(msg.percentage * 100))
    })
    return () => { batteryTopic.unsubscribe() }
  }, [ros, connected])

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">🤖 机器人状态</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* 连接状态 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-1">🔌 ROS 连接</h3>
          <div className={`text-2xl font-bold ${connected ? 'text-green-600' : 'text-red-600'}`}>
            {connected ? '已连接' : '未连接'}
          </div>
          {connected && <div className="text-xs text-gray-400 mt-1 truncate">{url}</div>}
        </div>

        {/* 电池电量 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-1">🔋 电池</h3>
          {batteryLevel !== null ? (
            <>
              <div className="text-2xl font-bold">{batteryLevel}%</div>
              <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                <div className={`h-2 rounded-full transition-all ${batteryLevel > 50 ? 'bg-green-500' : batteryLevel > 20 ? 'bg-yellow-500' : 'bg-red-500'}`}
                  style={{ width: `${batteryLevel}%` }} />
              </div>
            </>
          ) : <div className="text-gray-400">无数据</div>}
        </div>

        {/* 节点 */}
        <Link to="/nodes" className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow cursor-pointer">
          <h3 className="text-sm font-medium text-gray-500 mb-1">📦 节点</h3>
          <div className="text-2xl font-bold">{nodeCount}</div>
          {cache.nodes.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {cache.nodes.slice(0, 4).map(n => (
                <div key={n.name} className="text-xs text-gray-400 truncate">{n.name}</div>
              ))}
              {cache.nodes.length > 4 && <div className="text-xs text-blue-500">+{cache.nodes.length - 4} more</div>}
            </div>
          )}
        </Link>

        {/* 话题 */}
        <Link to="/topics" className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow cursor-pointer">
          <h3 className="text-sm font-medium text-gray-500 mb-1">📡 话题</h3>
          <div className="text-2xl font-bold">{topicCount}</div>
          {cache.topics.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {cache.topics.slice(0, 4).map(t => (
                <div key={t.name} className="text-xs text-gray-400 truncate">{t.name}</div>
              ))}
              {cache.topics.length > 4 && <div className="text-xs text-blue-500">+{cache.topics.length - 4} more</div>}
            </div>
          )}
        </Link>

        {/* 服务 */}
        <Link to="/services" className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow cursor-pointer">
          <h3 className="text-sm font-medium text-gray-500 mb-1">🔧 服务</h3>
          <div className="text-2xl font-bold">{serviceCount}</div>
        </Link>

        {/* 参数 */}
        <Link to="/params" className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow cursor-pointer">
          <h3 className="text-sm font-medium text-gray-500 mb-1">⚙️ 参数</h3>
          <div className="text-2xl font-bold">{paramCount}</div>
        </Link>
      </div>
    </div>
  )
}
