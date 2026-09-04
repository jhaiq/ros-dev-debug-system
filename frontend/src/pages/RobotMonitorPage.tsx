/**
 * rqt_robot_monitor 复刻 — 订阅 /diagnostics (diagnostic_msgs/msg/DiagnosticArray)，
 * 按名称树形展示、级别着色、状态汇总、详情面板、超时置灰(STALE)
 */
import { useState, useEffect, useMemo, useRef } from 'react'
import ROSLIB from 'roslib'
import { useROS } from '../hooks/useROS'

interface DiagnosticValue { key: string; value: string }
interface DiagnosticStatus {
  level: number
  name: string
  message: string
  hardware_id: string
  values: DiagnosticValue[]
  lastUpdate: number
}

const LEVEL_LABEL = ['OK', 'Warning', 'Error', 'Stale']
const LEVEL_COLOR = ['text-green-600', 'text-amber-500', 'text-red-600', 'text-gray-400']
const LEVEL_DOT = ['bg-green-500', 'bg-amber-500', 'bg-red-500', 'bg-gray-300']
const STALE_MS = 10_000

interface TreeNode {
  segment: string
  children: Map<string, TreeNode>
  status?: DiagnosticStatus
}

function insertName(root: TreeNode, name: string, status: DiagnosticStatus) {
  const parts = name.split('/').filter(Boolean)
  let cur = root
  parts.forEach(seg => {
    if (!cur.children.has(seg)) cur.children.set(seg, { segment: seg, children: new Map() })
    cur = cur.children.get(seg)!
  })
  cur.status = status
}

function collectCounts(node: TreeNode, counts: number[], now: number) {
  if (node.status) {
    const stale = now - node.status.lastUpdate > STALE_MS
    counts[stale ? 3 : node.status.level]++
  }
  node.children.forEach(c => collectCounts(c, counts, now))
}

function TreeView({ node, depth, selected, onSelect }: {
  node: TreeNode; depth: number
  selected: string | null
  onSelect: (s: DiagnosticStatus) => void
}) {
  return (
    <div className={depth > 0 ? 'ml-4 border-l pl-2' : ''}>
      {Array.from(node.children.values()).map(child => {
        const stale = child.status && Date.now() - child.status.lastUpdate > STALE_MS
        const level = stale ? 3 : child.status?.level ?? -1
        return (
          <div key={child.segment}>
            <div
              className={`flex items-center gap-2 py-1 cursor-pointer rounded px-1 hover:bg-gray-50 ${
                child.status && selected === child.status.name ? 'bg-blue-50' : ''
              }`}
              onClick={() => child.status && onSelect(child.status)}>
              <span className={`w-2 h-2 rounded-full shrink-0 ${level >= 0 ? LEVEL_DOT[level] : 'bg-gray-200'}`} />
              <span className="text-sm font-mono truncate">{child.segment}</span>
              {child.status && (
                <span className={`text-xs shrink-0 ${level >= 0 ? LEVEL_COLOR[level] : ''}`}>
                  {LEVEL_LABEL[level] ?? ''}
                </span>
              )}
            </div>
            {child.children.size > 0 && (
              <TreeView node={child} depth={depth + 1} selected={selected} onSelect={onSelect} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function RobotMonitorPage() {
  const { ros, connected } = useROS()
  const [statuses, setStatuses] = useState<Map<string, DiagnosticStatus>>(new Map())
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const topicRef = useRef<ROSLIB.Topic | null>(null)
  const [, forceTick] = useState(0)

  // 订阅 /diagnostics
  useEffect(() => {
    if (!ros || !connected) return
    const topic = new ROSLIB.Topic({ ros, name: '/diagnostics', messageType: 'diagnostic_msgs/msg/DiagnosticArray' })
    topicRef.current = topic
    topic.subscribe((msg: any) => {
      const arr: any[] = msg.status || []
      setStatuses(prev => {
        const next = new Map(prev)
        const ts = Date.now()
        arr.forEach(s => {
          next.set(s.name, {
            level: s.level ?? 0,
            name: s.name || '(unnamed)',
            message: s.message || '',
            hardware_id: s.hardware_id || '',
            values: (s.values || []).map((v: any) => ({ key: v.key ?? '', value: v.value ?? '' })),
            lastUpdate: ts,
          })
        })
        return next
      })
    })
    return () => {
      try { topic.unsubscribe() } catch {}
      topicRef.current = null
    }
  }, [ros, connected])

  // STALE 检测：每 2s 重算
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now())
      forceTick(t => t + 1)
    }, 2000)
    return () => clearInterval(timer)
  }, [])

  const tree = useMemo(() => {
    const root: TreeNode = { segment: '/', children: new Map() }
    statuses.forEach(s => insertName(root, s.name, s))
    return root
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statuses, now])

  const counts = useMemo(() => {
    const c = [0, 0, 0, 0]
    collectCounts(tree, c, now)
    return c
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, now])

  const selected = selectedName ? statuses.get(selectedName) : null

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">🩺 诊断监视器</h1>

      {/* 状态汇总（rqt_robot_monitor 顶部汇总） */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {LEVEL_LABEL.map((label, i) => (
          <div key={label} className="bg-white rounded-lg shadow p-3 flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${LEVEL_DOT[i]}`} />
            <span className="text-sm text-gray-500">{label}</span>
            <span className={`text-xl font-bold ${LEVEL_COLOR[i]}`}>{counts[i]}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm font-semibold mb-2">
            状态树 /diagnostics
            {!connected && <span className="text-amber-600 ml-2 text-xs">（未连接）</span>}
          </div>
          {statuses.size === 0 ? (
            <div className="text-sm text-gray-400 py-4 text-center">
              等待 /diagnostics 消息…（需要系统中有 diagnostic_aggregator 或其他发布节点）
            </div>
          ) : (
            <TreeView node={tree} depth={0} selected={selectedName}
              onSelect={s => setSelectedName(s.name)} />
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm font-semibold mb-2">详情</div>
          {selected ? (
            <div className="space-y-3">
              <div>
                <div className="text-xs text-gray-400">名称</div>
                <div className="text-sm font-mono">{selected.name}</div>
              </div>
              <div className="flex gap-6">
                <div>
                  <div className="text-xs text-gray-400">级别</div>
                  <div className={`text-sm font-medium ${LEVEL_COLOR[selected.level]}`}>
                    {LEVEL_LABEL[selected.level] ?? selected.level}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">硬件 ID</div>
                  <div className="text-sm font-mono">{selected.hardware_id || '-'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">最后更新</div>
                  <div className="text-sm">
                    {Math.round((now - selected.lastUpdate) / 1000)} 秒前
                  </div>
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400">消息</div>
                <div className="text-sm">{selected.message || '-'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">键值对 ({selected.values.length})</div>
                {selected.values.length > 0 ? (
                  <table className="w-full text-sm">
                    <tbody>
                      {selected.values.map((v, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-1 font-mono text-gray-600 w-1/2">{v.key}</td>
                          <td className="py-1 font-mono">{v.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-sm text-gray-400">无</div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-400 py-4 text-center">点击左侧状态项查看详情</div>
          )}
        </div>
      </div>
    </div>
  )
}
