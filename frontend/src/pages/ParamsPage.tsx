import { useState, useEffect, useCallback } from 'react'
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
  const [search, setSearch] = useState('')
  const [params, setParams] = useState<ParamNode[]>([])
  const [selectedParam, setSelectedParam] = useState<string | null>(null)
  const [paramValue, setParamValue] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const fetchParams = useCallback(() => {
    if (!ros || !connected) return
    // Use GetParamNames (the correct rosapi service)
    const getParamNames = new ROSLIB.Service({ ros, name: '/rosapi/get_param_names', serviceType: 'rosapi/GetParamNames' })
    getParamNames.callService(new ROSLIB.ServiceRequest({}), (result: any) => {
      const names: string[] = result.names || []
      // Build tree
      const tree: ParamNode[] = []
      const nodeMap: Record<string, ParamNode> = {}
      names.forEach(name => {
        const parts = name.split('/').filter(Boolean)
        let currentPath = ''
        let currentLevel = tree
        parts.forEach((part, idx) => {
          currentPath += '/' + part
          if (!nodeMap[currentPath]) {
            const node: ParamNode = { name: part, isLeaf: idx === parts.length - 1, children: [] }
            nodeMap[currentPath] = node
            currentLevel.push(node)
            currentLevel = node.children!
          } else {
            if (idx === parts.length - 1) nodeMap[currentPath].isLeaf = true
            currentLevel = nodeMap[currentPath].children!
          }
        })
      })
      setParams(tree)
    })
  }, [ros, connected])

  const getParam = (paramName: string) => {
    if (!ros || !connected) return
    const getParam = new ROSLIB.Service({ ros, name: '/rosapi/get_param', serviceType: 'rosapi/GetParam' })
    getParam.callService(new ROSLIB.ServiceRequest({ name: paramName }), (result: any) => {
      try {
        const val = JSON.parse(result.value)
        setParamValue(JSON.stringify(val, null, 2))
      } catch {
        setParamValue(result.value || '')
      }
      setSelectedParam(paramName)
    })
  }

  const setParam = () => {
    if (!ros || !connected || !selectedParam) return
    const setParamSvc = new ROSLIB.Service({ ros, name: '/rosapi/set_param', serviceType: 'rosapi/SetParam' })
    try {
      const value = JSON.parse(paramValue)
      setParamSvc.callService(new ROSLIB.ServiceRequest({ name: selectedParam, value: JSON.stringify(value) }), (result: any) => {
        if (result.success !== false) {
          setMessage({ type: 'success', text: '参数已更新' })
        } else {
          setMessage({ type: 'error', text: '更新失败' })
        }
        setTimeout(() => setMessage(null), 3000)
      })
    } catch (e: any) {
      setMessage({ type: 'error', text: 'JSON 格式错误: ' + e.message })
      setTimeout(() => setMessage(null), 3000)
    }
  }

  const deleteParam = () => {
    if (!ros || !connected || !selectedParam) return
    const delSvc = new ROSLIB.Service({ ros, name: '/rosapi/delete_param', serviceType: 'rosapi/DeleteParam' })
    delSvc.callService(new ROSLIB.ServiceRequest({ name: selectedParam }), (result: any) => {
      if (result.success !== false) {
        setMessage({ type: 'success', text: '参数已删除' })
        setSelectedParam(null)
        setParamValue('')
        fetchParams()
      }
      setTimeout(() => setMessage(null), 3000)
    })
  }

  useEffect(() => { if (connected) fetchParams() }, [connected, fetchParams])

  const filterTree = (nodes: ParamNode[], prefix = ''): ParamNode[] => {
    if (!search) return nodes
    return nodes.reduce<ParamNode[]>((acc, node) => {
      const fullPath = prefix + '/' + node.name
      const match = fullPath.toLowerCase().includes(search.toLowerCase())
      const filteredChildren = node.children ? filterTree(node.children, fullPath) : []
      if (match || filteredChildren.length > 0) {
        acc.push({ ...node, children: filteredChildren })
      }
      return acc
    }, [])
  }

  const ParamTree = ({ nodes, path = '' }: { nodes: ParamNode[]; path?: string }) => (
    <ul className="ml-2">
      {nodes.map(node => {
        const currentPath = path + '/' + node.name
        return (
          <li key={currentPath} className="py-0.5">
            <div className={`cursor-pointer hover:bg-gray-100 px-2 py-1 rounded text-sm ${selectedParam === currentPath ? 'bg-blue-50 font-semibold' : ''}`}
              onClick={() => node.isLeaf && getParam(currentPath)}>
              <span className="mr-1">{node.isLeaf ? '📄' : '📁'}</span>{node.name}
            </div>
            {node.children && node.children.length > 0 && <ParamTree nodes={node.children} path={currentPath} />}
          </li>
        )
      })}
    </ul>
  )

  const filteredParams = filterTree(params)

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">⚙️ 参数服务器</h1>
        <button onClick={fetchParams} disabled={!connected} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400">刷新</button>
      </div>
      {message && (
        <div className={`mb-4 p-3 rounded ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{message.text}</div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索参数..." className="w-full px-3 py-2 border rounded text-sm" />
          </div>
          <div className="p-4 overflow-y-auto max-h-[600px]">
            <ParamTree nodes={filteredParams} />
          </div>
        </div>
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="font-semibold mb-3">{selectedParam || '选择一个参数'}</h2>
            {selectedParam ? (
              <>
                <label className="block text-sm font-medium mb-2">参数值 (JSON)</label>
                <textarea value={paramValue} onChange={e => setParamValue(e.target.value)} className="w-full p-3 border rounded font-mono text-sm h-64" />
                <div className="flex gap-2 mt-3">
                  <button onClick={setParam} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">更新</button>
                  <button onClick={deleteParam} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">删除</button>
                </div>
              </>
            ) : (
              <div className="text-gray-400 text-center py-12">从左侧选择参数</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
