import { useState, useEffect, useRef } from 'react'
import { useROS } from '../hooks/useROS'
import ROSLIB from 'roslib'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface ScanData {
  angle: number
  distance: number
  intensity?: number
}

export default function LaserScanPage() {
  const { ros, connected } = useROS()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [topics, setTopics] = useState<string[]>([])
  const [selectedTopic, setSelectedTopic] = useState('')
  const [scanData, setScanData] = useState<ScanData[]>([])
  const [viewMode, setViewMode] = useState<'polar' | 'chart'>('polar')
  const [stats, setStats] = useState({ min: 0, max: 0, avg: 0, count: 0 })

  useEffect(() => {
    if (!ros || !connected) return
    new ROSLIB.Service({ ros, name: '/rosapi/topics', serviceType: 'rosapi/Topics' })
      .callService(new ROSLIB.ServiceRequest({}), (r: any) => {
        setTopics((r.topics || []).filter((t: string) => t.includes('scan') || t.includes('laser')))
      })
  }, [ros, connected])

  useEffect(() => {
    if (!selectedTopic || !ros) return
    const topic = new ROSLIB.Topic({ ros, name: selectedTopic, messageType: 'sensor_msgs/LaserScan', throttle_rate: 100 })
    topic.subscribe((msg: any) => {
      const ranges = msg.ranges || []
      const intensities = msg.intensities || []
      const angleMin = msg.angle_min || 0
      const angleIncrement = msg.angle_increment || 0.01
      const rangeMax = msg.range_max || 100
      const rangeMin = msg.range_min || 0

      const data: ScanData[] = ranges
        .map((r: number, i: number) => {
          const angle = angleMin + i * angleIncrement
          return { angle: (angle * 180 / Math.PI), distance: (r >= rangeMin && r <= rangeMax && isFinite(r)) ? r : null, intensity: intensities[i] }
        })
        .filter((d: any) => d.distance !== null)

      setScanData(data)
    })
    return () => topic.unsubscribe()
  }, [selectedTopic, ros])

  useEffect(() => {
    if (scanData.length === 0 || viewMode !== 'polar' || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')!
    const w = canvas.width, h = canvas.height
    const cx = w / 2, cy = h * 0.85
    const maxRadius = Math.min(w, h) * 0.7

    ctx.clearRect(0, 0, w, h)

    // Grid circles
    for (let i = 1; i <= 5; i++) {
      const r = (maxRadius / 5) * i
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.strokeStyle = '#e5e7eb'
      ctx.stroke()
    }

    // Angle lines
    for (let angle = -180; angle <= 180; angle += 30) {
      const rad = (angle - 90) * Math.PI / 180
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + Math.cos(rad) * maxRadius, cy + Math.sin(rad) * maxRadius)
      ctx.strokeStyle = '#e5e7eb'
      ctx.stroke()
    }

    // Draw scan data
    const maxDist = stats.max || 10
    scanData.forEach(d => {
      const rad = (d.angle - 90) * Math.PI / 180
      const r = (d.distance / maxDist) * maxRadius
      const x = cx + Math.cos(rad) * r
      const y = cy + Math.sin(rad) * r
      const ratio = Math.min(d.distance / maxDist, 1)
      const red = Math.round(255 * (1 - ratio))
      const blue = Math.round(255 * ratio)
      ctx.beginPath()
      ctx.arc(x, y, 1.5, 0, Math.PI * 2)
      ctx.fillStyle = `rgb(${red}, 50, ${blue})`
      ctx.fill()
    })

    // Robot center
    ctx.beginPath()
    ctx.arc(cx, cy, 5, 0, Math.PI * 2)
    ctx.fillStyle = '#3b82f6'
    ctx.fill()
  }, [scanData, viewMode, stats])

  useEffect(() => {
    if (scanData.length > 0) {
      const distances = scanData.map(d => d.distance)
      setStats({
        min: Math.min(...distances),
        max: Math.max(...distances),
        avg: distances.reduce((a, b) => a + b, 0) / distances.length,
        count: distances.length
      })
    }
  }, [scanData])

  const chartData = scanData.map(d => ({ angle: d.angle.toFixed(0), distance: d.distance }))

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">📡 激光雷达</h1>
        <div className="flex gap-2 items-center">
          <select value={selectedTopic} onChange={e => setSelectedTopic(e.target.value)} className="px-3 py-2 border rounded text-sm">
            <option value="">选择话题...</option>
            {topics.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <div className="flex gap-1">
            <button onClick={() => setViewMode('polar')} className={`px-3 py-1 rounded text-sm ${viewMode === 'polar' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>极坐标</button>
            <button onClick={() => setViewMode('chart')} className={`px-3 py-1 rounded text-sm ${viewMode === 'chart' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>折线图</button>
          </div>
        </div>
      </div>

      {stats.count > 0 && (
        <div className="grid grid-cols-4 gap-4 mb-4">
          <div className="bg-white rounded shadow p-3 text-center"><div className="text-sm text-gray-500">点数</div><div className="text-xl font-bold">{stats.count}</div></div>
          <div className="bg-white rounded shadow p-3 text-center"><div className="text-sm text-gray-500">最小距离</div><div className="text-xl font-bold">{stats.min.toFixed(2)}m</div></div>
          <div className="bg-white rounded shadow p-3 text-center"><div className="text-sm text-gray-500">最大距离</div><div className="text-xl font-bold">{stats.max.toFixed(2)}m</div></div>
          <div className="bg-white rounded shadow p-3 text-center"><div className="text-sm text-gray-500">平均距离</div><div className="text-xl font-bold">{stats.avg.toFixed(2)}m</div></div>
        </div>
      )}

      {viewMode === 'polar' ? (
        <div className="bg-white rounded-lg shadow p-4">
          <canvas ref={canvasRef} width={700} height={500} className="w-full" />
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow p-4">
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="angle" label={{ value: '角度 (°)', position: 'insideBottom', offset: -5 }} />
              <YAxis label={{ value: '距离 (m)', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Line type="monotone" dataKey="distance" stroke="#3b82f6" dot={false} strokeWidth={1} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
