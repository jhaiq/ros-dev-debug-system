import { useState, useEffect, useCallback } from 'react'
import { useROS } from '../hooks/useROS'
import ROSLIB from 'roslib'

interface NodeInfo {
  name: string
  publications: string[]
  subscriptions: string[]
  services: string[]
}

export default function NodesPage() {
  const { ros, connected } = useROS()
  const [nodes, setNodes] = useState<NodeInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedNode, setSelectedNode] = useState<string | null>(null)

  const fetchNodes = useCallback(() => {
    if (!ros || !connected) return
    setLoading(true)
    const getNodes = new ROSLIB.Service({ ros, name: '/rosapi/nodes', serviceType: 'rosapi/Nodes' })
    getNodes.callService(new ROSLIB.ServiceRequest({}), (result: any) => {
      const nodeNames: string[] = result.nodes || []
      const details: NodeInfo[] = []
      let pending = nodeNames.length
      if (pending === 0) { setNodes([]); setLoading(false); return }

      nodeNames.forEach(nodeName => {
        const getNodeDetails = new ROSLIB.Service({ ros, name: '/rosapi/node_details', serviceType: 'rosapi/NodeDetails' })
        getNodeDetails.callService(new ROSLIB.ServiceRequest({ node: nodeName }), (r: any) => {
          details.push({
            name: nodeName,
            publications: r.publications || [],
            subscriptions: r.subscriptions || [],
            services: r.services || []
          })
          pending--
          if (pending === 0) { setNodes(details); setLoading(false) }
        })
      })
    })
  }, [ros, connected])

  useEffect(() => { if (connected) fetchNodes() }, [connected, fetchNodes])

  const filtered = nodes.filter(n =>
    n.name.toLowerCase().includes(search.toLowerCase()) ||
    n.publications.some(p => p.toLowerCase().includes(search.toLowerCase())) ||
    n.subscriptions.some(s => s.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">📦 节点管理</h1>
        <button onClick={fetchNodes} disabled={!connected || loading} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400">
          {loading ? '刷新中...' : '刷新'}
        </button>
      </div>
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索节点或话题..." className="w-full px-3 py-2 border rounded text-sm" />
      </div>
      {!connected ? (
        <div className="text-center py-12 text-gray-500">请先连接 ROS</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">{loading ? '加载中...' : '暂无节点数据'}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(node => (
            <div key={node.name} className="bg-white rounded-lg shadow p-4 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setSelectedNode(selectedNode === node.name ? null : node.name)}>
              <div className="font-semibold truncate">{node.name}</div>
              <div className="text-sm text-gray-500 mt-1">
                {node.publications.length} 发布 · {node.subscriptions.length} 订阅 · {node.services.length} 服务
              </div>
              {selectedNode === node.name && (
                <div className="mt-3 pt-3 border-t space-y-2 text-sm">
                  {node.publications.length > 0 && (
                    <div>
                      <div className="font-medium text-green-700 mb-1">发布:</div>
                      <div className="flex flex-wrap gap-1">
                        {node.publications.map(p => <span key={p} className="px-2 py-0.5 bg-green-100 text-green-800 rounded text-xs">{p}</span>)}
                      </div>
                    </div>
                  )}
                  {node.subscriptions.length > 0 && (
                    <div>
                      <div className="font-medium text-blue-700 mb-1">订阅:</div>
                      <div className="flex flex-wrap gap-1">
                        {node.subscriptions.map(s => <span key={s} className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs">{s}</span>)}
                      </div>
                    </div>
                  )}
                  {node.services.length > 0 && (
                    <div>
                      <div className="font-medium text-purple-700 mb-1">服务:</div>
                      <div className="flex flex-wrap gap-1">
                        {node.services.map(s => <span key={s} className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded text-xs">{s}</span>)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
