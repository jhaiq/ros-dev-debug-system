import { useState, useEffect, useRef, useCallback } from 'react'
import { useROS } from '../hooks/useROS'
import ROSLIB from 'roslib'

export default function ImageViewerPage() {
  const { ros, connected } = useROS()
  const [imageTopics, setImageTopics] = useState<string[]>([])
  const [selectedTopic, setSelectedTopic] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [fps, setFps] = useState(10)
  const [fullscreen, setFullscreen] = useState(false)
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
    setImageUrl(null)
    if (!selectedTopic || !ros) return

    // Try CompressedImage first, fall back to raw Image
    const topic = new ROSLIB.Topic({
      ros, name: selectedTopic,
      messageType: selectedTopic.includes('compressed') ? 'sensor_msgs/CompressedImage' : 'sensor_msgs/Image',
      throttle_rate: Math.round(1000 / fps)
    })

    topic.subscribe((msg: any) => {
      if (msg.format && msg.data) {
        // CompressedImage
        const mime = msg.format.includes('jpeg') ? 'image/jpeg' : msg.format.includes('png') ? 'image/png' : 'image/jpeg'
        setImageUrl(`data:${mime};base64,${msg.data}`)
      } else if (msg.height && msg.width && msg.data) {
        // Raw Image - would need conversion, skip for now
        console.log('Raw image received, use compressed topic for display')
      }
    })
    subscriberRef.current = topic
    return () => { topic.unsubscribe() }
  }, [selectedTopic, fps, ros])

  return (
    <div className={`p-6 ${fullscreen ? 'fixed inset-0 z-50 bg-black p-0' : ''}`}>
      {!fullscreen && (
        <>
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">🖼️ 图像查看器</h1>
          </div>
          <div className="flex gap-4 mb-4">
            <select value={selectedTopic} onChange={e => setSelectedTopic(e.target.value)}
              className="flex-1 px-3 py-2 border rounded">
              <option value="">选择图像话题...</option>
              {imageTopics.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={fps} onChange={e => setFps(Number(e.target.value))}
              className="px-3 py-2 border rounded">
              {[5, 10, 15, 30].map(f => <option key={f} value={f}>{f} FPS</option>)}
            </select>
            {imageUrl && (
              <button onClick={() => setFullscreen(true)} className="px-4 py-2 bg-blue-600 text-white rounded">
                全屏
              </button>
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
