/**
 * 工作台紧凑面板 — 图像话题
 */
import { useState, useEffect, useRef } from 'react'
import { useROS } from '../../hooks/useROS'
import ROSLIB from 'roslib'

export default function ImagePanel() {
  const { ros, connected } = useROS()
  const [topics, setTopics] = useState<string[]>([])
  const [selected, setSelected] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [fps, setFps] = useState(10)
  const subRef = useRef<ROSLIB.Topic | null>(null)

  useEffect(() => {
    if (!ros || !connected) return
    new ROSLIB.Service({ ros, name: '/rosapi/topics', serviceType: 'rosapi/Topics' })
      .callService(new ROSLIB.ServiceRequest({}), (r: any) => {
        setTopics((r.topics || []).filter((t: string) => t.includes('/image') || t.includes('/camera') || t.includes('/compressed')))
      })
  }, [ros, connected])

  useEffect(() => {
    if (subRef.current) { subRef.current.unsubscribe(); subRef.current = null }
    setImageUrl(null)
    if (!selected || !ros) return
    const sub = new ROSLIB.Topic({
      ros, name: selected,
      messageType: selected.includes('compressed') ? 'sensor_msgs/CompressedImage' : 'sensor_msgs/Image',
      throttle_rate: Math.round(1000 / fps),
    })
    sub.subscribe((msg: any) => {
      if (msg.format && msg.data) {
        const mime = msg.format.includes('png') ? 'image/png' : 'image/jpeg'
        setImageUrl(`data:${mime};base64,${msg.data}`)
      }
    })
    subRef.current = sub
    return () => { sub.unsubscribe() }
  }, [selected, fps, ros])

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-1 px-2 pt-2 pb-1 border-b items-center">
        <select value={selected} onChange={e => setSelected(e.target.value)} className="flex-1 px-2 py-0.5 border rounded text-xs">
          <option value="">选择话题…</option>
          {topics.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={fps} onChange={e => setFps(Number(e.target.value))} className="px-1 py-0.5 border rounded text-xs">
          {[5, 10, 15, 30].map(f => <option key={f} value={f}>{f}fps</option>)}
        </select>
        {imageUrl && (
          <button onClick={() => { const a = document.createElement('a'); a.href = imageUrl; a.download = `snapshot-${iso()}.png`; a.click() }}
            className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded">快照</button>
        )}
      </div>
      <div className="flex-1 bg-gray-900 flex items-center justify-center min-h-0 overflow-hidden">
        {imageUrl ? <img src={imageUrl} className="max-w-full max-h-full object-contain" /> : <span className="text-gray-500 text-xs">无图像</span>}
      </div>
    </div>
  )
}

function iso() { return new Date().toISOString().slice(0, 19) }
