import { useState, useEffect, useRef } from 'react'
import { useROS } from '../hooks/useROS'
import ROSLIB from 'roslib'

interface BagFile {
  name: string
  size: string
  duration: string
  messages: number
  topics: number
}

export default function BagPage() {
  const { ros, connected } = useROS()
  const [mode, setMode] = useState<'record' | 'playback' | 'files'>('files')
  const [recording, setRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [selectedTopics, setSelectedTopics] = useState<string[]>([])
  const [availableTopics, setAvailableTopics] = useState<string[]>([])
  const [bags, setBags] = useState<BagFile[]>([])
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [playing, setPlaying] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!ros || !connected) return
    new ROSLIB.Service({ ros, name: '/rosapi/topics', serviceType: 'rosapi/Topics' })
      .callService(new ROSLIB.ServiceRequest({}), (r: any) => {
        setAvailableTopics(r.topics || [])
      })
  }, [ros, connected])

  const toggleTopic = (topic: string) => {
    setSelectedTopics(prev => prev.includes(topic) ? prev.filter(t => t !== topic) : [...prev, topic])
  }

  const startRecording = () => {
    setRecording(true)
    setRecordingTime(0)
    timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000)
    // 实际录制需要后端支持，这里只做 UI
  }

  const stopRecording = () => {
    setRecording(false)
    if (timerRef.current) clearInterval(timerRef.current)
  }

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }

  // Mock bag files for demo
  useEffect(() => {
    setBags([
      { name: 'test_run_2024-04-23.bag', size: '256 MB', duration: '5:32', messages: 125000, topics: 8 },
      { name: 'sensor_data_2024-04-22.bag', size: '1.2 GB', duration: '23:15', messages: 580000, topics: 12 },
      { name: 'calibration_2024-04-20.bag', size: '45 MB', duration: '2:08', messages: 32000, topics: 4 },
    ])
  }, [])

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">📼 Bag 文件管理</h1>

      <div className="flex gap-2 mb-6">
        {(['files', 'record', 'playback'] as const).map(m => (
          <button key={m} onClick={() => setMode(m)}
            className={`px-4 py-2 rounded ${mode === m ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
            {m === 'files' ? '📁 文件列表' : m === 'record' ? '⏺️ 录制' : '▶️ 回放'}
          </button>
        ))}
      </div>

      {mode === 'files' && (
        <div className="bg-white rounded-lg shadow">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left">文件名</th>
                <th className="px-4 py-3">大小</th>
                <th className="px-4 py-3">时长</th>
                <th className="px-4 py-3">消息数</th>
                <th className="px-4 py-3">话题数</th>
              </tr>
            </thead>
            <tbody>
              {bags.map(bag => (
                <tr key={bag.name} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono">{bag.name}</td>
                  <td className="px-4 py-3 text-center">{bag.size}</td>
                  <td className="px-4 py-3 text-center">{bag.duration}</td>
                  <td className="px-4 py-3 text-center">{bag.messages.toLocaleString()}</td>
                  <td className="px-4 py-3 text-center">{bag.topics}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mode === 'record' && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">录制</h2>
            {recording && <span className="text-red-600 font-mono text-xl">{formatTime(recordingTime)}</span>}
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">选择话题</label>
            <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto">
              {availableTopics.map(t => (
                <label key={t} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={selectedTopics.includes(t)} onChange={() => toggleTopic(t)} />
                  <span className="truncate">{t}</span>
                </label>
              ))}
            </div>
          </div>

          <button onClick={recording ? stopRecording : startRecording}
            className={`px-6 py-3 rounded-lg text-white font-semibold ${recording ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}>
            {recording ? '⏹️ 停止录制' : '⏺️ 开始录制'}
          </button>
        </div>
      )}

      {mode === 'playback' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">回放</h2>
          <select className="w-full px-3 py-2 border rounded mb-4">
            <option>选择 Bag 文件...</option>
            {bags.map(b => <option key={b.name}>{b.name}</option>)}
          </select>
          <div className="mb-4">
            <label className="text-sm text-gray-500">速度: {playbackSpeed}x</label>
            <input type="range" min={0.1} max={10} step={0.1} value={playbackSpeed}
              onChange={e => setPlaybackSpeed(Number(e.target.value))} className="w-full" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setPlaying(!playing)}
              className={`px-6 py-2 rounded text-white ${playing ? 'bg-yellow-600' : 'bg-green-600'}`}>
              {playing ? '⏸ 暂停' : '▶ 播放'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
