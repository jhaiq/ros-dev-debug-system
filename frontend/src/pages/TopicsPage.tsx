import { useState, useEffect, useCallback } from 'react'
import { useROS } from '../hooks/useROS'
import ROSLIB from 'roslib'

interface TopicInfo {
  name: string
  type: string
}

export default function TopicsPage() {
  const { ros, connected } = useROS()
  const [topics, setTopics] = useState<TopicInfo[]>([])
  const [search, setSearch] = useState('')
  const [selectedTopic, setSelectedTopic] = useState<TopicInfo | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [publishText, setPublishText] = useState('')
  const [subscriber, setSubscriber] = useState<ROSLIB.Topic | null>(null)

  const fetchTopics = useCallback(() => {
    if (!ros || !connected) return
    const getTopics = new ROSLIB.Service({ ros, name: '/rosapi/topics', serviceType: 'rosapi/Topics' })
    const getTopicTypes = new ROSLIB.Service({ ros, name: '/rosapi/topic_types', serviceType: 'rosapi/TopicTypes' })
    getTopics.callService(new ROSLIB.ServiceRequest({}), (result: any) => {
      const names: string[] = result.topics || []
      getTopicTypes.callService(new ROSLIB.ServiceRequest({}), (typesResult: any) => {
        const types: string[] = typesResult.types || []
        const info: TopicInfo[] = names.map((name, i) => ({ name, type: types[i] || 'unknown' }))
        setTopics(info)
      })
    })
  }, [ros, connected])

  const subscribe = useCallback((topic: TopicInfo) => {
    // Unsubscribe from previous
    if (subscriber) {
      subscriber.unsubscribe()
    }
    setMessages([])
    const sub = new ROSLIB.Topic({ ros: ros!, name: topic.name, messageType: topic.type, throttle_rate: 100 })
    sub.subscribe((msg: any) => {
      setMessages(prev => [msg, ...prev].slice(0, 100))
    })
    setSubscriber(sub)
  }, [ros, subscriber])

  const unsubscribe = useCallback(() => {
    if (subscriber) {
      subscriber.unsubscribe()
      setSubscriber(null)
    }
  }, [subscriber])

  const publish = useCallback(() => {
    if (!selectedTopic || !ros) return
    try {
      const data = JSON.parse(publishText)
      const topic = new ROSLIB.Topic({ ros, name: selectedTopic.name, messageType: selectedTopic.type })
      topic.publish(new ROSLIB.Message(data))
      setPublishText('')
    } catch (e: any) {
      alert('JSON 格式错误：' + e.message)
    }
  }, [ros, selectedTopic, publishText])

  useEffect(() => {
    if (connected) fetchTopics()
    return () => { if (subscriber) subscriber.unsubscribe() }
  }, [connected, fetchTopics])

  const filtered = topics.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.type.toLowerCase().includes(search.toLowerCase())
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
            <div className="text-sm text-gray-500 mt-1">{filtered.length} / {topics.length}</div>
          </div>
          <div className="overflow-y-auto max-h-[600px]">
            {filtered.map(topic => (
              <div key={topic.name} className={`p-3 border-b cursor-pointer hover:bg-gray-50 ${selectedTopic?.name === topic.name ? 'bg-blue-50' : ''}`}
                onClick={() => { setSelectedTopic(topic); subscribe(topic); }}>
                <div className="font-medium text-sm truncate">{topic.name}</div>
                <div className="text-xs text-gray-500">{topic.type}</div>
              </div>
            ))}
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
            <div className="p-4 max-h-[400px] overflow-y-auto">
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
