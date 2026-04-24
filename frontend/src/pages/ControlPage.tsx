import { useState, useEffect, useRef } from 'react'
import { useROS } from '../hooks/useROS'
import ROSLIB from 'roslib'

export default function ControlPage() {
  const { ros, connected } = useROS()
  const [linear, setLinear] = useState(0)
  const [angular, setAngular] = useState(0)
  const [maxLinear, setMaxLinear] = useState(0.5)
  const [maxAngular, setMaxAngular] = useState(1.0)
  const [keyboardMode, setKeyboardMode] = useState(false)
  const [cmdVelTopic] = useState('/cmd_vel')
  const publisherRef = useRef<ROSLIB.Topic | null>(null)
  const keysPressed = useRef<Set<string>>(new Set())

  // Publish cmd_vel
  useEffect(() => {
    if (!ros || !connected) return
    const pub = new ROSLIB.Topic({ ros, name: cmdVelTopic, messageType: 'geometry_msgs/Twist' })
    publisherRef.current = pub
    return () => { pub.unsubscribe() }
  }, [ros, connected, cmdVelTopic])

  useEffect(() => {
    if (publisherRef.current && (linear !== 0 || angular !== 0)) {
      const msg = new ROSLIB.Message({
        linear: { x: linear, y: 0, z: 0 },
        angular: { x: 0, y: 0, z: angular }
      })
      publisherRef.current.publish(msg)
    }
  }, [linear, angular])

  // Keyboard control
  useEffect(() => {
    if (!keyboardMode) return

    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed.current.add(e.key)
      updateVelocity()
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current.delete(e.key)
      updateVelocity()
    }

    const updateVelocity = () => {
      let l = 0, a = 0
      if (keysPressed.current.has('w') || keysPressed.current.has('ArrowUp')) l = maxLinear
      if (keysPressed.current.has('s') || keysPressed.current.has('ArrowDown')) l = -maxLinear
      if (keysPressed.current.has('a') || keysPressed.current.has('ArrowLeft')) a = maxAngular
      if (keysPressed.current.has('d') || keysPressed.current.has('ArrowRight')) a = -maxAngular
      setLinear(l)
      setAngular(a)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [keyboardMode, maxLinear, maxAngular])

  const stop = () => {
    setLinear(0)
    setAngular(0)
    keysPressed.current.clear()
  }

  const ArrowButton = ({ label, onClick }: { label: string; onClick: () => void }) => (
    <button
      onMouseDown={onClick}
      onMouseUp={stop}
      onMouseLeave={stop}
      onTouchStart={onClick}
      onTouchEnd={stop}
      className="w-16 h-16 bg-white rounded-lg shadow flex items-center justify-center text-2xl hover:bg-gray-100 active:bg-blue-100 select-none"
    >
      {label}
    </button>
  )

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">🎮 机器人控制</h1>

      {/* 控制模式 */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex gap-4 items-center mb-4">
          <button onClick={() => { setKeyboardMode(false); stop() }}
            className={`px-4 py-2 rounded ${!keyboardMode ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
            遥控器
          </button>
          <button onClick={() => setKeyboardMode(true)}
            className={`px-4 py-2 rounded ${keyboardMode ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
            键盘 (WASD)
          </button>
        </div>

        {keyboardMode && (
          <div className="text-sm text-gray-600 bg-blue-50 p-3 rounded">
            <strong>W/↑</strong> 前进 · <strong>S/↓</strong> 后退 · <strong>A/←</strong> 左转 · <strong>D/→</strong> 右转 · 松开按键停止
          </div>
        )}
      </div>

      {!keyboardMode && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex justify-center">
            <div className="grid grid-cols-3 gap-2">
              <div />
              <ArrowButton label="↑" onClick={() => { setLinear(maxLinear); setAngular(0) }} />
              <div />
              <ArrowButton label="←" onClick={() => { setLinear(0); setAngular(maxAngular) }} />
              <button onClick={stop} className="w-16 h-16 bg-red-600 text-white rounded-lg shadow flex items-center justify-center text-xl hover:bg-red-700">
                ■
              </button>
              <ArrowButton label="→" onClick={() => { setLinear(0); setAngular(-maxAngular) }} />
              <div />
              <ArrowButton label="↓" onClick={() => { setLinear(-maxLinear); setAngular(0) }} />
              <div />
            </div>
          </div>
        </div>
      )}

      {/* 速度设置 */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h3 className="font-semibold mb-4">速度设置</h3>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="text-sm text-gray-500">线速度 (m/s)</label>
            <input type="range" min={0.1} max={2} step={0.1} value={maxLinear}
              onChange={e => setMaxLinear(Number(e.target.value))} className="w-full" />
            <div className="text-center font-mono">{maxLinear.toFixed(1)}</div>
          </div>
          <div>
            <label className="text-sm text-gray-500">角速度 (rad/s)</label>
            <input type="range" min={0.1} max={3} step={0.1} value={maxAngular}
              onChange={e => setMaxAngular(Number(e.target.value))} className="w-full" />
            <div className="text-center font-mono">{maxAngular.toFixed(1)}</div>
          </div>
        </div>
      </div>

      {/* 实时速度显示 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="font-semibold mb-2">实时速度</h3>
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <div className="text-sm text-gray-500">线速度</div>
            <div className="text-2xl font-mono font-bold text-blue-600">{linear.toFixed(2)} m/s</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">角速度</div>
            <div className="text-2xl font-mono font-bold text-purple-600">{angular.toFixed(2)} rad/s</div>
          </div>
        </div>
      </div>

      {/* 急停 */}
      <button onClick={stop}
        className="fixed bottom-6 right-6 w-16 h-16 bg-red-600 text-white rounded-full shadow-lg flex items-center justify-center text-2xl hover:bg-red-700 active:scale-95 transition-transform">
        🛑
      </button>
    </div>
  )
}
