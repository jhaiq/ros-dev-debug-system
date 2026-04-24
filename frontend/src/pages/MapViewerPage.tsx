import { useState, useEffect, useRef } from 'react'
import { useROS } from '../hooks/useROS'
import ROSLIB from 'roslib'

interface PathPoint { x: number; y: number }

export default function MapViewerPage() {
  const { ros, connected } = useROS()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [mapData, setMapData] = useState<number[] | null>(null)
  const [mapInfo, setMapInfo] = useState<{ width: number; height: number; resolution: number; origin: [number, number] } | null>(null)
  const [path, setPath] = useState<PathPoint[]>([])
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const isDragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })

  useEffect(() => {
    if (!ros || !connected) return

    const mapTopic = new ROSLIB.Topic({ ros, name: '/map', messageType: 'nav_msgs/OccupancyGrid', throttle_rate: 1000 })
    const pathTopic = new ROSLIB.Topic({ ros, name: '/path', messageType: 'nav_msgs/Path', throttle_rate: 200 })

    mapTopic.subscribe((msg: any) => {
      setMapData(msg.data)
      setMapInfo({
        width: msg.info.width,
        height: msg.info.height,
        resolution: msg.info.resolution,
        origin: [msg.info.origin.position.x, msg.info.origin.position.y]
      })
    })

    pathTopic.subscribe((msg: any) => {
      setPath(msg.poses?.map((p: any) => ({ x: p.pose.position.x, y: p.pose.position.y })) || [])
    })

    return () => { mapTopic.unsubscribe(); pathTopic.unsubscribe() }
  }, [ros, connected])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !mapData || !mapInfo) return
    const ctx = canvas.getContext('2d')!
    const { width, height } = mapInfo

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.save()
    ctx.translate(offset.x, offset.y)
    ctx.scale(scale, scale)

    // Draw map
    const imgData = ctx.createImageData(width, height)
    for (let i = 0; i < mapData.length; i++) {
      const val = mapData[i]
      const idx = i * 4
      if (val === -1) {
        imgData.data[idx] = 169; imgData.data[idx+1] = 169; imgData.data[idx+2] = 169; imgData.data[idx+3] = 255
      } else if (val === 0) {
        imgData.data[idx] = 255; imgData.data[idx+1] = 255; imgData.data[idx+2] = 255; imgData.data[idx+3] = 255
      } else {
        const occ = val / 100
        imgData.data[idx] = 0; imgData.data[idx+1] = Math.round(255 * (1 - occ)); imgData.data[idx+2] = 0; imgData.data[idx+3] = 255
      }
    }
    ctx.putImageData(imgData, 0, 0)

    // Draw path
    if (path.length > 1) {
      ctx.beginPath()
      ctx.strokeStyle = '#3b82f6'
      ctx.lineWidth = 2 / scale
      path.forEach((p, i) => {
        const px = (p.x - mapInfo.origin[0]) / mapInfo.resolution
        const py = height - (p.y - mapInfo.origin[1]) / mapInfo.resolution
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
      })
      ctx.stroke()
    }

    ctx.restore()
  }, [mapData, mapInfo, path, scale, offset])

  const handleMouseDown = (e: React.MouseEvent) => { isDragging.current = true; dragStart.current = { x: e.clientX - offset.x, y: e.clientY - offset.y } }
  const handleMouseMove = (e: React.MouseEvent) => { if (isDragging.current) setOffset({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y }) }
  const handleMouseUp = () => { isDragging.current = false }
  const handleWheel = (e: React.WheelEvent) => { e.preventDefault(); setScale(s => Math.max(0.1, Math.min(10, s * (e.deltaY > 0 ? 0.9 : 1.1)))) }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">🗺️ 地图可视化</h1>
        {mapInfo && <span className="text-sm text-gray-500">分辨率: {mapInfo.resolution}m/px | {mapInfo.width}x{mapInfo.height}</span>}
      </div>
      <div className="bg-gray-100 rounded-lg overflow-hidden">
        <canvas ref={canvasRef} width={800} height={600}
          className="w-full cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
          onWheel={handleWheel} />
      </div>
      <div className="mt-2 text-sm text-gray-500">滚轮缩放 · 拖拽平移</div>
    </div>
  )
}
