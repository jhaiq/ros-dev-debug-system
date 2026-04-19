import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { useState } from 'react'
import NodesPage from './pages/NodesPage'
import TopicsPage from './pages/TopicsPage'
import ServicesPage from './pages/ServicesPage'
import ParamsPage from './pages/ParamsPage'
import LogsPage from './pages/LogsPage'
import TFPage from './pages/TFPage'
import StatusPage from './pages/StatusPage'
import { useROS } from './hooks/useROS'

function App() {
  const { connected, connect, disconnect } = useROS()
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const navItems = [
    { path: '/', label: '机器人状态', icon: '🤖' },
    { path: '/nodes', label: '节点管理', icon: '📦' },
    { path: '/topics', label: '话题监控', icon: '📡' },
    { path: '/services', label: '服务调用', icon: '🔧' },
    { path: '/params', label: '参数服务器', icon: '⚙️' },
    { path: '/logs', label: '日志系统', icon: '📋' },
    { path: '/tf', label: 'TF 树', icon: '🌳' },
  ]

  return (
    <BrowserRouter>
      <div className="flex h-screen bg-gray-100">
        {/* 侧边栏 */}
        <div className={`${sidebarOpen ? 'w-64' : 'w-16'} bg-gray-900 text-white transition-all duration-300`}>
          <div className="p-4 border-b border-gray-700">
            <h1 className={`${sidebarOpen ? 'block' : 'hidden'} text-xl font-bold`}>ROS 调试系统</h1>
            <button 
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-gray-700 rounded"
            >
              {sidebarOpen ? '←' : '→'}
            </button>
          </div>
          
          <nav className="p-2">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`block p-3 rounded hover:bg-gray-700 mb-1 ${sidebarOpen ? '' : 'text-center'}`}
              >
                <span className="mr-2">{item.icon}</span>
                {sidebarOpen && <span>{item.label}</span>}
              </Link>
            ))}
          </nav>

          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-700">
            <div className={`text-sm ${sidebarOpen ? '' : 'text-center'}`}>
              <div className="flex items-center justify-between">
                {sidebarOpen && <span>ROS 连接</span>}
                <span className={`px-2 py-1 rounded text-xs ${connected ? 'bg-green-600' : 'bg-red-600'}`}>
                  {connected ? '已连接' : '未连接'}
                </span>
              </div>
              {sidebarOpen && (
                <button
                  onClick={connected ? disconnect : connect}
                  className="mt-2 w-full py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm"
                >
                  {connected ? '断开' : '连接'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 主内容区 */}
        <div className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<StatusPage />} />
            <Route path="/nodes" element={<NodesPage />} />
            <Route path="/topics" element={<TopicsPage />} />
            <Route path="/services" element={<ServicesPage />} />
            <Route path="/params" element={<ParamsPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/tf" element={<TFPage />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  )
}

export default App
