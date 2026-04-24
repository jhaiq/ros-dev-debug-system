import { useState, useEffect, useCallback } from 'react'
import { useROS } from '../hooks/useROS'
import ROSLIB from 'roslib'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Text } from '@react-three/drei'

interface Transform {
  parent: string
  child: string
  x: number
  y: number
  z: number
}

function CoordinateFrame({ position, label, color = 'white' }: { position: [number, number, number]; label: string; color?: string }) {
  return (
    <group position={position}>
      {/* AxesHelper replaced with simple colored lines */}
      <line>
        <bufferGeometry attach="geometry" />
        <lineBasicMaterial attach="material" color="red" />
      </line>
      <Text position={[0, 0.15, 0]} fontSize={0.08} color={color} anchorX="center" anchorY="middle">
        {label}
      </Text>
    </group>
  )
}

export default function TF3DPage() {
  const { ros, connected } = useROS()
  const [transforms, setTransforms] = useState<Transform[]>([])
  const [frames, setFrames] = useState<string[]>([])
  const [selectedFrame, setSelectedFrame] = useState<string | null>(null)

  const fetchTF = useCallback(() => {
    if (!ros || !connected) return

    const tfTopic = new ROSLIB.Topic({ ros, name: '/tf', messageType: 'tf2_msgs/TFMessage', throttle_rate: 200 })
    tfTopic.subscribe((msg: any) => {
      if (msg.transforms) {
        const newTransforms: Transform[] = msg.transforms.map((t: any) => ({
          parent: t.header.frame_id,
          child: t.child_frame_id,
          x: t.transform.translation.x,
          y: t.transform.translation.y,
          z: t.transform.translation.z,
        }))
        setTransforms(newTransforms)
        const allFrames = new Set<string>()
        newTransforms.forEach(t => { allFrames.add(t.parent); allFrames.add(t.child) })
        setFrames([...allFrames])
      }
    })

    return () => tfTopic.unsubscribe()
  }, [ros, connected])

  useEffect(() => {
    if (connected) {
      const cleanup = fetchTF()
      return cleanup
    }
  }, [connected, fetchTF])

  // Build position map: accumulate transforms from root
  const getPositions = (): Record<string, [number, number, number]> => {
    const positions: Record<string, [number, number, number]> = {}
    const parentMap: Record<string, Transform> = {}
    transforms.forEach(t => { parentMap[t.child] = t })

    // Find roots (frames with no parent)
    const allChildren = new Set(transforms.map(t => t.child))
    const roots = transforms.filter(t => !allChildren.has(t.parent))

    // BFS from roots
    const queue: Transform[] = roots
    roots.forEach(r => {
      positions[r.parent] = [0, 0, 0]
      positions[r.child] = [r.x, r.y, r.z]
    })

    while (queue.length > 0) {
      const current = queue.shift()!
      const children = transforms.filter(t => t.parent === current.child)
      children.forEach(child => {
        const parentPos = positions[child.parent] || [0, 0, 0]
        positions[child.child] = [
          parentPos[0] + child.x,
          parentPos[1] + child.y,
          parentPos[2] + child.z,
        ]
        queue.push(child)
      })
    }

    return positions
  }

  const positions = getPositions()

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">🧊 TF 3D 可视化</h1>
        <span className="text-sm text-gray-500">{frames.length} frames</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 bg-gray-900 rounded-lg overflow-hidden" style={{ height: 600 }}>
          <Canvas camera={{ position: [3, 3, 3], fov: 50 }}>
            <ambientLight intensity={0.5} />
            <gridHelper args={[10, 10]} />
            {Object.entries(positions).map(([frame, pos]) => (
              <CoordinateFrame
                key={frame}
                position={pos}
                label={frame}
                color={selectedFrame === frame ? '#fbbf24' : 'white'}
              />
            ))}
            <OrbitControls />
          </Canvas>
        </div>

        <div className="bg-white rounded-lg shadow p-4 max-h-[600px] overflow-y-auto">
          <h3 className="font-semibold mb-3">坐标系列表</h3>
          {frames.map(f => (
            <div key={f}
              className={`px-3 py-2 rounded cursor-pointer text-sm mb-1 ${selectedFrame === f ? 'bg-blue-100 font-semibold' : 'hover:bg-gray-100'}`}
              onClick={() => setSelectedFrame(f)}>
              {f}
            </div>
          ))}
        </div>
      </div>

      {selectedFrame && positions[selectedFrame] && (
        <div className="mt-4 bg-white rounded-lg shadow p-4">
          <h3 className="font-semibold">{selectedFrame}</h3>
          <div className="grid grid-cols-3 gap-4 mt-2 text-sm">
            <div>X: {positions[selectedFrame][0].toFixed(3)} m</div>
            <div>Y: {positions[selectedFrame][1].toFixed(3)} m</div>
            <div>Z: {positions[selectedFrame][2].toFixed(3)} m</div>
          </div>
        </div>
      )}
    </div>
  )
}
