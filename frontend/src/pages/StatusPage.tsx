import { useState, useEffect, useCallback } from 'react'
import { useROS } from '../hooks/useROS'
import ROSLIB from 'roslib'

export default function StatusPage() {
  const { ros, connected, url } = useROS()
  const [nodeCount, setNodeCount] = useState(0)
  const [topicCount, setTopicCount] = useState(0)
  const [serviceCount, setServiceCount] = useState(0)
  const [paramCount, setParamCount] = useState(0)
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
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-1">📦 节点</h3>
          <div className="text-2xl font-bold">{nodeCount}</div>
        </div>

        {/* 话题 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-1">📡 话题</h3>
          <div className="text-2xl font-bold">{topicCount}</div>
        </div>

        {/* 服务 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-1">🔧 服务</h3>
          <div className="text-2xl font-bold">{serviceCount}</div>
        </div>

        {/* 参数 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-1">⚙️ 参数</h3>
          <div className="text-2xl font-bold">{paramCount}</div>
        </div>
      </div>
    </div>
  )
}
