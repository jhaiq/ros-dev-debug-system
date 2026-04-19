import { useState, useEffect } from 'react'
import { useROS } from '../hooks/useROS'
import ROSLIB from 'roslib'

interface RobotStatus {
  batteryLevel?: number
  isConnected: boolean
  rosMasterUri?: string
  nodeCount?: number
  topicCount?: number
  serviceCount?: number
}

export default function StatusPage() {
  const { ros, connected } = useROS()
  const [status, setStatus] = useState<RobotStatus>({ isConnected: false })

  useEffect(() => {
    if (!ros || !connected) {
      setStatus({ isConnected: false })
      return
    }

    // 获取节点数量
    const getNodes = new ROSLIB.Service({
      ros,
      name: '/rosapi/nodes',
      serviceType: 'rosapi/Nodes'
    })

    // 获取话题数量
    const getTopics = new ROSLIB.Service({
      ros,
      name: '/rosapi/topics',
      serviceType: 'rosapi/Topics'
    })

    // 获取服务数量
    const getServices = new ROSLIB.Service({
      ros,
      name: '/rosapi/services',
      serviceType: 'rosapi/Services'
    })

    Promise.all([
      new Promise<number>((resolve) => {
        getNodes.call({}, (result: any) => resolve(result.nodes?.length || 0))
      }),
      new Promise<number>((resolve) => {
        getTopics.call({}, (result: any) => resolve(result.topics?.length || 0))
      }),
      new Promise<number>((resolve) => {
        getServices.call({}, (result: any) => resolve(result.services?.length || 0))
      })
    ]).then(([nodes, topics, services]) => {
      setStatus({
        isConnected: true,
        rosMasterUri: process.env.ROS_MASTER_URI,
        nodeCount: nodes,
        topicCount: topics,
        serviceCount: services
      })
    })

    // 订阅电池状态（如果存在）
    const batteryTopic = new ROSLIB.Topic({
      ros,
      name: '/battery_state',
      messageType: 'sensor_msgs/BatteryState'
    })

    batteryTopic.subscribe((msg: any) => {
      setStatus(prev => ({
        ...prev,
        batteryLevel: msg.percentage ? Math.round(msg.percentage * 100) : undefined
      }))
    })

    return () => {
      batteryTopic.unsubscribe()
    }
  }, [ros, connected])

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">机器人状态</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* 连接状态 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-2">🔌 ROS 连接</h3>
          <div className={`text-2xl ${connected ? 'text-green-600' : 'text-red-600'}`}>
            {connected ? '已连接' : '未连接'}
          </div>
        </div>

        {/* 电池电量 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-2">🔋 电池电量</h3>
          <div className="text-2xl">
            {status.batteryLevel !== undefined ? (
              `${status.batteryLevel}%`
            ) : (
              <span className="text-gray-400">无数据</span>
            )}
          </div>
          {status.batteryLevel !== undefined && (
            <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
              <div 
                className={`h-2 rounded-full ${status.batteryLevel > 50 ? 'bg-green-500' : status.batteryLevel > 20 ? 'bg-yellow-500' : 'bg-red-500'}`}
                style={{ width: `${status.batteryLevel}%` }}
              />
            </div>
          )}
        </div>

        {/* 节点数量 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-2">📦 ROS 节点</h3>
          <div className="text-2xl">{status.nodeCount || 0}</div>
        </div>

        {/* 话题数量 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-2">📡 话题</h3>
          <div className="text-2xl">{status.topicCount || 0}</div>
        </div>

        {/* 服务数量 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-2">🔧 服务</h3>
          <div className="text-2xl">{status.serviceCount || 0}</div>
        </div>

        {/* ROS Master URI */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-2">🌐 ROS Master</h3>
          <div className="text-sm text-gray-600 break-all">
            {status.rosMasterUri || '未设置'}
          </div>
        </div>
      </div>
    </div>
  )
}
