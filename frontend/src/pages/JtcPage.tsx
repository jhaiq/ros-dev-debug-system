/**
 * rqt_joint_trajectory_controller 复刻 — 关节轨迹控制器
 * 通过 /controller_manager 服务枚举控制器，订阅 /joint_states，
 * 为 joint_trajectory_controller 类型的控制器生成关节滑条并下发 JointTrajectory。
 */
import { useState, useEffect, useRef, useMemo } from 'react'
import { useROS } from '../hooks/useROS'
import ROSLIB from 'roslib'

interface JointState {
  name: string
  position: number
}

interface ControllerInfo {
  name: string
  type: string
  isJtc: boolean
}

interface TrajectoryPoint {
  positions: number[]
  timeFromStart: { sec: number; nanosec: number }
}

export default function JtcPage() {
  const { ros, connected } = useROS()
  const [controllers, setControllers] = useState<ControllerInfo[]>([])
  const [selected, setSelected] = useState<ControllerInfo | null>(null)
  const [joints, setJoints] = useState<JointState[]>([])
  const [targets, setTargets] = useState<number[]>([])
  const [duration, setDuration] = useState(2)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [followStatus, setFollowStatus] = useState<string | null>(null)
  const jointStateSub = useRef<ROSLIB.Topic | null>(null)
  const latestJoints = useRef<JointState[]>([])

  /** 枚举 controller_manager 中的控制器 */
  const refreshControllers = async () => {
    if (!ros || !connected) return
    setError(null)
    try {
      const services = await (async () => {
        const r: any = await new Promise((resolve, reject) => {
          const svc = new ROSLIB.Service({ ros, name: '/rosapi/services', serviceType: 'rosapi/Services' })
          svc.callService(new ROSLIB.ServiceRequest({}), (res: any) => resolve(res), reject)
        })
        return (r?.services || []) as string[]
      })()

      const listSrv = services.find(s => s.includes('list_controllers'))
      if (!listSrv) {
        setError('未发现 /controller_manager/list_controllers 服务（机器人未运行 ros2_control）')
        setControllers([])
        return
      }

      const result: any = await new Promise((resolve, reject) => {
        const svc = new ROSLIB.Service({ ros, name: listSrv, serviceType: 'controller_manager/srv/ListControllers' })
        svc.callService(new ROSLIB.ServiceRequest({}), (res: any) => resolve(res), reject)
      })

      const infos: ControllerInfo[] = (result?.controller || []).map((c: any) => ({
        name: c.name,
        type: c.type,
        isJtc: !!c.type?.includes('JointTrajectoryController'),
      }))
      setControllers(infos)
      if (infos.length === 0) setError('controller_manager 未返回任何控制器')
    } catch (e: any) {
      setError(`枚举控制器失败：${e.message}`)
    }
  }

  useEffect(() => { if (connected) refreshControllers() }, [connected])

  /** 订阅 /joint_states */
  useEffect(() => {
    if (!ros || !connected) return
    const sub = new ROSLIB.Topic({ ros, name: '/joint_states', messageType: 'sensor_msgs/msg/JointState', throttle_rate: 100 })
    sub.subscribe((msg: any) => {
      const names: string[] = msg.name || []
      const positions: number[] = msg.position || []
      latestJoints.current = names.map((n, i) => ({ name: n, position: positions[i] ?? 0 }))
      setJoints(latestJoints.current)
    })
    jointStateSub.current = sub
    return () => { try { sub.unsubscribe() } catch {} }
  }, [ros, connected])

  /** 选择控制器后初始化目标值为当前关节位置 */
  const selectController = (c: ControllerInfo) => {
    setSelected(c)
    setFollowStatus(null)
    setTargets(joints.map(j => j.position))
  }

  const jointNames = useMemo(() => joints.map(j => j.name), [joints])

  /** 下发轨迹（FollowJointTrajectory action goal，经 rosbridge send_action_goal） */
  const sendTrajectory = async () => {
    if (!selected || !selected.isJtc || !ros) return
    setSending(true)
    setError(null)
    try {
      const points: TrajectoryPoint[] = [{
        positions: targets,
        timeFromStart: { sec: duration, nanosec: 0 },
      }]
      const actionName = `/${selected.name}/follow_joint_trajectory`
      const actionType = 'control_msgs/action/FollowJointTrajectory'
      const id = `jtc-goal-${Date.now()}`

      ros.callOnConnection({
        op: 'send_action_goal',
        id,
        action: actionName,
        action_type: actionType,
        args: {
          trajectory: {
            joint_names: jointNames,
            points,
          },
        },
        feedback: true,
      })
      setFollowStatus('轨迹已发送（结果回调见控制台日志）')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">🎛️ 关节轨迹控制器</h1>
        <button onClick={refreshControllers} disabled={!connected}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400">刷新控制器</button>
      </div>

      {error && <div className="mb-4 p-3 rounded bg-red-100 text-red-700 text-sm">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 控制器列表 */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-3 border-b text-sm font-semibold">控制器 ({controllers.length})</div>
          <div className="overflow-y-auto max-h-[400px]">
            {controllers.map(c => (
              <div key={c.name}
                className={`p-3 border-b cursor-pointer hover:bg-gray-50 ${selected?.name === c.name ? 'bg-blue-50' : ''}`}
                onClick={() => selectController(c)}>
                <div className="font-medium text-sm font-mono">{c.name}</div>
                <div className="text-xs text-gray-500 font-mono truncate">{c.type}</div>
                {c.isJtc && <span className="text-xs text-green-600">✓ JTC</span>}
              </div>
            ))}
            {controllers.length === 0 && <div className="p-4 text-sm text-gray-400 text-center">未发现控制器</div>}
          </div>
        </div>

        {/* 关节滑条 */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="font-semibold mb-3">
              {selected ? `${selected.name} — 关节控制` : '选择控制器'}
              {selected && !selected.isJtc && <span className="ml-2 text-xs text-amber-600">（非 JTC 控制器，仅显示关节状态）</span>}
            </h2>
            {joints.length === 0 ? (
              <div className="text-gray-400 text-center py-8">等待 /joint_states 数据…</div>
            ) : (
              <div className="space-y-3 max-h-[320px] overflow-y-auto">
                {joints.map((j, i) => (
                  <div key={j.name} className="flex items-center gap-3">
                    <span className="text-sm font-mono w-32 shrink-0 truncate">{j.name}</span>
                    <input type="range"
                      min={j.position - Math.PI} max={j.position + Math.PI} step={0.01}
                      value={targets[i] ?? j.position}
                      onChange={e => setTargets(prev => { const n = [...prev]; n[i] = Number(e.target.value); return n })}
                      className="flex-1" disabled={!selected?.isJtc} />
                    <span className="text-xs font-mono w-20 text-right">
                      {j.position.toFixed(2)} → {(targets[i] ?? j.position).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {selected?.isJtc && joints.length > 0 && (
              <div className="mt-4 flex items-center gap-3 flex-wrap">
                <label className="flex items-center gap-1 text-sm">时长
                  <input type="number" min={0.1} step={0.1} value={duration}
                    onChange={e => setDuration(Number(e.target.value) || 1)}
                    className="w-20 px-2 py-1 border rounded" /> s
                </label>
                <button onClick={() => setTargets(joints.map(j => j.position))}
                  className="px-3 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300">重置为当前位置</button>
                <button onClick={sendTrajectory} disabled={sending}
                  className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400">
                  {sending ? '发送中…' : '发送轨迹'}
                </button>
                {followStatus && <span className="text-sm text-green-600">{followStatus}</span>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
