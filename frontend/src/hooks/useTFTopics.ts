/**
 * TF 订阅共享 hook — 自动兼容命名空间仿真（如 go2_gz_sim 的 /robot1/tf）
 *
 * - 未设置前缀时：同时订阅 /tf、/tf_static、/robot1/tf、/robot1/tf_static，数据按 key 去重合并
 * - 设置前缀后：只订阅 `{prefix}/tf` 与 `{prefix}/tf_static`（localStorage 持久化，全页生效）
 */
import { useEffect, useRef, useSyncExternalStore } from 'react'
import ROSLIB from 'roslib'
import { useROS } from './useROS'

const PREFIX_KEY = 'tf_topic_prefix'

let listeners: (() => void)[] = []
export function getTfPrefix(): string {
  return localStorage.getItem(PREFIX_KEY) ?? ''
}
export function setTfPrefix(prefix: string): void {
  localStorage.setItem(PREFIX_KEY, prefix)
  listeners.forEach(l => l())
}
function subscribePrefix(cb: () => void) {
  listeners.push(cb)
  return () => { listeners = listeners.filter(l => l !== cb) }
}
export function useTfPrefix(): string {
  return useSyncExternalStore(subscribePrefix, getTfPrefix)
}

export function tfTopicNames(prefix: string): string[] {
  const p = prefix.trim().replace(/\/+$/, '')
  if (p) return [`${p}/tf`, `${p}/tf_static`]
  return ['/tf', '/tf_static', '/robot1/tf', '/robot1/tf_static']
}

/**
 * 订阅 TF 数据流。onMessage 收到整条 tf2_msgs/TFMessage（与各页面原 handleTF 形状一致）。
 */
export function useTFSubscription(onMessage: (msg: any) => void, throttleRate = 500) {
  const { ros, connected } = useROS()
  const prefix = useTfPrefix()
  const cbRef = useRef(onMessage)
  cbRef.current = onMessage

  useEffect(() => {
    if (!ros || !connected) return
    const topics = tfTopicNames(prefix).map(name => {
      const t = new ROSLIB.Topic({ ros, name, messageType: 'tf2_msgs/TFMessage', throttle_rate: throttleRate })
      t.subscribe((msg: any) => cbRef.current(msg))
      return t
    })
    return () => { topics.forEach(t => { try { t.unsubscribe() } catch {} }) }
  }, [ros, connected, prefix, throttleRate])
}
