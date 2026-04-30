import { useState, useEffect } from 'react'
import { useROS } from '../hooks/useROS'
import ROSLIB from 'roslib'

interface ServiceInfo {
  name: string
  type: string
}

export default function ServicesPage() {
  const { ros, connected, cache, setCache } = useROS()
  const [services, setServices] = useState<ServiceInfo[]>(() => cache.services.length > 0 ? cache.services : [])
  const [search, setSearch] = useState('')
  const [selectedService, setSelectedService] = useState<string | null>(null)
  const [requestText, setRequestText] = useState('{}')
  const [response, setResponse] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const fetchServices = () => {
    if (!ros || !connected) return
    const getServices = new ROSLIB.Service({ ros, name: '/rosapi/services', serviceType: 'rosapi/Services' })
    const getServiceTypes = new ROSLIB.Service({ ros, name: '/rosapi/service_types', serviceType: 'rosapi/ServiceTypes' })
    getServices.callService(new ROSLIB.ServiceRequest({}), (r1: any) => {
      const names: string[] = r1.services || []
      getServiceTypes.callService(new ROSLIB.ServiceRequest({}), (r2: any) => {
        const types: string[] = r2.types || []
        const info = names.map((name, i) => ({ name, type: types[i] || 'unknown' }))
        setServices(info)
        setCache(prev => ({ ...prev, services: info.slice(0, 200), servicesFetchedAt: Date.now() }))
      })
    })
  }

  const callService = () => {
    if (!ros || !connected || !selectedService) return
    const svc = services.find(s => s.name === selectedService)
    if (!svc) return
    setLoading(true)
    try {
      const service = new ROSLIB.Service({ ros, name: selectedService, serviceType: svc.type })
      const request = new ROSLIB.ServiceRequest(JSON.parse(requestText))
      service.callService(request, (result: any) => {
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
              <div key={svc.name} className={`p-3 border-b cursor-pointer hover:bg-gray-50 ${selectedService === svc.name ? 'bg-blue-50' : ''}`}
                onClick={() => { setSelectedService(svc.name); setResponse(null); setRequestText('{}') }}>
                <div className="font-medium text-sm truncate">{svc.name}</div>
                <div className="text-xs text-gray-500">{svc.type}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="font-semibold mb-3">{selectedService || '选择一个服务'}</h2>
            <label className="block text-sm font-medium mb-2">请求参数 (JSON)</label>
            <textarea value={requestText} onChange={e => setRequestText(e.target.value)} className="w-full p-3 border rounded font-mono text-sm h-32" placeholder='{}' />
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
