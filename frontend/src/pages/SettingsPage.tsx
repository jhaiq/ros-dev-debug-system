import { useState } from 'react'
import { useROS } from '../hooks/useROS'

export default function SettingsPage() {
  const { url, setUrl, connect, connected } = useROS()
  const [inputUrl, setInputUrl] = useState(url)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [testing, setTesting] = useState(false)

  const handleConnect = () => {
    setUrl(inputUrl)
    connect(inputUrl)
  }

  const testConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const ws = new WebSocket(inputUrl)
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('连接超时')), 5000))
      const connected = new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve()
        ws.onerror = () => reject(new Error('连接失败'))
      })
      await Promise.race([connected, timeout])
      ws.close()
      setTestResult({ ok: true, msg: '连接成功！rosbridge 正在运行' })
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.message })
    } finally {
      setTesting(false)
    }
  }

  const presets = [
    { label: '本地 rosbridge', url: 'ws://localhost:9090' },
    { label: 'Docker 容器', url: 'ws://host.docker.internal:9090' },
    { label: '远程服务器', url: 'ws://192.168.1.100:9090' },
  ]

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">⚙️ 连接设置</h1>

      {/* rosbridge URL */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">rosbridge WebSocket 地址</h2>
        <div className="flex gap-2 mb-4">
          <input
            value={inputUrl}
            onChange={e => setInputUrl(e.target.value)}
            className="flex-1 px-4 py-2 border rounded-lg"
            placeholder="ws://localhost:9090"
          />
          <button
            onClick={handleConnect}
            className={`px-6 py-2 text-white rounded-lg ${connected ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {connected ? '重连' : '连接'}
          </button>
        </div>

        {/* 预设 */}
        <div className="flex gap-2 mb-4">
          {presets.map(p => (
            <button
              key={p.url}
              onClick={() => setInputUrl(p.url)}
              className="px-3 py-1 bg-gray-100 rounded-full text-sm hover:bg-gray-200"
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* 连接状态 */}
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg ${connected ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
          {connected ? '已连接' : '未连接'}
        </div>
      </div>

      {/* 连接测试 */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">连接测试</h2>
        <button
          onClick={testConnection}
          disabled={testing}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
        >
          {testing ? '测试中...' : '测试连接'}
        </button>
        {testResult && (
          <div className={`mt-4 p-3 rounded-lg ${testResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {testResult.msg}
          </div>
        )}
      </div>

      {/* 说明 */}
      <div className="bg-blue-50 rounded-lg p-6">
        <h3 className="font-semibold mb-2">📖 如何启动 rosbridge</h3>
        <pre className="text-sm bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto">
# Docker 方式
docker run -p 9090:9090 rosbridge_suite rosbridge_websocket

# 或者使用项目的 docker-compose
cd docker && docker-compose up -d
        </pre>
      </div>
    </div>
  )
}
