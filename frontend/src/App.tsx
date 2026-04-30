import { useState } from 'react'
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Radio, Wrench, Settings, FileText, GitBranch,
  BarChart3, Image, Box, Network, Gamepad2, FolderOpen,
  Map, Cloud, Radar, Stethoscope, Clock, Shield, Activity, Brain
} from 'lucide-react'
import { ROSProvider, useROS } from './hooks/useROS'
import StatusPage from './pages/StatusPage'
import DashboardPage from './pages/DashboardPage'
import NodesPage from './pages/NodesPage'
import TopicsPage from './pages/TopicsPage'
import ServicesPage from './pages/ServicesPage'
import ParamsPage from './pages/ParamsPage'
import LogsPage from './pages/LogsPage'
import TFPage from './pages/TFPage'
import SettingsPage from './pages/SettingsPage'
import ChartsPage from './pages/ChartsPage'
import ImageViewerPage from './pages/ImageViewerPage'
import TF3DPage from './pages/TF3DPage'
import NodeGraphPage from './pages/NodeGraphPage'
import ControlPage from './pages/ControlPage'
import BagPage from './pages/BagPage'
import MapViewerPage from './pages/MapViewerPage'
import PointCloudPage from './pages/PointCloudPage'
import LaserScanPage from './pages/LaserScanPage'
import TFDiagnosticsPage from './pages/TFDiagnosticsPage'
import TracePage from './pages/TracePage'
import LatencyPage from './pages/LatencyPage'
import BottleneckPage from './pages/BottleneckPage'
import DiagnosticsPage from './pages/DiagnosticsPage'

type NavGroup = {
  label: string
  items: { path: string; label: string; icon: React.ReactNode }[]
}

const navGroups: NavGroup[] = [
  {
    label: '概览',
    items: [
      { path: '/', label: '机器人状态', icon: <Radio size={18} /> },
      { path: '/dashboard', label: '仪表盘', icon: <LayoutDashboard size={18} /> },
    ],
  },
  {
    label: 'ROS 核心',
    items: [
      { path: '/nodes', label: '节点管理', icon: <Radio size={18} /> },
      { path: '/topics', label: '话题监控', icon: <Radio size={18} /> },
      { path: '/services', label: '服务调用', icon: <Wrench size={18} /> },
      { path: '/params', label: '参数服务器', icon: <Settings size={18} /> },
      { path: '/tf', label: 'TF 列表', icon: <GitBranch size={18} /> },
      { path: '/logs', label: '日志系统', icon: <FileText size={18} /> },
    ],
  },
  {
    label: '可视化',
    items: [
      { path: '/charts', label: '实时图表', icon: <BarChart3 size={18} /> },
      { path: '/images', label: '图像话题', icon: <Image size={18} /> },
      { path: '/tf3d', label: 'TF 3D', icon: <Box size={18} /> },
      { path: '/node-graph', label: '节点图', icon: <Network size={18} /> },
      { path: '/map', label: '地图', icon: <Map size={18} /> },
      { path: '/pointcloud', label: '点云', icon: <Cloud size={18} /> },
      { path: '/laserscan', label: '激光雷达', icon: <Radar size={18} /> },
    ],
  },
  {
    label: '工具',
    items: [
      { path: '/control', label: '机器人控制', icon: <Gamepad2 size={18} /> },
      { path: '/bag', label: 'Bag 管理', icon: <FolderOpen size={18} /> },
      { path: '/tf-diagnostics', label: 'TF 诊断', icon: <Stethoscope size={18} /> },
      { path: '/settings', label: '设置', icon: <Settings size={18} /> },
    ],
  },
  {
    label: '性能分析',
    items: [
      { path: '/trace', label: '调用链', icon: <Clock size={18} /> },
      { path: '/latency', label: '延迟监控', icon: <Activity size={18} /> },
      { path: '/bottleneck', label: '瓶颈检测', icon: <Shield size={18} /> },
      { path: '/diagnostics', label: 'AI 诊断', icon: <Brain size={18} /> },
    ],
  },
]

function Sidebar({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const location = useLocation()
  const { connected } = useROS()

  return (
    <div className={`${open ? 'w-64' : 'w-16'} bg-gray-900 text-white transition-all duration-300 flex flex-col min-h-screen`}>
      <div className="p-4 border-b border-gray-700 flex items-center justify-between">
        {open && <h1 className="text-lg font-bold">ROS 调试系统</h1>}
        <button onClick={() => setOpen(!open)} className="p-1 hover:bg-gray-700 rounded">
          {open ? '◀' : '▶'}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        {navGroups.map((group) => (
          <div key={group.label}>
            {open && <div className="text-xs text-gray-500 uppercase px-3 py-1 mt-2">{group.label}</div>}
            {group.items.map((item) => (
              <Link key={item.path} to={item.path}
                className={`flex items-center gap-3 px-3 py-2 rounded text-sm hover:bg-gray-700 transition-colors ${
                  location.pathname === item.path ? 'bg-blue-600 hover:bg-blue-700' : ''
                } ${!open ? 'justify-center' : ''}`}>
                {item.icon}
                {open && <span>{item.label}</span>}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-700">
        <div className={`flex items-center gap-2 ${!open ? 'justify-center' : ''}`}>
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
          {open && <span className="text-sm">{connected ? '已连接' : '未连接'}</span>}
        </div>
      </div>
    </div>
  )
}

function AppContent() {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar open={sidebarOpen} setOpen={setSidebarOpen} />
      <div className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<StatusPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/nodes" element={<NodesPage />} />
          <Route path="/topics" element={<TopicsPage />} />
          <Route path="/services" element={<ServicesPage />} />
          <Route path="/params" element={<ParamsPage />} />
          <Route path="/logs" element={<LogsPage />} />
          <Route path="/tf" element={<TFPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/charts" element={<ChartsPage />} />
          <Route path="/images" element={<ImageViewerPage />} />
          <Route path="/tf3d" element={<TF3DPage />} />
          <Route path="/node-graph" element={<NodeGraphPage />} />
          <Route path="/control" element={<ControlPage />} />
          <Route path="/bag" element={<BagPage />} />
          <Route path="/map" element={<MapViewerPage />} />
          <Route path="/pointcloud" element={<PointCloudPage />} />
          <Route path="/laserscan" element={<LaserScanPage />} />
          <Route path="/tf-diagnostics" element={<TFDiagnosticsPage />} />
          <Route path="/trace" element={<TracePage />} />
          <Route path="/latency" element={<LatencyPage />} />
          <Route path="/bottleneck" element={<BottleneckPage />} />
          <Route path="/diagnostics" element={<DiagnosticsPage />} />
        </Routes>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ROSProvider>
        <AppContent />
      </ROSProvider>
    </BrowserRouter>
  )
}
