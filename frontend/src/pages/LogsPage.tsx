import { useState, useEffect, useRef } from 'react'
import { useROS } from '../hooks/useROS'
import ROSLIB from 'roslib'

interface LogEntry {
  level: string
  message: string
  time: string
}

const LEVEL_COLORS: Record<string, string> = {
  DEBUG: 'bg-gray-100 text-gray-800',
  INFO: 'bg-blue-100 text-blue-800',
  WARNING: 'bg-yellow-100 text-yellow-800',
  ERROR: 'bg-red-100 text-red-800',
  FATAL: 'bg-purple-100 text-purple-800'
}

export default function LogsPage() {
  const { ros, connected } = useROS()
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [filter, setFilter] = useState('ALL')
  const [searchText, setSearchText] = useState('')
  const [isAutoScroll, setIsAutoScroll] = useState(true)
  const logsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ros || !connected) return

    const rosoutTopic = new ROSLIB.Topic({
      ros,
      name: '/rosout',
      messageType: 'rosgraph_msgs/Log'
    })

    rosoutTopic.subscribe((msg: any) => {
      const levelMap: Record<number, string> = {
        1: 'DEBUG',
        2: 'INFO',
        4: 'WARNING',
        8: 'ERROR',
        16: 'FATAL'
      }

      const entry: LogEntry = {
        level: levelMap[msg.level] || 'INFO',
        message: msg.msg,
        time: new Date(msg.header.stamp.secs * 1000).toLocaleTimeString()
      }

      setLogs(prev => [...prev.slice(-499), entry]) // 保留最多 500 条
    })

    return () => {
      rosoutTopic.unsubscribe()
    }
  }, [ros, connected])

  useEffect(() => {
    if (isAutoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, isAutoScroll])

  const filteredLogs = logs.filter(log => {
    const levelMatch = filter === 'ALL' || log.level === filter
    const searchMatch = !searchText || log.message.toLowerCase().includes(searchText.toLowerCase())
    return levelMatch && searchMatch
  })

  const exportLogs = () => {
    const blob = new Blob([filteredLogs.map(l => `[${l.time}] [${l.level}] ${l.message}`).join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ros-logs-${new Date().toISOString().slice(0,19)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const clearLogs = () => {
    setLogs([])
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">日志系统</h1>
        <div className="flex gap-2">
          <button
            onClick={exportLogs}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            导出
          </button>
          <button
            onClick={clearLogs}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            清空
          </button>
        </div>
      </div>

      {/* 过滤器 */}
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">级别:</span>
            {['ALL', 'DEBUG', 'INFO', 'WARNING', 'ERROR', 'FATAL'].map(level => (
              <button
                key={level}
                onClick={() => setFilter(level)}
                className={`px-3 py-1 rounded text-sm ${filter === level ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
              >
                {level}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="搜索日志..."
              className="px-3 py-1 border rounded text-sm"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isAutoScroll}
              onChange={(e) => setIsAutoScroll(e.target.checked)}
            />
            自动滚动
          </label>

          <span className="text-sm text-gray-500 ml-auto">
            共 {filteredLogs.length} / {logs.length} 条
          </span>
        </div>
      </div>

      {/* 日志列表 */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b font-mono text-sm bg-gray-50">
          <div className="flex gap-4">
            <span className="w-20">时间</span>
            <span className="w-20">级别</span>
            <span>消息</span>
          </div>
        </div>
        <div className="p-4 max-h-[600px] overflow-y-auto font-mono text-sm">
          {filteredLogs.length === 0 ? (
            <div className="text-gray-400 text-center py-8">暂无日志</div>
          ) : (
            filteredLogs.map((log, idx) => (
              <div
                key={idx}
                className={`py-2 border-b ${LEVEL_COLORS[log.level] || LEVEL_COLORS.INFO}`}
              >
                <div className="flex gap-4">
                  <span className="w-20 text-gray-600">{log.time}</span>
                  <span className="w-20 font-semibold">{log.level}</span>
                  <span className="flex-1 break-all">{log.message}</span>
                </div>
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>
      </div>
    </div>
  )
}
