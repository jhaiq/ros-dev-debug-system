import { useState, useEffect } from 'react'
import { useROS } from '../hooks/useROS'
import ROSLIB from 'roslib'

interface ParamNode {
  name: string
  value?: any
  children?: ParamNode[]
  isLeaf: boolean
}

export default function ParamsPage() {
  const { ros, connected } = useROS()
  const [params, setParams] = useState<ParamNode[]>([])
  const [selectedParam, setSelectedParam] = useState<string | null>(null)
  const [paramValue, setParamValue] = useState('')
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null)

  const fetchParams = () => {
    if (!ros || !connected) return

    const getParams = new ROSLIB.Service({
      ros,
      name: '/rosapi/get_params',
      serviceType: 'rosapi/GetParams'
    })

    getParams.call({}, (result: any) => {
      const paramNames = result.params || []
      
      // 构建树形结构
      const tree: ParamNode[] = []
      const nodeMap: Record<string, ParamNode> = {}

      paramNames.forEach((name: string) => {
        const parts = name.split('/').filter(p => p)
        let currentPath = ''
        let currentLevel = tree

        parts.forEach((part, index) => {
          currentPath += '/' + part
          const existing = nodeMap[currentPath]
          
          if (existing) {
            if (index === parts.length - 1) {
              existing.isLeaf = true
            }
          } else {
            const node: ParamNode = {
              name: part,
              isLeaf: index === parts.length - 1
            }
            nodeMap[currentPath] = node
            currentLevel.push(node)
            node.children = []
            currentLevel = node.children as ParamNode[]
          }
        })
      })

      setParams(tree)
    })
  }

  const getParam = (paramName: string) => {
    if (!ros || !connected) return

    const getParamService = new ROSLIB.Service({
      ros,
      name: '/rosapi/get_param',
      serviceType: 'rosapi/GetParam'
    })

    getParamService.call({ name: paramName }, (result: any) => {
      setParamValue(JSON.stringify(JSON.parse(result.value), null, 2))
      setSelectedParam(paramName)
    })
  }

  const setParamValueService = () => {
    if (!ros || !connected || !selectedParam) return

    const setParamService = new ROSLIB.Service({
      ros,
      name: '/rosapi/set_param',
      serviceType: 'rosapi/SetParam'
    })

    try {
      const value = JSON.parse(paramValue)
      setParamService.call({ 
        name: selectedParam, 
        value: JSON.stringify(value) 
      }, (result: any) => {
        if (result.success) {
          setMessage({ type: 'success', text: '参数已更新' })
          setTimeout(() => setMessage(null), 3000)
        } else {
          setMessage({ type: 'error', text: '更新失败' })
        }
      })
    } catch (e) {
      setMessage({ type: 'error', text: 'JSON 格式错误：' + (e as Error).message })
      setTimeout(() => setMessage(null), 3000)
    }
  }

  const deleteParam = () => {
    if (!ros || !connected || !selectedParam) return

    const deleteParamService = new ROSLIB.Service({
      ros,
      name: '/rosapi/delete_param',
      serviceType: 'rosapi/DeleteParam'
    })

    deleteParamService.call({ name: selectedParam }, (result: any) => {
      if (result.success) {
        setMessage({ type: 'success', text: '参数已删除' })
        setSelectedParam(null)
        setParamValue('')
        fetchParams()
        setTimeout(() => setMessage(null), 3000)
      } else {
        setMessage({ type: 'error', text: '删除失败' })
        setTimeout(() => setMessage(null), 3000)
      }
    })
  }

  useEffect(() => {
    if (connected) {
      fetchParams()
    }
  }, [connected])

  const ParamTree = ({ nodes, path = '' }: { nodes: ParamNode[], path?: string }) => (
    <ul className="ml-4">
      {nodes.map((node) => {
        const currentPath = path + '/' + node.name
        return (
          <li key={currentPath} className="py-1">
            <div
              className={`cursor-pointer hover:bg-gray-100 px-2 rounded ${selectedParam === currentPath ? 'bg-blue-50' : ''}`}
              onClick={() => node.isLeaf && getParam(currentPath)}
            >
              <span className="mr-1">{node.isLeaf ? '📄' : '📁'}</span>
              {node.name}
            </div>
            {node.children && node.children.length > 0 && (
              <ParamTree nodes={node.children} path={currentPath} />
            )}
          </li>
        )
      })}
    </ul>
  )

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">参数服务器</h1>
        <button
          onClick={fetchParams}
          disabled={!connected}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
        >
          刷新
        </button>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 参数树 */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b">
            <h2 className="font-semibold">参数列表</h2>
          </div>
          <div className="p-4 overflow-y-auto max-h-[600px]">
            <ParamTree nodes={params} />
          </div>
        </div>

        {/* 参数编辑 */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="font-semibold mb-3">
              {selectedParam || '选择一个参数'}
            </h2>
            
            {selectedParam ? (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">参数值 (JSON)</label>
                  <textarea
                    value={paramValue}
                    onChange={(e) => setParamValue(e.target.value)}
                    className="w-full p-3 border rounded font-mono text-sm h-64"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={setParamValueService}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    更新
                  </button>
                  <button
                    onClick={deleteParam}
                    className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                  >
                    删除
                  </button>
                </div>
              </>
            ) : (
              <div className="text-gray-400 text-center py-12">
                从左侧选择一个参数进行查看或编辑
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
