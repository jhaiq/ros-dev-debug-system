/**
 * rqt_msg / rqt_srv 复刻 — 消息/服务/Action 类型浏览器
 * 对应 rqt_msg（查看消息定义）与 rqt_srv（查看服务请求/响应定义），
 * 并支持 action 的 goal/result/feedback 三段定义查看。
 */
import { useState } from 'react'
import ROSLIB from 'roslib'
import { useROS } from '../hooks/useROS'
import { buildTypeDefRegistry, resolveFieldTree, getConstants, type FieldNode, type RosTypeDef } from '../lib/message-def'
import { rosapi } from '../lib/rosapi'

type Kind = 'msg' | 'srv' | 'action'
type FieldView = { label: string; nodes: FieldNode[] }

function FieldTree({ nodes, depth = 0 }: { nodes: FieldNode[]; depth?: number }) {
  return (
    <div className={depth > 0 ? 'ml-4 border-l pl-3' : ''}>
      {nodes.map(node => (
        <div key={node.path} className="py-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-mono font-medium">{node.name}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded ${node.isBuiltin ? 'bg-gray-100 text-gray-500' : 'bg-blue-50 text-blue-600'}`}>
              {node.type}{node.isArray ? `[${node.arrayLen || ''}]` : ''}
            </span>
            {node.example && <span className="text-xs text-gray-400">示例: {node.example}</span>}
          </div>
          {node.children.length > 0 && <div className="mt-0.5"><FieldTree nodes={node.children} depth={depth + 1} /></div>}
        </div>
      ))}
    </div>
  )
}

export default function MsgTypesPage() {
  const { ros, connected } = useROS()
  const [kind, setKind] = useState<Kind>('msg')
  const [typeName, setTypeName] = useState('')
  const [views, setViews] = useState<FieldView[]>([])
  const [constants, setConstants] = useState<{ type: string; list: { name: string; value: string }[] }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const lookup = async () => {
    if (!ros || !connected || !typeName.trim()) return
    setLoading(true)
    setError(null)
    setViews([])
    setConstants([])
    try {
      const name = typeName.trim()
      const fetchTypedefs = async (fn: (r: ROSLIB.Ros, t: string) => Promise<RosTypeDef[]>) => {
        const typedefs = await fn(ros, name)
        if (!typedefs.length) throw new Error(`找不到类型 ${name} 的定义`)
        return typedefs
      }
      const toView = (label: string, typedefs: RosTypeDef[]): FieldView => ({
        label,
        nodes: resolveFieldTree(typedefs[0].type, buildTypeDefRegistry(typedefs)),
      })
      const collectConstants = (typedefs: RosTypeDef[]) =>
        typedefs.map(td => ({ type: td.type, list: getConstants(td) })).filter(c => c.list.length > 0)

      if (kind === 'msg') {
        const typedefs = await fetchTypedefs(rosapi.messageDetails)
        setViews([toView(name, typedefs)])
        setConstants(collectConstants(typedefs))
      } else if (kind === 'srv') {
        const req = await fetchTypedefs(rosapi.serviceRequestDetails)
        const resp = await fetchTypedefs(rosapi.serviceResponseDetails)
        setViews([toView(`${name} (请求)`, req), toView(`${name} (响应)`, resp)])
        setConstants([...collectConstants(req), ...collectConstants(resp)])
      } else {
        const goal = await fetchTypedefs(rosapi.actionGoalDetails)
        const result = await fetchTypedefs(rosapi.actionResultDetails)
        const feedback = await fetchTypedefs(rosapi.actionFeedbackDetails)
        setViews([toView(`${name} (Goal)`, goal), toView(`${name} (Result)`, result), toView(`${name} (Feedback)`, feedback)])
        setConstants([...collectConstants(goal), ...collectConstants(result), ...collectConstants(feedback)])
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const kinds: { key: Kind; label: string }[] = [
    { key: 'msg', label: '消息 (.msg)' },
    { key: 'srv', label: '服务 (.srv)' },
    { key: 'action', label: 'Action (.action)' },
  ]

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">📦 类型浏览器</h1>
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex gap-2 flex-wrap items-center">
          <div className="flex rounded border overflow-hidden">
            {kinds.map(k => (
              <button key={k.key} onClick={() => setKind(k.key)}
                className={`px-3 py-2 text-sm ${kind === k.key ? 'bg-blue-600 text-white' : 'bg-white hover:bg-gray-50'}`}>
                {k.label}
              </button>
            ))}
          </div>
          <input value={typeName} onChange={e => setTypeName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && lookup()}
            placeholder={kind === 'msg' ? '如 geometry_msgs/Pose' : kind === 'srv' ? '如 rosapi/TopicType' : '如 example_interfaces/action/Fibonacci'}
            className="flex-1 min-w-64 px-3 py-2 border rounded text-sm font-mono" />
          <button onClick={lookup} disabled={!connected || loading || !typeName.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 text-sm">
            {loading ? '查询中...' : '查看定义'}
          </button>
        </div>
        {!connected && <div className="text-sm text-amber-600 mt-2">未连接 rosbridge，无法查询类型定义</div>}
        {error && <div className="text-sm text-red-600 mt-2">{error}</div>}
      </div>

      {views.map(view => (
        <div key={view.label} className="bg-white rounded-lg shadow p-4 mb-4">
          <h2 className="font-semibold mb-2 font-mono text-sm text-gray-700">{view.label}</h2>
          <FieldTree nodes={view.nodes} />
        </div>
      ))}

      {constants.length > 0 && (
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="font-semibold mb-2 text-sm">常量定义</h2>
          {constants.map(c => (
            <div key={c.type} className="mb-2">
              <div className="text-xs font-mono text-gray-500">{c.type}</div>
              {c.list.map(k => (
                <div key={k.name} className="text-sm font-mono ml-2">
                  {k.name} = <span className="text-blue-600">{k.value}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
