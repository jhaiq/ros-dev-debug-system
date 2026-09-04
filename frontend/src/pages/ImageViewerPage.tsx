/**
 * rqt_image_view 复刻增强 — 图像话题查看器
 * 支持：sensor_msgs/Image 与 CompressedImage、FPS 节流、暂停、全屏、快照保存。
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { useROS } from '../hooks/useROS'
import ROSLIB from 'roslib'

interface FrameInfo {
  width?: number
  height?: number
  encoding?: string
  format?: string
  stamp?: { sec: number; nanosec: number }
}

export default function ImageViewerPage() {
  const { ros, connected } = useROS()
  const [imageTopics, setImageTopics] = useState<string[]>([])
  const [selectedTopic, setSelectedTopic] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [fps, setFps] = useState(10)
  const [fullscreen, setFullscreen] = useState(false)
  const [paused, setPaused] = useState(false)
  const [info, setInfo] = useState<FrameInfo>({})
  const subscriberRef = useRef<ROSLIB.Topic | null>(null)

  const fetchTopics = useCallback(() => {
    if (!ros || !connected) return
    new ROSLIB.Service({ ros, name: '/rosapi/topics', serviceType: 'rosapi/Topics' })
      .callService(new ROSLIB.ServiceRequest({}), (r: any) => {
        const allTopics: string[] = r.topics || []
        setImageTopics(allTopics.filter(t =>
          t.includes('/image') || t.includes('/camera') || t.includes('/rgb') || t.includes('/compressed')
        ))
      })
  }, [ros, connected])

  useEffect(() => { if (connected) fetchTopics() }, [connected, fetchTopics])

  useEffect(() => {
    if (subscriberRef.current) { subscriberRef.current.unsubscribe(); subscriberRef.current = null }
    setImageUrl(null); setInfo({})
    if (!selectedTopic || !ros) return

    const topic = new ROSLIB.Topic({
      ros, name: selectedTopic,
      messageType: selectedTopic.includes('compressed') ? 'sensor_msgs/CompressedImage' : 'sensor_msgs/Image',
      throttle_rate: Math.round(1000 / fps)
    })

    topic.subscribe((msg: any) => {
      if (paused) return
      if (msg.format && msg.data) {
        const mime = msg.format.includes('jpeg') ? 'image/jpeg' : msg.format.includes('png') ? 'image/png' : 'image/jpeg'
        setImageUrl(`data:${mime};base64,${msg.data}`)
        setInfo({ format: msg.format, stamp: msg.header?.stamp })
      } else if (msg.height && msg.width && msg.data) {
        // Raw Image：rosbridge 发送的 data 是 base64，但像素格式转 canvas 较复杂。
        // 这里尝试按 RGB8/RGBA8/BGR8 渲染；其它编码仅记录元信息。
        try {
          const buffer = typeof msg.data === 'string' ? base64ToBytes(msg.data) : new Uint8Array(msg.data)
          const canvas = document.createElement('canvas')
          canvas.width = msg.width; canvas.height = msg.height
          const ctx = canvas.getContext('2d')!
          const imgData = ctx.createImageData(msg.width, msg.height)
          const step = msg.step || msg.width * 3
          for (let y = 0; y < msg.height; y++) {
            for (let x = 0; x < msg.width; x++) {
              const src = y * step + x * (msg.encoding?.includes('rgba') ? 4 : 3)
              const dst = (y * msg.width + x) * 4
              if (msg.encoding?.includes('bgr')) {
                imgData.data[dst] = buffer[src + 2] ?? 0
                imgData.data[dst + 1] = buffer[src + 1] ?? 0
                imgData.data[dst + 2] = buffer[src] ?? 0
              } else if (msg.encoding?.includes('rgba')) {
                imgData.data[dst] = buffer[src]
                imgData.data[dst + 1] = buffer[src + 1]
                imgData.data[dst + 2] = buffer[src + 2]
              } else {
                // rgb8 default
                imgData.data[dst] = buffer[src] ?? 0
                imgData.data[dst + 1] = buffer[src + 1] ?? 0
                imgData.data[dst + 2] = buffer[src + 2] ?? 0
              }
              imgData.data[dst + 3] = 255
            }
          }
          ctx.putImageData(imgData, 0, 0)
          setImageUrl(canvas.toDataURL('image/png'))
        } catch (e) {
          console.warn('Raw image render skipped:', e)
        }
        setInfo({ width: msg.width, height: msg.height, encoding: msg.encoding, stamp: msg.header?.stamp })
      }
    })
    subscriberRef.current = topic
    return () => { topic.unsubscribe() }
  }, [selectedTopic, fps, ros, paused])

  const takeSnapshot = () => {
    if (!imageUrl) return
    const a = document.createElement('a')
    a.href = imageUrl
    a.download = `snapshot-${selectedTopic.replace(/\//g, '_')}-${iso()}.png`
    a.click()
  }

  return (
    <div className={`p-6 ${fullscreen ? 'fixed inset-0 z-50 bg-black p-0' : ''}`}>
      {!fullscreen && (
        <>
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">🖼️ 图像查看器</h1>
            <div className="text-sm text-gray-500">
              {info.width && info.height ? `${info.width}x${info.height} ${info.encoding || ''}` : info.format || ''}
              {info.stamp && <span className="ml-2">{info.stamp.sec}.{String(info.stamp.nanosec).padStart(9, '0')}</span>}
            </div>
          </div>
          <div className="flex gap-4 mb-4 flex-wrap">
            <select value={selectedTopic} onChange={e => setSelectedTopic(e.target.value)} className="flex-1 min-w-48 px-3 py-2 border rounded">
              <option value="">选择图像话题...</option>
              {imageTopics.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={fps} onChange={e => setFps(Number(e.target.value))} className="px-3 py-2 border rounded">
              {[5, 10, 15, 30].map(f => <option key={f} value={f}>{f} FPS</option>)}
            </select>
            <label className="flex items-center gap-1 px-3 py-2 border rounded bg-white text-sm cursor-pointer">
              <input type="checkbox" checked={paused} onChange={e => setPaused(e.target.checked)} />
              暂停
            </label>
            {imageUrl && (
              <>
                <button onClick={takeSnapshot} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">快照</button>
                <button onClick={() => setFullscreen(true)} className="px-4 py-2 bg-blue-600 text-white rounded">全屏</button>
              </>
            )}
          </div>
        </>
      )}

      {fullscreen && (
        <button onClick={() => setFullscreen(false)} className="fixed top-4 right-4 z-50 px-3 py-1 bg-black/50 text-white rounded">
          ✕ 退出
        </button>
      )}

      <div className={`${fullscreen ? '' : 'bg-gray-900 rounded-lg'} flex items-center justify-center overflow-hidden`}
        style={{ minHeight: fullscreen ? '100vh' : 480 }}>
        {imageUrl ? (
          <img src={imageUrl} alt="ROS Camera" className={`${fullscreen ? 'w-full h-full object-contain' : 'max-w-full'}`} />
        ) : (
          <div className="text-gray-500">
            {selectedTopic ? '等待图像数据...' : '选择一个图像话题'}
          </div>
        )}
      </div>
    </div>
  )
}

function base64ToBytes(base64: string): Uint8Array {
  const bin = atob(base64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
function iso() { return new Date().toISOString().slice(0, 19) }
