import { useState, useEffect } from 'react'
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
  const [selectedNode, setSelectedNode] = useState<NodeInfo | null>(null)

  const fetchNodes = async () => {
    if (!ros || !connected) return
    
    setLoading(true)
    try {
      // 获取节点列表
      const getNodes = new ROSLIB.Service({
        ros,
        name: '/rosapi/nodes',
        serviceType: 'rosapi/Nodes'
      })

      getNodes.call({}, async (result: any) => {
        const nodeNames = result.nodes || []
        const nodeDetails: NodeInfo[] = []

        // 获取每个节点的详细信息
        for (const nodeName of nodeNames.slice(0, 50)) { // 限制数量避免过载
          const getNodeDetails = new ROSLIB.Service({
            ros,
            name: '/rosapi/node_details',
            serviceType: 'rosapi/NodeDetails'
          })

          try {
            const details = await new Promise<any>((resolve) => {
              getNodeDetails.call({ node: nodeName }, resolve)
            })
            nodeDetails.push({
              name: nodeName,
              publications: details.publications || [],
              subscriptions: details.subscriptions || [],
              services: details.services || []
            })
          } catch (e) {
            nodeDetails.push({
              name: nodeName,
              publications: [],
              subscriptions: [],
              services: []
            })
          }
        }

        setNodes(nodeDetails)
        setLoading(false)
      })
    } catch (error) {
      console.error('获取节点失败:', error)
      setLoading(false)
    }
  }

  useEffect(() => {
    if (connected) {
      fetchNodes()
    }
  }, [connected])

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">节点管理</h1>
        <button
          onClick={fetchNodes}
          disabled={!connected || loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
        >
          {loading ? '刷新中...' : '刷新'}
        </button>
      </div>

      {!connected ? (
        <div className="text-center py-12 text-gray-500">
          请先连接 ROS
        </div>
      ) : nodes.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          暂无节点数据
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {nodes.map((node) => (
            <div
              key={node.name}
              className="bg-white rounded-lg shadow p-4 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setSelectedNode(selectedNode?.name === node.name ? null : node)}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg truncate">{node.name}</h3>
                <span className="text-sm text-gray-500">
                  {node.publications.length} 发布 / {node.subscriptions.length} 订阅
                </span>
              </div>
              
              {selectedNode?.name === node.name && (
                <div className="mt-4 pt-4 border-t">
                  {node.publications.length > 0 && (
                    <div className="mb-3">
                      <h4 className="font-medium text-sm text-gray-700 mb-1">发布话题:</h4>
                      <div className="flex flex-wrap gap-1">
                        {node.publications.map((pub) => (
                          <span key={pub} className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                            {pub}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {node.subscriptions.length > 0 && (
                    <div className="mb-3">
                      <h4 className="font-medium text-sm text-gray-700 mb-1">订阅话题:</h4>
                      <div className="flex flex-wrap gap-1">
                        {node.subscriptions.map((sub) => (
                          <span key={sub} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                            {sub}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {node.services.length > 0 && (
                    <div>
                      <h4 className="font-medium text-sm text-gray-700 mb-1">提供服务:</h4>
                      <div className="flex flex-wrap gap-1">
                        {node.services.map((svc) => (
                          <span key={svc} className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded">
                            {svc}
                          </span>
                        ))}
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
