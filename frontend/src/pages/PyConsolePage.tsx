/**
 * rqt_py_console 复刻 — WebSocket Python REPL（支持 rclpy）
 * 输入代码行，后端 python3 -i 执行，stdout/stderr 回传。
 */
import { useState, useEffect, useRef } from 'react'

const WS_URL = import.meta.env.VITE_BACKEND_WS || `ws://${location.hostname}:4000/ws/pyconsole`

interface OutputLine {
  type: 'stdout' | 'stderr' | 'system'
  data: string
}

export default function PyConsolePage() {
  const wsRef = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const [status, setStatus] = useState('')
  const [output, setOutput] = useState<OutputLine[]>([])
  const [code, setCode] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [historyIdx, setHistoryIdx] = useState(-1)
  const outputRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let ws: WebSocket | null = null
    let disposed = false

    const connect = () => {
      if (disposed) return
      setStatus('连接中...')
      ws = new WebSocket(WS_URL)
      wsRef.current = ws
      ws.onopen = () => { setConnected(true); setStatus('已连接') }
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data)
          if (msg.type === 'stdout' || msg.type === 'stderr') {
            setOutput(prev => [...prev.slice(-499), { type: msg.type, data: msg.data }])
          }
        } catch {}
      }
      ws.onclose = () => {
        setConnected(false)
        setStatus('连接已断开，3 秒后重连…')
        if (!disposed) setTimeout(connect, 3000)
      }
      ws.onerror = () => {}
    }
    connect()
    return () => { disposed = true; try { ws?.close() } catch {} }
  }, [])

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight
  }, [output])

  const appendOutput = (type: OutputLine['type'], data: string) => {
    setOutput(prev => [...prev.slice(-499), { type, data }])
  }

  const execCode = () => {
    const trimmed = code.trim()
    if (!trimmed || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    appendOutput('system', `>>> ${trimmed}\n`)
    wsRef.current.send(JSON.stringify({ type: 'exec', code: trimmed }))
    setHistory(prev => [trimmed, ...prev].slice(0, 50))
    setHistoryIdx(-1)
    setCode('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); execCode() }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const next = Math.min(historyIdx + 1, history.length - 1)
      if (history[next] !== undefined) { setHistoryIdx(next); setCode(history[next]) }
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = historyIdx - 1
      setHistoryIdx(next)
      if (next >= 0 && history[next]) setCode(history[next])
      else setCode('')
    }
  }

  const injectRclpy = () => {
    setCode(`import rclpy
rclpy.init()
node = rclpy.create_node('py_console_node')
print('rclpy node created:', node.get_name())
print('spin once:', rclpy.ok())`)
  }

  return (
    <div className="p-6 h-screen flex flex-col">
      <div className="flex items-center gap-3 mb-3">
        <h1 className="text-2xl font-bold">🐍 Python 控制台</h1>
        <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="text-sm text-gray-500">{status}</span>
        <button onClick={injectRclpy} disabled={!connected}
          className="ml-auto px-3 py-1 text-sm bg-purple-100 text-purple-700 rounded hover:bg-purple-200 disabled:bg-gray-200 disabled:text-gray-400">
          注入 rclpy 模板
        </button>
      </div>

      <div ref={outputRef}
        className="flex-1 bg-[#1e1e1e] text-green-300 rounded-lg p-3 font-mono text-sm overflow-y-auto whitespace-pre-wrap"
        style={{ minHeight: 360 }}>
        {output.map((line, i) => (
          <span key={i} className={line.type === 'stderr' ? 'text-red-400' : line.type === 'system' ? 'text-cyan-400' : ''}>
            {line.data}
          </span>
        ))}
        {output.length === 0 && <span className="text-gray-500"># 输入 Python 代码执行（Enter 运行，Shift+Enter 换行，↑↓ 历史）</span>}
      </div>

      <div className="mt-3 flex gap-2">
        <textarea value={code} onChange={e => setCode(e.target.value)} onKeyDown={handleKeyDown}
          placeholder=">>> 输入 Python 代码..."
          className="flex-1 px-3 py-2 border rounded font-mono text-sm h-16 resize-none"
          disabled={!connected} />
        <button onClick={execCode} disabled={!connected || !code.trim()}
          className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 self-end">
          执行
        </button>
      </div>
    </div>
  )
}
