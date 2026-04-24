import { useState, useEffect } from 'react'
import { useROS } from '../hooks/useROS'
import ROSLIB from 'roslib'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'

interface Point { position: [number, number, number]; color: [number, number, number] }

function PointCloud({ points, pointSize }: { points: Point[]; pointSize: number }) {
  if (points.length === 0) return null
  const positions = new Float32Array(points.length * 3)
  const colors = new Float32Array(points.length * 3)
  points.forEach((p, i) => {
    positions[i*3] = p.position[0]; positions[i*3+1] = p.position[1]; positions[i*3+2] = p.position[2]
    colors[i*3] = p.color[0]; colors[i*3+1] = p.color[1]; colors[i*3+2] = p.color[2]
  })
  return (
    <points>
      <bufferGeometry attach="geometry">
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial size={pointSize} vertexColors sizeAttenuation />
    </points>
  )
}

export default function PointCloudPage() {
  const { ros, connected } = useROS()
  const [topics, setTopics] = useState<string[]>([])
  const [selectedTopic, setSelectedTopic] = useState('')
  const [points, setPoints] = useState<Point[]>([])
  const [pointSize, setPointSize] = useState(0.05)
  const [pointCount, setPointCount] = useState(0)

  useEffect(() => {
    if (!ros || !connected) return
    new ROSLIB.Service({ ros, name: '/rosapi/topics', serviceType: 'rosapi/Topics' })
      .callService(new ROSLIB.ServiceRequest({}), (r: any) => {
        setTopics((r.topics || []).filter((t: string) => t.includes('point_cloud') || t.includes('cloud') || t.includes('points')))
      })
  }, [ros, connected])

  useEffect(() => {
    if (!selectedTopic || !ros) { setPoints([]); return }
    const topic = new ROSLIB.Topic({ ros, name: selectedTopic, messageType: 'sensor_msgs/PointCloud2', throttle_rate: 200 })
    topic.subscribe((msg: any) => {
      const parsed = parsePointCloud2(msg)
      setPoints(parsed)
      setPointCount(parsed.length)
    })
    return () => topic.unsubscribe()
  }, [selectedTopic, ros])

  function parsePointCloud2(msg: any): Point[] {
    // Simplified PCD2 parsing - ROS→Three.js coordinate conversion (Z-up → Y-up)
    const width = msg.width || 0
    const height = msg.height || 1
    const total = width * height
    if (total === 0 || total > 100000) return [] // limit points

    const result: Point[] = []
    const maxPoints = Math.min(total, 50000)
    const step = Math.max(1, Math.floor(total / maxPoints))

    // For simplicity, try to extract x,y,z from the message
    // Full implementation would parse the binary data according to fields
    if (msg.points && Array.isArray(msg.points)) {
      msg.points.forEach((p: any, i: number) => {
        if (i % step !== 0) return
        const intensity = p.intensity || 0
        const r = p.r ? p.r / 255 : intensity
        const g = p.g ? p.g / 255 : intensity
        const b = p.b ? p.b / 255 : intensity
        result.push({
          position: [-p.y || 0, p.z || 0, p.x || 0], // ROS→Three.js: Z-up to Y-up
          color: [r, g, b]
        })
      })
    }

    return result
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">☁️ 点云 3D</h1>
        <div className="flex gap-4 items-center">
          <select value={selectedTopic} onChange={e => setSelectedTopic(e.target.value)}
            className="px-3 py-2 border rounded text-sm">
            <option value="">选择点云话题...</option>
            {topics.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <div className="text-sm">
            <label>点大小: </label>
            <input type="range" min={0.01} max={0.3} step={0.01} value={pointSize}
              onChange={e => setPointSize(Number(e.target.value))} className="w-24" />
          </div>
          <span className="text-sm text-gray-500">{pointCount.toLocaleString()} 点</span>
        </div>
      </div>

      <div className="bg-gray-900 rounded-lg overflow-hidden" style={{ height: 600 }}>
        {selectedTopic ? (
          <Canvas camera={{ position: [3, 3, 3], fov: 50 }}>
            <ambientLight intensity={0.5} />
            <gridHelper args={[10, 10]} />
            <PointCloud points={points} pointSize={pointSize} />
            <OrbitControls />
          </Canvas>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">选择点云话题</div>
        )}
      </div>
    </div>
  )
}
