import { useState, useEffect } from 'react'
import { useROS } from '../hooks/useROS'
import ROSLIB from 'roslib'

interface ServiceInfo {
  name: string
  type: string
}

export default function ServicesPage() {
  const { ros, connected } = useROS()
  const [services, setServices] = useState<ServiceInfo[]>([])
  const [selectedService, setSelectedService] = useState<string | null>(null)
  const [requestText, setRequestText] = useState('{}')
  const [response, setResponse] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const fetchServices = () => {
    if (!ros || !connected) return

    const getServices = new ROSLIB.Service({
      ros,
      name: '/rosapi/services',
      serviceType: 'rosapi/Services'
    })

    const getServiceTypes = new ROSLIB.Service({
      ros,
      name: '/rosapi/service_types',
      serviceType: 'rosapi/ServiceTypes'
    })

    getServices.call({}, (servicesResult: any) => {
      const serviceNames = servicesResult.services || []
      
      getServiceTypes.call({}, (typesResult: any) => {
        const serviceTypes = typesResult.types || []
        const serviceInfo: ServiceInfo[] = serviceNames.map((name: string, index: number) => ({
          name,
          type: serviceTypes[index] || 'unknown'
        }))
        setServices(serviceInfo.slice(0, 100))
      })
    })
  }

  const callService = () => {
    if (!ros || !connected || !selectedService) return

    setLoading(true)
    try {
      const service = new ROSLIB.Service({
        ros,
        name: selectedService,
        serviceType: 'std_srvs/Empty' // 简化处理，实际需要根据服务类型动态设置
      })

      const request = new ROSLIB.ServiceRequest(JSON.parse(requestText))
      
      service.callService(request, (result: any) => {
        setResponse(result)
        setLoading(false)
      })
    } catch (e) {
      setResponse({ error: (e as Error).message })
      setLoading(false)
    }
  }

  useEffect(() => {
    if (connected) {
      fetchServices()
    }
  }, [connected])

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">服务调用</h1>
        <button
          onClick={fetchServices}
          disabled={!connected}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
        >
          刷新
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 服务列表 */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b">
            <h2 className="font-semibold">服务列表 ({services.length})</h2>
          </div>
          <div className="overflow-y-auto max-h-[600px]">
            {services.map((service) => (
              <div
                key={service.name}
                className={`p-3 border-b cursor-pointer hover:bg-gray-50 ${selectedService === service.name ? 'bg-blue-50' : ''}`}
                onClick={() => {
                  setSelectedService(service.name)
                  setResponse(null)
                  setRequestText('{}')
                }}
              >
                <div className="font-medium text-sm truncate">{service.name}</div>
                <div className="text-xs text-gray-500">{service.type}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 服务调用 */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="font-semibold mb-3">
              {selectedService || '选择一个服务'}
            </h2>
            
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">请求参数 (JSON)</label>
              <textarea
                value={requestText}
                onChange={(e) => setRequestText(e.target.value)}
                className="w-full p-3 border rounded font-mono text-sm h-32"
                placeholder='{}'
              />
            </div>

            <button
              onClick={callService}
              disabled={!selectedService || loading}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
            >
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
