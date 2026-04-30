import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import ROSLIB from 'roslib'

const DEFAULT_URL = 'ws://192.192.168.55.1:9090'
const STORAGE_KEY = 'rosbridge_url'

// ---------- 全局数据缓存 ----------
export interface ROSCache {
  nodes: any[]
  topics: any[]
  services: any[]
  params: string[]
  tfFrames: any[]
  nodesFetchedAt: number
  topicsFetchedAt: number
  servicesFetchedAt: number
  paramsFetchedAt: number
  tfFetchedAt: number
}

const INITIAL_CACHE: ROSCache = {
  nodes: [], topics: [], services: [], params: [], tfFrames: [],
  nodesFetchedAt: 0, topicsFetchedAt: 0, servicesFetchedAt: 0,
  paramsFetchedAt: 0, tfFetchedAt: 0,
}

// ---------- Context ----------
interface ROSContextValue {
  ros: ROSLIB.Ros | null
  connected: boolean
  rosUrl: string
  setRosUrl: (url: string) => void
  connect: () => void
  disconnect: () => void
  // 全局缓存
  cache: ROSCache
  setCache: React.Dispatch<React.SetStateAction<ROSCache>>
}

const ROSContext = createContext<ROSContextValue | null>(null)

/**
 * 在 App 最顶层挂载一次，所有页面共享同一个 ROS 连接 + 数据缓存。
 * 路由切换时：连接不断开，缓存不丢失。
 */
export function ROSProvider({ children }: { children: ReactNode }) {
  const [ros, setRos] = useState<ROSLIB.Ros | null>(null)
  const [connected, setConnected] = useState(false)
  const [rosUrl, setRosUrlState] = useState(() =>
    typeof window !== 'undefined' ? (localStorage.getItem(STORAGE_KEY) || DEFAULT_URL) : DEFAULT_URL,
  )
  const [cache, setCache] = useState<ROSCache>(INITIAL_CACHE)

  const rosRef = useRef<ROSLIB.Ros | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoReconnectRef = useRef(true)
  const connectingRef = useRef(false)

  const setRosUrl = useCallback((url: string) => {
    setRosUrlState(url)
    localStorage.setItem(STORAGE_KEY, url)
  }, [])

  const doCleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    if (rosRef.current) {
      try { rosRef.current.close() } catch { /* ignore */ }
      rosRef.current = null
    }
    setRos(null)
    setConnected(false)
    connectingRef.current = false
  }, [])

  const connect = useCallback(() => {
    if (connectingRef.current || rosRef.current) return
    connectingRef.current = true
    autoReconnectRef.current = true

    const instance = new ROSLIB.Ros({ url: rosUrl })
    rosRef.current = instance

    instance.on('connection', () => {
      connectingRef.current = false
      setConnected(true)
      setRos(instance)
    })

    instance.on('error', () => {
      connectingRef.current = false
      setConnected(false)
    })

    instance.on('close', () => {
      connectingRef.current = false
      setConnected(false)
      setRos(null)
      rosRef.current = null
      if (autoReconnectRef.current) {
        const interval = parseInt(localStorage.getItem('ros-reconnect-interval') || '5', 10)
        reconnectTimerRef.current = setTimeout(() => connect(), interval * 1000)
      }
    })
  }, [rosUrl])

  const disconnect = useCallback(() => {
    autoReconnectRef.current = false
    doCleanup()
  }, [doCleanup])

  // 首次挂载连接一次，不随路由切换而重连
  useEffect(() => {
    connect()
    return () => {
      // 只有整个 App 卸载时才真正关闭连接
      doCleanup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // URL 变化时重连
  useEffect(() => {
    if (rosRef.current) {
      disconnect()
      setTimeout(connect, 300)
    }
  }, [rosUrl, connect, disconnect])

  return (
    <ROSContext.Provider value={{ ros, connected, rosUrl, setRosUrl, connect, disconnect, cache, setCache }}>
      {children}
    </ROSContext.Provider>
  )
}

/** 页面组件使用的 hook — 读取全局共享连接 + 缓存 */
export function useROS(): ROSContextValue {
  const ctx = useContext(ROSContext)
  if (!ctx) throw new Error('useROS must be used inside <ROSProvider>')
  return ctx
}
