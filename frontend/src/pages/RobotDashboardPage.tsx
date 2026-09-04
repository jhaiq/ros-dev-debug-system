/**
 * rqt_robot_dashboard 复刻 — 通用机器人仪表盘框架
 * 上游 rqt_robot_dashboard 是"为具体机器人定制仪表盘"的框架插件。
 * 本页按框架复刻：模块化 widget 架构 + 默认 widget 集
 * （连接状态、电池、诊断汇总、cmd_vel 遥控、急停），各 widget 独立可开合。
 */
import { useState, useEffect, useRef } from 'react'
import { useROS } from '../hooks/useROS'
import ROSLIB from 'roslib'

// ---------- Widget 组件 ----------

function ConnectionWidget() {
  const { connected, url } = useROS()
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="text-sm font-semibold text-gray-500 mb-2">连接</h3>
      <div className="flex items-center gap-2">
        <span className={`w-3 h-3 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className={`font-medium ${connected ? 'text-green-600' : 'text-red-600'}`}>
          {connected ? '已连接' : '未连接'}
        </span>
      </div>
      <div className="text-xs text-gray-400 mt-1 font-mono truncate">{url}</div>
    </div>
  )
}

function BatteryWidget() {
  const { ros, connected } = useROS()
  const [battery, setBattery] = useState<{ percentage: number; voltage: number; charging: boolean } | null>(null)

  useEffect(() => {
    if (!ros || !connected) return
    const sub = new ROSLIB.Topic({ ros, name: '/battery_state', messageType: 'sensor_msgs/msg/BatteryState', throttle_rate: 2000 })
    sub.subscribe((msg: any) => {
      setBattery({ percentage: msg.percentage ?? 0, voltage: msg.voltage ?? 0, charging: msg.power_supply_status === 1 })
    })
    return () => { try { sub.unsubscribe() } catch {} }
  }, [ros, connected])

  if (!battery) {
    return (
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-sm font-semibold text-gray-500 mb-2">电池</h3>
        <div className="text-sm text-gray-400">等待 /battery_state…</div>
      </div>
    )
  }
  const pct = Math.min(100, Math.max(0, battery.percentage))
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="text-sm font-semibold text-gray-500 mb-2">电池</h3>
      <div className="flex items-center gap-3">
        <div className="w-24 h-6 border-2 border-gray-300 rounded relative overflow-hidden">
          <div className={`h-full ${pct > 50 ? 'bg-green-500' : pct > 20 ? 'bg-amber-500' : 'bg-red-500'}`}
            style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xl font-bold">{pct.toFixed(0)}%</span>
        {battery.charging && <span className="text-green-600 text-sm">⚡充电中</span>}
      </div>
      <div className="text-xs text-gray-400 mt-1">{battery.voltage.toFixed(2)} V</div>
    </div>
  )
}

function DiagnosticsWidget() {
  const { ros, connected } = useROS()
  const [counts, setCounts] = useState([0, 0, 0])

  useEffect(() => {
    if (!ros || !connected) return
    const sub = new ROSLIB.Topic({ ros, name: '/diagnostics', messageType: 'diagnostic_msgs/msg/DiagnosticArray' })
    sub.subscribe((msg: any) => {
      setCounts(prev => {
        const next = [...prev]
        ;(msg.status || []).forEach((s: any) => {
          const level = s.level ?? 0
          if (level >= 1 && level <= 3) next[level - 1]++
        })
        return next
      })
    })
    return () => { try { sub.unsubscribe() } catch {} }
  }, [ros, connected])

  const labels = ['警告', '错误', '过期']
  const colors = ['text-amber-500', 'text-red-600', 'text-gray-400']
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="text-sm font-semibold text-gray-500 mb-2">诊断</h3>
      <div className="flex gap-4">
        {labels.map((l, i) => (
          <div key={l} className="text-center">
            <div className={`text-2xl font-bold ${colors[i]}`}>{counts[i]}</div>
            <div className="text-xs text-gray-500">{l}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TeleopWidget() {
  const { ros, connected } = useROS()
  const [linear, setLinear] = useState(0)
  const [angular, setAngular] = useState(0)
  const pubRef = useRef<ROSLIB.Topic | null>(null)

  const publish = (l: number, a: number) => {
    if (!ros || !connected) return
    if (!pubRef.current) pubRef.current = new ROSLIB.Topic({ ros, name: '/cmd_vel', messageType: 'geometry_msgs/msg/Twist' })
    pubRef.current.publish(new ROSLIB.Message({
      linear: { x: l, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: a },
    }))
  }

  const stop = () => { publish(0, 0); setLinear(0); setAngular(0) }

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="text-sm font-semibold text-gray-500 mb-2">遥控 (/cmd_vel)</h3>
      <div className="flex gap-2 items-center flex-wrap">
        <button onClick={() => { setLinear(l => Math.min(l + 0.1, 2)); publish(Math.min(linear + 0.1, 2), angular) }}
          className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm">▲ 前进</button>
        <button onClick={() => { setLinear(l => Math.max(l - 0.1, -2)); publish(Math.max(linear - 0.1, -2), angular) }}
          className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm">▼ 后退</button>
        <button onClick={() => { setAngular(a => Math.min(a + 0.2, 2)); publish(linear, Math.min(angular + 0.2, 2)) }}
          className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm">↺ 左转</button>
        <button onClick={() => { setAngular(a => Math.max(a - 0.2, -2)); publish(linear, Math.max(angular - 0.2, -2)) }}
          className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm">↻ 右转</button>
        <button onClick={stop} className="px-3 py-1 bg-red-100 text-red-700 rounded text-sm">⏹ 停止</button>
      </div>
      <div className="text-xs text-gray-400 mt-2 font-mono">linear.x: {linear.toFixed(2)} m/s, angular.z: {angular.toFixed(2)} rad/s</div>
    </div>
  )
}

function EStopWidget() {
  const { ros, connected } = useROS()
  const [estop, setEstop] = useState(false)

  const triggerEStop = () => {
    if (!ros || !connected) return
    const pub = new ROSLIB.Topic({ ros, name: '/cmd_vel', messageType: 'geometry_msgs/msg/Twist' })
    pub.publish(new ROSLIB.Message({ linear: { x: 0, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0 } }))
    setEstop(true)
    setTimeout(() => setEstop(false), 3000)
  }

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="text-sm font-semibold text-gray-500 mb-2">急停</h3>
      <button onClick={triggerEStop} disabled={!connected || estop}
        className={`w-full py-4 rounded-lg text-white font-bold text-lg ${estop ? 'bg-red-800' : 'bg-red-600 hover:bg-red-700'} disabled:bg-gray-400`}>
        {estop ? '已急停' : '🛑 急停'}
      </button>
    </div>
  )
}

// ---------- 仪表盘框架 ----------

const WIDGETS: { id: string; title: string; component: () => JSX.Element }[] = [
  { id: 'connection', title: '连接', component: ConnectionWidget },
  { id: 'battery', title: '电池', component: BatteryWidget },
  { id: 'diagnostics', title: '诊断', component: DiagnosticsWidget },
  { id: 'teleop', title: '遥控', component: TeleopWidget },
  { id: 'estop', title: '急停', component: EStopWidget },
]

export default function RobotDashboardPage() {
  const [enabled, setEnabled] = useState<Set<string>>(new Set(['connection', 'battery', 'diagnostics', 'teleop', 'estop']))

  const toggle = (id: string) => {
    setEnabled(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6 flex-wrap gap-2">
        <h1 className="text-2xl font-bold">🤖 机器人仪表盘</h1>
        <div className="flex gap-2 flex-wrap">
          {WIDGETS.map(w => (
            <label key={w.id} className="flex items-center gap-1 text-sm cursor-pointer">
              <input type="checkbox" checked={enabled.has(w.id)} onChange={() => toggle(w.id)} />
              {w.title}
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {WIDGETS.filter(w => enabled.has(w.id)).map(w => {
          const Component = w.component
          return <Component key={w.id} />
        })}
      </div>
      {enabled.size === 0 && <div className="text-gray-400 text-center py-12">所有 widget 已隐藏，勾选上方启用</div>}
    </div>
  )
}
