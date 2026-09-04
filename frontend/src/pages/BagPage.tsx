/**
 * rqt_bag 复刻 — Bag 录制/回放管理
 * 对接后端 /api/bags REST API，真实调用 ros2 bag。
 */
import { useState, useEffect, useRef } from 'react'
import { useROS } from '../hooks/useROS'
import ROSLIB from 'roslib'

const API = import.meta.env.VITE_BACKEND_API || 'http://localhost:4000/api'

interface BagFile {
  name: string
  path: string
  size: number
  duration: number
}

interface BagInfo {
  messages: number
  duration: number
  topics: { name: string; type: string; count: number }[]
}

interface Recording {
  id: string
  outputName: string
  topics: string[]
  startedAt: number
  paused: boolean
}

interface Playback {
  id: string
  file: string
  startedAt: number
  paused: boolean
  rate: number
}

function formatBytes(b: number): string {
  if (!b) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  while (b >= 1024 && i < units.length - 1) { b /= 1024; i++ }
  return `${b.toFixed(2)} ${units[i]}`
}

function formatDuration(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
}

export default function BagPage() {
  const { ros, connected } = useROS()
  const [mode, setMode] = useState<'files' | 'record' | 'playback'>('files')
  const [bags, setBags] = useState<BagFile[]>([])
  const [records, setRecords] = useState<Recording[]>([])
  const [plays, setPlays] = useState<Playback[]>([])
  const [availableTopics, setAvailableTopics] = useState<string[]>([])
  const [selectedTopics, setSelectedTopics] = useState<string[]>([])
  const [recordAll, setRecordAll] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [selectedBag, setSelectedBag] = useState('')
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [selectedInfo, setSelectedInfo] = useState<{ name: string; info: BagInfo } | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [error, setError] = useState<string | null>(null)

  const api = async (path: string, opts?: RequestInit) => {
    const res = await fetch(`${API}${path}`, opts)
    if (!res.ok) throw new Error((await res.json()).error || res.statusText)
    return res.json()
  }

  const refresh = async () => {
    try {
      setError(null)
      const [b, r, p] = await Promise.all([api('/bags'), api('/bags/records'), api('/bags/plays')])
      setBags(b)
      setRecords(r)
      setPlays(p)
    } catch (e: any) { setError(e.message) }
  }

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 2000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!ros || !connected) return
    new ROSLIB.Service({ ros, name: '/rosapi/topics', serviceType: 'rosapi/Topics' })
      .callService(new ROSLIB.ServiceRequest({}), (r: any) => setAvailableTopics(r.topics || []))
  }, [ros, connected])

  const activeRecord = records[0]
  const activePlay = plays[0]

  const startRecording = async () => {
    if (activeRecord) return
    try {
      const body: any = { all: recordAll }
      if (!recordAll) body.topics = selectedTopics.length ? selectedTopics : availableTopics
      await api('/bags/record/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      setRecordingTime(0)
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000)
      refresh()
    } catch (e: any) { setError(e.message) }
  }

  const stopRecording = async () => {
    if (!activeRecord) return
    try {
      await api(`/bags/record/${activeRecord.id}/stop`, { method: 'POST' })
      if (timerRef.current) clearInterval(timerRef.current)
      setRecordingTime(0)
      refresh()
    } catch (e: any) { setError(e.message) }
  }

  const togglePauseRecord = async () => {
    if (!activeRecord) return
    const paused = !activeRecord.paused
    await api(`/bags/record/${activeRecord.id}/${paused ? 'pause' : 'resume'}`, { method: 'POST' })
    refresh()
  }

  const startPlayback = async () => {
    if (!selectedBag) return
    try {
      await api('/bags/play/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: selectedBag, rate: playbackSpeed, loop: false })
      })
      refresh()
    } catch (e: any) { setError(e.message) }
  }

  const stopPlayback = async () => {
    if (!activePlay) return
    await api(`/bags/play/${activePlay.id}/stop`, { method: 'POST' })
    refresh()
  }

  const togglePausePlay = async () => {
    if (!activePlay) return
    const paused = !activePlay.paused
    await api(`/bags/play/${activePlay.id}/${paused ? 'pause' : 'resume'}`, { method: 'POST' })
    refresh()
  }

  const loadInfo = async (name: string) => {
    try {
      const info = await api(`/bags/${encodeURIComponent(name)}/info`)
      setSelectedInfo({ name, info })
    } catch (e: any) { setError(e.message) }
  }

  const toggleTopic = (topic: string) => {
    setSelectedTopics(prev => prev.includes(topic) ? prev.filter(t => t !== topic) : [...prev, topic])
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">📼 Bag 文件管理</h1>
      {error && <div className="mb-4 p-3 rounded bg-red-100 text-red-700 text-sm">{error}</div>}

      <div className="flex gap-2 mb-6">
        {(['files', 'record', 'playback'] as const).map(m => (
          <button key={m} onClick={() => setMode(m)}
            className={`px-4 py-2 rounded ${mode === m ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
            {m === 'files' ? '📁 文件列表' : m === 'record' ? '⏺️ 录制' : '▶️ 回放'}
          </button>
        ))}
      </div>

      {mode === 'files' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left">文件名</th>
                <th className="px-4 py-3">大小</th>
                <th className="px-4 py-3">时长</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {bags.map(bag => (
                <tr key={bag.name} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono">{bag.name}</td>
                  <td className="px-4 py-3 text-center">{formatBytes(bag.size)}</td>
                  <td className="px-4 py-3 text-center">{formatDuration(bag.duration)}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => loadInfo(bag.name)} className="text-blue-600 hover:underline text-xs">info</button>
                  </td>
                </tr>
              ))}
              {bags.length === 0 && <tr><td colSpan={4} className="text-center py-8 text-gray-400">暂无 bag 文件</td></tr>}
            </tbody>
          </table>
          {selectedInfo && (
            <div className="p-4 border-t">
              <div className="text-sm font-semibold mb-2">{selectedInfo.name} 信息</div>
              <div className="text-sm text-gray-600">消息数：{selectedInfo.info.messages}，时长：{formatDuration(selectedInfo.info.duration)}，话题数：{selectedInfo.info.topics.length}</div>
              <table className="w-full text-xs mt-2">
                <thead className="bg-gray-50"><tr><th className="px-2 py-1 text-left">话题</th><th className="px-2 py-1 text-left">类型</th><th className="px-2 py-1">数量</th></tr></thead>
                <tbody>
                  {selectedInfo.info.topics.map(t => (
                    <tr key={t.name} className="border-b"><td className="px-2 py-1 font-mono">{t.name}</td><td className="px-2 py-1 font-mono">{t.type}</td><td className="px-2 py-1 text-center">{t.count}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {mode === 'record' && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">录制</h2>
            {activeRecord && <span className="text-red-600 font-mono text-xl">{formatDuration(recordingTime)}</span>}
          </div>
          <label className="flex items-center gap-2 mb-3 text-sm">
            <input type="checkbox" checked={recordAll} onChange={e => setRecordAll(e.target.checked)} />
            录制全部话题
          </label>
          {!recordAll && (
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">选择话题</label>
              <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto border rounded p-2">
                {availableTopics.map(t => (
                  <label key={t} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={selectedTopics.includes(t)} onChange={() => toggleTopic(t)} />
                    <span className="truncate font-mono">{t}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            {activeRecord ? (
              <>
                <button onClick={togglePauseRecord} className="px-6 py-3 rounded-lg text-white font-semibold bg-yellow-600 hover:bg-yellow-700">
                  {activeRecord.paused ? '▶ 继续' : '⏸ 暂停'}
                </button>
                <button onClick={stopRecording} className="px-6 py-3 rounded-lg text-white font-semibold bg-red-600 hover:bg-red-700">⏹ 停止</button>
              </>
            ) : (
              <button onClick={startRecording} className="px-6 py-3 rounded-lg text-white font-semibold bg-green-600 hover:bg-green-700">⏺ 开始录制</button>
            )}
          </div>
          <div className="mt-4 text-sm text-gray-500">活动录制：{records.length} 个</div>
        </div>
      )}

      {mode === 'playback' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">回放</h2>
          <select className="w-full px-3 py-2 border rounded mb-4" value={selectedBag} onChange={e => setSelectedBag(e.target.value)}>
            <option value="">选择 Bag 文件...</option>
            {bags.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
          </select>
          <div className="mb-4">
            <label className="text-sm text-gray-500">速度: {playbackSpeed}x</label>
            <input type="range" min={0.1} max={10} step={0.1} value={playbackSpeed}
              onChange={e => setPlaybackSpeed(Number(e.target.value))} className="w-full" />
          </div>
          <div className="flex gap-2">
            {activePlay ? (
              <>
                <button onClick={togglePausePlay} className="px-6 py-2 rounded text-white bg-yellow-600 hover:bg-yellow-700">
                  {activePlay.paused ? '▶ 继续' : '⏸ 暂停'}
                </button>
                <button onClick={stopPlayback} className="px-6 py-2 rounded text-white bg-red-600 hover:bg-red-700">⏹ 停止</button>
              </>
            ) : (
              <button onClick={startPlayback} disabled={!selectedBag} className="px-6 py-2 rounded text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400">▶ 播放</button>
            )}
          </div>
          <div className="mt-4 text-sm text-gray-500">活动回放：{plays.length} 个</div>
        </div>
      )}
    </div>
  )
}
