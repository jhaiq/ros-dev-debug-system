import { useState, useEffect } from 'react'
import { useROS } from '../hooks/useROS'
import ROSLIB from 'roslib'

interface TopicInfo {
  name: string
  type: string
  publishers: number
  subscribers: number
}

export default function TopicsPage() {
  const { ros, connected } = useROS()
  const [topics, setTopics] = useState<TopicInfo[]>([])
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [publishText, setPublishText] = useState('')
  const [isSubscribed, setIsSubscribed] = useState(false)

  const fetchTopics = () => {
    if (!ros || !connected) return

    const getTopics = new ROSLIB.Service({
      ros,
      name: '/rosapi/topics',
      serviceType: 'rosapi/Topics'
    })

    const getTopicTypes = new ROSLIB.Service({
      ros,
      name: '/rosapi/topic_types',
      serviceType: 'rosapi/TopicTypes'
    })

    getTopics.call({}, (topicsResult: any) => {
      const topicNames = topicsResult.topics || []
      
      getTopicTypes.call({}, (typesResult: any) => {
        const topicTypes = typesResult.types || []
        const topicInfo: TopicInfo[] = topicNames.map((name: string, index: number) => ({
          name,
          type: topicTypes[index] || 'unknown',
          publishers: 0,
          subscribers: 0
        }))
        setTopics(topicInfo.slice(0, 100)) // 限制显示数量
      })
    })
  }

  const subscribeToTopic = (topicName: string, topicType: string) => {
    if (!ros || !connected) return

    const topic = new ROSLIB.Topic({
      ros,
      name: topicName,
      messageType: topicType
    })

    topic.subscribe((msg: any) => {
      setMessages(prev => [msg, ...prev].slice(0, 50)) // 保留最近 50 条
    })

    setIsSubscribed(true)
    return () => topic.unsubscribe()
  }

  const publishToTopic = (topicName: string, topicType: string) => {
    if (!ros || !connected) return

    const topic = new ROSLIB.Topic({
      ros,
      name: topicName,
      messageType: topicType
    })

    try {
      const data = JSON.parse(publishText)
      const msg = new ROSLIB.Message(data)
      topic.publish(msg)
      setPublishText('')
    } catch (e) {
      alert('JSON 格式错误：' + (e as Error).message)
    }
  }

  useEffect(() => {
    if (connected) {
      fetchTopics()
    }
  }, [connected])

  const handleTopicSelect = (topic: TopicInfo) => {
    setSelectedTopic(topic.name)
    setMessages([])
    setIsSubscribed(false)
    subscribeToTopic(topic.name, topic.type)
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">话题监控</h1>
        <button
          onClick={fetchTopics}
          disabled={!connected}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
        >
          刷新
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 话题列表 */}
        <div className="lg:col-span-1 bg-white rounded-lg shadow">
          <div className="p-4 border-b">
            <h2 className="font-semibold">话题列表 ({topics.length})</h2>
          </div>
          <div className="overflow-y-auto max-h-[600px]">
            {topics.map((topic) => (
              <div
                key={topic.name}
                className={`p-3 border-b cursor-pointer hover:bg-gray-50 ${selectedTopic === topic.name ? 'bg-blue-50' : ''}`}
                onClick={() => handleTopicSelect(topic)}
              >
                <div className="font-medium text-sm truncate">{topic.name}</div>
                <div className="text-xs text-gray-500">{topic.type}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 消息查看和发布 */}
        <div className="lg:col-span-2 space-y-4">
          {/* 实时消息 */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="font-semibold">
                {selectedTopic ? `实时消息：${selectedTopic}` : '选择一个话题'}
              </h2>
              {isSubscribed && (
                <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded">正在订阅</span>
              )}
            </div>
            <div className="p-4 max-h-[400px] overflow-y-auto">
              {messages.length === 0 ? (
                <div className="text-gray-400 text-center py-8">暂无消息</div>
              ) : (
                messages.map((msg, idx) => (
                  <div key={idx} className="mb-3 p-3 bg-gray-50 rounded text-sm font-mono overflow-x-auto">
                    <pre>{JSON.stringify(msg, null, 2)}</pre>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 消息发布 */}
          {selectedTopic && (
            <div className="bg-white rounded-lg shadow p-4">
              <h2 className="font-semibold mb-3">发布消息</h2>
              <textarea
                value={publishText}
                onChange={(e) => setPublishText(e.target.value)}
                placeholder='{"data": "hello"}'
                className="w-full p-3 border rounded font-mono text-sm h-32"
              />
              <button
                onClick={() => {
                  const topic = topics.find(t => t.name === selectedTopic)
                  if (topic) publishToTopic(topic.name, topic.type)
                }}
                className="mt-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                发布
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
