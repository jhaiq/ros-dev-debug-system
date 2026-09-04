/**
 * rqt_topic 复刻增强 — 话题列表 + Hz/带宽列 + 字段树 + 发布
 * 对当前可见话题做滚动窗口测频；带宽以 JSON 序列化长度近似（rosbridge 无法拿到 DDS 线缆字节）。
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useROS } from '../hooks/useROS'
import ROSLIB from 'roslib'
import { buildTypeDefRegistry, resolveFieldTree, type FieldNode } from '../lib/message-def'
import { rosapi } from '../lib/rosapi'

interface TopicInfo {
  name: string
  type: string
}

interface TopicStats {
  hz: number
  bandwidth: number
  lastTs: number
  samples: { count: number; bytes: number }[]
}

const WINDOW_MS = 1000
const MAX_SUBS = 50

function formatBytes(b: number): string {
  if (b === 0) return '0 B/s'
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s']
  let i = 0
  let v = b
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(2)} ${units[i]}`
}

export default function TopicsPage() {
  const { ros, connected, cache, setCache } = useROS()
  const [topics, setTopics] = useState<TopicInfo[]>(() => cache.topics.length > 0 ? cache.topics : [])
  const [search, setSearch] = useState('')
  const [selectedTopic, setSelectedTopic] = useState<TopicInfo | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [publishText, setPublishText] = useState('')
  const [subscriber, setSubscriber] = useState<ROSLIB.Topic | null>(null)
  const [stats, setStats] = useState<Map<string, TopicStats>>(new Map())
  const [fieldTree, setFieldTree] = useState<FieldNode[]>([])
  const [fieldValues, setFieldValues] = useState<Map<string, any>>(new Map())
  const [fieldHz, setFieldHz] = useState<Map<string, number>>(new Map())
  const activeSubs = useRef<Map<string, ROSLIB.Topic>>(new Map())
  const publishTopicRef = useRef<Map<string, ROSLIB.Topic>>(new Map())
  const fieldChangesRef = useRef<Map<string, number[]>>(new Map())
  const prevFieldValuesRef = useRef<Map<string, any>>(new Map())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchTopics = useCallback(async () => {
    if (!ros || !connected) return
    const info: TopicInfo[] = await rosapi.topicTypes(ros)
    setTopics(info)
    setCache(prev => ({ ...prev, topics: info.slice(0, 200), topicsFetchedAt: Date.now() }))
  }, [ros, connected, setCache])

  const filtered = useMemo(() => topics.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.type.toLowerCase().includes(search.toLowerCase())
  ), [topics, search])

  // 对可见话题批量订阅测频
  useEffect(() => {
    if (!ros || !connected) {
      activeSubs.current.forEach(s => { try { s.unsubscribe() } catch {} })
      activeSubs.current.clear()
      return
    }
    const toWatch = filtered.slice(0, MAX_SUBS)
    const current = new Set(activeSubs.current.keys())
    const needed = new Set(toWatch.map(t => t.name))

    current.forEach(name => {
      if (!needed.has(name)) {
        activeSubs.current.get(name)?.unsubscribe()
        activeSubs.current.delete(name)
      }
    })

    toWatch.forEach(t => {
      if (activeSubs.current.has(t.name)) return
      const sub = new ROSLIB.Topic({ ros, name: t.name, messageType: t.type, throttle_rate: 100 })
      sub.subscribe((msg: any) => {
        const bytes = JSON.stringify(msg).length
        setStats(prev => {
          const s = prev.get(t.name)
          const now = Date.now()
          const samples = s ? s.samples.filter(x => now - x.count <= WINDOW_MS) : []
          samples.push({ count: now, bytes })
          const dt = samples.length > 1 ? (samples[samples.length - 1].count - samples[0].count) / 1000 : 1
          const count = samples.length
          const totalBytes = samples.reduce((a, x) => a + x.bytes, 0)
          const hz = count / Math.max(dt, 0.001)
          const bandwidth = totalBytes / Math.max(dt, 0.001)
          const next = new Map(prev)
          next.set(t.name, { hz, bandwidth, lastTs: now, samples })
          return next
        })
      })
      activeSubs.current.set(t.name, sub)
    })

    // 窗口清理定时器
    intervalRef.current = setInterval(() => {
      const now = Date.now()
      setStats(prev => {
        let changed = false
        const next = new Map(prev)
        prev.forEach((s, name) => {
          const samples = s.samples.filter(x => now - x.count <= WINDOW_MS)
          if (samples.length !== s.samples.length) {
            changed = true
            const dt = samples.length > 1 ? (samples[samples.length - 1].count - samples[0].count) / 1000 : 1
            const count = samples.length
            const totalBytes = samples.reduce((a, x) => a + x.bytes, 0)
            next.set(name, {
              hz: count / Math.max(dt, 0.001),
              bandwidth: totalBytes / Math.max(dt, 0.001),
              lastTs: now,
              samples,
            })
          }
        })
        return changed ? next : prev
      })
    }, 500)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      activeSubs.current.forEach(s => { try { s.unsubscribe() } catch {} })
      activeSubs.current.clear()
    }
  }, [ros, connected, filtered.map(t => t.name).join('\n')])

  const subscribe = useCallback((topic: TopicInfo) => {
    if (subscriber) { subscriber.unsubscribe(); setSubscriber(null) }
    setMessages([])
    const sub = new ROSLIB.Topic({ ros: ros!, name: topic.name, messageType: topic.type, throttle_rate: 100 })
    sub.subscribe((msg: any) => setMessages(prev => [msg, ...prev].slice(0, 100)))
    setSubscriber(sub)
  }, [ros, subscriber])

  const unsubscribe = useCallback(() => {
    if (subscriber) { subscriber.unsubscribe(); setSubscriber(null) }
  }, [subscriber])

  const loadFieldTree = async (topic: TopicInfo) => {
    if (!ros || !connected || !topic.type || topic.type === 'unknown') return
    try {
      const typedefs = await rosapi.messageDetails(ros, topic.type)
      if (!typedefs.length) { setFieldTree([]); return }
      const tree = resolveFieldTree(typedefs[0].type, buildTypeDefRegistry(typedefs))
      setFieldTree(tree)
      updateFieldValues(tree, null)
    } catch { setFieldTree([]) }
  }

  const updateFieldValues = (tree: FieldNode[], msg: any | null, prefix = '') => {
    const values = new Map<string, any>()
    const walk = (nodes: FieldNode[], parent: any, pre: string) => {
      nodes.forEach(n => {
        const val = parent ? parent[n.name] : null
        const path = pre ? `${pre}/${n.name}` : n.name
        if (!n.isBuiltin && n.children.length > 0) {
          walk(n.children, val || {}, path)
        } else {
          values.set(path, val)
        }
      })
    }
    walk(tree, msg, prefix)

    // 每字段 Hz：值发生变化即计数（1s 滚动窗口，rqt_topic 行为）
    if (msg === null) {
      fieldChangesRef.current.clear()
      prevFieldValuesRef.current.clear()
    } else {
      const now = Date.now()
      values.forEach((val, path) => {
        const prev = prevFieldValuesRef.current.get(path)
        if (JSON.stringify(prev) !== JSON.stringify(val)) {
          const arr = (fieldChangesRef.current.get(path) || []).filter(ts => now - ts < 1000)
          arr.push(now)
          fieldChangesRef.current.set(path, arr)
        }
        prevFieldValuesRef.current.set(path, val)
      })
      const hz = new Map<string, number>()
      fieldChangesRef.current.forEach((arr, path) => {
        if (arr.length >= 2) {
          const dt = (arr[arr.length - 1] - arr[0]) / 1000
          hz.set(path, dt > 0 ? (arr.length - 1) / dt : 0)
        }
      })
      setFieldHz(hz)
    }
    setFieldValues(values)
  }

  const selectTopic = (topic: TopicInfo) => {
    setSelectedTopic(topic)
    subscribe(topic)
    loadFieldTree(topic)
  }

  // 当实时消息到达时，更新字段值
  useEffect(() => {
    if (messages.length > 0 && fieldTree.length > 0) {
      updateFieldValues(fieldTree, messages[0])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages[0], fieldTree])

  const publish = useCallback(() => {
    if (!selectedTopic || !ros) return
    try {
      const data = JSON.parse(publishText)
      let pub = publishTopicRef.current.get(selectedTopic.name)
      if (!pub) {
        pub = new ROSLIB.Topic({ ros, name: selectedTopic.name, messageType: selectedTopic.type })
        publishTopicRef.current.set(selectedTopic.name, pub)
      }
      pub.publish(new ROSLIB.Message(data))
      setPublishText('')
    } catch (e: any) { alert('JSON 格式错误：' + e.message) }
  }, [ros, selectedTopic, publishText])

  useEffect(() => {
    if (connected) fetchTopics()
    return () => {
      if (subscriber) subscriber.unsubscribe()
      publishTopicRef.current.forEach(t => { try { t.unsubscribe() } catch {} })
      publishTopicRef.current.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, fetchTopics])

  const renderTree = (nodes: FieldNode[], depth = 0): JSX.Element => (
    <div className={depth > 0 ? 'ml-4 border-l pl-2' : ''}>
      {nodes.map(n => (
        <div key={n.path} className="py-0.5">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-mono">{n.name}</span>
            <span className="text-xs text-gray-400">{n.type}{n.isArray ? '[]' : ''}</span>
            {n.isBuiltin && (
              <>
                <span className="text-xs font-mono text-blue-600 truncate max-w-[200px]">
                  {JSON.stringify(fieldValues.get(n.path)) ?? '-'}
                </span>
                <span className="text-xs font-mono text-purple-600 w-14 text-right shrink-0">
                  {fieldHz.get(n.path)?.toFixed(1) ?? '—'} Hz
                </span>
              </>
            )}
          </div>
          {n.children.length > 0 && <div className="mt-0.5">{renderTree(n.children, depth + 1)}</div>}
        </div>
      ))}
    </div>
  )

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">📡 话题监控</h1>
        <button onClick={fetchTopics} disabled={!connected} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400">刷新</button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索话题..." className="w-full px-3 py-2 border rounded text-sm" />
            <div className="text-xs text-gray-400 mt-1">显示 {filtered.length}/{topics.length}，最多订阅 {MAX_SUBS} 个用于测频</div>
          </div>
          <div className="overflow-y-auto max-h-[600px]">
            {filtered.map(topic => {
              const s = stats.get(topic.name)
              return (
                <div key={topic.name}
                  className={`p-3 border-b cursor-pointer hover:bg-gray-50 ${selectedTopic?.name === topic.name ? 'bg-blue-50' : ''}`}
                  onClick={() => selectTopic(topic)}>
                  <div className="font-medium text-sm truncate">{topic.name}</div>
                  <div className="text-xs text-gray-500 truncate">{topic.type}</div>
                  <div className="flex gap-3 text-xs mt-1">
                    <span className="text-blue-600 font-mono">{s ? `${s.hz.toFixed(1)} Hz` : '—'}</span>
                    <span className="text-green-600 font-mono">{s ? formatBytes(s.bandwidth) : '—'}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="font-semibold">{selectedTopic ? `实时消息：${selectedTopic.name}` : '选择话题'}</h2>
              {subscriber && (
                <button onClick={unsubscribe} className="px-3 py-1 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200">取消订阅</button>
              )}
            </div>
            <div className="p-4 max-h-[300px] overflow-y-auto">
              {messages.length === 0 ? (
                <div className="text-gray-400 text-center py-8">暂无消息</div>
              ) : (
                messages.map((msg, i) => (
                  <div key={i} className="mb-2 p-2 bg-gray-50 rounded text-xs font-mono overflow-x-auto">
                    <pre>{JSON.stringify(msg, null, 2)}</pre>
                  </div>
                ))
              )}
            </div>
          </div>

          {selectedTopic && (
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-semibold">字段树（{selectedTopic.type}）</h2>
                <span className="text-xs text-gray-400">实时字段值来自当前消息</span>
              </div>
              <div className="max-h-[260px] overflow-y-auto border rounded p-2">
                {fieldTree.length > 0 ? renderTree(fieldTree) : <div className="text-sm text-gray-400">加载定义中…</div>}
              </div>
            </div>
          )}

          {selectedTopic && (
            <div className="bg-white rounded-lg shadow p-4">
              <h2 className="font-semibold mb-2">发布消息</h2>
              <textarea value={publishText} onChange={e => setPublishText(e.target.value)} placeholder='{"data": "hello"}' className="w-full p-3 border rounded font-mono text-sm h-24" />
              <button onClick={publish} className="mt-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">发布</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
