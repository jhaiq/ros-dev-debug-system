import { useState, useEffect } from 'react'
import { useROS } from '../hooks/useROS'
import ROSLIB from 'roslib'

interface TFNode {
  frame_id: string
  child_frame_id: string
  children?: TFNode[]
}

export default function TFPage() {
  const { ros, connected } = useROS()
  const [tfTree, setTfTree] = useState<TFNode[]>([])
  const [expandedFrames, setExpandedFrames] = useState<Set<string>>(new Set(['world', 'map', 'odom']))

  const fetchTF = () => {
    if (!ros || !connected) return

    const getFrames = new ROSLIB.Service({
      ros,
      name: '/rosapi/get_frames',
      serviceType: 'rosapi/GetFrames'
    })

    getFrames.call({}, (result: any) => {
      const frames = result.frames || []
      
      // 构建树形结构
      const frameMap: Record<string, TFNode> = {}
      const rootNodes: TFNode[] = []

      frames.forEach((frame: any) => {
        const parentId = frame.parent || 'world'
        const childId = frame.child

        if (!frameMap[parentId]) {
          frameMap[parentId] = { frame_id: parentId, child_frame_id: parentId, children: [] }
        }
        if (!frameMap[childId]) {
          frameMap[childId] = { frame_id: childId, child_frame_id: childId, children: [] }
        }

        frameMap[parentId].children?.push(frameMap[childId])
      })

      // 找到根节点
      const allChildren = new Set(frames.map((f: any) => f.child))
      const roots = frames.filter((f: any) => !allChildren.has(f.parent))
      
      setTfTree(roots.map((r: any) => frameMap[r.parent] || frameMap[r.child]))
    })
  }

  const toggleFrame = (frameId: string) => {
    const newExpanded = new Set(expandedFrames)
    if (newExpanded.has(frameId)) {
      newExpanded.delete(frameId)
    } else {
      newExpanded.add(frameId)
    }
    setExpandedFrames(newExpanded)
  }

  const TFNodeView = ({ node, depth = 0 }: { node: TFNode, depth?: number }) => {
    const isExpanded = expandedFrames.has(node.frame_id)
    const hasChildren = node.children && node.children.length > 0

    return (
      <div style={{ marginLeft: depth * 24 }}>
        <div
          className="flex items-center gap-2 py-2 cursor-pointer hover:bg-gray-50 rounded"
          onClick={() => hasChildren && toggleFrame(node.frame_id)}
        >
          {hasChildren ? (
            <span className="text-gray-500">{isExpanded ? '📂' : '📁'}</span>
          ) : (
            <span className="text-gray-300">📄</span>
          )}
          <span className="font-mono text-sm">{node.frame_id}</span>
          {hasChildren && (
            <span className="text-xs text-gray-400">({node.children?.length} 个子坐标系)</span>
          )}
        </div>
        {hasChildren && isExpanded && (
          <div>
            {node.children?.map((child, idx) => (
              <TFNodeView key={idx} node={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    )
  }

  useEffect(() => {
    if (connected) {
      fetchTF()
    }
  }, [connected])

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">TF 树可视化</h1>
        <button
          onClick={fetchTF}
          disabled={!connected}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
        >
          刷新
        </button>
      </div>

      {!connected ? (
        <div className="text-center py-12 text-gray-500">
          请先连接 ROS
        </div>
      ) : tfTree.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          暂无 TF 数据
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="mb-4 text-sm text-gray-600">
            点击文件夹图标展开/收起子坐标系
          </div>
          <div className="space-y-2">
            {tfTree.map((node, idx) => (
              <TFNodeView key={idx} node={node} />
            ))}
          </div>
        </div>
      )}

      {/* TF 说明 */}
      <div className="mt-6 bg-blue-50 rounded-lg p-4">
        <h3 className="font-semibold mb-2">📖 关于 TF</h3>
        <p className="text-sm text-gray-700">
          TF (Transform) 是 ROS 中用于管理坐标系变换的系统。它允许你在不同坐标系之间转换点和向量，
          例如从激光雷达坐标系转换到机器人基座坐标系。常见的坐标系包括：
        </p>
        <ul className="mt-2 text-sm text-gray-700 list-disc list-inside">
          <li><strong>world/map</strong> - 世界/地图坐标系（固定）</li>
          <li><strong>odom</strong> - 里程计坐标系（连续但会漂移）</li>
          <li><strong>base_link</strong> - 机器人基座坐标系</li>
          <li><strong>laser/camera</strong> - 传感器坐标系</li>
        </ul>
      </div>
    </div>
  )
}
