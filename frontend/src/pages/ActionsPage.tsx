/**
 * rqt_action 复刻 — Action 客户端
 *
 * roslibjs 1.4.1 的消息分发不转发 action op，因此本页对 rosbridge
 * 使用独立原生 WebSocket 收发 send_action_goal / cancel_action_goal /
 * action_feedback / action_result 协议消息；roslib 共享连接仅用于展示状态。
 *
 * 能力探测：rosbridge_suite 旧版本不含 action 支持（Q5，见 docs/rqt-parity/02），
 * 不支持时页面明确提示。
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { useROS } from '../hooks/useROS'
import MessageFieldEditor from '../components/MessageFieldEditor'
import { buildTypeDefRegistry, resolveFieldTree, defaultMessageObject, type FieldNode } from '../lib/message-def'

const GOAL_STATUS: Record<number, string> = {
  0: 'UNKNOWN', 1: 'ACCEPTED', 2: 'EXECUTING', 3: 'CANCELING',
  4: 'SUCCEEDED', 5: 'CANCELED', 6: 'ABORTED',
}
const STATUS_COLOR: Record<number, string> = {
  0: 'text-gray-500', 1: 'text-blue-500', 2: 'text-blue-600', 3: 'text-amber-500',
  4: 'text-green-600', 5: 'text-gray-600', 6: 'text-red-600',
}

interface Goal {
  id: string
  action: string
  type: string
  status: number
  feedbacks: any[]
  result: any
  sentAt: number
}

export default function ActionsPage() {
  const { url, connected } = useROS()
  const [actions, setActions] = useState<{ name: string; type: string }[]>([])
  const [probeError, setProbeError] = useState<string | null>(null)
  const [selected, setSelected] = useState<{ name: string; type: string } | null>(null)
  const [goalTree, setGoalTree] = useState<FieldNode[]>([])
  const [goalMsg, setGoalMsg] = useState<Record<string, any>>({})
  const [goals, setGoals] = useState<Goal[]>([])
  const [loadingDef, setLoadingDef] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const pendingRef = useRef<Set<string>>(new Set())

  /** 原生 WebSocket 连接（本页专用，独立于 roslib 共享连接） */
  const rawWsRef = useRef<WebSocket | null>(null)
  const getSocket = useCallback((): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      const existing = rawWsRef.current
      if (existing) {
        if (existing.readyState === WebSocket.OPEN) { resolve(existing); return }
        if (existing.readyState === WebSocket.CONNECTING) {
          const onOpen = () => { existing.removeEventListener('open', onOpen); resolve(existing) }
          existing.addEventListener('open', onOpen)
          return
        }
      }
      const ws = new WebSocket(url)
      rawWsRef.current = ws
      ws.onmessage = (ev) => {
        let msg: any
        try { msg = JSON.parse(ev.data) } catch { return }
        if (msg.op === 'action_feedback') {
          setGoals(prev => prev.map(g => g.id === msg.id
            ? { ...g, status: msg.status ?? g.status, feedbacks: [...g.feedbacks, msg.values] } : g))
        } else if (msg.op === 'action_result') {
          setGoals(prev => prev.map(g => g.id === msg.id
            ? { ...g, status: msg.status, result: msg.values, feedbacks: [...g.feedbacks] } : g))
          pendingRef.current.delete(msg.id)
        } else if (msg.op === 'status' && msg.level === 'error') {
          // rosbridge 对不支持 op 的错误响应
          setSendError(msg.msg || 'rosbridge 返回错误')
          pendingRef.current.clear()
        }
      }
      ws.onopen = () => resolve(ws)
      ws.onerror = () => reject(new Error('WebSocket 连接失败'))
      ws.onclose = () => { if (rawWsRef.current === ws) rawWsRef.current = null }
    })
  }, [url])

  useEffect(() => {
    return () => {
      const ws = rawWsRef.current
      if (ws) { try { ws.close() } catch {}; rawWsRef.current = null }
    }
  }, [])

  const callApi = useCallback(async (service: string, request: any = {}) => {
    const ws = await getSocket()
    return new Promise<any>((resolve, reject) => {
      const id = `call:${service}:${Math.random().toString(36).slice(2)}`
      const onMsg = (ev: MessageEvent) => {
        let msg: any
        try { msg = JSON.parse(ev.data) } catch { return }
        if (msg.op === 'service_response' && msg.id === id) {
          ws.removeEventListener('message', onMsg)
          clearTimeout(timer)
          msg.result ? resolve(msg.values) : reject(new Error(msg.values || '调用失败'))
        }
      }
      ws.addEventListener('message', onMsg)
      const timer = setTimeout(() => {
        ws.removeEventListener('message', onMsg)
        reject(new Error(`rosapi/${service} 超时`))
      }, 8000)
      ws.send(JSON.stringify({ op: 'call_service', id, service: `/rosapi/${service}`, type: `rosapi_msgs/srv/${service}`, args: request }))
    })
  }, [getSocket])

  /** 能力探测 + action 列表（rqt_action 的 action 下拉） */
  const refreshActions = useCallback(async () => {
    setProbeError(null)
    setSendError(null)
    try {
      const names: string[] = (await callApi('action_servers')).action_servers || []
      const withTypes = await Promise.all(names.map(async name => {
        let type = ''
        try { type = (await callApi('action_type', { action: name })).type || '' } catch { /* 类型未知仍列出 */ }
        return { name, type }
      }))
      setActions(withTypes)
    } catch (e: any) {
      setActions([])
      setProbeError(`无法获取 action 列表：${e.message}。` +
        '若 rosbridge 版本较旧（不含 action 支持），请升级 rosbridge_suite（见 docs/rqt-parity/02 Q5）。')
    }
  }, [callApi])

  useEffect(() => {
    if (connected) refreshActions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected])

  /** 加载 goal 定义（rosapi action_goal_details） */
  const selectAction = async (a: { name: string; type: string }) => {
    setSelected(a)
    setSendError(null)
    if (!a.type) return
    setLoadingDef(true)
    try {
      const resp: any = await callApi('action_goal_details', { type: a.type })
      const typedefs = resp.typedefs || []
      // goal 定义在 _action/Goal 嵌套结构中，取 goal 字段展开
      const tree = resolveFieldTree(typedefs[0]?.type || a.type, buildTypeDefRegistry(typedefs))
      const goalField = tree.find(n => n.name === 'goal' && !n.isBuiltin)
      const nodes = goalField ? goalField.children : tree
      setGoalTree(nodes)
      setGoalMsg(defaultMessageObject(nodes))
    } catch (e: any) {
      setSendError(`加载 goal 定义失败：${e.message}`)
    } finally {
      setLoadingDef(false)
    }
  }

  /** 发送 goal（协议 op: send_action_goal） */
  const sendGoal = async () => {
    if (!selected) return
    setSendError(null)
    try {
      const ws = await getSocket()
      const id = `goal:${Math.random().toString(36).slice(2)}`
      pendingRef.current.add(id)
      setGoals(prev => [{
        id, action: selected.name, type: selected.type, status: 1, feedbacks: [], result: null, sentAt: Date.now(),
      }, ...prev])
      ws.send(JSON.stringify({
        op: 'send_action_goal', id, action: selected.name, action_type: selected.type,
        args: goalMsg, feedback: true,
      }))
    } catch (e: any) {
      setSendError(e.message)
    }
  }

  /** 取消 goal（协议 op: cancel_action_goal） */
  const cancelGoal = async (g: Goal) => {
    try {
      const ws = await getSocket()
      ws.send(JSON.stringify({ op: 'cancel_action_goal', id: g.id, action: g.action }))
    } catch { /* 忽略 */ }
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">🎯 Action 客户端</h1>
        <button onClick={refreshActions} disabled={!connected}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400">刷新</button>
      </div>

      {probeError && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded p-3 mb-4 text-sm">{probeError}</div>
      )}
      {sendError && <div className="bg-red-50 text-red-700 rounded p-3 mb-4 text-sm">{sendError}</div>}

      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="text-sm font-semibold mb-2">Action 服务器 ({actions.length})</div>
        <div className="flex gap-2 flex-wrap">
          {actions.map(a => (
            <button key={a.name} onClick={() => selectAction(a)}
              className={`px-3 py-1.5 rounded text-sm font-mono border ${selected?.name === a.name ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50 border-gray-300'}`}>
              {a.name}{a.type && <span className="text-xs opacity-60 ml-1">{a.type}</span>}
            </button>
          ))}
          {!probeError && actions.length === 0 && (
            <span className="text-sm text-gray-400">未发现 action 服务器</span>
          )}
        </div>
      </div>

      {selected && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* goal 编辑器 */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="font-semibold mb-3 text-sm font-mono">{selected.name} — Goal</h2>
            {loadingDef ? <div className="text-sm text-gray-400">加载定义中...</div> : (
              <>
                <div className="border rounded p-3 max-h-[360px] overflow-auto">
                  <MessageFieldEditor tree={goalTree} value={goalMsg} onChange={setGoalMsg} />
                </div>
                <button onClick={sendGoal} disabled={loadingDef}
                  className="mt-3 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400">
                  发送 Goal
                </button>
              </>
            )}
          </div>

          {/* goal 状态列表 */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="font-semibold mb-3 text-sm">Goal 列表</h2>
            <div className="space-y-3 max-h-[460px] overflow-auto">
              {goals.map(g => (
                <div key={g.id} className="border rounded p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-mono text-xs text-gray-400 truncate">{g.id}</span>
                    <span className={`font-medium ${STATUS_COLOR[g.status]}`}>{GOAL_STATUS[g.status] ?? g.status}</span>
                  </div>
                  <div className="text-xs text-gray-500 font-mono mt-0.5">{g.action}</div>
                  {g.feedbacks.length > 0 && (
                    <details className="mt-1">
                      <summary className="text-xs text-blue-600 cursor-pointer">反馈 ({g.feedbacks.length})</summary>
                      <pre className="text-xs font-mono bg-gray-50 p-2 rounded mt-1 max-h-40 overflow-auto">
                        {JSON.stringify(g.feedbacks, null, 2)}
                      </pre>
                    </details>
                  )}
                  {g.result !== null && (
                    <pre className="text-xs font-mono bg-green-50 text-green-800 p-2 rounded mt-1 max-h-40 overflow-auto">
                      {JSON.stringify(g.result, null, 2)}
                    </pre>
                  )}
                  {[1, 2, 3].includes(g.status) && (
                    <button onClick={() => cancelGoal(g)}
                      className="mt-2 px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100">取消 Goal</button>
                  )}
                </div>
              ))}
              {goals.length === 0 && <div className="text-sm text-gray-400 text-center py-4">还没有发送 goal</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
