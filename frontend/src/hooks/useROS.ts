import { useState, useEffect, useCallback, useRef } from 'react'
import ROSLIB from 'roslib'

const STORAGE_KEY = 'rosbridge_url'
const DEFAULT_URL = 'ws://localhost:9090'

// 重连退避参数
const RECONNECT_INITIAL_DELAY = 3000   // 首次 3 秒
const RECONNECT_MAX_DELAY = 30000      // 最大 30 秒
const RECONNECT_MULTIPLIER = 2         // 指数退避倍数

export function useROS(initialUrl?: string) {
  const [url, setUrl] = useState<string>(() => {
    return initialUrl || localStorage.getItem(STORAGE_KEY) || DEFAULT_URL
  })
  const [ros, setRos] = useState<ROSLIB.Ros | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rosRef = useRef<ROSLIB.Ros | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoReconnectRef = useRef(true)
  const reconnectAttemptsRef = useRef(0)

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current)
      reconnectTimer.current = null
    }
  }, [])

  /** 计算下次重连延迟（指数退避） */
  const getReconnectDelay = useCallback((): number => {
    const delay = RECONNECT_INITIAL_DELAY * Math.pow(RECONNECT_MULTIPLIER, reconnectAttemptsRef.current)
    reconnectAttemptsRef.current += 1
    return Math.min(delay, RECONNECT_MAX_DELAY)
  }, [])

  const connect = useCallback((targetUrl?: string) => {
    const connectUrl = targetUrl || url
    if (targetUrl) setUrl(targetUrl)
    localStorage.setItem(STORAGE_KEY, connectUrl)

    clearReconnectTimer()

    // Close existing connection
    if (rosRef.current) {
      try { rosRef.current.close() } catch {}
      rosRef.current = null
    }

    setError(null)
    setConnected(false)

    const newRos = new ROSLIB.Ros({ url: connectUrl })

    newRos.on('connection', () => {
      setConnected(true)
      setError(null)
      reconnectAttemptsRef.current = 0  // 重连成功后重置计数器
    })

    newRos.on('error', (err: any) => {
      setConnected(false)
      setError(String(err))
    })

    newRos.on('close', () => {
      setConnected(false)
      // Auto reconnect with exponential backoff
      if (autoReconnectRef.current) {
        const delay = getReconnectDelay()
        console.log(`🔄 ROS 重连尝试 #${reconnectAttemptsRef.current + 1}，${delay}ms 后重试`)
        reconnectTimer.current = setTimeout(() => {
          connect(connectUrl)
        }, delay)
      }
    })

    rosRef.current = newRos
    setRos(newRos)
  }, [url, clearReconnectTimer, getReconnectDelay])

  const disconnect = useCallback(() => {
    autoReconnectRef.current = false
    clearReconnectTimer()
    reconnectAttemptsRef.current = 0
    if (rosRef.current) {
      try { rosRef.current.close() } catch {}
      rosRef.current = null
    }
    setRos(null)
    setConnected(false)
  }, [clearReconnectTimer])

  useEffect(() => {
    connect()
    return () => {
      clearReconnectTimer()
      if (rosRef.current) {
        try { rosRef.current.close() } catch {}
        rosRef.current = null
      }
    }
  }, []) // Only run once on mount

  return { ros, connected, error, url, setUrl, connect, disconnect }
}
