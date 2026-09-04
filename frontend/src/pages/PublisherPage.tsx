/**
 * rqt_publisher 复刻 — 发布器列表 + 按消息定义的字段编辑器 + 单次/周期发布
 */
import { useState, useEffect, useRef } from 'react'
import ROSLIB from 'roslib'
import { useROS } from '../hooks/useROS'
import MessageFieldEditor from '../components/MessageFieldEditor'
import { buildTypeDefRegistry, resolveFieldTree, defaultMessageObject, type FieldNode } from '../lib/message-def'
import { rosapi, type TopicType } from '../lib/rosapi'

interface PublisherEntry {
  id: number
  topic: string
  type: string
  rate: number // Hz，0 表示不周期发布
  enabled: boolean
  count: number
  tree: FieldNode[]
  msg: Record<string, any>
}

let nextId = 1

export default function PublisherPage() {
  const { ros, connected } = useROS()
  const [publishers, setPublishers] = useState<PublisherEntry[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [topicTypes, setTopicTypes] = useState<TopicType[]>([])
  const [newTopic, setNewTopic] = useState('')
  const [newType, setNewType] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loadingDef, setLoadingDef] = useState(false)
  const roslibPubRef = useRef<Map<number, ROSLIB.Topic>>(new Map())

  const selected = publishers.find(p => p.id === selectedId) || null

  // 刷新话题类型列表（供下拉选择）
  const refreshTopics = async () => {
    if (!ros || !connected) return
    try {
      setTopicTypes(await rosapi.topicTypes(ros))
    } catch { /* 忽略，可手输类型 */ }
  }
  useEffect(() => { if (connected) refreshTopics() }, [connected])

  const updatePub = (id: number, patch: Partial<PublisherEntry>) => {
    setPublishers(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))
  }

  /** 加载消息定义并添加发布器（rqt_publisher 的"添加发布器 + 默认值"行为） */
  const addPublisher = async (topic: string, type: string) => {
    if (!ros || !connected || !topic || !type) return
    setLoadingDef(true)
    setError(null)
    try {
      const typedefs = await rosapi.messageDetails(ros, type)
      if (!typedefs.length) throw new Error(`找不到类型 ${type} 的定义`)
      const tree = resolveFieldTree(typedefs[0].type, buildTypeDefRegistry(typedefs))
      const entry: PublisherEntry = {
        id: nextId++, topic, type, rate: 1, enabled: false, count: 0,
        tree, msg: defaultMessageObject(tree),
      }
      setPublishers(prev => [...prev, entry])
      setSelectedId(entry.id)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoadingDef(false)
    }
  }

  const removePublisher = (id: number) => {
    const rt = roslibPubRef.current.get(id)
    if (rt) { try { rt.unsubscribe() } catch {} ; roslibPubRef.current.delete(id) }
    setPublishers(prev => prev.filter(p => p.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  const publishersRef = useRef<PublisherEntry[]>(publishers)
  useEffect(() => { publishersRef.current = publishers }, [publishers])

  /** 发布一次（rqt_publisher 单次发布按钮） */
  const publishOnce = (id: number) => {
    const pub = publishersRef.current.find(p => p.id === id)
    if (!pub || !ros) return
    let rt = roslibPubRef.current.get(id)
    if (!rt) {
      rt = new ROSLIB.Topic({ ros, name: pub.topic, messageType: pub.type })
      roslibPubRef.current.set(id, rt)
    }
    rt.publish(new ROSLIB.Message(pub.msg))
    updatePub(id, { count: pub.count + 1 })
  }

  // 周期发布定时器：rate>0 且 enabled 的发布器按频率发布
  useEffect(() => {
    const timers: ReturnType<typeof setInterval>[] = []
    publishers.forEach(pub => {
      if (pub.enabled && pub.rate > 0) {
        timers.push(setInterval(() => publishOnce(pub.id), Math.max(1000 / pub.rate, 10)))
      }
    })
    return () => timers.forEach(clearInterval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishers.map(p => `${p.id}:${p.enabled}:${p.rate}`).join(',')])

  const currentType = selected ? topicTypes.find(t => t.name === selected.topic)?.type : undefined

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">📢 消息发布器</h1>
        <button onClick={refreshTopics} disabled={!connected}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400">刷新话题</button>
      </div>

      {/* 添加发布器 */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex gap-2 flex-wrap items-center">
          <input list="pub-topics" value={newTopic} onChange={e => {
            setNewTopic(e.target.value)
            const t = topicTypes.find(x => x.name === e.target.value)
            if (t) setNewType(t.type)
          }} placeholder="话题名，如 /cmd_vel"
            className="w-56 px-3 py-2 border rounded text-sm font-mono" />
          <datalist id="pub-topics">
            {topicTypes.map(t => <option key={t.name} value={t.name}>{t.type}</option>)}
          </datalist>
          <input value={newType} onChange={e => setNewType(e.target.value)}
            placeholder="消息类型，如 geometry_msgs/msg/Twist"
            className="flex-1 min-w-64 px-3 py-2 border rounded text-sm font-mono" />
          <button onClick={() => addPublisher(newTopic.trim(), newType.trim())}
            disabled={!connected || loadingDef || !newTopic.trim() || !newType.trim()}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 text-sm">
            {loadingDef ? '加载定义中...' : '添加发布器'}
          </button>
        </div>
        {error && <div className="text-sm text-red-600 mt-2">{error}</div>}
        {currentType && <div className="text-xs text-gray-400 mt-2">提示：话题 {selected?.topic} 当前类型为 {currentType}</div>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 发布器列表 */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-3 border-b text-sm font-semibold">发布器列表 ({publishers.length})</div>
          <div className="overflow-y-auto max-h-[560px]">
            {publishers.map(pub => (
              <div key={pub.id}
                className={`p-3 border-b cursor-pointer hover:bg-gray-50 ${selectedId === pub.id ? 'bg-blue-50' : ''}`}
                onClick={() => setSelectedId(pub.id)}>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm font-mono truncate">{pub.topic}</span>
                  <button onClick={e => { e.stopPropagation(); removePublisher(pub.id) }}
                    className="text-xs text-red-500 hover:text-red-700">删除</button>
                </div>
                <div className="text-xs text-gray-500 font-mono truncate">{pub.type}</div>
                <div className="text-xs text-gray-400">已发布 {pub.count} 条</div>
              </div>
            ))}
            {publishers.length === 0 && (
              <div className="p-4 text-sm text-gray-400 text-center">还没有发布器，请在上方添加</div>
            )}
          </div>
        </div>

        {/* 编辑器 */}
        <div className="lg:col-span-2">
          {selected ? (
            <div className="bg-white rounded-lg shadow p-4 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="font-semibold font-mono text-sm">{selected.topic} — {selected.type}</h2>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1 text-sm">
                    频率
                    <input type="number" min={0.1} step={0.1} value={selected.rate}
                      onChange={e => updatePub(selected.id, { rate: Number(e.target.value) || 1 })}
                      className="w-20 px-2 py-1 border rounded text-sm" /> Hz
                  </label>
                  <label className="flex items-center gap-1 text-sm">
                    <input type="checkbox" checked={selected.enabled}
                      onChange={e => updatePub(selected.id, { enabled: e.target.checked })} />
                    周期发布
                  </label>
                </div>
              </div>
              <div className="border rounded p-3 max-h-[420px] overflow-auto">
                <MessageFieldEditor tree={selected.tree} value={selected.msg}
                  onChange={v => updatePub(selected.id, { msg: v })} />
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">JSON 预览</div>
                <pre className="bg-gray-50 p-2 rounded text-xs font-mono max-h-40 overflow-auto">{JSON.stringify(selected.msg, null, 2)}</pre>
              </div>
              <button onClick={() => publishOnce(selected.id)}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                单次发布
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow p-8 text-center text-gray-400">
              选择左侧发布器进行编辑
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
