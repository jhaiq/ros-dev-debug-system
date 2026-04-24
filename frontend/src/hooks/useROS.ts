import { useState, useEffect, useCallback, useRef } from 'react'
import ROSLIB from 'roslib'

const STORAGE_KEY = 'rosbridge_url'
const DEFAULT_URL = 'ws://localhost:9090'

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

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current)
      reconnectTimer.current = null
    }
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
    })

    newRos.on('error', (err: any) => {
      setConnected(false)
      setError(String(err))
    })

    newRos.on('close', () => {
      setConnected(false)
      // Auto reconnect after delay
      if (autoReconnectRef.current) {
        reconnectTimer.current = setTimeout(() => {
          connect(connectUrl)
        }, 3000)
      }
    })

    rosRef.current = newRos
    setRos(newRos)
  }, [url, clearReconnectTimer])

  const disconnect = useCallback(() => {
    autoReconnectRef.current = false
    clearReconnectTimer()
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
