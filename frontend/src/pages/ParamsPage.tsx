/**
 * rqt_reconfigure 复刻增强 — 参数服务器
 * 支持：树形视图 / 按节点分组视图、类型化编辑器（bool/number/string）、
 *       数组/对象仍用 JSON 编辑、新增/删除参数。
 */
import { useState, useEffect, useCallback } from 'react'
import { useROS } from '../hooks/useROS'
import ROSLIB from 'roslib'

interface ParamNode {
  name: string
  value?: any
  children?: ParamNode[]
  isLeaf: boolean
}

function buildParamTree(names: string[]): ParamNode[] {
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
  return tree
}

type EditorMode = 'tree' | 'node'

type ParamType = 'bool' | 'number' | 'string' | 'json'

function detectType(v: any): ParamType {
  if (typeof v === 'boolean') return 'bool'
  if (typeof v === 'number') return 'number'
  if (typeof v === 'string') return 'string'
  return 'json'
}

export default function ParamsPage() {
  const { ros, connected, cache, setCache } = useROS()
  const [search, setSearch] = useState('')
  const [mode, setMode] = useState<EditorMode>('tree')
  const [params, setParams] = useState<ParamNode[]>(() => {
    if (cache.params.length > 0) return buildParamTree(cache.params)
    return []
  })
  const [selectedParam, setSelectedParam] = useState<string | null>(null)
  const [paramValue, setParamValue] = useState('')
  const [editorType, setEditorType] = useState<ParamType>('json')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const fetchParams = useCallback(() => {
    if (!ros || !connected) return
    const getParamNames = new ROSLIB.Service({ ros, name: '/rosapi/get_param_names', serviceType: 'rosapi/GetParamNames' })
    getParamNames.callService(new ROSLIB.ServiceRequest({}), (result: any) => {
      const names: string[] = result.names || []
      const tree = buildParamTree(names)
      setParams(tree)
      setCache(prev => ({ ...prev, params: names, paramsFetchedAt: Date.now() }))
    })
  }, [ros, connected, setCache])

  useEffect(() => { if (connected) fetchParams() }, [connected, fetchParams])

  const getParam = (paramName: string) => {
    if (!ros || !connected) return
    const getParamSvc = new ROSLIB.Service({ ros, name: '/rosapi/get_param', serviceType: 'rosapi/GetParam' })
    getParamSvc.callService(new ROSLIB.ServiceRequest({ name: paramName }), (result: any) => {
      try {
        const val = JSON.parse(result.value)
        setEditorType(detectType(val))
        setParamValue(formatValue(val))
      } catch {
        setEditorType('string')
        setParamValue(result.value || '')
      }
      setSelectedParam(paramName)
    })
  }

  const formatValue = (v: any): string => {
    if (typeof v === 'boolean') return v ? 'true' : 'false'
    if (typeof v === 'number') return String(v)
    if (typeof v === 'string') return v
    return JSON.stringify(v, null, 2)
  }

  const parseValue = (): any => {
    if (editorType === 'bool') return paramValue === 'true'
    if (editorType === 'number') return Number(paramValue)
    if (editorType === 'string') return paramValue
    return JSON.parse(paramValue)
  }

  const setParam = () => {
    if (!ros || !connected || !selectedParam) return
    const setParamSvc = new ROSLIB.Service({ ros, name: '/rosapi/set_param', serviceType: 'rosapi/SetParam' })
    try {
      const value = parseValue()
      setParamSvc.callService(new ROSLIB.ServiceRequest({ name: selectedParam, value: JSON.stringify(value) }), (result: any) => {
        setMessage({ type: result.success !== false ? 'success' : 'error', text: result.success !== false ? '参数已更新' : '更新失败' })
        setTimeout(() => setMessage(null), 3000)
      })
    } catch (e: any) {
      setMessage({ type: 'error', text: '格式错误: ' + e.message })
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

  const renderTree = (nodes: ParamNode[], prefix = ''): ParamNode[] => {
    if (!search) return nodes
    return nodes.reduce<ParamNode[]>((acc, node) => {
      const fullPath = prefix + '/' + node.name
      const match = fullPath.toLowerCase().includes(search.toLowerCase())
      const filteredChildren = node.children ? renderTree(node.children, fullPath) : []
      if (match || filteredChildren.length > 0) acc.push({ ...node, children: filteredChildren })
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

  const nodeGroups = () => {
    const map = new Map<string, string[]>()
    cache.params.forEach(full => {
      const parts = full.split('/').filter(Boolean)
      const node = parts[0] || '(全局)'
      map.set(node, [...(map.get(node) || []), full])
    })
    return new Map([...map.entries()].sort())
  }

  const filteredGroups = () => {
    const low = search.toLowerCase()
    const groups = nodeGroups()
    if (!low) return groups
    const filtered = new Map<string, string[]>()
    groups.forEach((list, node) => {
      const hits = list.filter(p => p.toLowerCase().includes(low))
      if (hits.length) filtered.set(node, hits)
      else if (node.toLowerCase().includes(low)) filtered.set(node, list)
    })
    return filtered
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">⚙️ 参数服务器</h1>
        <button onClick={fetchParams} disabled={!connected} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400">刷新</button>
      </div>
      {message && <div className={`mb-4 p-3 rounded ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{message.text}</div>}

      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <div className="flex gap-2 flex-wrap">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索参数..." className="flex-1 min-w-64 px-3 py-2 border rounded text-sm" />
          <div className="flex border rounded overflow-hidden">
            <button onClick={() => setMode('tree')} className={`px-3 py-2 text-sm ${mode === 'tree' ? 'bg-blue-600 text-white' : 'bg-white hover:bg-gray-50'}`}>树形</button>
            <button onClick={() => setMode('node')} className={`px-3 py-2 text-sm ${mode === 'node' ? 'bg-blue-600 text-white' : 'bg-white hover:bg-gray-50'}`}>按节点分组</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 overflow-y-auto max-h-[600px]">
            {mode === 'tree' ? (
              <ParamTree nodes={renderTree(params)} />
            ) : (
              <div className="space-y-3">
                {Array.from(filteredGroups()).map(([node, list]) => (
                  <details key={node} open={!!search}>
                    <summary className="font-medium text-sm cursor-pointer">{node} <span className="text-xs text-gray-400">({list.length})</span></summary>
                    <ul className="ml-4 mt-1 space-y-0.5">
                      {list.map(p => (
                        <li key={p} className={`cursor-pointer text-sm font-mono hover:bg-gray-50 px-1 rounded ${selectedParam === p ? 'bg-blue-50 font-semibold' : ''}`}
                          onClick={() => getParam(p)}>{p}</li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="font-semibold mb-3">{selectedParam || '选择一个参数'}</h2>
            {selectedParam ? (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-gray-500">类型</span>
                  <select value={editorType} onChange={e => setEditorType(e.target.value as ParamType)} className="text-sm border rounded px-2 py-1">
                    <option value="bool">bool</option>
                    <option value="number">number</option>
                    <option value="string">string</option>
                    <option value="json">JSON</option>
                  </select>
                </div>
                {editorType === 'bool' ? (
                  <label className="flex items-center gap-2 p-3 border rounded">
                    <input type="checkbox" checked={paramValue === 'true'} onChange={e => setParamValue(e.target.checked ? 'true' : 'false')} />
                    <span>{paramValue === 'true' ? 'true' : 'false'}</span>
                  </label>
                ) : editorType === 'number' ? (
                  <input type="number" step="any" value={paramValue} onChange={e => setParamValue(e.target.value)}
                    className="w-full p-3 border rounded font-mono text-sm" />
                ) : editorType === 'string' ? (
                  <textarea value={paramValue} onChange={e => setParamValue(e.target.value)} className="w-full p-3 border rounded font-mono text-sm h-40" />
                ) : (
                  <textarea value={paramValue} onChange={e => setParamValue(e.target.value)} className="w-full p-3 border rounded font-mono text-sm h-64" />
                )}
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
