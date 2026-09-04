/**
 * rqt_shell 复刻 — WebSocket 远程终端
 * 使用 xterm.js 显示，后端 PTY 转发 bash/sh。
 * 安全提示：仅内网/可信环境使用（Q2）。
 */
import { useState, useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

const WS_URL = import.meta.env.VITE_BACKEND_WS || `ws://${location.hostname}:4000/ws/shell`

export default function ShellPage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const [status, setStatus] = useState<string>('')

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: { background: '#1e1e1e' },
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    fitAddon.fit()
    termRef.current = term

    let ws: WebSocket | null = null
    let disposed = false

    const connect = () => {
      if (disposed) return
      setStatus('连接中...')
      ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        setStatus('已连接')
        fitAddon.fit()
        ws!.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
      }
      ws.onmessage = (ev) => {
        if (typeof ev.data === 'string') term.write(ev.data)
      }
      ws.onclose = () => {
        setConnected(false)
        setStatus('连接已断开，3 秒后重连…')
        if (!disposed) setTimeout(connect, 3000)
      }
      ws.onerror = () => {}
    }

    const sub = term.onData((data) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'input', data }))
      }
    })
    const resizeObserver = new ResizeObserver(() => {
      try { fitAddon.fit() } catch {}
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
      }
    })
    resizeObserver.observe(containerRef.current)

    connect()

    return () => {
      disposed = true
      resizeObserver.disconnect()
      sub.dispose()
      try { ws?.close() } catch {}
      term.dispose()
      termRef.current = null
    }
  }, [])

  return (
    <div className="p-6 h-screen flex flex-col">
      <div className="flex items-center gap-3 mb-3">
        <h1 className="text-2xl font-bold">🖥️ 远程终端</h1>
        <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="text-sm text-gray-500">{status}</span>
        <span className="ml-auto text-xs text-amber-600">⚠️ 仅在内网/可信环境使用（Q2 确认）</span>
      </div>
      <div className="flex-1 bg-[#1e1e1e] rounded-lg overflow-hidden border border-gray-700"
        ref={containerRef} style={{ minHeight: 480 }} />
    </div>
  )
}
