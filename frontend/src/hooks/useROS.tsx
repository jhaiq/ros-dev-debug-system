import { useState, useEffect, useCallback, useRef, createContext, useContext, type ReactNode } from 'react'
import ROSLIB from 'roslib'

const STORAGE_KEY = 'rosbridge_url'
const DEFAULT_URL = 'ws://localhost:9090'

// 重连退避参数
const RECONNECT_INITIAL_DELAY = 3000   // 首次 3 秒
const RECONNECT_MAX_DELAY = 30000      // 最大 30 秒
const RECONNECT_MULTIPLIER = 2         // 指数退避倍数

// ---------- 全局数据缓存（跨路由保持，切换菜单不丢失） ----------
export interface ROSDataCache {
  nodes: { name: string; publications: string[]; subscriptions: string[]; services: string[] }[]
  topics: { name: string; type: string }[]
  services: { name: string; type: string }[]
  params: string[]
  status: { nodeCount?: number; topicCount?: number; serviceCount?: number; paramCount?: number }
  nodesFetchedAt: number
  topicsFetchedAt: number
  servicesFetchedAt: number
  paramsFetchedAt: number
}

const EMPTY_CACHE: ROSDataCache = {
  nodes: [], topics: [], services: [], params: [], status: {},
  nodesFetchedAt: 0, topicsFetchedAt: 0, servicesFetchedAt: 0, paramsFetchedAt: 0,
}

interface ROSContextValue {
  ros: ROSLIB.Ros | null
  connected: boolean
  error: string | null
  url: string
  setUrl: (u: string) => void
  connect: (targetUrl?: string) => void
  disconnect: () => void
  cache: ROSDataCache
  setCache: React.Dispatch<React.SetStateAction<ROSDataCache>>
}

const ROSContext = createContext<ROSContextValue | null>(null)

/**
 * 在 App 最顶层挂载一次，所有页面共享：
 * - 同一个 ROS 连接（路由切换不断开）
 * - 同一个数据缓存（路由切换不丢失）
 */
export function ROSProvider({ children, initialUrl }: { children: ReactNode; initialUrl?: string }) {
  const [url, setUrlState] = useState<string>(() => {
    return initialUrl || localStorage.getItem(STORAGE_KEY) || DEFAULT_URL
  })
  const [ros, setRos] = useState<ROSLIB.Ros | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cache, setCache] = useState<ROSDataCache>(EMPTY_CACHE)

  const rosRef = useRef<ROSLIB.Ros | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoReconnectRef = useRef(true)
  const reconnectAttemptsRef = useRef(0)
  const connectingRef = useRef(false)

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current)
      reconnectTimer.current = null
    }
  }, [])

  const getReconnectDelay = useCallback((): number => {
    const delay = RECONNECT_INITIAL_DELAY * Math.pow(RECONNECT_MULTIPLIER, reconnectAttemptsRef.current)
    reconnectAttemptsRef.current += 1
    return Math.min(delay, RECONNECT_MAX_DELAY)
  }, [])

  const setUrl = useCallback((u: string) => {
    setUrlState(u)
    localStorage.setItem(STORAGE_KEY, u)
  }, [])

  const doCleanup = useCallback(() => {
    clearReconnectTimer()
    if (rosRef.current) {
      try { rosRef.current.close() } catch {}
      rosRef.current = null
    }
    setRos(null)
    setConnected(false)
    connectingRef.current = false
  }, [clearReconnectTimer])

  const connect = useCallback((targetUrl?: string) => {
    if (connectingRef.current || rosRef.current) return
    connectingRef.current = true
    autoReconnectRef.current = true

    const connectUrl = targetUrl || url
    if (targetUrl) setUrl(targetUrl)
    localStorage.setItem(STORAGE_KEY, connectUrl)

    clearReconnectTimer()
    setError(null)
    setConnected(false)

    const newRos = new ROSLIB.Ros({ url: connectUrl })

    newRos.on('connection', () => {
      connectingRef.current = false
      setConnected(true)
      setError(null)
      reconnectAttemptsRef.current = 0
      setRos(newRos)
    })

    newRos.on('error', (err: any) => {
      connectingRef.current = false
      setConnected(false)
      setError(String(err))
    })

    newRos.on('close', () => {
      connectingRef.current = false
      setConnected(false)
      setRos(null)
      rosRef.current = null
      if (autoReconnectRef.current) {
        const delay = getReconnectDelay()
        console.log(`🔄 ROS 重连尝试 #${reconnectAttemptsRef.current + 1}，${delay}ms 后重试`)
        reconnectTimer.current = setTimeout(() => {
          connect(connectUrl)
        }, delay)
      }
    })

    rosRef.current = newRos
  }, [url, clearReconnectTimer, getReconnectDelay, setUrl])

  const disconnect = useCallback(() => {
    autoReconnectRef.current = false
    clearReconnectTimer()
    reconnectAttemptsRef.current = 0
    if (rosRef.current) {
      // Graceful close: close the WebSocket first so rosbridge
      // stops sending data to this client, then clean up locally.
      // This prevents "WebSocketClosedError: Tried to write to
      // closed websocket" warnings on the server side.
      try { rosRef.current.close() } catch {}
      rosRef.current = null
    }
    setRos(null)
    setConnected(false)
  }, [clearReconnectTimer])

  // 首次挂载连接一次，不随路由切换而重连
  useEffect(() => {
    connect()
    return () => {
      autoReconnectRef.current = false
      clearReconnectTimer()
      reconnectAttemptsRef.current = 0
      if (rosRef.current) {
        try { rosRef.current.close() } catch {}
        rosRef.current = null
      }
      setRos(null)
      setConnected(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // URL 变化时重连
  useEffect(() => {
    if (rosRef.current && rosRef.current.isConnected) {
      disconnect()
      setTimeout(() => connect(url), 300)
    }
  }, [url, connect, disconnect])

  // ★ 连接成功后预取基础数据 → 填充全局缓存
  useEffect(() => {
    if (!ros || !connected) return

    const call = (name: string, type: string) => new Promise<any[]>((resolve) => {
      const svc = new ROSLIB.Service({ ros, name, serviceType: type })
      svc.callService(new ROSLIB.ServiceRequest({}),
        (r: any) => resolve(r.names || r.nodes || r.topics || r.services || r.types || []),
        () => resolve([])
      )
    })

    Promise.all([
      call('/rosapi/nodes', 'rosapi/Nodes'),
      call('/rosapi/topics', 'rosapi/Topics'),
      call('/rosapi/services', 'rosapi/Services'),
      call('/rosapi/get_param_names', 'rosapi/GetParamNames'),
    ]).then(([nodes, topics, services, params]) => {
      setCache(prev => ({
        ...prev,
        nodes: nodes.slice(0, 50).map((n: string) => ({ name: n, publications: [], subscriptions: [], services: [] })),
        topics: topics.slice(0, 200).map((t: string) => ({ name: t, type: '' })),
        services: services.slice(0, 200).map((s: string) => ({ name: s, type: '' })),
        params: params.slice(0, 200),
        nodesFetchedAt: Date.now(),
        topicsFetchedAt: Date.now(),
        servicesFetchedAt: Date.now(),
        paramsFetchedAt: Date.now(),
      }))
    })
  }, [ros, connected, setCache])

  return (
    <ROSContext.Provider value={{ ros, connected, error, url, setUrl, connect, disconnect, cache, setCache }}>
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

/** 向后兼容：单组件独立连接（不推荐新项目使用） */
export function useROSStandalone(initialUrl?: string) {
  const { ros, connected, error, url, setUrl, connect, disconnect } = useROS()
  return { ros, connected, error, url, setUrl, connect, disconnect }
}
