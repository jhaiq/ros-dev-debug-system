import { useState, useEffect, useCallback } from 'react'
import ROSLIB from 'roslib'

export function useROS(rosUrl: string = 'ws://localhost:9090') {
  const [ros, setRos] = useState<ROSLIB.Ros | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const connect = useCallback(() => {
    const newRos = new ROSLIB.Ros({
      url: rosUrl
    })

    newRos.on('connection', () => {
      setConnected(true)
      setError(null)
    })

    newRos.on('error', (err: any) => {
      setConnected(false)
      setError(err.toString())
    })

    newRos.on('close', () => {
      setConnected(false)
    })

    setRos(newRos)
  }, [rosUrl])

  const disconnect = useCallback(() => {
    if (ros) {
      ros.close()
      setRos(null)
      setConnected(false)
    }
  }, [ros])

  useEffect(() => {
    // 自动连接
    connect()
    return () => disconnect()
  }, [])

  return {
    ros,
    connected,
    error,
    connect,
    disconnect
  }
}
