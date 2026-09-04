import { useState, useEffect } from 'react'
import { useROS } from '../hooks/useROS'
import ROSLIB from 'roslib'
import MessageFieldEditor from '../components/MessageFieldEditor'
import { buildTypeDefRegistry, resolveFieldTree, defaultMessageObject, type FieldNode } from '../lib/message-def'
import { rosapi } from '../lib/rosapi'

interface ServiceInfo {
  name: string
  type: string
}

export default function ServicesPage() {
  const { ros, connected, cache, setCache } = useROS()
  const [services, setServices] = useState<ServiceInfo[]>(() => cache.services.length > 0 ? cache.services : [])
  const [search, setSearch] = useState('')
  const [selectedService, setSelectedService] = useState<ServiceInfo | null>(null)
  const [mode, setMode] = useState<'form' | 'json'>('form')
  const [reqTree, setReqTree] = useState<FieldNode[]>([])
  const [formValue, setFormValue] = useState<Record<string, any>>({})
  const [requestText, setRequestText] = useState('{}')
  const [defError, setDefError] = useState<string | null>(null)
  const [response, setResponse] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const fetchServices = async () => {
    if (!ros || !connected) return
    const info = await rosapi.services(ros)
    setServices(info)
    setCache(prev => ({ ...prev, services: info.slice(0, 200), servicesFetchedAt: Date.now() }))
  }

  /** 选中服务：加载 srv 请求定义生成结构化表单（rqt_service_caller 行为） */
  const selectService = async (svc: ServiceInfo) => {
    setSelectedService(svc)
    setResponse(null)
    setDefError(null)
    setReqTree([])
    setFormValue({})
    setRequestText('{}')
    if (!ros || !connected) { setMode('json'); return }
    try {
      // 新版 rosapi 列表不带类型，单查补齐
      let type = svc.type
      if (!type) {
        type = await rosapi.serviceType(ros, svc.name)
        setServices(prev => prev.map(s => s.name === svc.name ? { ...s, type } : s))
      }
      if (!type) throw new Error('无法确定服务类型')
      const typedefs = await rosapi.serviceRequestDetails(ros, type)
      if (!typedefs.length) throw new Error('无法获取请求定义')
      const tree = resolveFieldTree(typedefs[0].type, buildTypeDefRegistry(typedefs))
      const defaults = defaultMessageObject(tree)
      setReqTree(tree)
      setFormValue(defaults)
      setRequestText(JSON.stringify(defaults, null, 2))
      setMode('form')
      setSelectedService({ ...svc, type })
    } catch (e: any) {
      setDefError(`结构化编辑器不可用（${e.message}），已切换为 JSON 模式`)
      setMode('json')
    }
  }

  const switchMode = (m: 'form' | 'json') => {
    if (m === mode) return
    if (m === 'json') {
      setRequestText(JSON.stringify(formValue, null, 2))
    } else {
      try {
        setFormValue(JSON.parse(requestText))
      } catch (e: any) {
        alert('JSON 格式错误：' + e.message)
        return
      }
    }
    setMode(m)
  }

  const callService = () => {
    if (!ros || !connected || !selectedService) return
    setLoading(true)
    try {
      const request = mode === 'form' ? formValue : JSON.parse(requestText)
      const service = new ROSLIB.Service({ ros, name: selectedService.name, serviceType: selectedService.type })
      service.callService(new ROSLIB.ServiceRequest(request), (result: any) => {
        setResponse(result)
        setLoading(false)
      })
    } catch (e: any) {
      setResponse({ error: e.message })
      setLoading(false)
    }
  }

  useEffect(() => { if (connected) fetchServices() }, [connected])

  const filtered = services.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.type.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">🔧 服务调用</h1>
        <button onClick={fetchServices} disabled={!connected} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400">刷新</button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索服务..." className="w-full px-3 py-2 border rounded text-sm" />
            <div className="text-sm text-gray-500 mt-1">{filtered.length} / {services.length}</div>
          </div>
          <div className="overflow-y-auto max-h-[600px]">
            {filtered.map(svc => (
              <div key={svc.name} className={`p-3 border-b cursor-pointer hover:bg-gray-50 ${selectedService?.name === svc.name ? 'bg-blue-50' : ''}`}
                onClick={() => selectService(svc)}>
                <div className="font-medium text-sm truncate">{svc.name}</div>
                <div className="text-xs text-gray-500">{svc.type}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
              <h2 className="font-semibold font-mono text-sm">{selectedService ? `${selectedService.name} — ${selectedService.type}` : '选择一个服务'}</h2>
              {reqTree.length > 0 && (
                <div className="flex border rounded overflow-hidden">
                  <button onClick={() => switchMode('form')} className={`px-3 py-1 text-sm ${mode === 'form' ? 'bg-blue-600 text-white' : 'bg-white hover:bg-gray-50'}`}>表单</button>
                  <button onClick={() => switchMode('json')} className={`px-3 py-1 text-sm ${mode === 'json' ? 'bg-blue-600 text-white' : 'bg-white hover:bg-gray-50'}`}>JSON</button>
                </div>
              )}
            </div>
            {defError && <div className="text-xs text-amber-600 mb-2">{defError}</div>}
            {selectedService && mode === 'form' && reqTree.length > 0 && (
              <div className="border rounded p-3 max-h-[360px] overflow-auto mb-3">
                <MessageFieldEditor tree={reqTree} value={formValue} onChange={setFormValue} />
              </div>
            )}
            {(mode === 'json' || reqTree.length === 0) && (
              <>
                <label className="block text-sm font-medium mb-2">请求参数 (JSON)</label>
                <textarea value={requestText} onChange={e => setRequestText(e.target.value)} className="w-full p-3 border rounded font-mono text-sm h-32" placeholder='{}' />
              </>
            )}
            <button onClick={callService} disabled={!selectedService || loading} className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400">
              {loading ? '调用中...' : '调用服务'}
            </button>
            {response && (
              <div className="mt-4">
                <label className="block text-sm font-medium mb-2">响应结果</label>
                <div className={`p-3 rounded font-mono text-sm ${response.error ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}>
                  <pre>{JSON.stringify(response, null, 2)}</pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
